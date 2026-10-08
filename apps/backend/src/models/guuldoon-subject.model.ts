import mongoose, { Schema, Document } from 'mongoose';

export interface IGuuldoonSubject extends Document {
  course: mongoose.Types.ObjectId;
  externalId: string;
  grade: 8 | 12;
  language: 'so' | 'en' | 'ar';
  nameSo?: string;
  nameEn: string;
  nameAr?: string;
  descriptionSo?: string;
  descriptionEn?: string;
  status: 'draft' | 'published';
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGuuldoonSubject>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  externalId: { type: String, required: true, trim: true },
  grade: { type: Number, enum: [8, 12], required: true },
  language: { type: String, enum: ['so', 'en', 'ar'], default: 'so', index: true },
  nameSo: { type: String, default: '', trim: true },
  nameEn: { type: String, required: true, trim: true },
  nameAr: { type: String, default: '', trim: true },
  descriptionSo: { type: String, default: '', trim: true },
  descriptionEn: { type: String, default: '', trim: true },
  status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
}, { timestamps: true });

schema.index({ course: 1, externalId: 1 }, { unique: true });

export default mongoose.model<IGuuldoonSubject>('GuuldoonSubject', schema);
