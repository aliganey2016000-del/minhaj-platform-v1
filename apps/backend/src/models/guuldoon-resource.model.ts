import mongoose, { Schema, Document } from 'mongoose';

export type GuuldoonResourceType = 'video' | 'audio' | 'pdf' | 'book' | 'image' | 'note' | 'link';

export interface IGuuldoonResource extends Document {
  course: mongoose.Types.ObjectId;
  externalId: string;
  subjectExternalId: string;
  chapterExternalId?: string;
  type: GuuldoonResourceType;
  title: string;
  url?: string;
  fileName?: string;
  pageFrom?: number;
  pageTo?: number;
  language: 'so' | 'en' | 'ar';
  direction: 'ltr' | 'rtl' | 'auto';
  offlineAvailable: boolean;
  contentText?: string;
  figureFiles?: string[];
  /** Set when a Super Admin edits the lesson by hand; a later Excel import keeps it. */
  manuallyEdited?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGuuldoonResource>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  externalId: { type: String, required: true, trim: true },
  subjectExternalId: { type: String, required: true, trim: true, index: true },
  chapterExternalId: { type: String, default: '', trim: true, index: true },
  type: { type: String, enum: ['video', 'audio', 'pdf', 'book', 'image', 'note', 'link'], required: true },
  title: { type: String, required: true, trim: true },
  url: { type: String, default: '', trim: true },
  fileName: { type: String, default: '', trim: true },
  pageFrom: { type: Number, min: 1, default: null },
  pageTo: { type: Number, min: 1, default: null },
  language: { type: String, enum: ['so', 'en', 'ar'], default: 'so' },
  direction: { type: String, enum: ['ltr', 'rtl', 'auto'], default: 'auto' },
  offlineAvailable: { type: Boolean, default: false },
  contentText: { type: String, default: '' },
  figureFiles: { type: [String], default: [] },
  manuallyEdited: { type: Boolean, default: false },
}, { timestamps: true });

schema.index({ course: 1, externalId: 1 }, { unique: true });
schema.index({ course: 1, chapterExternalId: 1 });

export default mongoose.model<IGuuldoonResource>('GuuldoonResource', schema);
