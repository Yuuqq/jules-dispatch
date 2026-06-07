import { describe, expect, it } from 'vitest';
import { runBatches, validateBatchSize } from '../src/batch.js';

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
  it('runs work in bounded batches and preserves result order', async () => {
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
});
