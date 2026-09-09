import mongoose, { Document, Schema } from 'mongoose';

export type WhatsAppConversationStatus = 'open' | 'closed' | 'archived';

export interface IWhatsAppConversation extends Document {
  organization: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  parent?: mongoose.Types.ObjectId;
  phone: string;
  contactName?: string;
  status: WhatsAppConversationStatus;
  unreadCount: number;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  lastMessageDirection?: 'inbound' | 'outbound';
  assignedTo?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWhatsAppConversation>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: undefined, index: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Parent', default: undefined, index: true },
    phone: { type: String, required: true, trim: true },
    contactName: { type: String, trim: true, default: undefined },
    status: { type: String, enum: ['open', 'closed', 'archived'], default: 'open', index: true },
    unreadCount: { type: Number, default: 0, min: 0 },
    lastMessageAt: { type: Date, default: undefined, index: true },
    lastMessagePreview: { type: String, default: undefined },
    lastMessageDirection: { type: String, enum: ['inbound', 'outbound'], default: undefined },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
  },
  { timestamps: true },
);

schema.index({ organization: 1, phone: 1 }, { unique: true });
schema.index({ organization: 1, status: 1, lastMessageAt: -1 });

export default mongoose.model<IWhatsAppConversation>('WhatsAppConversation', schema);
