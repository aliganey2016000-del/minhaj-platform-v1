import mongoose, { Schema, Document } from 'mongoose';

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
  markedBy: mongoose.Types.ObjectId;
  // Once attendance for a session is submitted it locks — the submitter
  // (org_admin/teacher) can no longer edit it; only a platform Admin can
  // unlock it via PATCH /attendance/unlock before it can be resubmitted.
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
    notes: { type: String, default: '' },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

attendanceSchema.index({ course: 1, student: 1, date: 1, schedule: 1 }, { unique: true });
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ date: 1 });

const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);
export default Attendance;