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

function mockClient(activities: JulesActivity[]): Pick<JulesClient, 'getSession' | 'listActivities'> {
  return {
    getSession: vi.fn().mockResolvedValue(session()),
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
});
