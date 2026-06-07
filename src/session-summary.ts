import { deriveStatus, type JulesClient } from './client.js';

export type SessionStatus = ReturnType<typeof deriveStatus>;

export interface SessionSummary {
  sessionId: string;
  title?: string;
  state?: string;
  status: SessionStatus | 'error';
  prUrl?: string;
  lastActivity?: string;
}

export interface LegacySessionSummary extends SessionSummary {
  prTitle?: string;
  activities?: number;
  error?: string;
}

export async function summarizeSession(
  client: Pick<JulesClient, 'getSession' | 'listActivities'>,
  sessionId: string,
): Promise<SessionSummary> {
  try {
    const session = await client.getSession(sessionId);
    const { activities } = await client.listActivities(sessionId, 10);
    const status = deriveStatus(session, activities);
    const pr = session.outputs?.find(o => o.pullRequest)?.pullRequest;

    return {
      sessionId,
      title: session.title,
      state: session.state,
      status,
      prUrl: pr?.url,
      lastActivity: getLastActivity(status, activities),
    };
  } catch (err) {
    return {
      sessionId,
      status: 'error',
      lastActivity: (err as Error).message,
    };
  }
}

export async function summarizeSessionLegacy(
  client: Pick<JulesClient, 'getSession' | 'listActivities'>,
  sessionId: string,
): Promise<LegacySessionSummary> {
  try {
    const session = await client.getSession(sessionId);
    const { activities } = await client.listActivities(sessionId, 10);
    const status = deriveStatus(session, activities);
    const pr = session.outputs?.find(o => o.pullRequest)?.pullRequest;

    return {
      sessionId,
      title: session.title,
      state: session.state,
      status,
      prUrl: pr?.url,
      prTitle: pr?.title,
      activities: activities.length,
    };
  } catch (err) {
    return { sessionId, status: 'error', error: (err as Error).message };
  }
}

function getLastActivity(status: SessionStatus, activities: Awaited<ReturnType<JulesClient['listActivities']>>['activities']): string {
  const failedAct = activities.find(a => a.sessionFailed);
  const latestProgress = activities
    .filter(a => a.progressUpdated)
    .sort((a, b) => (a.createTime > b.createTime ? -1 : 1))[0];

  if (status === 'failed') return failedAct?.sessionFailed?.message ?? failedAct?.sessionFailed?.reason ?? 'Failed';
  if (status === 'completed') return 'Completed';
  if (status === 'awaiting_plan') return 'Awaiting plan approval';
  if (status === 'cancelled') return 'Cancelled';
  return latestProgress?.progressUpdated?.title ?? 'In progress';
}
