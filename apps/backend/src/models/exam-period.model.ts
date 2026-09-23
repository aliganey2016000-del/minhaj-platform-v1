import mongoose, { Schema, Document } from 'mongoose';

export type ExamPeriodStatus = 'draft' | 'published' | 'closed';

export interface IExamPeriod extends Document {
  school: mongoose.Types.ObjectId;
  name: string;
  academicYear: string;
  term?: string;
  startDate?: Date;
  endDate?: Date;
  status: ExamPeriodStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examPeriodSchema = new Schema<IExamPeriod>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    academicYear: { type: String, required: true, trim: true, maxlength: 30, index: true },
    term: { type: String, default: '', trim: true, maxlength: 60 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['draft', 'published', 'closed'],
      default: 'draft',
      index: true,
    },
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

examPeriodSchema.index(
  { school: 1, academicYear: 1, term: 1, name: 1 },
  { unique: true }
);

export default mongoose.model<IExamPeriod>('ExamPeriod', examPeriodSchema);
