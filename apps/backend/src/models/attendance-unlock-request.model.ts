import mongoose, { Schema, Document } from 'mongoose';

export type AttendanceUnlockRequestStatus = 'pending' | 'approved' | 'rejected';

export interface IAttendanceUnlockRequest extends Document {
  school: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  schedule: mongoose.Types.ObjectId;
  date: Date;
  teacher: mongoose.Types.ObjectId;
  reason: string;
  status: AttendanceUnlockRequestStatus;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAttendanceUnlockRequest>({
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  schedule: { type: Schema.Types.ObjectId, ref: 'ClassSchedule', required: true, index: true },
  date: { type: Date, required: true, index: true },
  teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
  reason: { type: String, trim: true, minlength: 3, maxlength: 1000, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
}, { timestamps: true });

schema.index({ school: 1, schedule: 1, date: 1, status: 1 });
export default mongoose.model<IAttendanceUnlockRequest>('AttendanceUnlockRequest', schema);
