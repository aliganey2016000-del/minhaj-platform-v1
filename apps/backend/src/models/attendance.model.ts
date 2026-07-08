import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendance extends Document {
  course: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  date: Date;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
  markedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true, default: 'present' },
    notes: { type: String, default: '' },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

attendanceSchema.index({ course: 1, student: 1, date: 1 }, { unique: true });
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ date: 1 });

const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);
export default Attendance;