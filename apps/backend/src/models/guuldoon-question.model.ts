import mongoose, { Schema, Document } from 'mongoose';

export type GuuldoonQuestionType = 'mcq' | 'structured' | 'fill' | 'match';

export interface IGuuldoonQuestion extends Document {
  course: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  externalId?: string;
  examExternalId?: string;
  parent?: mongoose.Types.ObjectId;
  parentExternalId?: string;
  number: number;
  type: GuuldoonQuestionType;
  language: 'so' | 'en' | 'ar';
  direction: 'ltr' | 'rtl' | 'auto';
  textSo: string;
  textEn?: string;
  options?: string[];
  marks: number;
  figureUrl?: string;
  figureFiles?: string[];
  chapterId: string;
  topicTags: string[];
  resourceExternalId?: string;
  answer?: unknown;
  answerStatus: 'verified' | 'pending';
  markingMode: 'auto' | 'manual';
  explainerAudioUrl?: string;
  explainerText?: string;
  notes?: string;
  bookAnchorText?: string;
  bookRelation?: 'direct' | 'indirect' | 'similar' | 'derived';
  bookRef?: { bookId?: string; pageFrom?: number; pageTo?: number };
  similarIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGuuldoonQuestion>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  exam: { type: Schema.Types.ObjectId, ref: 'GuuldoonPastExam', required: true, index: true },
  externalId: { type: String, trim: true, default: undefined },
  examExternalId: { type: String, default: '', trim: true, index: true },
  parent: { type: Schema.Types.ObjectId, ref: 'GuuldoonQuestion', default: null, index: true },
  parentExternalId: { type: String, default: '', trim: true },
  number: { type: Number, required: true, min: 1 },
  type: { type: String, enum: ['mcq', 'structured', 'fill', 'match'], required: true },
  language: { type: String, enum: ['so', 'en', 'ar'], default: 'so' },
  direction: { type: String, enum: ['ltr', 'rtl', 'auto'], default: 'auto' },
  textSo: { type: String, required: true, trim: true },
  textEn: { type: String, default: '', trim: true },
  options: { type: [String], default: undefined },
  marks: { type: Number, required: true, min: 0, max: 100 },
  figureUrl: { type: String, default: '', trim: true },
  figureFiles: { type: [String], default: [] },
  chapterId: { type: String, required: true, trim: true, index: true },
  topicTags: { type: [String], default: [], index: true },
  resourceExternalId: { type: String, default: '', trim: true, index: true },
  answer: { type: Schema.Types.Mixed, default: undefined, select: false },
  answerStatus: { type: String, enum: ['verified', 'pending'], default: 'pending', index: true },
  markingMode: { type: String, enum: ['auto', 'manual'], default: 'manual' },
  explainerAudioUrl: { type: String, default: '', trim: true },
  explainerText: { type: String, default: '', trim: true },
  notes: { type: String, default: '' },
  bookAnchorText: { type: String, default: '', trim: true },
  bookRelation: { type: String, enum: ['direct', 'indirect', 'similar', 'derived'], default: undefined },
  bookRef: {
    bookId: { type: String, default: '', trim: true },
    pageFrom: { type: Number, min: 1 },
    pageTo: { type: Number, min: 1 },
  },
  similarIds: [{ type: Schema.Types.ObjectId, ref: 'GuuldoonQuestion' }],
}, { timestamps: true });

schema.index({ exam: 1, number: 1 }, { unique: true });
schema.index({ course: 1, chapterId: 1, topicTags: 1 });
schema.index(
  { course: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $exists: true, $type: 'string' } } },
);

export default mongoose.model<IGuuldoonQuestion>('GuuldoonQuestion', schema);
