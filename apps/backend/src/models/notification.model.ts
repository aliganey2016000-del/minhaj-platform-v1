import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  read: boolean;
  createdAt: Date;
  // Optional dedupe key for notifications emitted by a recurring job (e.g.
  // "send at most one installment reminder per user/installment/day").
  // Callers build their own stable key and check it via the indexed
  // `metadata.dedupeKey` field below instead of scanning message text with
  // a regex, which cannot use an index.
  metadata?: {
    dedupeKey?: string;
  };
}

const schema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true },
    type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
    metadata: {
      dedupeKey: { type: String },
    },
  },
  { timestamps: true }
);

schema.index({ user: 1, read: 1 });
schema.index({ createdAt: -1 });
schema.index({ user: 1, 'metadata.dedupeKey': 1 });
// Retention: notifications are kept for 12 months, then MongoDB removes them.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60, name: 'createdAt_ttl_12_months' });

export default mongoose.model<INotification>('Notification', schema);