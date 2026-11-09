/**
 * Master seating plan: one room/seat per student for an exam period
 * (e.g. MONTHLY EXAM I). Rows created before periods were tracked carry no
 * `period` and stay scoped by academic year + exam type.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface IExamSeatingPlan extends Document {
  _id: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  deskNumber: string;
  academicYear: string;
  examType: 'mid' | 'final';
  period?: mongoose.Types.ObjectId | null;
  school?: mongoose.Types.ObjectId | null;
  locked?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IExamSeatingPlan>({
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  room: { type: Schema.Types.ObjectId, ref: 'ExamRoom', required: true, index: true },
  deskNumber: { type: String, required: true, trim: true },
  academicYear: { type: String, required: true, trim: true, index: true },
  examType: { type: String, enum: ['mid', 'final'], required: true, index: true },
  period: { type: Schema.Types.ObjectId, ref: 'ExamPeriod', default: null, index: true },
  school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  locked: { type: Boolean, default: false, index: true },
}, { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; if (typeof ret.deskNumber === 'string' && ret.deskNumber.startsWith('__ROOM_ONLY__')) ret.deskNumber = ''; return ret; } } });

// Room-only generation still needs a non-empty database value because
// deskNumber participates in the unique room/seat index. The placeholder is
// deterministic per student and is hidden again by the JSON transform above.
schema.pre('validate', function(next) {
  if (!this.deskNumber && this.student) {
    this.deskNumber = `__ROOM_ONLY__${this.student.toString()}`;
  }
  next();
});

// One seat per student, and one student per desk, within each exam period.
// The previous indexes (without `period`) are dropped at boot by
// scripts/repair-exam-seating-indexes.ts so two periods in the same year can
// each have their own allocation.
schema.index({ school: 1, academicYear: 1, examType: 1, period: 1, student: 1 }, { unique: true, name: 'seating_period_student_unique' });
schema.index({ school: 1, academicYear: 1, examType: 1, period: 1, room: 1, deskNumber: 1 }, { unique: true, name: 'seating_period_desk_unique' });

export default mongoose.model<IExamSeatingPlan>('ExamSeatingPlan', schema);
