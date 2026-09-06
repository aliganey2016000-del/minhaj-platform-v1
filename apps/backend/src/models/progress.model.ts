/**
 * Progress Model
 * Tracks a student's progress within an enrolled course.
 * Each document represents one student's journey through one course.
 */

import mongoose, { Schema, Document } from 'mongoose';
import CourseContent from './course-content.model';

// ---------------------------------------------------------------------------
// TypeScript Interface
// ---------------------------------------------------------------------------

export interface IProgress extends Document {
  _id: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  completedLessons: number;
  completedQuizzes: number;
  completedAssignments: number;
  // Which specific chapter items (lesson/quiz/assignment _id strings) this
  // student has actually completed — the counters above are aggregate-only
  // and can't answer "did they finish chapter X specifically", which
  // auto-scheduled exam eligibility needs (see exam-attempt.controller.ts).
  completedItemIds: string[];
  totalItems: number; // cached from CourseContent for quick display
  lastAccessed: Date;
  status: 'in_progress' | 'completed';
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const progressSchema = new Schema<IProgress>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student reference is required'],
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course reference is required'],
      index: true,
    },
    completedLessons: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedQuizzes: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedAssignments: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedItemIds: {
      type: [String],
      default: [],
    },
    totalItems: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastAccessed: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
      index: true,
    },
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

// ---------------------------------------------------------------------------
// Compound Index — one progress record per student per course
// ---------------------------------------------------------------------------

progressSchema.index({ student: 1, course: 1 }, { unique: true });
progressSchema.index({ student: 1, status: 1 });
progressSchema.index({ lastAccessed: -1 });
progressSchema.index({ student: 1, completedAt: -1 });

// ---------------------------------------------------------------------------
// Virtual — computed progress percentage
// ---------------------------------------------------------------------------

progressSchema.virtual('progressPercent').get(function (this: IProgress) {
  if (this.totalItems === 0) return 0;
  const completed = this.completedLessons + this.completedQuizzes + this.completedAssignments;
  return Math.round((completed / this.totalItems) * 100);
});

progressSchema.set('toJSON', { virtuals: true });
progressSchema.set('toObject', { virtuals: true });

// ---------------------------------------------------------------------------
// Automatic course completion
// ---------------------------------------------------------------------------
//
// The learning flow records lesson completion by incrementing
// `completedLessons`. The final lesson is therefore the authoritative point
// at which a course can become completed. Keep the completion timestamp on
// the progress record itself so historical completion is not inferred later
// from a mutable counter.
//
// This hook also covers the first Progress document created directly with a
// final lesson already completed. `updateOne()` is used here rather than
// calling save() again, avoiding recursive post-save execution.
progressSchema.post('save', async function (doc: IProgress) {
  if (doc.status === 'completed' && doc.completedAt) return;
  if (doc.completedLessons < 1) return;

  const content = await CourseContent.findOne({ course: doc.course }).select('totalLessons').lean();
  const totalLessons = Number(content?.totalLessons || 0);
  if (totalLessons <= 0 || doc.completedLessons < totalLessons) return;

  const completedAt = doc.completedAt || new Date();
  await mongoose.model<IProgress>('Progress').updateOne(
    { _id: doc._id, status: { $ne: 'completed' } },
    { $set: { status: 'completed', completedAt } },
  );
});

// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------

const Progress = mongoose.model<IProgress>('Progress', progressSchema);
export default Progress;
