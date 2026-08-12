/**
 * Refund Model — an immutable, audited reversal of part or all of a Payment.
 *
 * Issuing a refund NEVER edits/deletes the original Payment (Payment.amount
 * is write-once); it creates one of these records instead, and
 * refund.controller.ts atomically reverses the linked Invoice's amountPaid
 * to match. Multiple partial refunds against one payment are legitimate, so
 * there's no unique constraint here — the refundable-amount check is done in
 * the service layer against the sum of prior refunds for that payment.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IRefund extends Document {
  payment: mongoose.Types.ObjectId;
  invoice: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  amount: number;
  reason: string;
  status: 'completed';
  processedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const refundSchema = new Schema<IRefund>(
  {
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    // Only 'completed' is ever written this phase — kept as an enum (rather
    // than a boolean/const) so a future approval workflow ('pending',
    // 'rejected') can be added without a schema migration.
    status: { type: String, enum: ['completed'], default: 'completed' },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

refundSchema.index({ student: 1, createdAt: -1 });

export default mongoose.model<IRefund>('Refund', refundSchema);
