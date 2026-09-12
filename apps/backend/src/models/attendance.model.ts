import mongoose, { Schema, Document } from 'mongoose';

export type AttendanceReasonCode =
  | ''
  | 'sick'
  | 'medical'
  | 'family_emergency'
  | 'school_activity'
  | 'suspension'
  | 'transport_delay'
  | 'other';

export interface IAttendance extends Document {
  course: mongoose.Types.ObjectId;
  // Which specific ClassSchedule session this record belongs to — a course
  // can meet more than once on the same day (e.g. 07:30 and 11:00 sessions),
  // and without this each session would read/write the same course+date
  // rows, making the second session of the day look pre-marked from the
  // first. Optional/null for attendance taken without picking a specific
  // session (e.g. straight from the Course dropdown) — that path still
  // behaves as one attendance record per course per day, same as before.
  schedule?: mongoose.Types.ObjectId | null;
  student: mongoose.Types.ObjectId;
  date: Date;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
  reasonCode?: AttendanceReasonCode;
  /** Local school time (HH:MM), useful for late arrivals / check-in. */
  arrivalTime?: string;
  /** Local school time (HH:MM), useful for early departures / check-out. */
  departureTime?: string;
  markedBy: mongoose.Types.ObjectId;
  // Once a complete scheduled roster is submitted it locks. A platform Admin
  // or authorized organization administrator can unlock it with a correction
  // reason through the attendance-session workflow.
  locked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    schedule: { type: Schema.Types.ObjectId, ref: 'ClassSchedule', default: null, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true, default: 'present' },
    notes: { type: String, default: '', maxlength: 1000 },
    reasonCode: {
      type: String,
      enum: ['', 'sick', 'medical', 'family_emergency', 'school_activity', 'suspension', 'transport_delay', 'other'],
      default: '',
      index: true,
    },
    arrivalTime: {
      type: String,
      default: '',
      match: [/^$|^([01]\d|2[0-3]):([0-5]\d)$/, 'Arrival time must be HH:MM (24-hour format)'],
    },
    departureTime: {
      type: String,
      default: '',
      match: [/^$|^([01]\d|2[0-3]):([0-5]\d)$/, 'Departure time must be HH:MM (24-hour format)'],
    },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

attendanceSchema.index({ course: 1, student: 1, date: 1, schedule: 1 }, { unique: true });
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ course: 1, date: 1, status: 1 });

const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);
export default Attendance;
