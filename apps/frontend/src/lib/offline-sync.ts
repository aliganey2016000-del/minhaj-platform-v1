/**
 * Offline Sync — replays the pendingActions queue (progress/gamification
 * calls made while offline) against the real API once the connection is
 * back. Call `initOfflineSync()` once near app startup.
 */

import api from './axios';
import { getQueuedActions, removeQueuedAction } from './offline-store';

let flushing = false;

// `pendingActions` lives in IndexedDB, which every tab of this origin
// shares — but `flushing` above is a plain module-level variable, scoped to
// one tab's JS context. A student with the app open in two tabs (or a tab
// plus a reinstalled/updated PWA window) who regains connectivity fires the
// `online` listener in BOTH tabs at once: each independently calls
// getQueuedActions(), both read the SAME still-queued quiz-submit-attempt /
// gamification action before either has deleted it, and both POST it to the
// server — a real duplicate quiz attempt or double-counted XP/streak, not
// just a corner case. `navigator.locks` (Web Locks API) is the one
// primitive that actually serializes work across tabs/workers of the same
// origin, so the whole read-replay-delete cycle below runs inside it;
// `ifAvailable: true` means a tab that loses the race simply skips this
// round instead of queueing behind the winner — the winner's own flush
// already drains the queue for everyone, since IndexedDB is shared.
// Browsers without the Web Locks API (older Safari) fall back to running
// unlocked, same as before this fix.
async function withCrossTabLock(fn: () => Promise<void>): Promise<void> {
  const locks = (navigator as any).locks;
  if (!locks?.request) {
    await fn();
    return;
  }
  await locks.request('sahal-offline-sync-flush', { ifAvailable: true }, async (lock: unknown) => {
    if (!lock) return; // another tab already holds it and will drain the queue
    await fn();
  });
}

export async function flushPendingActions(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    await withCrossTabLock(async () => {
      const actions = await getQueuedActions();
      // Replay in the order they were queued so e.g. a lesson-complete lands
      // before the streak update that followed it.
      for (const action of actions.sort((a, b) => a.createdAt - b.createdAt)) {
        try {
          await api.post(action.url, action.body);
          if (action.id !== undefined) await removeQueuedAction(action.id);
        } catch (err: any) {
          // A response (as opposed to a network/timeout failure, which has no
          // `response`) means the server actually looked at this request and
          // rejected it. For a 4xx other than 408/429 that rejection is
          // permanent — bad payload, not found, forbidden, already-submitted
          // conflict, or (notably) a stale action left over from a different
          // account on this device that no longer matches who's signed in now.
          // Retrying it unchanged would fail identically forever, hammering
          // the server on every reconnect/flush and never letting the queue
          // drain. Drop only those; a genuine transient failure (no response,
          // or 5xx/408/429) stays queued for the next flush.
          const status = err?.response?.status;
          const isPermanentRejection = typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
          if (isPermanentRejection && action.id !== undefined) {
            await removeQueuedAction(action.id);
          }
        }
      }
    });
  } finally {
    flushing = false;
  }
}

export function initOfflineSync(): void {
  window.addEventListener('online', () => { void flushPendingActions(); });
  if (navigator.onLine) void flushPendingActions();
}
