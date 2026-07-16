/**
 * Exam Appeal Model
 * A student-submitted grade review / violation dispute / general exam issue
 * report ("Academic Appeals"), reviewed by admin/teacher.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IExamAppeal extends Document {
  _id: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  type: 'grade_review' | 'violation_dispute' | 'other';
  description: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  adminResponse?: string;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  school?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examAppealSchema = new Schema<IExamAppeal>(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    type: { type: String, enum: ['grade_review', 'violation_dispute', 'other'], required: true },
    description: { type: String, required: [true, 'Description is required'], maxlength: 2000 },
    status: { type: String, enum: ['pending', 'under_review', 'approved', 'rejected'], default: 'pending', index: true },
    adminResponse: { type: String, default: '' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

export default mongoose.model<IExamAppeal>('ExamAppeal', examAppealSchema);
