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
      } catch {
        // Leave it queued — could be a real server error, not just offline;
        // it'll retry on the next flush trigger without blocking the rest.
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
