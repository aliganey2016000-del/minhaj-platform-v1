import mongoose, { Document, Schema } from 'mongoose';

export type WhatsAppMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
export type WhatsAppMessageKind = 'text' | 'template' | 'media' | 'event';
export type WhatsAppMessageDirection = 'inbound' | 'outbound';

export interface IWhatsAppMessage extends Document {
  school?: mongoose.Types.ObjectId;
  organization?: mongoose.Types.ObjectId;
  conversation?: mongoose.Types.ObjectId;
  recipient: string;
  sender?: string;
  parent?: mongoose.Types.ObjectId;
  direction: WhatsAppMessageDirection;
  kind: WhatsAppMessageKind;
  templateName?: string;
  languageCode?: string;
  body?: string;
  providerMessageId?: string;
  providerTimestamp?: Date;
  pushName?: string;
  raw?: Record<string, unknown>;
  status: WhatsAppMessageStatus;
  error?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWhatsAppMessage>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', default: undefined, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: undefined, index: true },
    conversation: { type: Schema.Types.ObjectId, ref: 'WhatsAppConversation', default: undefined, index: true },
    recipient: { type: String, required: true, trim: true },
    sender: { type: String, trim: true, default: undefined },
    parent: { type: Schema.Types.ObjectId, ref: 'Parent', default: undefined, index: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true, default: 'outbound', index: true },
    kind: { type: String, enum: ['text', 'template', 'media', 'event'], required: true },
    templateName: { type: String, trim: true, default: undefined },
    languageCode: { type: String, trim: true, default: undefined },
    body: { type: String, default: undefined },
    providerMessageId: { type: String, default: undefined, index: true },
    providerTimestamp: { type: Date, default: undefined },
    pushName: { type: String, default: undefined },
    raw: { type: Schema.Types.Mixed, default: undefined },
    status: { type: String, enum: ['queued', 'sent', 'delivered', 'read', 'failed', 'received'], required: true, index: true },
    error: { type: String, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
  },
  { timestamps: true },
);

schema.index({ organization: 1, createdAt: -1 });
schema.index({ organization: 1, conversation: 1, createdAt: -1 });
schema.index({ school: 1, createdAt: -1 });
schema.index({ providerMessageId: 1 }, { sparse: true });

export default mongoose.model<IWhatsAppMessage>('WhatsAppMessage', schema);
