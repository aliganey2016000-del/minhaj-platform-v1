import mongoose, { Schema, Document } from 'mongoose';

export interface IGuuldoonPracticeResult extends Document {
  user: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  chapterId: string;
  source: 'understand' | 'past' | 'single';
  total: number;
  firstTry: number;
  correct: number;
  wrong: number;
  durationMs: number;
  createdAt: Date;
}

const schema = new Schema<IGuuldoonPracticeResult>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  chapterId: { type: String, required: true, trim: true },
  source: { type: String, enum: ['understand', 'past', 'single'], required: true },
  total: { type: Number, required: true, min: 1, max: 500 },
  firstTry: { type: Number, required: true, min: 0, max: 500 },
  correct: { type: Number, required: true, min: 0, max: 500 },
  wrong: { type: Number, required: true, min: 0, max: 500 },
  durationMs: { type: Number, min: 0, max: 24 * 60 * 60 * 1000, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ user: 1, course: 1, chapterId: 1, createdAt: -1 });

export default mongoose.model<IGuuldoonPracticeResult>('GuuldoonPracticeResult', schema);
