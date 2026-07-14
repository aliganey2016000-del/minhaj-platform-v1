import mongoose, { Schema, Document } from 'mongoose';

export interface IExam extends Document {
  title: string;
  course: mongoose.Types.ObjectId;
  examDate: Date;
  startTime: string;
  endTime: string;
  duration: number; // minutes
  totalMarks: number;
  passingMarks: number;
  room?: string;
  instructions?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examSchema = new Schema<IExam>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    examDate: { type: Date, required: true },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    duration: { type: Number, required: true, min: 1 },
    totalMarks: { type: Number, required: true, min: 1 },
    passingMarks: { type: Number, required: true, min: 1 },
    room: { type: String, default: '' },
    instructions: { type: String, default: '' },
    status: { type: String, enum: ['scheduled', 'ongoing', 'completed', 'cancelled'], default: 'scheduled', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

examSchema.index({ course: 1, examDate: 1 });

export default mongoose.model<IExam>('Exam', examSchema);