import mongoose, { Schema, Document } from 'mongoose';

/**
 * Claim ticket for "this student has already been awarded gamification XP
 * for completing this lesson."
 *
 * gamification.controller.ts's completeLesson (POST /gamification/complete-lesson)
 * used to award +10 XP and +1 totalLessonsCompleted on every call, with no
 * check against the specific lesson at all — a student revisiting a lesson
 * and clicking "Mark as Completed" again (or simply replaying the request,
 * e.g. via the offline action queue retrying after a lost response) could
 * farm unlimited XP, inflate the leaderboard, and unlock the "bookworm"
 * badge (10 lessons) without completing 10 distinct lessons.
 *
 * Same atomic-claim technique as quiz-first-attempt-claim.model.ts /
 * reminder-lock.model.ts (findOneAndUpdate with `upsert: true, new: false`),
 * but its own collection since, like the quiz claim, this must never expire.
 * When the request doesn't carry a lessonId (older clients, or callers that
 * don't identify a specific lesson), the controller falls back to its
 * previous always-award behavior rather than guessing a key.
 */
export interface ILessonFirstCompleteClaim extends Document {
  student: mongoose.Types.ObjectId;
  courseId: string;
  lessonId: string;
  createdAt: Date;
}

const schema = new Schema<ILessonFirstCompleteClaim>({
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  courseId: { type: String, required: true },
  lessonId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

schema.index({ student: 1, courseId: 1, lessonId: 1 }, { unique: true });

export default mongoose.model<ILessonFirstCompleteClaim>('LessonFirstCompleteClaim', schema);
