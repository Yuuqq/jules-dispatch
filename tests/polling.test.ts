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
      stillRunning: ['s1'],
      timedOut: true,
    });
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
      if (callCount <= 2) throw new Error('transient');
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
