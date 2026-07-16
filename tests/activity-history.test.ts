import { describe, expect, it, vi } from 'vitest';
import {
  compareActivityPositions,
  deriveActivityLifecycle,
  fetchActivityHistory,
  hasResumedAfterTerminal,
} from '../src/activity-history.js';
import type { JulesActivity } from '../src/types.js';

function activity(index: number, overrides: Partial<JulesActivity> = {}): JulesActivity {
  const id = `act-${index}`;
  return {
    id,
    name: `activities/${id}`,
    createTime: new Date(Date.parse('2026-01-01T00:00:00Z') + index * 1000).toISOString(),
    originator: 'agent',
    ...overrides,
  };
}

describe('fetchActivityHistory', () => {
  it('scans every oldest-first page while retaining the newest requested window', async () => {
    const listActivities = vi.fn()
      .mockResolvedValueOnce({
        activities: [
          activity(0, { planGenerated: { plan: { id: 'old-plan', steps: [] } } }),
          activity(1, { sessionCompleted: {} }),
          activity(2),
        ],
        nextPageToken: 'page-2',
      })
      .mockResolvedValueOnce({
        activities: [
          activity(3, {
            originator: 'user',
            userMessaged: { userMessage: 'Please revise it.' },
          }),
          activity(4, { planGenerated: { plan: { id: 'new-plan', steps: [] } } }),
          activity(5, { sessionCompleted: {} }),
        ],
      });

    const result = await fetchActivityHistory({ listActivities }, 'sess-1', {
      pageSize: 3,
      initialLimit: 3,
    });

    expect(result.activities.map(item => item.id)).toEqual(['act-3', 'act-4', 'act-5']);
    expect(result.totalActivities).toBe(6);
    expect(result.latestPlan?.id).toBe('new-plan');
    expect(result.cursor).toMatchObject({
      pageToken: 'page-2',
      latestResume: { id: 'act-3' },
      latestTerminal: { id: 'act-5', kind: 'completed' },
    });
    expect(listActivities).toHaveBeenNthCalledWith(1, 'sess-1', 3, undefined);
    expect(listActivities).toHaveBeenNthCalledWith(2, 'sess-1', 3, 'page-2');
  });

  it('rescans without dropping unseen activity when a saved page token is invalidated', async () => {
    const invalidCursorError = Object.assign(new Error('invalid page token'), { status: 400 });
    const listActivities = vi.fn()
      .mockRejectedValueOnce(invalidCursorError)
      .mockResolvedValueOnce({
        activities: [activity(0), activity(1), activity(2)],
        nextPageToken: 'page-2',
      })
      .mockResolvedValueOnce({ activities: [activity(3), activity(4)] });

    const result = await fetchActivityHistory({ listActivities }, 'sess-1', {
      cursor: { pageToken: 'stale-token' },
      pageSize: 3,
      initialLimit: 2,
    });

    expect(result.activities.map(item => item.id)).toEqual([
      'act-0',
      'act-1',
      'act-2',
      'act-3',
      'act-4',
    ]);
    expect(result.totalActivities).toBe(5);
    expect(result.cursor.pageToken).toBe('page-2');
    expect(listActivities).toHaveBeenNthCalledWith(1, 'sess-1', 3, 'stale-token');
    expect(listActivities).toHaveBeenNthCalledWith(2, 'sess-1', 3, undefined);
    expect(listActivities).toHaveBeenNthCalledWith(3, 'sess-1', 3, 'page-2');
  });

  it('does not hide non-cursor server errors behind a rescan', async () => {
    const serverError = Object.assign(new Error('service unavailable'), { status: 503 });
    const listActivities = vi.fn().mockRejectedValue(serverError);

    await expect(fetchActivityHistory({ listActivities }, 'sess-1', {
      cursor: { pageToken: 'page-2' },
    })).rejects.toBe(serverError);
    expect(listActivities).toHaveBeenCalledTimes(1);
  });
});

describe('activity lifecycle', () => {
  it('orders equivalent-second timestamps by their complete fractional precision', () => {
    expect(compareActivityPositions(
      { createTime: '2026-01-01T00:00:00.000000001Z', id: 'later' },
      { createTime: '2026-01-01T00:00:00Z', id: 'earlier' },
    )).toBeGreaterThan(0);
    expect(compareActivityPositions(
      { createTime: '2026-01-01T00:00:00.1Z', id: 'later' },
      { createTime: '2026-01-01T00:00:00.01Z', id: 'earlier' },
    )).toBeGreaterThan(0);
  });

  it('only treats a user message as resumed work', () => {
    const planApproval = activity(2, { originator: 'user' }) as JulesActivity & {
      planApproved: Record<string, never>;
    };
    planApproval.planApproved = {};

    const cursor = deriveActivityLifecycle([
      activity(1, { sessionCompleted: {} }),
      planApproval,
      activity(3, { originator: 'agent', progressUpdated: { title: 'Working' } }),
    ]);

    expect(cursor.latestResume).toBeUndefined();
    expect(hasResumedAfterTerminal(cursor)).toBe(false);
  });

  it('supports legacy user message activities as resume signals', () => {
    const cursor = deriveActivityLifecycle([
      activity(1, { sessionCompleted: {} }),
      activity(2, { originator: 'user', message: { text: 'Try again.' } }),
    ]);

    expect(cursor.latestResume?.id).toBe('act-2');
    expect(hasResumedAfterTerminal(cursor)).toBe(true);
  });
});
