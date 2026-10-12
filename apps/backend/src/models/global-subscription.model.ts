import { Schema, model } from 'mongoose';

const schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  grade: { type: Number, enum: [8, 12], required: true },
  amount: { type: Number, enum: [5], default: 5 },
  currency: { type: String, enum: ['USD'], default: 'USD' },
  paymentReference: { type: String, required: true, maxlength: 120 },
  // Wallet number the student paid from; lets a forwarded confirmation SMS be matched safely.
  payerPhone: { type: String, maxlength: 30 },
  autoVerified: { type: Boolean, default: false },
  // Set when the student paid through the WaafiPay wallet API (EVC Plus, Zaad, eDahab).
  gateway: { type: String, enum: ['waafipay'] },
  gatewayTransactionId: { type: String, maxlength: 80 },
  gatewayMessage: { type: String, maxlength: 300 },
  // Set only after a platform administrator verifies receipt of payment.
  verifiedReference: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'revoked'], default: 'pending', index: true },
  startsAt: Date,
  expiresAt: Date,
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
}, { timestamps: true });
schema.index({ user: 1, grade: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
schema.index({ verifiedReference: 1 }, { unique: true, sparse: true });
export default model('GlobalSubscription', schema);
