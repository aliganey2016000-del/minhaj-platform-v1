/**
 * Exam Eligibility Model
 * Records the exact moment a student first met an auto-scheduled exam's
 * prerequisites — the anchor point everything else is computed from:
 *   scheduledStart = eligibleAt + exam.autoScheduleDelayDays
 *   scheduledEnd   = scheduledStart + exam.autoScheduleWindowDays
 * Written once (first-eligible wins) so re-checking eligibility on every
 * page load never shifts a student's personal exam window.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface IExamEligibility extends Document {
  exam: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  eligibleAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const examEligibilitySchema = new Schema<IExamEligibility>(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    eligibleAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

examEligibilitySchema.index({ exam: 1, student: 1 }, { unique: true });

export default mongoose.model<IExamEligibility>('ExamEligibility', examEligibilitySchema);
