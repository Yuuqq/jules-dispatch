import type { JulesClient } from './client.js';
import type { JulesActivity } from './types.js';

type TailClient = Pick<JulesClient, 'listActivities' | 'iterateActivities'>;

/** Keep initial history bounded, then exhaust every cursor-based page of new activity. */
export async function fetchTailActivities(
  client: TailClient,
  sessionId: string,
  createTimeCursor?: string,
): Promise<JulesActivity[]> {
  if (!createTimeCursor) {
    return (await client.listActivities(sessionId, 100)).activities;
  }

  const activities: JulesActivity[] = [];
  for await (const activity of client.iterateActivities(sessionId, 100, createTimeCursor)) {
    activities.push(activity);
  }
  return activities;
}

/** Preserve failure context across polling waves that contain no failure event. */
export function rememberLatestFailure(
  previous: string | undefined,
  activities: JulesActivity[],
): string | undefined {
  const failure = activities
    .filter(activity => activity.sessionFailed)
    .sort((a, b) => (
      a.createTime > b.createTime ? -1 : a.createTime < b.createTime ? 1 : 0
    ))[0]
    ?.sessionFailed;
  return failure?.reason ?? failure?.message ?? previous;
}
