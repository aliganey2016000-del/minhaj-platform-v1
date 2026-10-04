/**
 * Offline Sync — replays the pendingActions queue (progress/gamification
 * calls made while offline) against the real API once the connection is
 * back. Call `initOfflineSync()` once near app startup.
 */

import api from './axios';
import { getQueuedActions, removeQueuedAction } from './offline-store';

let flushing = false;

export async function flushPendingActions(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
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
  } finally {
    flushing = false;
  }
}

export function initOfflineSync(): void {
  window.addEventListener('online', () => { void flushPendingActions(); });
  if (navigator.onLine) void flushPendingActions();
}
