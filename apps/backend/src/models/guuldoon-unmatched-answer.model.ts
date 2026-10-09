import mongoose, { Schema, Document } from 'mongoose';

/**
 * Wrong text answers students gave for auto-marked short-answer questions,
 * grouped by normalised text. An admin accepts the frequent ones with one tap,
 * which adds them to the question's accepted answers, so the answer key
 * improves over time without AI or teachers.
 */
export interface IGuuldoonUnmatchedAnswer extends Document {
  course: mongoose.Types.ObjectId;
  question: mongoose.Types.ObjectId;
  normalized: string;
  sample: string;
  count: number;
  status: 'pending' | 'accepted' | 'rejected';
  lastSeenAt: Date;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
}

const schema = new Schema<IGuuldoonUnmatchedAnswer>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  question: { type: Schema.Types.ObjectId, ref: 'GuuldoonQuestion', required: true },
  normalized: { type: String, required: true, maxlength: 200 },
  sample: { type: String, required: true, maxlength: 200 },
  count: { type: Number, default: 1, min: 1 },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
  lastSeenAt: { type: Date, default: Date.now },
  decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  decidedAt: { type: Date },
}, { timestamps: true });

schema.index({ question: 1, normalized: 1 }, { unique: true });
schema.index({ course: 1, status: 1, count: -1 });

export default mongoose.model<IGuuldoonUnmatchedAnswer>('GuuldoonUnmatchedAnswer', schema);
