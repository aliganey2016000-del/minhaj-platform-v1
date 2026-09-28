import mongoose, { Document, Schema } from 'mongoose';

export type ExamInvigilatorTeacherAttendanceStatus = 'present' | 'absent';

export interface IExamInvigilatorTeacherAttendance extends Document {
  school: mongoose.Types.ObjectId;
  period: mongoose.Types.ObjectId;
  examDate: Date;
  teacher: mongoose.Types.ObjectId;
  status: ExamInvigilatorTeacherAttendanceStatus;
  markedBy: mongoose.Types.ObjectId;
  markedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IExamInvigilatorTeacherAttendance>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    period: { type: Schema.Types.ObjectId, ref: 'ExamPeriod', required: true, index: true },
    examDate: { type: Date, required: true, index: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
    status: { type: String, enum: ['present', 'absent'], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    markedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

schema.index({ school: 1, period: 1, examDate: 1, teacher: 1 }, { unique: true });
schema.index({ school: 1, examDate: 1, status: 1 });

export default mongoose.model<IExamInvigilatorTeacherAttendance>(
  'ExamInvigilatorTeacherAttendance',
  schema
);
