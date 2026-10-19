/**
 * Per-school maximum duration of teacher offline attendance access.
 * Do not confuse this with the lifetime of the server-issued access token.
 * An offline client cannot observe changes made while disconnected, so
 * server policy is refreshed at the next verified online request.
 */
import mongoose, { Schema, Document } from 'mongoose';

export const DEFAULT_OFFLINE_ATTENDANCE_DAYS = 7;
export const ALLOWED_OFFLINE_ATTENDANCE_DAYS = [1, 3, 7, 14, 30] as const;

export interface IOfflineAttendancePolicy extends Document {
  organizationId: mongoose.Types.ObjectId;
  maxOfflineDays: number;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IOfflineAttendancePolicy>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
  maxOfflineDays: { type: Number, required: true, enum: ALLOWED_OFFLINE_ATTENDANCE_DAYS, default: DEFAULT_OFFLINE_ATTENDANCE_DAYS },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model<IOfflineAttendancePolicy>('OfflineAttendancePolicy', schema);
