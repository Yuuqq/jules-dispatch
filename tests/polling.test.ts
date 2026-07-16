import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { pollSessions } from '../src/polling.js';
import type { JulesSession, JulesActivity } from '../src/types.js';

function completedSession(id: string): JulesSession {
  return {
    id,
    name: `sessions/${id}`,
    title: `Session ${id}`,
    prompt: '',
    url: '',
    sourceContext: { source: 'test', githubRepoContext: { startingBranch: 'main' } },
    state: 'COMPLETED',
  };
}

function runningSession(id: string): JulesSession {
  return {
    id,
    name: `sessions/${id}`,
    title: `Session ${id}`,
    prompt: '',
    url: '',
    sourceContext: { source: 'test', githubRepoContext: { startingBranch: 'main' } },
    state: 'RUNNING',
  };
}

function failedSession(id: string): JulesSession {
  return {
    id,
    name: `sessions/${id}`,
    title: `Session ${id}`,
    prompt: '',
    url: '',
    sourceContext: { source: 'test', githubRepoContext: { startingBranch: 'main' } },
    state: 'FAILED',
  };
}

function cancelledSession(id: string): JulesSession {
  return {
    id,
    name: `sessions/${id}`,
    title: `Session ${id}`,
    prompt: '',
    url: '',
    sourceContext: { source: 'test', githubRepoContext: { startingBranch: 'main' } },
    state: 'CANCELLED',
  };
}

function sessionWithState(id: string, state: string): JulesSession {
  return {
    ...runningSession(id),
    state,
  };
}

function successActivities(): { activities: JulesActivity[] } {
  return { activities: [] };
}

function failedActivities(): { activities: JulesActivity[] } {
  return {
    activities: [{ sessionFailed: { message: 'boom' } }] as unknown as JulesActivity[],
  };
}

