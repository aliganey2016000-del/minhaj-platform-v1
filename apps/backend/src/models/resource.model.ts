import mongoose, { Schema, Document } from 'mongoose';

export interface IResource extends Document {
  title: string;
  description: string;
  course: mongoose.Types.ObjectId;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  category: string;
  status: 'active' | 'inactive';
  uploadedBy: mongoose.Types.ObjectId;
  downloads: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IResource>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '' },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String, default: 'pdf' },
    fileSize: { type: Number, default: 0 },
    category: { type: String, default: 'material' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    downloads: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { transform(_d: any, r: any) { delete r.__v; return r; } } }
);

schema.index({ course: 1, category: 1 });
schema.index({ status: 1 });

export default mongoose.model<IResource>('Resource', schema);