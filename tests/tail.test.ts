import { describe, expect, it, vi } from 'vitest';
import { fetchTailActivities, rememberLatestFailure } from '../src/tail.js';
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

describe('fetchTailActivities', () => {
  it('bounds the initial history fetch to one page of 100 activities', async () => {
    const listActivities = vi.fn().mockResolvedValue({ activities: [activity()] });
    const iterateActivities = vi.fn();

    const result = await fetchTailActivities(
      { listActivities, iterateActivities },
      'sess-1',
    );

    expect(result).toHaveLength(1);
    expect(listActivities).toHaveBeenCalledWith('sess-1', 100);
    expect(iterateActivities).not.toHaveBeenCalled();
  });

  it('collects every cursor-based page after tailing has started', async () => {
    const listActivities = vi.fn();
    const iterateActivities = vi.fn().mockImplementation(async function* () {
      yield activity({ id: 'act-1' });
      yield activity({ id: 'act-2', createTime: '2026-01-01T00:01:00Z' });
    });

    const result = await fetchTailActivities(
      { listActivities, iterateActivities },
      'sess-1',
      '2025-12-31T23:59:00Z',
    );

    expect(result.map(item => item.id)).toEqual(['act-1', 'act-2']);
    expect(iterateActivities).toHaveBeenCalledWith(
      'sess-1',
      100,
      '2025-12-31T23:59:00Z',
    );
    expect(listActivities).not.toHaveBeenCalled();
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
