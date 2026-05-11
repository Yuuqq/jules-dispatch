import * as fs from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { JulesClient } from '../src/client.js';
import { collectStatus, waitForCompletion } from '../src/collector.js';
import * as log from '../src/log.js';
import type { JulesConfig, JulesSession } from '../src/types.js';

const config: JulesConfig = {
  apiKey: 'test-key',
  defaultSource: 'sources/test',
  defaultBranch: 'main',
  autoMode: 'NONE',
};

function session(overrides: Partial<JulesSession> = {}): JulesSession {
  return {
    id: 'session-1',
    name: 'sessions/session-1',
    title: 'Test session',
    prompt: '',
    url: '',
    sourceContext: { source: 'sources/test', githubRepoContext: { startingBranch: 'main' } },
    state: 'RUNNING',
    ...overrides,
  };
}

function mockClient() {
  return {
    getSession: vi.fn(),
    listActivities: vi.fn(),
    listSessions: vi.fn(),
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('collectStatus error handling', () => {
  it('activity fetch error is logged via debug', async () => {
    const client = mockClient();
    client.getSession.mockResolvedValue(session({ id: 'session-1', state: 'RUNNING' }));
    client.listActivities.mockRejectedValue(new Error('activity API down'));
    const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => undefined);

    const result = await collectStatus(client as unknown as JulesClient, config, { sessionIds: ['session-1'] });

    expect(result[0]).toMatchObject({
      sessionId: 'session-1',
      status: 'running',
      lastActivity: 'Error fetching activities',
      activities: 0,
    });
    expect(debugSpy).toHaveBeenCalledWith('activity fetch error', {
      sessionId: 'session-1',
      error: 'activity API down',
    });
    expect(client.listSessions).not.toHaveBeenCalled();
  });

  it('session not found fallback', async () => {
    const client = mockClient();
    client.getSession.mockRejectedValue(new Error('not found'));
    client.listActivities.mockResolvedValue({ activities: [] });

    const result = await collectStatus(client as unknown as JulesClient, config, { sessionIds: ['missing-session'] });

    expect(result[0]).toMatchObject({
      sessionId: 'missing-session',
      state: 'FAILED',
      status: 'failed',
    });
    expect(result[0].title).toContain('not found');
    expect(client.listSessions).not.toHaveBeenCalled();
  });

  it('no empty catch blocks remain', () => {
    expect(fs.readFileSync('src/collector.ts', 'utf-8')).not.toContain('catch {\n');
  });
});

describe('waitForCompletion error handling', () => {
  it('wait poll error is logged via debug', async () => {
    vi.useFakeTimers();
    const client = mockClient();
    client.getSession
      .mockRejectedValueOnce(new Error('session poll failed'))
      .mockResolvedValue(session({ id: 'session-1', state: 'COMPLETED' }));
    client.listActivities
      .mockRejectedValueOnce(new Error('activity poll failed'))
      .mockResolvedValue({ activities: [] });
    const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => undefined);

    const resultPromise = waitForCompletion(
      client as unknown as JulesClient,
      config,
      ['session-1'],
      { interval: 100, timeout: 500 },
    );

    await vi.advanceTimersByTimeAsync(300);

    await expect(resultPromise).resolves.toMatchObject({
      completed: ['session-1'],
      timedOut: false,
    });
    expect(debugSpy).toHaveBeenCalledWith('wait poll error', {
      sessionId: 'session-1',
      error: 'session poll failed',
    });
    expect(debugSpy).toHaveBeenCalledWith('wait poll error', {
      sessionId: 'session-1',
      error: 'activity poll failed',
    });
  });
});
