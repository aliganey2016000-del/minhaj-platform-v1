import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog extends Document {
  user: mongoose.Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ip?: string;
  createdAt: Date;
}

const schema = new Schema<IActivityLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true, enum: ['create', 'update', 'delete', 'login', 'logout', 'view', 'export'] },
    resource: { type: String, required: true },
    resourceId: { type: String, default: '' },
    details: { type: String, default: '' },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

schema.index({ createdAt: -1 });
schema.index({ action: 1 });

export default mongoose.model<IActivityLog>('ActivityLog', schema);