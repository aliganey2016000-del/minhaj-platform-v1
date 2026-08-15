/** Master seating plan: one room/seat per student for an academic year + exam type. */
import mongoose, { Schema, Document } from 'mongoose';

export interface IExamSeatingPlan extends Document {
  _id: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  deskNumber: string;
  academicYear: string;
  examType: 'mid' | 'final';
  school?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IExamSeatingPlan>({
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  room: { type: Schema.Types.ObjectId, ref: 'ExamRoom', required: true, index: true },
  deskNumber: { type: String, required: true, trim: true },
  academicYear: { type: String, required: true, trim: true, index: true },
  examType: { type: String, enum: ['mid', 'final'], required: true, index: true },
  school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
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

schema.index({ school: 1, academicYear: 1, examType: 1, student: 1 }, { unique: true });
schema.index({ school: 1, academicYear: 1, examType: 1, room: 1, deskNumber: 1 }, { unique: true });

export default mongoose.model<IExamSeatingPlan>('ExamSeatingPlan', schema);
