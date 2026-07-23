/**
 * Manual Grade Entry — a teacher-entered 0-100 score for one grading
 * category that has no automatic data source (e.g. "Participation"), or
 * bonus points awarded on top of the weighted total (categoryKey: '__bonus').
 * One row per (course, student, categoryKey).
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IManualGradeEntry extends Document {
  _id: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  categoryKey: string;
  score: number; // 0-100 for a category; 0-bonusCapPercent when categoryKey === '__bonus'
  enteredBy: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const manualGradeEntrySchema = new Schema<IManualGradeEntry>(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    categoryKey: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

manualGradeEntrySchema.index({ course: 1, student: 1, categoryKey: 1 }, { unique: true });

export default mongoose.model<IManualGradeEntry>('ManualGradeEntry', manualGradeEntrySchema);
