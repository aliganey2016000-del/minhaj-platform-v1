import mongoose, { Schema, Document } from 'mongoose';

export interface IParent extends Document {
  user: mongoose.Types.ObjectId;
  profile: mongoose.Types.ObjectId;
  parentId: string;
  children: mongoose.Types.ObjectId[];
  school?: mongoose.Types.ObjectId;
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
    school: { type: Schema.Types.ObjectId, ref: 'School', default: undefined },
    occupation: { type: String, default: '' },
    relationship: { type: String, default: 'father', enum: ['father', 'mother', 'guardian', 'other'] },
    address: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

export default mongoose.model<IParent>('Parent', parentSchema);