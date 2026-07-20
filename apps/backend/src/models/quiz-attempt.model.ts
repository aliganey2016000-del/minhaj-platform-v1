/**
 * Quiz Attempt Model
 *
 * One document per student submission of a quiz — the durable, auditable
 * record of what was answered and how it was graded. Progress/Gamification
 * only get incremented on a student's FIRST attempt at a given quiz (see
 * quiz.controller.ts submitAttempt) so retries don't farm XP, but every
 * attempt (first or retry) gets its own record here.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IQuizAnswerRecord {
  questionId: string;
  selectedAnswer: unknown;
  correct: boolean;
  points: number;
}

export interface IQuizAttempt extends Document {
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  quizId: string; // the quiz subdocument's _id within CourseContent
  answers: IQuizAnswerRecord[];
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  durationSeconds: number;
  isFirstAttempt: boolean;
  createdAt: Date;
}

const quizAnswerRecordSchema = new Schema<IQuizAnswerRecord>(
  {
    questionId: { type: String, required: true },
    selectedAnswer: { type: Schema.Types.Mixed },
    correct: { type: Boolean, required: true },
    points: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const quizAttemptSchema = new Schema<IQuizAttempt>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    quizId: { type: String, required: true, index: true },
    answers: { type: [quizAnswerRecordSchema], default: [] },
    score: { type: Number, required: true },
    totalPoints: { type: Number, required: true },
    percentage: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    durationSeconds: { type: Number, default: 0, min: 0 },
    isFirstAttempt: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

quizAttemptSchema.index({ student: 1, quizId: 1, createdAt: -1 });

export default mongoose.model<IQuizAttempt>('QuizAttempt', quizAttemptSchema);
