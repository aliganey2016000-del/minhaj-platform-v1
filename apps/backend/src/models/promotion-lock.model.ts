import mongoose, { Schema, Document } from 'mongoose';

/**
 * Claim ticket serializing year-end promotion runs for one school.
 *
 * Why this exists: both bulk promote-all and per-student promote-reviewed
 * read every active student's current class/enrollmentHistory, decide who
 * still needs to move, and then mutate each student with a plain
 * `document.save()` (reassignStudentClassCourses -> syncEnrollmentHistory).
 * A double-click of "Confirm Promotion", or a client retry firing while the
 * first request is still running server-side, launches a second run before
 * the first one's writes land. Both reads see the same pre-promotion state,
 * so both independently decide the same students still need to move and
 * both push a new enrollmentHistory entry from their own in-memory copy of
 * the array. Because `enrollmentHistory` is an array mutated via push,
 * Mongoose's optimistic `__v` check on `save()` makes the second writer's
 * save throw a VersionError for every student the two runs overlap on —
 * aborting that request mid-batch (leaving later classes in the same run
 * unprocessed) instead of either queuing behind the first run or cleanly
 * rejecting the duplicate click.
 *
 * Reusing the same atomic-claim shape as reminder-lock.model.ts (a single
 * `findOneAndUpdate(..., { upsert: true, new: false })`): MongoDB resolves a
 * concurrent double-insert against the same unique `key` by retrying the
 * losing side as a match rather than a duplicate-key error, so exactly one
 * caller ever observes "I claimed it". Unlike a reminder (fire-and-forget,
 * cleaned up only by TTL), a promotion run actively releases its claim when
 * it finishes (success or failure) so an admin can immediately retry after
 * a real error; the TTL below is only a safety net against a crashed
 * process leaving a stale claim behind.
 */
export interface IPromotionLock extends Document {
  key: string;
  createdAt: Date;
}

const schema = new Schema<IPromotionLock>({
  key: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 15 * 60 },
});

export default mongoose.model<IPromotionLock>('PromotionLock', schema);