function mockClient() {
  return {
    getSession: vi.fn(),
    listActivities: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pollSessions', () => {
  it('bounds per-wave polling concurrency to 10 by default', async () => {
    const client = mockClient();
    let inFlight = 0;
    let maxInFlight = 0;
    client.getSession.mockImplementation(async (id: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return completedSession(id);
    });
    client.listActivities.mockResolvedValue(successActivities());

    const ids = Array.from({ length: 25 }, (_, i) => `s${i + 1}`);
    const result = await pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ids,
      { interval: 100, timeout: 5000 },
    );

    expect(result.completed).toEqual(ids);
    expect(maxInFlight).toBe(10);
  });

  it('returns timedOut when timeout elapses with session still running', async () => {
    const client = mockClient();
    client.getSession.mockResolvedValue(runningSession('s1'));
    client.listActivities.mockResolvedValue(successActivities());

    const resultPromise = pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1'],
      { interval: 100, timeout: 500 },
    );

    await vi.advanceTimersByTimeAsync(600);

    const result = await resultPromise;
    expect(result).toEqual({
      completed: [],
      failed: [],
      cancelled: [],
      awaitingPlan: [],
      awaitingUserFeedback: [],
      paused: [],
      actionRequired: [],
      stillRunning: ['s1'],
      timedOut: true,
    });
  });

  it.each([
    ['AWAITING_PLAN_APPROVAL', 'awaitingPlan'],
    ['AWAITING_USER_FEEDBACK', 'awaitingUserFeedback'],
    ['PAUSED', 'paused'],
  ] as const)('returns immediately when a session reaches %s', async (state, bucket) => {
    const client = mockClient();
    client.getSession.mockResolvedValue(sessionWithState('s1', state));
    client.listActivities.mockResolvedValue(successActivities());

    const result = await pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1'],
      { interval: 100, timeout: 5000 },
    );

    expect(result[bucket]).toEqual(['s1']);
    expect(result.actionRequired).toEqual(['s1']);
    expect(result.stillRunning).toEqual([]);
    expect(result.timedOut).toBe(false);
  });

  it('returns active sessions separately when another session needs feedback', async () => {
    const client = mockClient();
    client.getSession.mockImplementation(async (id: string) => (
      id === 's1'
        ? sessionWithState(id, 'AWAITING_USER_FEEDBACK')
        : sessionWithState(id, 'IN_PROGRESS')
    ));
    client.listActivities.mockResolvedValue(successActivities());

    const result = await pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1', 's2'],
      { interval: 100, timeout: 5000 },
    );

    expect(result.awaitingUserFeedback).toEqual(['s1']);
    expect(result.actionRequired).toEqual(['s1']);
    expect(result.stillRunning).toEqual(['s2']);
    expect(result.timedOut).toBe(false);
  });

  it('returns completed sessions when all reach COMPLETED', async () => {
    const client = mockClient();
    client.getSession.mockResolvedValue(completedSession('s1'));
    client.listActivities.mockResolvedValue(successActivities());

    const resultPromise = pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1', 's2'],
      { interval: 100, timeout: 5000 },
    );

    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result.completed).toEqual(expect.arrayContaining(['s1', 's2']));
    expect(result.completed).toHaveLength(2);
    expect(result.timedOut).toBe(false);
  });

  it('failFast returns immediately when first session reaches FAILED', async () => {
    const client = mockClient();
    client.getSession.mockImplementation(async (id: string) => {
      if (id === 's1') return failedSession('s1');
      return runningSession(id);
    });
    client.listActivities.mockResolvedValue(successActivities());

    const resultPromise = pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1', 's2'],
      { interval: 100, timeout: 5000, failFast: true },
    );

    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result.failed).toContain('s1');
    expect(result.stillRunning).toContain('s2');
    expect(result.timedOut).toBe(false);
  });

  it('handles mixed terminal states correctly', async () => {
    const client = mockClient();
    client.getSession.mockImplementation(async (id: string) => {
      if (id === 's1') return completedSession('s1');
      if (id === 's2') return failedSession('s2');
      if (id === 's3') return cancelledSession('s3');
      return runningSession(id);
    });
    client.listActivities.mockResolvedValue(successActivities());

    const resultPromise = pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1', 's2', 's3'],
      { interval: 100, timeout: 5000 },
    );

    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result.completed).toEqual(['s1']);
    expect(result.failed).toEqual(['s2']);
    expect(result.cancelled).toEqual(['s3']);
    expect(result.stillRunning).toEqual([]);
    expect(result.timedOut).toBe(false);
  });

  it('tolerates transient errors and re-polls', async () => {
    const client = mockClient();
    let callCount = 0;
    client.getSession.mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) throw new TypeError('fetch failed');
      return completedSession('s1');
    });
    client.listActivities.mockResolvedValue(successActivities());

    const resultPromise = pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1'],
      { interval: 100, timeout: 5000 },
    );

    await vi.advanceTimersByTimeAsync(500);

    const result = await resultPromise;
    expect(result.completed).toEqual(['s1']);
    expect(result.timedOut).toBe(false);
  });

  it('rejects permanent polling errors immediately with session context', async () => {
    const client = mockClient();
    client.getSession.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    const onError = vi.fn();

    const rejection = expect(pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['missing-session'],
      { interval: 100, timeout: 5000 },
      { onError },
    )).rejects.toThrow('Failed to poll Jules session missing-session: not found');

    await rejection;
    expect(onError).toHaveBeenCalledWith('missing-session', expect.objectContaining({
      message: 'not found',
    }));
    expect(client.getSession).toHaveBeenCalledTimes(1);
    expect(client.listActivities).not.toHaveBeenCalled();
  });

  it('keeps polling a stale COMPLETED state until resumed work completes again', async () => {
    const client = mockClient();
    client.getSession.mockResolvedValue(completedSession('s1'));
    const firstCompletion = {
      id: 'completed-1',
      name: 'activities/completed-1',
      createTime: '2026-01-01T00:01:00Z',
      originator: 'agent',
      sessionCompleted: {},
    } satisfies JulesActivity;
    const feedback = {
      id: 'feedback-1',
      name: 'activities/feedback-1',
      createTime: '2026-01-01T00:02:00Z',
      originator: 'user',
      userMessaged: { userMessage: 'Please revise it.' },
    } satisfies JulesActivity;
    const secondCompletion = {
      id: 'completed-2',
      name: 'activities/completed-2',
      createTime: '2026-01-01T00:03:00Z',
      originator: 'agent',
      sessionCompleted: {},
    } satisfies JulesActivity;
    client.listActivities
      .mockResolvedValueOnce({ activities: [firstCompletion], nextPageToken: 'page-2' })
      .mockResolvedValueOnce({ activities: [feedback] })
      .mockResolvedValueOnce({ activities: [feedback, secondCompletion] });

    const resultPromise = pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1'],
      { interval: 100, timeout: 5000 },
    );

    await vi.advanceTimersByTimeAsync(200);
    await expect(resultPromise).resolves.toMatchObject({
      completed: ['s1'],
      stillRunning: [],
      timedOut: false,
    });
    expect(client.getSession).toHaveBeenCalledTimes(2);
    expect(client.listActivities).toHaveBeenNthCalledWith(3, 's1', 100, 'page-2');
  });

  it('does not re-poll sessions already terminal via pre-seeded state', async () => {
    const client = mockClient();
    const pollInfo: Array<{ completed: number; failed: number; cancelled: number; remaining: number }> = [];

    // Session 's1' is already completed, 's2' completes on first poll
    client.getSession.mockImplementation(async (id: string) => {
      if (id === 's1') return completedSession('s1');
      return completedSession('s2');
    });
    client.listActivities.mockResolvedValue(successActivities());

    const resultPromise = pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1', 's2'],
      { interval: 100, timeout: 5000 },
      {
        onPoll: (info) => { pollInfo.push(info); },
      },
    );

    await vi.advanceTimersByTimeAsync(300);

    const result = await resultPromise;
    expect(result.completed).toEqual(expect.arrayContaining(['s1', 's2']));
    expect(result.timedOut).toBe(false);
    // Both resolved in first poll, so onPoll fires once with remaining=0 after the loop
    expect(pollInfo.length).toBeGreaterThanOrEqual(1);
  });

  it('fires onPoll callback each tick with correct counts', async () => {
    const client = mockClient();
    let callCount = 0;
    client.getSession.mockImplementation(async (id: string) => {
      if (id === 's1') return completedSession('s1');
      callCount++;
      if (callCount >= 3) return completedSession('s2');
      return runningSession('s2');
    });
    client.listActivities.mockResolvedValue(successActivities());

    const pollInfo: Array<{ completed: number; failed: number; cancelled: number; remaining: number }> = [];

    const resultPromise = pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1', 's2'],
      { interval: 100, timeout: 5000 },
      {
        onPoll: (info) => { pollInfo.push({ ...info }); },
      },
    );

    await vi.advanceTimersByTimeAsync(600);

    const result = await resultPromise;
    expect(result.completed).toEqual(expect.arrayContaining(['s1', 's2']));
    expect(pollInfo.length).toBeGreaterThanOrEqual(2);
    // First poll: s1 completed, s2 still running
    expect(pollInfo[0]).toMatchObject({
      completed: 1,
      failed: 0,
      cancelled: 0,
      remaining: 1,
    });
  });
});
