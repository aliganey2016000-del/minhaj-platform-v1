import { Schema, model } from 'mongoose';

/** A payment-confirmation SMS forwarded from the merchant phone. Kept briefly for matching and audit. */
const schema = new Schema({
  hash: { type: String, required: true, unique: true },
  from: { type: String, default: '', maxlength: 60 },
  body: { type: String, required: true, maxlength: 1000 },
  receivedAt: { type: Date, default: Date.now },
  amountUsd: { type: Number, default: null },
  refTokens: { type: [String], default: [], index: true },
  phones: { type: [String], default: [], index: true },
  status: { type: String, enum: ['unmatched', 'matched'], default: 'unmatched', index: true },
  subscription: { type: Schema.Types.ObjectId, ref: 'GlobalSubscription' },
}, { timestamps: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export default model('PaymentSms', schema);
