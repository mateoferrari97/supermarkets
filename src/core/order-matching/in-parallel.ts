export async function inParallel<T, R>(
  values: T[],
  limit: number,
  signal: AbortSignal,
  work: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (next < values.length && !failed) {
      signal.throwIfAborted();
      const index = next++;
      try {
        results[index] = await work(values[index]!, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}
