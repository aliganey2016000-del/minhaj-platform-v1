import mongoose, { Schema, Document } from 'mongoose';
import { AttendanceReasonCode } from './attendance.model';

export type DailyAttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type DailyAttendanceSource = 'manual' | 'check_in' | 'check_out' | 'section_derived';

export interface IDailyAttendance extends Document {
  school: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  class?: mongoose.Types.ObjectId | null;
  date: Date;
  status: DailyAttendanceStatus;
  reasonCode?: AttendanceReasonCode;
  arrivalTime?: string;
  departureTime?: string;
  notes?: string;
  source: DailyAttendanceSource;
  markedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const dailyAttendanceSchema = new Schema<IDailyAttendance>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    class: { type: Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    date: { type: Date, required: true, index: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true, index: true },
    reasonCode: {
      type: String,
      enum: ['', 'sick', 'medical', 'family_emergency', 'school_activity', 'suspension', 'transport_delay', 'other'],
      default: '',
      index: true,
    },
    arrivalTime: { type: String, default: '', match: [/^$|^([01]\d|2[0-3]):([0-5]\d)$/, 'Arrival time must be HH:MM'] },
    departureTime: { type: String, default: '', match: [/^$|^([01]\d|2[0-3]):([0-5]\d)$/, 'Departure time must be HH:MM'] },
    notes: { type: String, default: '', maxlength: 1000 },
    source: { type: String, enum: ['manual', 'check_in', 'check_out', 'section_derived'], default: 'manual' },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

dailyAttendanceSchema.index({ school: 1, student: 1, date: 1 }, { unique: true });
dailyAttendanceSchema.index({ school: 1, date: 1, status: 1 });
dailyAttendanceSchema.index({ school: 1, class: 1, date: 1 });

export default mongoose.model<IDailyAttendance>('DailyAttendance', dailyAttendanceSchema);
