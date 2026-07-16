import { deriveStatus, type JulesClient } from './client.js';
import type { JulesActivity } from './types.js';

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
      lastActivity: getLastActivity(status, activities),
      activities: activities.length,
    };
  } catch (err) {
    return { sessionId, status: 'error', error: (err as Error).message };
  }
}

export function getLastActivity(status: SessionStatus, activities: JulesActivity[]): string {
  const newestFirst = activities.slice().sort((a, b) => (
    a.createTime > b.createTime ? -1 : a.createTime < b.createTime ? 1 : 0
  ));
  const failedAct = newestFirst.find(a => a.sessionFailed);
  const latestAgentMessage = newestFirst.find(a => (
    a.agentMessaged?.agentMessage || a.message?.text
  ));
  const latestMeaningful = newestFirst.find(a => activityText(a));

  if (status === 'failed') return failedAct?.sessionFailed?.message ?? failedAct?.sessionFailed?.reason ?? 'Failed';
  if (status === 'completed') return 'Completed';
  if (status === 'awaiting_plan') return 'Awaiting plan approval';
  if (status === 'awaiting_user_feedback') {
    return latestAgentMessage?.agentMessaged?.agentMessage ??
      latestAgentMessage?.message?.text ??
      'Awaiting user feedback';
  }
  if (status === 'paused') return latestMeaningful ? activityText(latestMeaningful)! : 'Paused';
  if (status === 'cancelled') return 'Cancelled';
  return latestMeaningful ? activityText(latestMeaningful)! : 'In progress';
}

function activityText(activity: JulesActivity): string | undefined {
  return activity.agentMessaged?.agentMessage ??
    activity.userMessaged?.userMessage ??
    activity.message?.text ??
    activity.description ??
    activity.progressUpdated?.title;
}
