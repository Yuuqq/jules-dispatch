import { describe, expect, it, vi } from 'vitest';
import {
  fetchTailActivities,
  isTailSessionTerminal,
  rememberLatestFailure,
  shouldRetryTailError,
  tailRetryDelay,
  waitForTailPoll,
  type TailCursor,
} from '../src/tail.js';
import type { JulesActivity } from '../src/types.js';

function activity(overrides: Partial<JulesActivity> = {}): JulesActivity {
  return {
    id: 'act-1',
    name: 'activities/act-1',
    createTime: '2026-01-01T00:00:00Z',
    originator: 'agent',
    ...overrides,
  };
}

function numberedActivity(index: number): JulesActivity {
  const id = `act-${String(index).padStart(3, '0')}`;
  return activity({
    id,
    name: `activities/${id}`,
    createTime: new Date(Date.parse('2026-01-01T00:00:00Z') + index * 1000).toISOString(),
  });
}

describe('fetchTailActivities', () => {
  it('scans to the live edge but bounds initial output to the newest 100 activities', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => numberedActivity(index));
    const secondPage = Array.from({ length: 50 }, (_, index) => numberedActivity(index + 100));
    const listActivities = vi.fn()
      .mockResolvedValueOnce({ activities: firstPage, nextPageToken: 'page-2' })
      .mockResolvedValueOnce({ activities: secondPage });

    const result = await fetchTailActivities({ listActivities }, 'sess-1');

    expect(result.activities).toHaveLength(100);
    expect(result.activities[0].id).toBe('act-050');
    expect(result.activities.at(-1)?.id).toBe('act-149');
    expect(result.cursor.pageToken).toBe('page-2');
    expect(listActivities).toHaveBeenNthCalledWith(1, 'sess-1', 100, undefined);
    expect(listActivities).toHaveBeenNthCalledWith(2, 'sess-1', 100, 'page-2');
  });

  it('does not truncate unseen activity when the previous final page had no token', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => numberedActivity(index));
    const secondPage = Array.from({ length: 50 }, (_, index) => numberedActivity(index + 100));
    const listActivities = vi.fn()
      .mockResolvedValueOnce({ activities: firstPage, nextPageToken: 'page-2' })
      .mockResolvedValueOnce({ activities: secondPage });

    const result = await fetchTailActivities({ listActivities }, 'sess-1', {});

    expect(result.activities).toHaveLength(150);
    expect(result.cursor.pageToken).toBe('page-2');
  });

  it('re-reads the previous final page and exhausts pages appended after it', async () => {
    const listActivities = vi.fn()
      .mockResolvedValueOnce({
        activities: [numberedActivity(99), numberedActivity(100)],
        nextPageToken: 'page-3',
      })
      .mockResolvedValueOnce({ activities: [numberedActivity(101)] });
    const cursor: TailCursor = { pageToken: 'page-2' };

    const result = await fetchTailActivities({ listActivities }, 'sess-1', cursor);

    expect(result.activities.map(item => item.id)).toEqual(['act-099', 'act-100', 'act-101']);
    expect(result.cursor.pageToken).toBe('page-3');
    expect(listActivities).toHaveBeenNthCalledWith(1, 'sess-1', 100, 'page-2');
    expect(listActivities).toHaveBeenNthCalledWith(2, 'sess-1', 100, 'page-3');
  });

  it('rejects a repeated page token instead of looping forever', async () => {
    const listActivities = vi.fn()
      .mockResolvedValueOnce({ activities: [], nextPageToken: 'same' })
      .mockResolvedValueOnce({ activities: [], nextPageToken: 'same' });

    await expect(fetchTailActivities({ listActivities }, 'sess-1')).rejects.toThrow(
      /repeated page token/i,
    );
    expect(listActivities).toHaveBeenCalledTimes(2);
  });
});

describe('tail lifecycle', () => {
  it('keeps tailing when work resumes after an earlier completion', () => {
    const cursor: TailCursor = {
      latestTerminal: {
        createTime: '2026-01-01T00:01:00Z',
        id: 'completed-1',
        kind: 'completed',
      },
      latestResume: { createTime: '2026-01-01T00:02:00Z', id: 'feedback-1' },
    };

    expect(isTailSessionTerminal('COMPLETED', cursor)).toBe(false);
    expect(isTailSessionTerminal('IN_PROGRESS', cursor)).toBe(false);
  });

  it('ends after the resumed work emits a newer terminal activity', () => {
    const cursor: TailCursor = {
      latestResume: { createTime: '2026-01-01T00:02:00Z', id: 'feedback-1' },
      latestTerminal: {
        createTime: '2026-01-01T00:03:00Z',
        id: 'completed-2',
        kind: 'completed',
      },
    };

    expect(isTailSessionTerminal('COMPLETED', cursor)).toBe(true);
  });

  it('treats failed and cancelled states as terminal', () => {
    expect(isTailSessionTerminal('FAILED', {})).toBe(true);
    expect(isTailSessionTerminal('CANCELLED', {})).toBe(true);
    expect(isTailSessionTerminal('CANCELED', {})).toBe(true);
  });
});

describe('tail retry pacing', () => {
  it('retries only transient errors and caps consecutive attempts', () => {
    expect(shouldRetryTailError('NETWORK_ERROR', 1)).toBe(true);
    expect(shouldRetryTailError('RATE_LIMITED', 4)).toBe(true);
    expect(shouldRetryTailError('SERVER_ERROR', 5)).toBe(false);
    expect(shouldRetryTailError('INVALID_REQUEST', 1)).toBe(false);
  });

  it('uses bounded exponential backoff', () => {
    expect(tailRetryDelay(1000, 1)).toBe(1000);
    expect(tailRetryDelay(1000, 2)).toBe(2000);
    expect(tailRetryDelay(1000, 10)).toBe(30_000);
  });

  it('interrupts a pending poll delay when aborted', async () => {
    const abort = new AbortController();
    const pending = waitForTailPoll(30_000, abort.signal);
    abort.abort();
    await expect(pending).resolves.toBeUndefined();
  });
});

describe('rememberLatestFailure', () => {
  it('retains a failure when a later polling wave contains no failure activity', () => {
    const first = rememberLatestFailure(undefined, [
      activity({ sessionFailed: { message: 'build failed' } }),
    ]);
    const second = rememberLatestFailure(first, []);

    expect(second).toBe('build failed');
  });

  it('replaces an older failure with the newest observed failure', () => {
    const result = rememberLatestFailure('old failure', [
      activity({
        id: 'newer',
        createTime: '2026-01-01T00:02:00Z',
        sessionFailed: { reason: 'new failure' },
      }),
      activity({
        id: 'older',
        createTime: '2026-01-01T00:01:00Z',
        sessionFailed: { reason: 'older wave failure' },
      }),
    ]);

    expect(result).toBe('new failure');
  });
});
