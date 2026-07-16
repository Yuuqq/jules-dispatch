import { describe, expect, it, vi } from 'vitest';
import { summarizeSession } from '../src/session-summary.js';
import type { JulesActivity, JulesSession } from '../src/types.js';
import type { JulesClient } from '../src/client.js';

function session(overrides: Partial<JulesSession> = {}): JulesSession {
  return {
    id: 'sess-1',
    name: 'sessions/sess-1',
    title: 'Test Session',
    prompt: '',
    url: 'https://jules.example/sess-1',
    sourceContext: { source: 'sources/github/owner/repo', githubRepoContext: { startingBranch: 'main' } },
    state: 'FAILED',
    ...overrides,
  };
}

function activity(overrides: Partial<JulesActivity> = {}): JulesActivity {
  return {
    id: 'act-1',
    name: 'activities/act-1',
    createTime: '2026-01-01T00:00:00Z',
    originator: 'agent',
    ...overrides,
  };
}

function mockClient(
  activities: JulesActivity[],
  sessionOverrides: Partial<JulesSession> = {},
): Pick<JulesClient, 'getSession' | 'listActivities'> {
  return {
    getSession: vi.fn().mockResolvedValue(session(sessionOverrides)),
    listActivities: vi.fn().mockResolvedValue({ activities }),
  };
}

describe('summarizeSession', () => {
  it('uses sessionFailed.reason when message is absent', async () => {
    const result = await summarizeSession(
      mockClient([activity({ sessionFailed: { reason: 'quota exceeded' } })]),
      'sess-1',
    );

    expect(result).toMatchObject({
      sessionId: 'sess-1',
      status: 'failed',
      lastActivity: 'quota exceeded',
    });
  });

  it('prefers sessionFailed.message over reason', async () => {
    const result = await summarizeSession(
      mockClient([activity({ sessionFailed: { message: 'explicit failure', reason: 'fallback' } })]),
      'sess-1',
    );

    expect(result.lastActivity).toBe('explicit failure');
  });

  it('selects the newest failure when activities are not already sorted', async () => {
    const result = await summarizeSession(
      mockClient([
        activity({
          id: 'older-failure',
          createTime: '2026-01-01T00:00:00Z',
          sessionFailed: { message: 'old failure' },
        }),
        activity({
          id: 'newer-failure',
          createTime: '2026-01-01T00:05:00Z',
          sessionFailed: { message: 'new failure' },
        }),
      ]),
      'sess-1',
    );

    expect(result.lastActivity).toBe('new failure');
  });

  it('surfaces the latest Jules message when user feedback is required', async () => {
    const result = await summarizeSession(
      mockClient([
        activity({
          createTime: '2026-01-01T00:02:00Z',
          agentMessaged: { agentMessage: 'Which database should I target?' },
        }),
      ], { state: 'AWAITING_USER_FEEDBACK' }),
      'sess-1',
    );

    expect(result).toMatchObject({
      status: 'awaiting_user_feedback',
      lastActivity: 'Which database should I target?',
    });
  });

  it('reports paused sessions as action required', async () => {
    const result = await summarizeSession(
      mockClient([], { state: 'PAUSED' }),
      'sess-1',
    );

    expect(result).toMatchObject({ status: 'paused', lastActivity: 'Paused' });
  });
});
