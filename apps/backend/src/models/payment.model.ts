import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  student: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  amount: number;
  discount?: number;
  refundedAmount: number;
  currency: string;
  type: 'tuition' | 'registration' | 'exam' | 'material' | 'donation' | 'other';
  method: 'cash' | 'bank_transfer' | 'mobile_money' | 'online';
  status: 'completed' | 'pending' | 'refunded';
  notes: string;
  reference?: string;
  recordedBy: mongoose.Types.ObjectId;
  dueDate?: Date;
  invoice?: mongoose.Types.ObjectId;
  idempotencyKey?: string;
  receiptNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  effectiveAmount: number;
  netCollectedAmount: number;
}

const paymentSchema = new Schema<IPayment>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: function (this: IPayment, value: number) { return value <= this.amount; }, message: 'Discount cannot exceed payment amount' },
    },
    refundedAmount: { type: Number, default: 0, min: 0 },
    // Currency is snapshotted on the transaction so a later school setting
    // change never changes the meaning of an old receipt.
    currency: { type: String, default: 'USD', trim: true, uppercase: true, minlength: 3, maxlength: 3 },
    type: { type: String, enum: ['tuition', 'registration', 'exam', 'material', 'donation', 'other'], default: 'tuition' },
    method: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'online'], default: 'cash' },
    status: { type: String, enum: ['completed', 'pending', 'refunded'], default: 'completed', index: true },
    notes: { type: String, default: '' },
    reference: { type: String, default: '', trim: true, maxlength: 100 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null, index: true },
    idempotencyKey: { type: String, default: undefined },
    receiptNumber: { type: String, unique: true, sparse: true },
  },
  { timestamps: true, toJSON: { virtuals: true, transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

paymentSchema.index({ student: 1, createdAt: -1 });
paymentSchema.index({ type: 1 });
paymentSchema.index({ method: 1, createdAt: -1 });
paymentSchema.index({ reference: 1, createdAt: -1 });
paymentSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

export function formatReceiptNumber(id: mongoose.Types.ObjectId, createdAt: Date): string {
  return `RCT-${createdAt.getFullYear()}-${id.toHexString().toUpperCase()}`;
}

paymentSchema.pre<IPayment>('save', function (next) {
  if (this.isNew && !this.receiptNumber) {
    this.receiptNumber = formatReceiptNumber(this._id as mongoose.Types.ObjectId, new Date());
  }
  next();
});

paymentSchema.virtual('effectiveAmount').get(function (this: IPayment) {
  return Math.max(0, this.amount - (this.discount || 0));
});

paymentSchema.virtual('netCollectedAmount').get(function (this: IPayment) {
  return Math.max(0, this.effectiveAmount - (this.refundedAmount || 0));
});

export default mongoose.model<IPayment>('Payment', paymentSchema);
