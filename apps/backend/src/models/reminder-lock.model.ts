import mongoose, { Schema, Document } from 'mongoose';

/**
 * Claim ticket for a one-shot recurring reminder (installment reminders,
 * and any future daily/periodic notification job that must send a given
 * message at most once).
 *
 * Why this exists: `sendInstallmentReminders` used to dedupe purely by
 * checking `Notification.exists({ user, 'metadata.dedupeKey' })` before
 * creating the notification — a classic check-then-act race. Two backend
 * instances both running the scheduler (the normal case until leader
 * election exists — see server.ts's RUN_SCHEDULERS comment), or even the
 * same instance's boot-time "send now" call overlapping its first
 * `setInterval` tick, could both pass the `exists` check before either had
 * inserted anything, and both send the same reminder.
 *
 * `key` is globally unique (not scoped by `user` as a compound key) and
 * every document that is ever inserted here has one, so a plain unique
 * index is correct — no partialFilterExpression needed. Claiming is a
 * single atomic `findOneAndUpdate(..., { upsert: true })`: MongoDB resolves
 * a concurrent double-insert against the same unique key by retrying the
 * losing side as a match instead of a duplicate-key error, so exactly one
 * caller ever observes "I created it" for a given key.
 *
 * TTL-expires a day after the reminder's own day-bucket, so the collection
 * self-cleans instead of growing forever.
 */
export interface IReminderLock extends Document {
  key: string;
  createdAt: Date;
}

const schema = new Schema<IReminderLock>({
  key: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 2 * 24 * 60 * 60 },
});

export default mongoose.model<IReminderLock>('ReminderLock', schema);
