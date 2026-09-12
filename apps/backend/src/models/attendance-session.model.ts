import mongoose, { Schema, Document } from 'mongoose';

export type AttendanceSessionStatus = 'partial' | 'complete';

export interface IAttendanceCorrection {
  unlockedBy: mongoose.Types.ObjectId;
  unlockedAt: Date;
  reason: string;
}

export interface IAttendanceSession extends Document {
  school: mongoose.Types.ObjectId;
  class?: mongoose.Types.ObjectId | null;
  course: mongoose.Types.ObjectId;
  schedule: mongoose.Types.ObjectId;
  date: Date;
  expectedStudents: number;
  recordedStudents: number;
  status: AttendanceSessionStatus;
  locked: boolean;
  takenBy: mongoose.Types.ObjectId;
  submittedAt: Date;
  unlockedBy?: mongoose.Types.ObjectId | null;
  unlockedAt?: Date | null;
  unlockReason?: string;
  corrections: IAttendanceCorrection[];
  createdAt: Date;
  updatedAt: Date;
}

const correctionSchema = new Schema<IAttendanceCorrection>(
  {
    unlockedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    unlockedAt: { type: Date, required: true },
    reason: { type: String, trim: true, maxlength: 500, required: true },
  },
  { _id: false }
);

const attendanceSessionSchema = new Schema<IAttendanceSession>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    class: { type: Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    schedule: { type: Schema.Types.ObjectId, ref: 'ClassSchedule', required: true, index: true },
    date: { type: Date, required: true, index: true },
    expectedStudents: { type: Number, min: 0, default: 0 },
    recordedStudents: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['partial', 'complete'], required: true, default: 'partial', index: true },
    locked: { type: Boolean, default: false, index: true },
    takenBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedAt: { type: Date, required: true, default: Date.now },
    // Last correction is kept for quick display, while corrections[] is an
    // append-only session audit trail that survives subsequent resubmissions.
    unlockedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    unlockedAt: { type: Date, default: null },
    unlockReason: { type: String, trim: true, maxlength: 500, default: '' },
    corrections: { type: [correctionSchema], default: [] },
  },
  { timestamps: true }
);

attendanceSessionSchema.index({ school: 1, schedule: 1, date: 1 }, { unique: true });
attendanceSessionSchema.index({ school: 1, date: 1, status: 1 });

export default mongoose.model<IAttendanceSession>('AttendanceSession', attendanceSessionSchema);
