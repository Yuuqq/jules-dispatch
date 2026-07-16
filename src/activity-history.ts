import type { JulesActivity, JulesPlan } from './types.js';

const DEFAULT_PAGE_SIZE = 100;

type ActivityClient = {
  listActivities: (
    sessionId: string,
    pageSize?: number,
    pageToken?: string,
  ) => Promise<{ activities: JulesActivity[]; nextPageToken?: string }>;
};

interface ActivityHistoryScanOptions {
  cursor?: ActivityHistoryCursor;
  pageSize: number;
  retainedActivityLimit?: number;
  includeTotalActivities: boolean;
}

export interface ActivityPosition {
  createTime: string;
  id: string;
}

export interface ActivityTerminalPosition extends ActivityPosition {
  kind: 'completed' | 'failed';
}

export interface ActivityHistoryCursor {
  /** Token used to fetch the current final page again on the next poll. */
  pageToken?: string;
  /** Latest user message that can resume work after an earlier completion. */
  latestResume?: ActivityPosition;
  latestTerminal?: ActivityTerminalPosition;
}

export interface ActivityHistoryOptions {
  cursor?: ActivityHistoryCursor;
  /** Retain only the newest N activities on the initial full-history scan. */
  initialLimit?: number;
  pageSize?: number;
}

export interface ActivityHistoryResult {
  activities: JulesActivity[];
  cursor: ActivityHistoryCursor;
  /** Available after an initial full scan; incremental scans only cover an overlap window. */
  totalActivities?: number;
  latestPlan: JulesPlan | null;
}

/**
 * Scan an oldest-first activity feed to its live edge. Later calls can reuse
 * the returned cursor to reread the previous final page and follow new pages.
 */
export async function fetchActivityHistory(
  client: ActivityClient,
  sessionId: string,
  options: ActivityHistoryOptions = {},
): Promise<ActivityHistoryResult> {
  const pageSize = normalizePageSize(options.pageSize ?? DEFAULT_PAGE_SIZE);
  const initialLimit = normalizeInitialLimit(options.initialLimit);

  try {
    return await fetchActivityHistoryPages(
      client,
      sessionId,
      {
        cursor: options.cursor,
        pageSize,
        retainedActivityLimit: options.cursor === undefined ? initialLimit : undefined,
        includeTotalActivities: options.cursor === undefined,
      },
    );
  } catch (err) {
    // Page tokens are opaque and may be invalidated server-side. Rescan from
    // the beginning while preserving lifecycle state so no terminal/resume
    // context is lost and callers can continue without manual recovery.
    if (options.cursor?.pageToken && getHttpStatus(err) === 400) {
      return fetchActivityHistoryPages(
        client,
        sessionId,
        {
          cursor: { ...options.cursor, pageToken: undefined },
          pageSize,
          includeTotalActivities: true,
        },
      );
    }
    throw err;
  }
}

export function deriveActivityLifecycle(activities: JulesActivity[]): ActivityHistoryCursor {
  const cursor: ActivityHistoryCursor = {};
  for (const activity of activities) updateActivityLifecycle(cursor, activity);
  return cursor;
}

export function updateActivityLifecycle(
  cursor: ActivityHistoryCursor,
  activity: JulesActivity,
): void {
  const position = { createTime: activity.createTime, id: activity.id };

  if (activity.sessionFailed || activity.sessionCompleted) {
    const terminal: ActivityTerminalPosition = {
      ...position,
      kind: activity.sessionFailed ? 'failed' : 'completed',
    };
    if (!cursor.latestTerminal || compareActivityPositions(terminal, cursor.latestTerminal) > 0) {
      cursor.latestTerminal = terminal;
    }
    return;
  }

  if (!isResumeActivity(activity)) return;
  if (!cursor.latestResume || compareActivityPositions(position, cursor.latestResume) > 0) {
    cursor.latestResume = position;
  }
}

export function hasResumedAfterTerminal(cursor: ActivityHistoryCursor): boolean {
  return Boolean(
    cursor.latestResume &&
    cursor.latestTerminal &&
    compareActivityPositions(cursor.latestResume, cursor.latestTerminal) > 0
  );
}

export function compareActivityPositions(a: ActivityPosition, b: ActivityPosition): number {
  const aTime = Date.parse(a.createTime);
  const bTime = Date.parse(b.createTime);
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
    if (aTime !== bTime) return aTime - bTime;

    // Date.parse truncates sub-millisecond precision. Compare the complete
    // fractional component so RFC 3339 timestamps such as `.1Z` and `Z`
    // remain correctly ordered when they fall within the same millisecond.
    const aFraction = getFractionalSeconds(a.createTime);
    const bFraction = getFractionalSeconds(b.createTime);
    const fractionWidth = Math.max(aFraction.length, bFraction.length);
    const fractionOrder = aFraction
      .padEnd(fractionWidth, '0')
      .localeCompare(bFraction.padEnd(fractionWidth, '0'));
    if (fractionOrder !== 0) return fractionOrder;
  } else {
    const timeOrder = a.createTime.localeCompare(b.createTime);
    if (timeOrder !== 0) return timeOrder;
  }

  return a.id.localeCompare(b.id);
}

function isResumeActivity(activity: JulesActivity): boolean {
  return activity.userMessaged !== undefined || (
    activity.originator === 'user' && activity.message !== undefined
  );
}

function getFractionalSeconds(value: string): string {
  return /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i.exec(value)?.[1] ?? '';
}

async function fetchActivityHistoryPages(
  client: ActivityClient,
  sessionId: string,
  options: ActivityHistoryScanOptions,
): Promise<ActivityHistoryResult> {
  const cursor: ActivityHistoryCursor = { ...options.cursor };
  const activities: JulesActivity[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken = options.cursor?.pageToken;
  let totalActivities = 0;
  let latestPlanActivity: JulesActivity | undefined;

  if (pageToken) seenPageTokens.add(pageToken);

  while (true) {
    const currentPageToken = pageToken;
    const page = await client.listActivities(sessionId, options.pageSize, currentPageToken);

    for (const activity of page.activities) {
      totalActivities += 1;
      updateActivityLifecycle(cursor, activity);
      activities.push(activity);

      if (
        activity.planGenerated?.plan &&
        (!latestPlanActivity || compareActivityPositions(activity, latestPlanActivity) > 0)
      ) {
        latestPlanActivity = activity;
      }
    }

    if (
      options.retainedActivityLimit !== undefined &&
      activities.length > options.retainedActivityLimit
    ) {
      activities.sort(compareActivityPositions);
      activities.splice(0, activities.length - options.retainedActivityLimit);
    }

    if (!page.nextPageToken) {
      cursor.pageToken = currentPageToken;
      break;
    }
    if (seenPageTokens.has(page.nextPageToken)) {
      throw new Error(
        `Jules API repeated page token while listing activities for session ${sessionId}: ${page.nextPageToken}`,
      );
    }
    seenPageTokens.add(page.nextPageToken);
    pageToken = page.nextPageToken;
  }

  activities.sort(compareActivityPositions);
  return {
    activities,
    cursor,
    ...(options.includeTotalActivities ? { totalActivities } : {}),
    latestPlan: latestPlanActivity?.planGenerated?.plan ?? null,
  };
}

function normalizePageSize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error('Invalid activity page size. Expected an integer from 1 to 100.');
  }
  return value;
}

function normalizeInitialLimit(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Invalid activity history limit. Expected a non-negative integer.');
  }
  return value;
}

function getHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object' || !('status' in err)) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}
