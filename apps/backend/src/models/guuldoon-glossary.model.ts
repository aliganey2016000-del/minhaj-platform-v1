import mongoose, { Schema, Document } from 'mongoose';

export interface IGuuldoonGlossary extends Document {
  course: mongoose.Types.ObjectId;
  externalId: string;
  subjectExternalId: string;
  termSo: string;
  termEn: string;
  termAr: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGuuldoonGlossary>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  externalId: { type: String, required: true, trim: true },
  subjectExternalId: { type: String, required: true, trim: true, index: true },
  termSo: { type: String, required: true, trim: true },
  termEn: { type: String, required: true, trim: true },
  termAr: { type: String, required: true, trim: true },
}, { timestamps: true });

schema.index({ course: 1, externalId: 1 }, { unique: true });
schema.index({ course: 1, subjectExternalId: 1, termEn: 1 });

export default mongoose.model<IGuuldoonGlossary>('GuuldoonGlossary', schema);
