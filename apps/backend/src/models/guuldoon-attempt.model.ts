import mongoose, { Schema, Document } from 'mongoose';

export interface IGuuldoonAttempt extends Document {
  user: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  question: mongoose.Types.ObjectId;
  chapterId: string;
  correct: boolean | null;
  answer: unknown;
  timeMs: number;
  retry?: boolean;
  createdAt: Date;
}

const schema = new Schema<IGuuldoonAttempt>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  question: { type: Schema.Types.ObjectId, ref: 'GuuldoonQuestion', required: true, index: true },
  chapterId: { type: String, required: true, trim: true, index: true },
  correct: { type: Boolean, default: null },
  answer: { type: Schema.Types.Mixed, default: null },
  timeMs: { type: Number, min: 0, max: 60 * 60 * 1000, default: 0 },
  retry: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ user: 1, course: 1, createdAt: -1 });
schema.index({ user: 1, chapterId: 1, createdAt: -1 });

export default mongoose.model<IGuuldoonAttempt>('GuuldoonAttempt', schema);
