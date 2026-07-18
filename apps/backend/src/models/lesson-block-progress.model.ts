/**
 * Lesson Block Progress Model
 *
 * Tracks a student's progress through an "Interactive Gate" lesson's
 * content blocks — how far they've unlocked, and their answer history.
 * One document per (student, lessonId) pair. Separate from the aggregate
 * `Progress` model (which only counts completed lessons/quizzes/assignments
 * course-wide) since gate progress needs per-block granularity that would
 * otherwise bloat that model's simple counter shape.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IBlockAttempt {
  blockIndex: number;
  selectedAnswer: number | boolean; // mcq option index, or true/false
  correct: boolean;
  attemptedAt: Date;
}

export interface ILessonBlockProgress extends Document {
  _id: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  lessonId: mongoose.Types.ObjectId; // the lesson subdocument's _id within CourseContent
  unlockedBlockIndex: number;        // highest block index the student may currently view
  gateCompleted: boolean;            // true once they've cleared the last block's question
  attempts: IBlockAttempt[];
  createdAt: Date;
  updatedAt: Date;
}

const blockAttemptSchema = new Schema<IBlockAttempt>(
  {
    blockIndex: { type: Number, required: true },
    selectedAnswer: { type: Schema.Types.Mixed },
    correct: { type: Boolean, required: true },
    attemptedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const lessonBlockProgressSchema = new Schema<ILessonBlockProgress>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    lessonId: { type: Schema.Types.ObjectId, required: true, index: true },
    unlockedBlockIndex: { type: Number, default: 0 },
    gateCompleted: { type: Boolean, default: false },
    attempts: { type: [blockAttemptSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

lessonBlockProgressSchema.index({ student: 1, lessonId: 1 }, { unique: true });

const LessonBlockProgress = mongoose.model<ILessonBlockProgress>('LessonBlockProgress', lessonBlockProgressSchema);
export default LessonBlockProgress;
