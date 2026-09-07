import mongoose, { Schema, Document } from 'mongoose';
import type { InstitutionType } from '../utils/academic-config';

export interface IStudentDocumentType extends Document {
  organizationType: InstitutionType;
  school?: mongoose.Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  category?: string;
  allowedMimeTypes: string[];
  maxFileSize: number;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  metadataSchema?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const studentDocumentTypeSchema = new Schema<IStudentDocumentType>({
  organizationType: { type: String, enum: ['university', 'college', 'school', 'training_center'], required: true, index: true },
  school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  category: { type: String, trim: true, maxlength: 80, default: 'general' },
  allowedMimeTypes: { type: [String], default: ['application/pdf', 'image/jpeg', 'image/png'] },
  maxFileSize: { type: Number, default: 10 * 1024 * 1024, min: 1, max: 25 * 1024 * 1024 },
  isRequired: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 },
  metadataSchema: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } });

studentDocumentTypeSchema.index({ organizationType: 1, school: 1, code: 1 }, { unique: true });

export default mongoose.model<IStudentDocumentType>('StudentDocumentType', studentDocumentTypeSchema);
