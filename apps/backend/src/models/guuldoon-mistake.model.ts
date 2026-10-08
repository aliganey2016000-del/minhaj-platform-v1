import mongoose, { Schema, Document } from 'mongoose';

export interface IGuuldoonMistake extends Document {
  user: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  question: mongoose.Types.ObjectId;
  box: number;
  dueAt: Date;
  lastResult: 'correct' | 'wrong';
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGuuldoonMistake>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  question: { type: Schema.Types.ObjectId, ref: 'GuuldoonQuestion', required: true, index: true },
  box: { type: Number, min: 1, max: 5, default: 1 },
  dueAt: { type: Date, required: true, index: true },
  lastResult: { type: String, enum: ['correct', 'wrong'], default: 'wrong' },
}, { timestamps: true });

schema.index({ user: 1, question: 1 }, { unique: true });
schema.index({ user: 1, course: 1, dueAt: 1 });

export default mongoose.model<IGuuldoonMistake>('GuuldoonMistake', schema);
