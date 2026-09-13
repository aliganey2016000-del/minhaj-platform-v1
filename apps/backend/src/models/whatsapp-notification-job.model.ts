import mongoose, { Document, Schema } from 'mongoose';

export type WhatsAppNotificationJobStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'cancelled';

export interface IWhatsAppNotificationJob extends Document {
  organizationId: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId;
  recipientPhone: string;
  category: string;
  eventType: string;
  payload: Record<string, unknown>;
  templateId?: mongoose.Types.ObjectId;
  status: WhatsAppNotificationJobStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastError?: string | null;
  providerMessageId?: string | null;
  sentAt?: Date | null;
  idempotencyKey: string;
}

const schema = new Schema<IWhatsAppNotificationJob>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'Parent', index: true },
  recipientPhone: { type: String, required: true },
  category: { type: String, required: true, index: true },
  eventType: { type: String, required: true, index: true },
  payload: { type: Schema.Types.Mixed, required: true },
  templateId: { type: Schema.Types.ObjectId, ref: 'WhatsAppTemplate' },
  status: { type: String, enum: ['queued', 'processing', 'sent', 'failed', 'cancelled'], default: 'queued', index: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lastError: { type: String, default: null },
  providerMessageId: { type: String, default: null },
  sentAt: { type: Date, default: null },
  idempotencyKey: { type: String, required: true, unique: true },
}, { timestamps: true });

schema.index({ status: 1, nextAttemptAt: 1 });

export const WhatsAppNotificationJob = mongoose.model<IWhatsAppNotificationJob>('WhatsAppNotificationJob', schema);
