/**
 * Exam Attendance Model
 * Invigilator-marked exam-day attendance, distinct from regular course
 * attendance — this is per-exam, not per-class-session.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IExamAttendance extends Document {
  _id: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
  markedBy: mongoose.Types.ObjectId;
  markedAt: Date;
  school?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examAttendanceSchema = new Schema<IExamAttendance>(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'excused'],
      required: true,
      default: 'absent',
    },
    notes: { type: String, default: '', maxlength: 500 },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    markedAt: { type: Date, default: Date.now },
    // Stamped from the exam's own org — kept for efficient tenant-scoped queries.
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

// One attendance record per student per exam (re-marking updates it in place).
examAttendanceSchema.index({ exam: 1, student: 1 }, { unique: true });

export default mongoose.model<IExamAttendance>('ExamAttendance', examAttendanceSchema);
