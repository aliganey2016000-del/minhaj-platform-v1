import mongoose, { Document, Schema } from 'mongoose';

export type TelegramMessageStatus = 'queued' | 'sent' | 'failed';

export interface ITelegramMessage extends Document {
  school?: mongoose.Types.ObjectId;
  chatId: string;
  parent?: mongoose.Types.ObjectId;
  body: string;
  status: TelegramMessageStatus;
  providerMessageId?: string;
  error?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITelegramMessage>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', default: undefined, index: true },
    chatId: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Parent', default: undefined, index: true },
    body: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed'], required: true, index: true },
    providerMessageId: { type: String, default: undefined },
    error: { type: String, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
  },
  { timestamps: true }
);

schema.index({ createdAt: -1 });
// Retention: telegram messages are kept for 12 months, then MongoDB removes them.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60, name: 'createdAt_ttl_12_months' });

export default mongoose.model<ITelegramMessage>('TelegramMessage', schema);
