import mongoose, { Schema, Document } from 'mongoose';

export interface IParent extends Document {
  user: mongoose.Types.ObjectId;
  profile: mongoose.Types.ObjectId;
  parentId: string;
  children: mongoose.Types.ObjectId[];
  school?: mongoose.Types.ObjectId;
  phone?: string;
  occupation?: string;
  relationship: string;
  address?: string;
  status: 'active' | 'inactive';
  telegramChatId?: string;
  telegramLinkToken?: string;
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
    // Denormalized copy of the guardian's User.phone — kept in sync on every
    // write — so student-creation flows (manual + bulk import) can dedupe a
    // guardian by { school, phone } directly against Parent, without a join.
    phone: { type: String, trim: true, default: undefined },
    occupation: { type: String, default: '' },
    relationship: { type: String, default: 'father', enum: ['father', 'mother', 'guardian', 'other'] },
    address: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    // Set once the parent opens the bot's deep link and hits Start — see
    // telegram.controller.ts's generateLinkToken/webhook. Unlike WhatsApp's
    // phone-number recipient, Telegram requires the user to initiate contact
    // with the bot at least once before it can message them.
    telegramChatId: { type: String, trim: true, default: undefined, index: true },
    telegramLinkToken: { type: String, trim: true, default: undefined, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

// Tenant-scoped guardian correlation lookup — the "upsert and link by phone" flow.
parentSchema.index({ school: 1, phone: 1 });

export default mongoose.model<IParent>('Parent', parentSchema);