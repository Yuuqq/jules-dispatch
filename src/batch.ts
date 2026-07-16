export function validateBatchSize(value: number, name = 'parallel'): void {
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new Error(`Invalid ${name} value. Expected an integer from 1 to 50.`);
  }
}

export function validatePaceMs(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 60_000) {
    throw new Error('Invalid paceMs value. Expected an integer from 0 to 60000.');
  }
}

export interface RunBatchesOptions {
  /** Minimum interval between worker starts. Zero disables pacing. */
  paceMs?: number;
}

export async function runBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T, index: number) => Promise<R>,
  options: RunBatchesOptions = {},
): Promise<R[]> {
  validateBatchSize(batchSize);
  const paceMs = options.paceMs ?? 0;
  validatePaceMs(paceMs);

  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  const workerCount = Math.min(batchSize, items.length);
  let nextIndex = 0;
  let nextStartAt = Date.now();
  let launchQueue = Promise.resolve();
  let stopped = false;

  const waitForLaunchSlot = (): Promise<void> => {
    if (paceMs === 0) return Promise.resolve();

    const turn = launchQueue.then(async () => {
      const delay = Math.max(0, nextStartAt - Date.now());
      if (delay > 0) await sleep(delay);
      nextStartAt = Date.now() + paceMs;
    });
    launchQueue = turn.catch(() => undefined);
    return turn;
  };

  const runWorker = async (): Promise<void> => {
    while (!stopped) {
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex += 1;

      await waitForLaunchSlot();
      if (stopped) return;

      try {
        results[index] = await worker(items[index], index);
      } catch (err) {
        stopped = true;
        throw err;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
