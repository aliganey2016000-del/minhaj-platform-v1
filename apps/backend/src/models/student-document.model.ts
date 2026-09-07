import mongoose, { Schema, Document } from 'mongoose';

export type StudentDocumentStatus = 'pending' | 'verified' | 'rejected';

export interface IStudentDocument extends Document {
  student: mongoose.Types.ObjectId;
  school: mongoose.Types.ObjectId;
  documentType: mongoose.Types.ObjectId;
  title: string;
  fileUrl: string;
  storageProvider: 'local' | 'cloudinary';
  storagePublicId?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentNumber?: string;
  issuedDate?: Date;
  expiryDate?: Date;
  issuedBy?: string;
  status: StudentDocumentStatus;
  notes?: string;
  isVerified: boolean;
  verifiedBy?: mongoose.Types.ObjectId;
  verifiedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const studentDocumentSchema = new Schema<IStudentDocument>({
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  documentType: { type: Schema.Types.ObjectId, ref: 'StudentDocumentType', required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  fileUrl: { type: String, required: true },
  storageProvider: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
  storagePublicId: { type: String, default: null },
  fileName: { type: String, required: true, trim: true, maxlength: 255 },
  mimeType: { type: String, required: true, trim: true },
  fileSize: { type: Number, required: true, min: 1 },
  documentNumber: { type: String, trim: true, maxlength: 100, default: null },
  issuedDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null },
  issuedBy: { type: String, trim: true, maxlength: 200, default: null },
  status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', index: true },
  notes: { type: String, trim: true, maxlength: 2000, default: null },
  isVerified: { type: Boolean, default: false },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } });

studentDocumentSchema.index({ school: 1, student: 1, documentType: 1 });

export default mongoose.model<IStudentDocument>('StudentDocument', studentDocumentSchema);
