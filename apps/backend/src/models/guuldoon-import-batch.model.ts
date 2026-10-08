import mongoose, { Schema, Document } from 'mongoose';

export interface GuuldoonImportIssue {
  sheet: string;
  row: number;
  id?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface IGuuldoonImportBatch extends Document {
  course: mongoose.Types.ObjectId;
  uploadedBy: mongoose.Types.ObjectId;
  filename: string;
  zipFilename?: string;
  excelHash: string;
  zipHash?: string;
  status: 'validated' | 'committed' | 'expired';
  summary: Record<string, unknown>;
  preview: Record<string, unknown>;
  issues: GuuldoonImportIssue[];
  result?: Record<string, unknown>;
  committedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const issueSchema = new Schema<GuuldoonImportIssue>({
  sheet: { type: String, required: true },
  row: { type: Number, required: true },
  id: { type: String, default: '' },
  field: { type: String, default: '' },
  message: { type: String, required: true },
  severity: { type: String, enum: ['error', 'warning'], required: true },
}, { _id: false });

const schema = new Schema<IGuuldoonImportBatch>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  filename: { type: String, required: true },
  zipFilename: { type: String, default: '' },
  excelHash: { type: String, required: true },
  zipHash: { type: String, default: '' },
  status: { type: String, enum: ['validated', 'committed', 'expired'], default: 'validated', index: true },
  summary: { type: Schema.Types.Mixed, default: {} },
  preview: { type: Schema.Types.Mixed, default: {} },
  issues: { type: [issueSchema], default: [] },
  result: { type: Schema.Types.Mixed, default: null },
  committedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true });

schema.index({ course: 1, createdAt: -1 });

export default mongoose.model<IGuuldoonImportBatch>('GuuldoonImportBatch', schema);
