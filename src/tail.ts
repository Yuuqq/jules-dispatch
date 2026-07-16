import type { JulesClient } from './client.js';
import type { JulesActivity } from './types.js';
import {
  compareActivityPositions,
  fetchActivityHistory,
  hasResumedAfterTerminal,
  type ActivityHistoryCursor,
} from './activity-history.js';

type TailClient = Pick<JulesClient, 'listActivities'>;

const TAIL_PAGE_SIZE = 100;
const MAX_CONSECUTIVE_ERRORS = 5;
const MAX_RETRY_DELAY_MS = 30_000;

export type TailCursor = ActivityHistoryCursor;

export interface TailActivityBatch {
  activities: JulesActivity[];
  cursor: TailCursor;
}

/**
 * Scan to the live edge once, then re-read only the previous final page and any
 * pages appended after it. The API does not support a createTime query cursor.
 */
export async function fetchTailActivities(
  client: TailClient,
  sessionId: string,
  cursor?: TailCursor,
): Promise<TailActivityBatch> {
  const result = await fetchActivityHistory(client, sessionId, {
    cursor,
    initialLimit: TAIL_PAGE_SIZE,
    pageSize: TAIL_PAGE_SIZE,
  });
  return { activities: result.activities, cursor: result.cursor };
}

/** A stale COMPLETED state must not stop a session that resumed after feedback. */
export function isTailSessionTerminal(state: string | undefined, cursor: TailCursor): boolean {
  const normalized = (state ?? '').toUpperCase();
  if (normalized === 'FAILED' || normalized === 'CANCELLED' || normalized === 'CANCELED') {
    return true;
  }
  if (normalized !== 'COMPLETED') return false;
  return !hasResumedAfterTerminal(cursor);
}

export function shouldRetryTailError(code: string, consecutiveErrors: number): boolean {
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) return false;
  return code === 'NETWORK_ERROR' || code === 'RATE_LIMITED' || code === 'SERVER_ERROR';
}

export function tailRetryDelay(baseIntervalMs: number, consecutiveErrors: number): number {
  const exponent = Math.max(consecutiveErrors - 1, 0);
  return Math.min(baseIntervalMs * 2 ** exponent, MAX_RETRY_DELAY_MS);
}

export function waitForTailPoll(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Preserve failure context across polling waves that contain no failure event. */
export function rememberLatestFailure(
  previous: string | undefined,
  activities: JulesActivity[],
): string | undefined {
  const failure = activities
    .filter(activity => activity.sessionFailed)
    .sort((a, b) => compareActivityPositions(b, a))[0]
    ?.sessionFailed;
  return failure?.reason ?? failure?.message ?? previous;
}
