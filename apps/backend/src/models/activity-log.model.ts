import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog extends Document {
  user: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
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
    // Denormalized tenant ownership is captured when the event is written.
    // Org-admin reads/deletes scope directly on this immutable audit field
    // instead of trusting request query/body/header organization selectors or
    // the user's current organization (which may change later).
    organizationId: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
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
schema.index({ organizationId: 1, createdAt: -1 });
schema.index({ organizationId: 1, action: 1, createdAt: -1 });
// Retention: activity logs are kept for 12 months, then MongoDB removes them.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60, name: 'createdAt_ttl_12_months' });

export default mongoose.model<IActivityLog>('ActivityLog', schema);
