import mongoose, { Schema, Document } from 'mongoose';

export interface IGuuldoonChapter extends Document {
  course: mongoose.Types.ObjectId;
  subject: mongoose.Types.ObjectId;
  externalId: string;
  subjectExternalId: string;
  order: number;
  titleSo?: string;
  titleEn: string;
  titleAr?: string;
  examWeight?: number;
  status: 'draft' | 'published';
  /** Set when a Super Admin edits the chapter by hand; a later Excel import keeps it. */
  manuallyEdited?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGuuldoonChapter>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  subject: { type: Schema.Types.ObjectId, ref: 'GuuldoonSubject', required: true, index: true },
  externalId: { type: String, required: true, trim: true },
  subjectExternalId: { type: String, required: true, trim: true, index: true },
  order: { type: Number, required: true, min: 1 },
  titleSo: { type: String, default: '', trim: true },
  titleEn: { type: String, required: true, trim: true },
  titleAr: { type: String, default: '', trim: true },
  examWeight: { type: Number, min: 0, max: 100, default: null },
  status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
  manuallyEdited: { type: Boolean, default: false },
}, { timestamps: true });

schema.index({ course: 1, externalId: 1 }, { unique: true });
schema.index({ course: 1, subjectExternalId: 1, order: 1 });

export default mongoose.model<IGuuldoonChapter>('GuuldoonChapter', schema);
