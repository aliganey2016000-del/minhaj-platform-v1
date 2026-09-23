import mongoose, { Schema, Document } from 'mongoose';

export interface IExamInvigilatorAssignment extends Document {
  school: mongoose.Types.ObjectId;
  period: mongoose.Types.ObjectId;
  examDate: Date;
  startTime: string;
  endTime: string;
  room: mongoose.Types.ObjectId;
  teacher: mongoose.Types.ObjectId;
  examType: 'mid' | 'final';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IExamInvigilatorAssignment>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    period: { type: Schema.Types.ObjectId, ref: 'ExamPeriod', required: true, index: true },
    examDate: { type: Date, required: true, index: true },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    room: { type: Schema.Types.ObjectId, ref: 'ExamRoom', required: true, index: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
    examType: { type: String, enum: ['mid', 'final'], required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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

schema.index(
  { school: 1, examDate: 1, startTime: 1, endTime: 1, room: 1 },
  { unique: true }
);
schema.index({ teacher: 1, examDate: 1, startTime: 1, endTime: 1 });
schema.index({ period: 1, examDate: 1, startTime: 1 });

export default mongoose.model<IExamInvigilatorAssignment>('ExamInvigilatorAssignment', schema);
