import mongoose, { Document, Schema } from 'mongoose';

export type WhatsAppMessageStatus = 'queued' | 'sent' | 'failed';
export type WhatsAppMessageKind = 'text' | 'template';

export interface IWhatsAppMessage extends Document {
  school?: mongoose.Types.ObjectId;
  recipient: string;
  parent?: mongoose.Types.ObjectId;
  kind: WhatsAppMessageKind;
  templateName?: string;
  languageCode?: string;
  body?: string;
  status: WhatsAppMessageStatus;
  providerMessageId?: string;
  error?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWhatsAppMessage>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', default: undefined, index: true },
    recipient: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Parent', default: undefined, index: true },
    kind: { type: String, enum: ['text', 'template'], required: true },
    templateName: { type: String, trim: true, default: undefined },
    languageCode: { type: String, trim: true, default: undefined },
    body: { type: String, default: undefined },
    status: { type: String, enum: ['queued', 'sent', 'failed'], required: true, index: true },
    providerMessageId: { type: String, default: undefined },
    error: { type: String, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
  },
  { timestamps: true }
);

schema.index({ createdAt: -1 });

export default mongoose.model<IWhatsAppMessage>('WhatsAppMessage', schema);
