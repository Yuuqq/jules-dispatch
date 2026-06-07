export function validateBatchSize(value: number, name = 'parallel'): void {
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new Error(`Invalid ${name} value. Expected an integer from 1 to 50.`);
  }
}

export async function runBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  validateBatchSize(batchSize);

  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, offset) => worker(item, i + offset)),
    );
    results.push(...batchResults);
  }

  return results;
}
