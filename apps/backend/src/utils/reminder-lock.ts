import ReminderLock from '../models/reminder-lock.model';

/**
 * Atomically claims `key` for a one-shot send. Returns true the first time
 * any caller claims a given key (go ahead and send), false on every
 * subsequent call for that key (already sent/claimed — skip).
 *
 * Extracted out of installment-reminder.service.ts (where this pattern was
 * first introduced to fix a check-then-act duplicate-send race) so every
 * other at-most-once notification job — attendance alerts, exam reminders,
 * etc — can share it instead of re-implementing the same
 * `exists`-then-`create` race.
 *
 * Safe against two schedulers/requests (two backend instances, overlapping
 * retries, a double-click on "mark attendance") racing on the same key: see
 * reminder-lock.model.ts for why this is race-safe without a separate
 * read-then-write step.
 */
export async function claimOnce(key: string): Promise<boolean> {
  try {
    const result = await ReminderLock.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, createdAt: new Date() } },
      { upsert: true, new: false },
    );
    // `new: false` returns the pre-update document — null means nothing
    // matched before this call's upsert created it, i.e. we won the claim.
    return result === null;
  } catch (error: any) {
    // A duplicate-key error here means another caller's insert landed in
    // between our findOneAndUpdate's match and insert steps (possible on
    // some server versions without the automatic upsert retry) — that is
    // itself proof someone else claimed it first.
    if (error?.code === 11000) return false;
    throw error;
  }
}
