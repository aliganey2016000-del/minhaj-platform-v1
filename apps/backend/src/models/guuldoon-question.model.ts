import mongoose, { Schema, Document } from 'mongoose';

export type GuuldoonQuestionType = 'mcq' | 'structured' | 'fill' | 'match';

export interface IGuuldoonQuestion extends Document {
  course: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  number: number;
  type: GuuldoonQuestionType;
  textSo: string;
  textEn?: string;
  options?: string[];
  marks: number;
  figureUrl?: string;
  chapterId: string;
  topicTags: string[];
  answer?: unknown;
  answerStatus: 'verified' | 'pending';
  explainerAudioUrl?: string;
  explainerText?: string;
  bookRef?: { bookId?: string; pageFrom?: number; pageTo?: number };
  similarIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGuuldoonQuestion>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  exam: { type: Schema.Types.ObjectId, ref: 'GuuldoonPastExam', required: true, index: true },
  number: { type: Number, required: true, min: 1 },
  type: { type: String, enum: ['mcq', 'structured', 'fill', 'match'], required: true },
  textSo: { type: String, required: true, trim: true },
  textEn: { type: String, default: '', trim: true },
  options: { type: [String], default: undefined },
  marks: { type: Number, required: true, min: 0, max: 100 },
  figureUrl: { type: String, default: '', trim: true },
  chapterId: { type: String, required: true, trim: true, index: true },
  topicTags: { type: [String], default: [], index: true },
  answer: { type: Schema.Types.Mixed, default: undefined, select: false },
  answerStatus: { type: String, enum: ['verified', 'pending'], default: 'pending', index: true },
  explainerAudioUrl: { type: String, default: '', trim: true },
  explainerText: { type: String, default: '', trim: true },
  bookRef: {
    bookId: { type: String, default: '', trim: true },
    pageFrom: { type: Number, min: 1 },
    pageTo: { type: Number, min: 1 },
  },
  similarIds: [{ type: Schema.Types.ObjectId, ref: 'GuuldoonQuestion' }],
}, { timestamps: true });

schema.index({ exam: 1, number: 1 }, { unique: true });
schema.index({ course: 1, chapterId: 1, topicTags: 1 });

export default mongoose.model<IGuuldoonQuestion>('GuuldoonQuestion', schema);
