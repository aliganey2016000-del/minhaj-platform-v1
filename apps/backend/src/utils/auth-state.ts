/**
 * Live account state for access-token checks.
 *
 * An access token is valid for 15 minutes, so a deactivated account, a role
 * change or a removed staff permission used to keep working until it
 * expired. authMiddleware now compares the token with the account's current
 * state, cached briefly so this costs one small query per user per
 * AUTH_STATE_TTL_MS rather than one per request. Changes made through User
 * Management drop the cached entry at once on this instance.
 */

import User from '../models/user.model';

export const AUTH_STATE_TTL_MS = 30_000;
const MAX_ENTRIES = 5000;

export interface AuthState {
  exists: boolean;
  isActive: boolean;
  role?: string;
  permissions: string[];
  organizationId?: string;
}

const cache = new Map<string, { state: AuthState; expiresAt: number }>();

// Anything that needs to react the instant an account's auth state is
// invalidated (deactivation, role change, permission/sidebar change) —
// currently just the Socket.IO layer, which otherwise has no reason to
// re-check a connection after its initial handshake and would keep an
// already-open socket alive (still receiving notifications/presence/live
// updates) for as long as the browser tab stays open, even though the same
// account's next HTTP request would already be rejected. Registered via
// `onAuthStateInvalidated` rather than importing socket.ts directly here,
// to avoid a circular import (socket.ts already imports this module).
type InvalidationListener = (userId: string) => void;
const invalidationListeners: InvalidationListener[] = [];

export function onAuthStateInvalidated(listener: InvalidationListener): void {
  invalidationListeners.push(listener);
}

export function flattenPermissions(permissions: any[] | undefined): string[] {
  return (permissions || []).flatMap((permission: any) => (permission.actions || []).map((action: string) =>
    permission.page ? `page:${permission.page}.${action}` : `${permission.module}.${action}`));
}

export async function getAuthState(userId: string): Promise<AuthState> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.state;

  const user: any = await User.findById(userId).select('isActive role permissions organizationId').lean();
  const state: AuthState = user
    ? {
        exists: true,
        isActive: user.isActive !== false,
        role: user.role,
        permissions: flattenPermissions(user.permissions),
        organizationId: user.organizationId ? String(user.organizationId) : undefined,
      }
    : { exists: false, isActive: false, permissions: [] };

  if (cache.size >= MAX_ENTRIES) {
    for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
    while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  }
  cache.set(userId, { state, expiresAt: now + AUTH_STATE_TTL_MS });
  return state;
}

export function invalidateAuthState(userId: unknown): void {
  if (!userId) return;
  const id = String(userId);
  cache.delete(id);
  for (const listener of invalidationListeners) {
    try {
      listener(id);
    } catch (error) {
      // A listener failure must never block the cache invalidation itself.
      console.error('onAuthStateInvalidated listener failed:', error);
    }
  }
}

/** Why a token no longer matches its account, or null when it still does. */
export function tokenMismatch(
  state: AuthState,
  token: { role: string; permissions?: string[]; organizationId?: string },
): string | null {
  if (!state.exists) return 'This account no longer exists.';
  if (!state.isActive) return 'Your account has been deactivated. Please contact an administrator.';
  if (state.role !== token.role) return 'Your access has changed. Please sign in again.';
  // A platform admin moving a user to a different organization must take
  // effect immediately, not after the access token happens to expire: the
  // token's organizationId claim is what every tenant-scoped query trusts
  // (see req.user.organizationId), so a stale claim would let the user keep
  // acting on their old organization's data after being reassigned away
  // from it.
  if ((state.organizationId || '') !== (token.organizationId || '')) {
    return 'Your access has changed. Please sign in again.';
  }
  if (state.role === 'staff') {
    const current = [...state.permissions].sort().join('|');
    const claimed = [...(token.permissions || [])].sort().join('|');
    if (current !== claimed) return 'Your access has changed. Please sign in again.';
  }
  return null;
}
