/**
 * Random Quiz Attempt Session
 *
 * Stores the exact generated question set for a student before submission.
 * This prevents source/config edits from changing an in-progress random quiz.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface IQuizAttemptSession extends Document {
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  quizId: string;
  questions: any[];
  configVersion: number;
  createdAt: Date;
  expiresAt?: Date;
}

const quizAttemptSessionSchema = new Schema<IQuizAttemptSession>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    quizId: { type: String, required: true, index: true },
    questions: { type: [Schema.Types.Mixed], required: true },
    configVersion: { type: Number, required: true, default: 1 },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

quizAttemptSessionSchema.index({ student: 1, quizId: 1, createdAt: -1 });
quizAttemptSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IQuizAttemptSession>('QuizAttemptSession', quizAttemptSessionSchema);
