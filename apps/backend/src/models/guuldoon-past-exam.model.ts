import mongoose, { Schema, Document } from 'mongoose';

export interface IGuuldoonPastExam extends Document {
  course: mongoose.Types.ObjectId;
  externalId?: string;
  subjectExternalId?: string;
  year: number;
  durationMin: number;
  totalMarks: number;
  source?: string;
  notes?: string;
  answerKeyStatus: 'verified' | 'pending';
  published: boolean;
  kind: 'past' | 'practice';
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGuuldoonPastExam>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  externalId: { type: String, trim: true, default: undefined },
  subjectExternalId: { type: String, default: '', trim: true, index: true },
  year: { type: Number, required: true, min: 1900, max: 2100 },
  durationMin: { type: Number, required: true, min: 1, max: 600 },
  totalMarks: { type: Number, required: true, min: 1, max: 1000 },
  source: { type: String, default: '', trim: true, maxlength: 500 },
  notes: { type: String, default: '' },
  answerKeyStatus: { type: String, enum: ['verified', 'pending'], default: 'pending', index: true },
  published: { type: Boolean, default: false, index: true },
  kind: { type: String, enum: ['past', 'practice'], default: 'past', index: true },
}, { timestamps: true });

schema.index({ course: 1, year: 1 }, { unique: true });
schema.index(
  { course: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $exists: true, $type: 'string' } } },
);

export default mongoose.model<IGuuldoonPastExam>('GuuldoonPastExam', schema);
