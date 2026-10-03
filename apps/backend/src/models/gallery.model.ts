import mongoose, { Schema, Document } from 'mongoose';

export interface IGallery extends Document {
  title: string;
  description?: string;
  imageUrl: string;
  album: string;
  status: 'active' | 'inactive';
  uploadedBy: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId | null;
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
    // Owning school. null = platform-wide content only the platform admin manages.
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  },
  { timestamps: true, toJSON: { transform(_d: any, r: any) { delete r.__v; return r; } } }
);

schema.index({ album: 1 });

export default mongoose.model<IGallery>('Gallery', schema);