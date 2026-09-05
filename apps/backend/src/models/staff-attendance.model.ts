import mongoose, { Document, Schema } from 'mongoose';

export type StaffAttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface IStaffAttendance extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  date: Date;
  status: StaffAttendanceStatus;
  notes?: string;
  markedBy: mongoose.Types.ObjectId;
  markedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const staffAttendanceSchema = new Schema<IStaffAttendance>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  date: { type: Date, required: true, index: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true, default: 'present' },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  markedAt: { type: Date, default: Date.now },
}, { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } });

staffAttendanceSchema.index({ organizationId: 1, user: 1, date: 1 }, { unique: true });

export default mongoose.model<IStaffAttendance>('StaffAttendance', staffAttendanceSchema);
