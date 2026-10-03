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
}

const cache = new Map<string, { state: AuthState; expiresAt: number }>();

export function flattenPermissions(permissions: any[] | undefined): string[] {
  return (permissions || []).flatMap((permission: any) => (permission.actions || []).map((action: string) =>
    permission.page ? `page:${permission.page}.${action}` : `${permission.module}.${action}`));
}

export async function getAuthState(userId: string): Promise<AuthState> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.state;

  const user: any = await User.findById(userId).select('isActive role permissions').lean();
  const state: AuthState = user
    ? { exists: true, isActive: user.isActive !== false, role: user.role, permissions: flattenPermissions(user.permissions) }
    : { exists: false, isActive: false, permissions: [] };

  if (cache.size >= MAX_ENTRIES) {
    for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
    while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  }
  cache.set(userId, { state, expiresAt: now + AUTH_STATE_TTL_MS });
  return state;
}

export function invalidateAuthState(userId: unknown): void {
  if (userId) cache.delete(String(userId));
}

/** Why a token no longer matches its account, or null when it still does. */
export function tokenMismatch(state: AuthState, token: { role: string; permissions?: string[] }): string | null {
  if (!state.exists) return 'This account no longer exists.';
  if (!state.isActive) return 'Your account has been deactivated. Please contact an administrator.';
  if (state.role !== token.role) return 'Your access has changed. Please sign in again.';
  if (state.role === 'staff') {
    const current = [...state.permissions].sort().join('|');
    const claimed = [...(token.permissions || [])].sort().join('|');
    if (current !== claimed) return 'Your access has changed. Please sign in again.';
  }
  return null;
}
