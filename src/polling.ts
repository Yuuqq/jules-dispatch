import type { JulesClient } from './client.js';

export interface PollCallbacks {
  onPoll?: (info: { completed: number; failed: number; cancelled: number; remaining: number }) => void;
  onTerminal?: (sessionId: string, status: 'completed' | 'failed' | 'cancelled') => void;
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
  throw new Error('not implemented');
}
