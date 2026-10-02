/**
 * A tiny in-memory cache for expensive, read-heavy dashboard aggregations.
 *
 * Several admins at the same school opening the dashboard within the same
 * few seconds (or one admin re-rendering/navigating back and forth) used to
 * each recompute the same handful of heavy aggregations from scratch. This
 * lets near-simultaneous callers share one computed result for a short TTL
 * instead. Deliberately process-local (matches this backend's single-
 * instance deployment, no Redis) — a multi-instance deployment would need a
 * shared cache instead.
 *
 * This is a deliberate staleness trade-off, not a correctness guarantee: a
 * write (a new student, a payment, an attendance submission) may not be
 * reflected in the dashboard for up to `ttlMs`. Keep TTLs short (seconds,
 * not minutes) and only use this for summary/dashboard reads where a few
 * seconds of staleness is acceptable — never for a page that must reflect
 * the caller's own just-made write.
 */

interface CacheEntry {
  promise: Promise<unknown>;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/**
 * Returns the cached value for `key` if still fresh; otherwise computes it
 * once and caches it for `ttlMs` milliseconds. Concurrent callers for the
 * same key while that computation is in flight share the same promise
 * instead of each starting their own copy of the same expensive work.
 */
export async function microCache<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;

  const promise = compute();
  store.set(key, { promise, expiresAt: now + ttlMs });
  try {
    return await promise;
  } catch (error) {
    // Never cache a failure — the next request should retry rather than
    // keep replaying the same error for the rest of the TTL window.
    if (store.get(key)?.promise === promise) store.delete(key);
    throw error;
  }
}
