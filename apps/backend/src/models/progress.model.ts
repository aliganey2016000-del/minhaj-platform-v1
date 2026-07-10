/**
 * Progress Model
 * Tracks a student's progress within an enrolled course.
 * Each document represents one student's journey through one course.
 */

import mongoose, { Schema, Document } from 'mongoose';

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
  totalItems: number; // cached from CourseContent for quick display
  lastAccessed: Date;
  status: 'in_progress' | 'completed';
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
// Model Export
// ---------------------------------------------------------------------------

const Progress = mongoose.model<IProgress>('Progress', progressSchema);
export default Progress;