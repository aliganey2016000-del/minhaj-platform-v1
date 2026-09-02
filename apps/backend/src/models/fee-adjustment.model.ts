/**
 * FeeAdjustment — an immutable, audited record of a discount, fee waiver, or
 * scholarship granted against a specific Invoice.
 *
 * Granting one applies the reduction to the linked Invoice's `discount` field
 * via billing.service.ts's applyInvoiceDiscount (never edits amountPaid), then
 * triggers recalcStudentBalance so Student.totalFeesDue reflects it
 * immediately. `type` is purely a label for reporting/audit purposes — a
 * discount, a waiver, and a scholarship all reduce the invoice the same way;
 * there is no separate recurring-scholarship policy (one-time only, applied
 * per invoice).
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IFeeAdjustment extends Document {
  invoice: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  type: 'discount' | 'waiver' | 'scholarship';
  valueType: 'fixed' | 'percent';
  inputValue: number;
  amount: number;
  reason: string;
  grantedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const feeAdjustmentSchema = new Schema<IFeeAdjustment>(
  {
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    type: { type: String, enum: ['discount', 'waiver', 'scholarship'], required: true },
    valueType: { type: String, enum: ['fixed', 'percent'], required: true },
    inputValue: { type: Number, required: true, min: 0.01 },
    amount: { type: Number, required: true, min: 0.01 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

feeAdjustmentSchema.index({ student: 1, createdAt: -1 });
feeAdjustmentSchema.index({ school: 1, createdAt: -1 });

export default mongoose.model<IFeeAdjustment>('FeeAdjustment', feeAdjustmentSchema);
