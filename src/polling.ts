import { deriveStatus } from './client.js';
import type { JulesClient } from './client.js';

export interface PollCallbacks {
  onPoll?: (info: { completed: number; failed: number; cancelled: number; remaining: number }) => void;
  onTerminal?: (sessionId: string, status: 'completed' | 'failed' | 'cancelled') => void;
  onError?: (sessionId: string, error: Error) => void;
}

export interface PollResult {
  completed: string[];
  failed: string[];
  cancelled: string[];
  stillRunning: string[];
  timedOut: boolean;
}

export interface PollOptions {
  interval?: number;   // default 10000
  timeout?: number;    // default 600000
  failFast?: boolean;  // default false
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
  const start = Date.now();

  const completed = new Set<string>();
  const failed = new Set<string>();
  const cancelled = new Set<string>();
  let stoppedByFailFast = false;

  const markTerminal = (id: string, status: 'completed' | 'failed' | 'cancelled'): void => {
    if (status === 'completed') completed.add(id);
    else if (status === 'failed') failed.add(id);
    else if (status === 'cancelled') cancelled.add(id);
    callbacks?.onTerminal?.(id, status);
  };

  while (Date.now() - start < timeout && !(failFast && failed.size > 0)) {
    const remaining = sessionIds.filter(id =>
      !completed.has(id) && !failed.has(id) && !cancelled.has(id),
    );
    if (remaining.length === 0) break;

    for (const id of remaining) {
      try {
        const session = await client.getSession(id);
        const { activities } = await client.listActivities(id, 10);
        const status = deriveStatus(session, activities);

        if (status === 'completed') markTerminal(id, 'completed');
        else if (status === 'failed') {
          markTerminal(id, 'failed');
          if (failFast) break;
        }
        else if (status === 'cancelled') markTerminal(id, 'cancelled');
      } catch (err) {
        callbacks?.onError?.(id, err as Error);
      }
    }

    callbacks?.onPoll?.({
      completed: completed.size,
      failed: failed.size,
      cancelled: cancelled.size,
      remaining: sessionIds.filter(id =>
        !completed.has(id) && !failed.has(id) && !cancelled.has(id),
      ).length,
    });

    if (failFast && failed.size > 0) {
      stoppedByFailFast = true;
      break;
    }

    const stillRunning = sessionIds.filter(id =>
      !completed.has(id) && !failed.has(id) && !cancelled.has(id),
    );
    if (stillRunning.length === 0) break;

    await sleep(interval);
  }

  const stillRunning = sessionIds.filter(id =>
    !completed.has(id) && !failed.has(id) && !cancelled.has(id),
  );

  return {
    completed: [...completed],
    failed: [...failed],
    cancelled: [...cancelled],
    stillRunning,
    timedOut: stillRunning.length > 0 && !stoppedByFailFast && Date.now() - start >= timeout,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
