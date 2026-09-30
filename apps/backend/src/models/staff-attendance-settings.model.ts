import mongoose, { Document, Schema } from 'mongoose';

export interface IStaffAttendanceSettings extends Document {
  organizationId: mongoose.Types.ObjectId;
  enabled: boolean;
  latitude?: number;
  longitude?: number;
  locationAccuracyMeters: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
  faceMatchThreshold: number;
  requireLiveness: boolean;
  enrollmentRequiresGeofence: boolean;
  checkOutEnabled: boolean;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const staffAttendanceSettingsSchema = new Schema<IStaffAttendanceSettings>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true, index: true },
  enabled: { type: Boolean, default: true },
  latitude: { type: Number, min: -90, max: 90, default: undefined },
  longitude: { type: Number, min: -180, max: 180, default: undefined },
  locationAccuracyMeters: { type: Number, min: 0, max: 5000, default: 0 },
  radiusMeters: { type: Number, min: 20, max: 5000, default: 150 },
  maxAccuracyMeters: { type: Number, min: 10, max: 1000, default: 100 },
  faceMatchThreshold: { type: Number, min: 0.3, max: 0.8, default: 0.52 },
  requireLiveness: { type: Boolean, default: true },
  enrollmentRequiresGeofence: { type: Boolean, default: true },
  checkOutEnabled: { type: Boolean, default: true },
  timezone: { type: String, trim: true, maxlength: 100, default: 'Africa/Mogadishu' },
}, {
  timestamps: true,
  toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } },
});

export default mongoose.model<IStaffAttendanceSettings>('StaffAttendanceSettings', staffAttendanceSettingsSchema);
