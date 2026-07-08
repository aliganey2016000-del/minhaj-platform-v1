import mongoose, { Schema, Document } from 'mongoose';

export interface IGallery extends Document {
  title: string;
  description?: string;
  imageUrl: string;
  album: string;
  status: 'active' | 'inactive';
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGallery>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '' },
    imageUrl: { type: String, required: true },
    album: { type: String, default: 'general', trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_d: any, r: any) { delete r.__v; return r; } } }
);

schema.index({ album: 1 });
schema.index({ status: 1 });

export default mongoose.model<IGallery>('Gallery', schema);