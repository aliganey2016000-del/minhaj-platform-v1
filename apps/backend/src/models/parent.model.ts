import mongoose, { Schema, Document } from 'mongoose';

export interface IParent extends Document {
  user: mongoose.Types.ObjectId;
  profile: mongoose.Types.ObjectId;
  parentId: string;
  children: mongoose.Types.ObjectId[];
  occupation?: string;
  relationship: string;
  address?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const parentSchema = new Schema<IParent>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    profile: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    parentId: { type: String, unique: true, sparse: true },
    children: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
    occupation: { type: String, default: '' },
    relationship: { type: String, default: 'father', enum: ['father', 'mother', 'guardian', 'other'] },
    address: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

parentSchema.index({ user: 1 }, { unique: true });
parentSchema.index({ parentId: 1 }, { unique: true, sparse: true });

export default mongoose.model<IParent>('Parent', parentSchema);