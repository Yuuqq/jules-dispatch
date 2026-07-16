import { deriveStatus } from './client.js';
import type { JulesClient } from './client.js';
import type { JulesSessionStatus } from './types.js';
import {
  fetchActivityHistory,
  type ActivityHistoryCursor,
} from './activity-history.js';
import { translateError } from './errors.js';

type ActionRequiredStatus = Extract<
  JulesSessionStatus,
  'awaiting_plan' | 'awaiting_user_feedback' | 'paused'
>;

export interface PollCallbacks {
  onPoll?: (info: {
    completed: number;
    failed: number;
    cancelled: number;
    awaitingPlan: number;
    awaitingUserFeedback: number;
    paused: number;
    actionRequired: number;
    remaining: number;
  }) => void;
  onTerminal?: (sessionId: string, status: 'completed' | 'failed' | 'cancelled') => void;
  onActionRequired?: (sessionId: string, status: ActionRequiredStatus) => void;
  onError?: (sessionId: string, error: Error) => void;
}

export interface PollResult {
  completed: string[];
  failed: string[];
  cancelled: string[];
  awaitingPlan: string[];
  awaitingUserFeedback: string[];
  paused: string[];
  actionRequired: string[];
  stillRunning: string[];
  timedOut: boolean;
}

export interface PollOptions {
  interval?: number;   // default 10000
  timeout?: number;    // default 600000
  failFast?: boolean;  // default false
  concurrency?: number; // default 10
}

export async function pollSessions(
  client: Pick<JulesClient, 'getSession' | 'listActivities'>,
  sessionIds: string[],
  options?: PollOptions,
  callbacks?: PollCallbacks,
): Promise<PollResult> {
  const interval = options?.interval ?? 10000;
  const timeout = options?.timeout ?? 600000;
  const failFast = options?.failFast ?? false;
  const concurrency = options?.concurrency ?? 10;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50) {
    throw new Error('Invalid polling concurrency. Expected an integer between 1 and 50.');
  }
  const start = Date.now();

  const completed = new Set<string>();
  const failed = new Set<string>();
  const cancelled = new Set<string>();
  const awaitingPlan = new Set<string>();
  const awaitingUserFeedback = new Set<string>();
  const paused = new Set<string>();
  const activityCursors = new Map<string, ActivityHistoryCursor>();
  let stoppedByFailFast = false;

  const markTerminal = (id: string, status: 'completed' | 'failed' | 'cancelled'): void => {
    if (status === 'completed') completed.add(id);
    else if (status === 'failed') failed.add(id);
    else if (status === 'cancelled') cancelled.add(id);
    callbacks?.onTerminal?.(id, status);
  };

  const markActionRequired = (id: string, status: ActionRequiredStatus): void => {
    if (status === 'awaiting_plan') awaitingPlan.add(id);
    else if (status === 'awaiting_user_feedback') awaitingUserFeedback.add(id);
    else paused.add(id);
    callbacks?.onActionRequired?.(id, status);
  };

  const isResolved = (id: string): boolean => (
    completed.has(id) ||
    failed.has(id) ||
    cancelled.has(id) ||
    awaitingPlan.has(id) ||
    awaitingUserFeedback.has(id) ||
    paused.has(id)
  );

  const hasActionRequired = (): boolean => (
    awaitingPlan.size + awaitingUserFeedback.size + paused.size > 0
  );

  const getStillRunning = (): string[] => sessionIds.filter(id => !isResolved(id));

  while (
    Date.now() - start < timeout &&
    !(failFast && failed.size > 0) &&
    !hasActionRequired()
  ) {
    const remaining = getStillRunning();
    if (remaining.length === 0) break;

    for (let i = 0; i < remaining.length; i += concurrency) {
      const chunk = remaining.slice(i, i + concurrency);
      await Promise.all(chunk.map(async (id) => {
        try {
          const session = await client.getSession(id);
          const history = await fetchActivityHistory(client, id, {
            cursor: activityCursors.get(id),
            initialLimit: 10,
          });
          activityCursors.set(id, history.cursor);
          const status = deriveStatus(session, history.activities, history.cursor);

          if (status === 'completed') markTerminal(id, 'completed');
          else if (status === 'failed') markTerminal(id, 'failed');
          else if (status === 'cancelled') markTerminal(id, 'cancelled');
          else if (
            status === 'awaiting_plan' ||
            status === 'awaiting_user_feedback' ||
            status === 'paused'
          ) markActionRequired(id, status);
        } catch (err) {
          const error = toError(err);
          callbacks?.onError?.(id, error);
          if (!isTransientPollingError(error)) {
            throw contextualizePollingError(id, error);
          }
        }
      }));

      if (hasActionRequired()) break;
      if (failFast && failed.size > 0) {
        stoppedByFailFast = true;
        break;
      }
    }

    callbacks?.onPoll?.({
      completed: completed.size,
      failed: failed.size,
      cancelled: cancelled.size,
      awaitingPlan: awaitingPlan.size,
      awaitingUserFeedback: awaitingUserFeedback.size,
      paused: paused.size,
      actionRequired: awaitingPlan.size + awaitingUserFeedback.size + paused.size,
      remaining: getStillRunning().length,
    });

    if (hasActionRequired()) break;

    if (failFast && failed.size > 0) break;

    const stillRunning = getStillRunning();
    if (stillRunning.length === 0) break;

    await sleep(interval);
  }

  const stillRunning = getStillRunning();
  const inInputOrder = (set: Set<string>): string[] => sessionIds.filter(id => set.has(id));
  const actionRequired = sessionIds.filter(id => (
    awaitingPlan.has(id) || awaitingUserFeedback.has(id) || paused.has(id)
  ));

  return {
    completed: inInputOrder(completed),
    failed: inInputOrder(failed),
    cancelled: inInputOrder(cancelled),
    awaitingPlan: inInputOrder(awaitingPlan),
    awaitingUserFeedback: inInputOrder(awaitingUserFeedback),
    paused: inInputOrder(paused),
    actionRequired,
    stillRunning,
    timedOut: (
      stillRunning.length > 0 &&
      actionRequired.length === 0 &&
      !stoppedByFailFast &&
      Date.now() - start >= timeout
    ),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientPollingError(err: Error): boolean {
  const code = translateError(err).code;
  return code === 'NETWORK_ERROR' || code === 'RATE_LIMITED' || code === 'SERVER_ERROR';
}

function contextualizePollingError(sessionId: string, err: Error): Error {
  const wrapped = new Error(`Failed to poll Jules session ${sessionId}: ${err.message}`, {
    cause: err,
  }) as Error & { status?: number };
  const status = getHttpStatus(err);
  if (status !== undefined) wrapped.status = status;
  return wrapped;
}

function getHttpStatus(err: Error): number | undefined {
  if (!('status' in err)) return undefined;
  const status = (err as Error & { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
