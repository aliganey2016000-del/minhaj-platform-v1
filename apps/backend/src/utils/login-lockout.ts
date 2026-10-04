/**
 * Login lockout, bound to (email, IP) rather than email alone.
 *
 * The persisted `User.failedLoginAttempts` / `lockedUntil` fields count
 * failures for an account across every IP, which let anyone lock any known
 * account's sign-in from anywhere with five bad requests — a trivial
 * single-account denial-of-service with no knowledge of the password. The
 * actual lockout enforced here is instead keyed by (email, ip): the same
 * attacker IP has to fail five times against the same account before that
 * pair is locked, and a legitimate user on a different network is
 * unaffected. The DB fields are still updated by the caller for audit/UI
 * (e.g. an admin's user security view) but are not read here.
 *
 * State lives in a bounded in-memory Map, the same pattern as
 * utils/auth-state.ts: fine for this app's single-instance deployment,
 * reset on restart (which also clears any stuck lockouts), and capped so a
 * flood of distinct (email, ip) pairs cannot grow it without bound.
 */

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const MAX_ENTRIES = 10000;

interface Entry {
  count: number;
  lockedUntil?: number;
  expiresAt: number;
}

const attempts = new Map<string, Entry>();

function keyFor(email: string, ip: string): string {
  return `${email.trim().toLowerCase()}|${ip || 'unknown'}`;
}

function prune(now: number): void {
  if (attempts.size < MAX_ENTRIES) return;
  for (const [k, entry] of attempts) {
    if (entry.expiresAt <= now) attempts.delete(k);
  }
  // Still over the cap after dropping expired entries (e.g. a burst of
  // distinct pairs within one TTL window) — evict oldest-inserted first
  // rather than let the map grow unbounded.
  while (attempts.size >= MAX_ENTRIES) {
    const oldestKey = attempts.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    attempts.delete(oldestKey);
  }
}

/** True when this (email, ip) pair is currently locked out. */
export function isLoginLocked(email: string, ip: string): boolean {
  const now = Date.now();
  const key = keyFor(email, ip);
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.expiresAt <= now) {
    attempts.delete(key);
    return false;
  }
  return Boolean(entry.lockedUntil && entry.lockedUntil > now);
}

/** Record one failed attempt for (email, ip); returns whether it is now locked. */
export function recordFailedLogin(email: string, ip: string): { count: number; locked: boolean } {
  const now = Date.now();
  const key = keyFor(email, ip);
  let entry = attempts.get(key);
  if (!entry || entry.expiresAt <= now) {
    entry = { count: 0, expiresAt: now + TTL_MS };
  }
  entry.count += 1;
  entry.expiresAt = now + TTL_MS;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + TTL_MS;
  }
  attempts.set(key, entry);
  prune(now);
  return { count: entry.count, locked: Boolean(entry.lockedUntil) };
}

/** Clear any tracked failures for (email, ip), e.g. after a successful login. */
export function clearLoginAttempts(email: string, ip: string): void {
  attempts.delete(keyFor(email, ip));
}

/** Test-only: the number of tracked (email, ip) pairs. */
export function _loginLockoutSizeForTests(): number {
  return attempts.size;
}
