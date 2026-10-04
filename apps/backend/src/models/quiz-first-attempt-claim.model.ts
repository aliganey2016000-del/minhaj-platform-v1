import mongoose, { Schema, Document } from 'mongoose';

/**
 * Claim ticket for "this is the student's first-ever attempt at this quiz."
 *
 * quiz.controller.ts's submitAttempt used to decide `isFirstAttempt` with
 * `!(await QuizAttempt.exists({ student, quizId }))`, checked *before*
 * `QuizAttempt.create(...)` ran — a classic check-then-act race, the same
 * shape as the attendance-alert/installment-reminder duplicate-send races
 * fixed earlier (see reminder-lock.model.ts). Two concurrent submissions of
 * the same quiz (a double-click, or a retried request on a flaky network)
 * could both observe "no attempt yet" before either insert landed, and both
 * get treated as the first attempt — double-incrementing
 * Progress.completedQuizzes and double-awarding gamification XP for a
 * single quiz.
 *
 * This mirrors ReminderLock's atomic upsert-claim technique (findOneAndUpdate
 * with `upsert: true, new: false` — the pre-update document is null only for
 * whichever caller's upsert actually inserted the row), but needs its own
 * collection rather than reusing ReminderLock: a reminder claim is meant to
 * expire and be re-claimable (TTL, see reminder-lock.model.ts), while a
 * quiz's "first attempt" claim must never expire — a retry made months later
 * must still never re-award XP.
 */
export interface IQuizFirstAttemptClaim extends Document {
  student: mongoose.Types.ObjectId;
  quizId: string;
  createdAt: Date;
}

const schema = new Schema<IQuizFirstAttemptClaim>({
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  quizId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Compound unique index: at most one claim per (student, quiz), ever.
schema.index({ student: 1, quizId: 1 }, { unique: true });

export default mongoose.model<IQuizFirstAttemptClaim>('QuizFirstAttemptClaim', schema);
