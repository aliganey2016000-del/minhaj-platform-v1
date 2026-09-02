import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoiceLineItem {
  description: string;
  amount: number;
}

export interface IInvoice extends Document {
  student: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  feeStructure?: mongoose.Types.ObjectId;
  title: string;
  period: string;
  lineItems: IInvoiceLineItem[];
  amount: number;
  discount: number;
  amountPaid: number;
  status: 'pending' | 'partial' | 'paid' | 'void';
  paymentType: 'tuition' | 'registration' | 'exam' | 'material' | 'donation' | 'other';
  dueDate: Date;
  issueDate: Date;
  academicYear?: string;
  batchId?: string;
  generatedBy: mongoose.Types.ObjectId;
  notes?: string;
  voidedAt?: Date;
  voidedBy?: mongoose.Types.ObjectId;
  voidReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<IInvoiceLineItem>(
  {
    description: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const invoiceSchema = new Schema<IInvoice>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    feeStructure: { type: Schema.Types.ObjectId, ref: 'FeeStructure', default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    period: { type: String, required: true, trim: true, maxlength: 40 },
    lineItems: {
      type: [lineItemSchema],
      validate: { validator: (v: IInvoiceLineItem[]) => Array.isArray(v) && v.length > 0, message: 'At least one line item is required' },
    },
    amount: { type: Number, required: true, min: 0 },
    // Discounts are deductions from the invoice obligation, not payments.
    // Keeping this separate from amountPaid makes balances and refunds
    // mathematically correct (gross - discount - cash received).
    discount: { type: Number, default: 0, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['pending', 'partial', 'paid', 'void'], default: 'pending', index: true },
    paymentType: { type: String, enum: ['tuition', 'registration', 'exam', 'material', 'donation', 'other'], default: 'tuition' },
    dueDate: { type: Date, required: true },
    issueDate: { type: Date, default: Date.now },
    academicYear: { type: String, trim: true, maxlength: 20, default: '' },
    batchId: { type: String, default: '', index: true },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, default: '' },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    voidReason: { type: String, default: '' },
  },
  { timestamps: true }
);

invoiceSchema.index(
  { student: 1, feeStructure: 1, period: 1 },
  { unique: true, partialFilterExpression: { feeStructure: { $type: 'objectId' } } }
);

invoiceSchema.index({ school: 1, status: 1 });
invoiceSchema.index({ student: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });

invoiceSchema.virtual('amountDue').get(function (this: IInvoice) {
  return Math.max(0, this.amount - (this.discount || 0) - (this.amountPaid || 0));
});

invoiceSchema.virtual('grossAmountDue').get(function (this: IInvoice) {
  return Math.max(0, this.amount - (this.amountPaid || 0));
});

invoiceSchema.virtual('isOverdue').get(function (this: IInvoice) {
  return this.status !== 'paid' && this.status !== 'void' && this.dueDate < new Date();
});

invoiceSchema.set('toJSON', {
  virtuals: true,
  transform(_doc: any, ret: any) {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model<IInvoice>('Invoice', invoiceSchema);
