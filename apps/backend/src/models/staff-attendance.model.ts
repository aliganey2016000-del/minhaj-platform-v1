import mongoose, { Document, Schema } from 'mongoose';

export type StaffAttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type StaffAttendanceSource = 'admin' | 'smart_self';

export interface IStaffAttendanceVerification {
  gpsVerified: boolean;
  faceVerified: boolean;
  livenessVerified: boolean;
  distanceMeters?: number;
  accuracyMeters?: number;
  faceDistance?: number;
  challenge?: string[];
  device?: string;
}

export interface IStaffAttendance extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  date: Date;
  status: StaffAttendanceStatus;
  notes?: string;
  source: StaffAttendanceSource;
  checkInAt?: Date;
  checkOutAt?: Date;
  verification?: IStaffAttendanceVerification;
  checkOutVerification?: IStaffAttendanceVerification;
  markedBy: mongoose.Types.ObjectId;
  markedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const verificationSchema = new Schema<IStaffAttendanceVerification>({
  gpsVerified: { type: Boolean, default: false },
  faceVerified: { type: Boolean, default: false },
  livenessVerified: { type: Boolean, default: false },
  distanceMeters: { type: Number, min: 0, default: undefined },
  accuracyMeters: { type: Number, min: 0, default: undefined },
  faceDistance: { type: Number, min: 0, default: undefined },
  challenge: { type: [String], default: undefined },
  device: { type: String, trim: true, maxlength: 500, default: undefined },
}, { _id: false });

const staffAttendanceSchema = new Schema<IStaffAttendance>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  date: { type: Date, required: true, index: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true, default: 'present' },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  source: { type: String, enum: ['admin', 'smart_self'], default: 'admin', index: true },
  checkInAt: { type: Date, default: undefined },
  checkOutAt: { type: Date, default: undefined },
  verification: { type: verificationSchema, default: undefined },
  checkOutVerification: { type: verificationSchema, default: undefined },
  markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  markedAt: { type: Date, default: Date.now },
}, { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } });

staffAttendanceSchema.index({ organizationId: 1, user: 1, date: 1 }, { unique: true });

export default mongoose.model<IStaffAttendance>('StaffAttendance', staffAttendanceSchema);
