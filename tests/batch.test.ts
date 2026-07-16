import { describe, expect, it, vi } from 'vitest';
import { runBatches, validateBatchSize, validatePaceMs } from '../src/batch.js';

describe('validateBatchSize', () => {
  it('accepts values from 1 to 50', () => {
    expect(() => validateBatchSize(1)).not.toThrow();
    expect(() => validateBatchSize(50)).not.toThrow();
  });

  it('rejects non-integer and out-of-range values', () => {
    expect(() => validateBatchSize(0)).toThrow('Invalid parallel value');
    expect(() => validateBatchSize(51)).toThrow('Invalid parallel value');
    expect(() => validateBatchSize(1.5)).toThrow('Invalid parallel value');
  });
});

describe('runBatches', () => {
  it('runs work with bounded concurrency and preserves result order', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await runBatches([1, 2, 3, 4, 5], 2, async item => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 0));
      inFlight -= 1;
      return item * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxInFlight).toBe(2);
  });

  it('starts the next item as soon as any worker slot is free', async () => {
    const started: number[] = [];
    const releases = new Map<number, () => void>();

    const resultPromise = runBatches([0, 1, 2], 2, async item => {
      started.push(item);
      if (item < 2) {
        await new Promise<void>(resolve => releases.set(item, resolve));
      }
      return item * 10;
    });

    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    releases.get(0)?.();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));

    releases.get(1)?.();
    await expect(resultPromise).resolves.toEqual([0, 10, 20]);
  });

  it('enforces a minimum interval between dispatch starts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const starts: number[] = [];
      const resultPromise = runBatches([1, 2, 3], 3, async item => {
        starts.push(Date.now());
        return item;
      }, { paceMs: 100 });

      await vi.advanceTimersByTimeAsync(0);
      expect(starts).toEqual([Date.parse('2026-01-01T00:00:00Z')]);

      await vi.advanceTimersByTimeAsync(99);
      expect(starts).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(starts).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(100);
      await expect(resultPromise).resolves.toEqual([1, 2, 3]);
      expect(starts).toEqual([
        Date.parse('2026-01-01T00:00:00Z'),
        Date.parse('2026-01-01T00:00:00.100Z'),
        Date.parse('2026-01-01T00:00:00.200Z'),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects invalid pacing values', () => {
    expect(() => validatePaceMs(-1)).toThrow('Invalid paceMs value');
    expect(() => validatePaceMs(60_001)).toThrow('Invalid paceMs value');
    expect(() => validatePaceMs(1.5)).toThrow('Invalid paceMs value');
  });
});
