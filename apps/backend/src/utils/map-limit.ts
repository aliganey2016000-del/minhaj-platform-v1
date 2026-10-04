/**
 * Runs `fn` over `items` with at most `limit` calls in flight.
 *
 * `Promise.all(items.map(fn))` starts every call at once: recalculating the
 * balance of 5,000 students after a bulk invoice run, or notifying a whole
 * school, opened thousands of simultaneous database operations (the driver
 * only has ~100 connections, so everything else on the server queued behind
 * them). Results keep the input order; the first error rejects like Promise.all.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
