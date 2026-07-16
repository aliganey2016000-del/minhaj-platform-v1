/**
 * Seat Allocation Model
 * Assigns an enrolled student to a room + desk number for a specific exam.
 * One seat per student per exam; one occupant per desk per exam.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface ISeatAllocation extends Document {
  _id: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  deskNumber: string;
  school?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const seatAllocationSchema = new Schema<ISeatAllocation>(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    room: { type: Schema.Types.ObjectId, ref: 'ExamRoom', required: true, index: true },
    deskNumber: { type: String, required: true, trim: true },
    // Stamped from the exam's own org — kept for efficient tenant-scoped queries.
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

// One seat per student per exam.
seatAllocationSchema.index({ exam: 1, student: 1 }, { unique: true });
// No two students at the same desk in the same room for the same exam.
seatAllocationSchema.index({ exam: 1, room: 1, deskNumber: 1 }, { unique: true });

export default mongoose.model<ISeatAllocation>('SeatAllocation', seatAllocationSchema);
