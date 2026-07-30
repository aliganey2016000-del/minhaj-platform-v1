/**
 * Exam Attendance Log — audit trail for changes to ExamAttendance records.
 * ExamAttendance itself holds one row per (exam, student), updated in
 * place on every re-mark, so it can never answer "what did this used to
 * say, and who changed it, and when" — this collection is the append-only
 * history that does.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IExamAttendanceLog extends Document {
  _id: mongoose.Types.ObjectId;
  attendance: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  changedBy: mongoose.Types.ObjectId;
  previousStatus: string | null;
  newStatus: string;
  previousNotes: string;
  newNotes: string;
  createdAt: Date;
}

const examAttendanceLogSchema = new Schema<IExamAttendanceLog>(
  {
    attendance: { type: Schema.Types.ObjectId, ref: 'ExamAttendance', required: true, index: true },
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    previousStatus: { type: String, default: null },
    newStatus: { type: String, required: true },
    previousNotes: { type: String, default: '' },
    newNotes: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

examAttendanceLogSchema.index({ exam: 1, student: 1, createdAt: -1 });

export default mongoose.model<IExamAttendanceLog>('ExamAttendanceLog', examAttendanceLogSchema);
