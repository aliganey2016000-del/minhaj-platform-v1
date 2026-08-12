import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  student: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  amount: number;
  discount?: number;           // discount applied to this payment (reduces amount)
  type: 'tuition' | 'registration' | 'exam' | 'material' | 'donation' | 'other';
  method: 'cash' | 'bank_transfer' | 'mobile_money' | 'online';
  status: 'completed' | 'pending' | 'refunded';
  notes: string;
  recordedBy: mongoose.Types.ObjectId;
  dueDate?: Date;
  invoice?: mongoose.Types.ObjectId;
  idempotencyKey?: string;
  receiptNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  effectiveAmount: number;
}

const paymentSchema = new Schema<IPayment>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    type: { type: String, enum: ['tuition', 'registration', 'exam', 'material', 'donation', 'other'], default: 'tuition' },
    method: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'online'], default: 'cash' },
    status: { type: String, enum: ['completed', 'pending', 'refunded'], default: 'completed', index: true },
    notes: { type: String, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null, index: true },
    // Client-supplied, e.g. `crypto.randomUUID()` generated once per
    // submit-attempt and resent unchanged on retry — lets collectPaymentService
    // recognize and no-op a duplicate submission (double-click, network
    // retry) instead of creating a second charge. Partial index so older
    // payments with no key don't collide with each other on `null`.
    idempotencyKey: { type: String, default: undefined },
    // Human-facing receipt identifier, derived from the payment's own
    // ObjectId (already globally unique) rather than a counted sequence —
    // no extra query, no race/collision risk under concurrent writes. Uses
    // the FULL ObjectId hex (not a truncated slice) so it's exactly as
    // collision-proof as _id itself — an earlier 8-char-truncated version
    // had a realistic birthday-bound collision risk, and a collision here
    // isn't just cosmetic: it throws E11000 out of Payment.create, which
    // collectPaymentService (billing.service.ts) must not misattribute to
    // an unrelated idempotencyKey race. `sparse` because payments created
    // before this field existed have none.
    receiptNumber: { type: String, unique: true, sparse: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

paymentSchema.index({ student: 1, createdAt: -1 });
paymentSchema.index({ type: 1 });
paymentSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

// Shared by the pre-save hook below AND payment.controller.ts's getReceipt
// (for payments saved before this field existed) so both ever produce the
// same format instead of two formats coexisting permanently.
export function formatReceiptNumber(id: mongoose.Types.ObjectId, createdAt: Date): string {
  return `RCT-${createdAt.getFullYear()}-${id.toHexString().toUpperCase()}`;
}

paymentSchema.pre<IPayment>('save', function (next) {
  if (this.isNew && !this.receiptNumber) {
    this.receiptNumber = formatReceiptNumber(this._id as mongoose.Types.ObjectId, new Date());
  }
  next();
});

// Virtual: effective amount after discount
paymentSchema.virtual('effectiveAmount').get(function (this: IPayment) {
  return Math.max(0, this.amount - (this.discount || 0));
});

export default mongoose.model<IPayment>('Payment', paymentSchema);