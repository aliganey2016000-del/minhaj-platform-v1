/**
 * DiscountGrant — a recurring/standing discount policy tied to a student
 * (not a specific invoice), auto-applied by invoice generation for as long
 * as it is within its validity window. Complements FeeAdjustment (a
 * one-time, invoice-scoped reduction): a grant answers "does this student
 * get X% off every bill for some period," while FeeAdjustment answers
 * "reduce this one invoice, right now."
 *
 * durationType drives what validUntil means:
 *  - 'standing'      — no expiry; applies until the student graduates/
 *                       withdraws (validUntil is always forced to null).
 *  - 'academic_year' — tied to one academicYear string; validUntil is the
 *                       explicit end date of that year (there is no
 *                       separate AcademicYear model to derive it from, so
 *                       the caller supplies it).
 *  - 'fixed_period'  — an explicit validFrom/validUntil window (e.g. one
 *                       term or month of hardship relief).
 *
 * Revoking a grant only stops it from applying to invoices generated after
 * the revoke — like Invoice/FeeAdjustment, already-issued invoices keep
 * their discount so the financial record stays immutable.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IDiscountGrant extends Document {
  student: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  label: string;
  type: 'discount' | 'waiver' | 'scholarship';
  durationType: 'standing' | 'academic_year' | 'fixed_period';
  valueType: 'fixed' | 'percent';
  inputValue: number;
  academicYear?: string;
  validFrom: Date;
  validUntil?: Date | null;
  status: 'active' | 'revoked';
  reason: string;
  grantedBy: mongoose.Types.ObjectId;
  revokedAt?: Date | null;
  revokedBy?: mongoose.Types.ObjectId | null;
  revokeReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const discountGrantSchema = new Schema<IDiscountGrant>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    label: { type: String, required: true, trim: true, maxlength: 150 },
    type: { type: String, enum: ['discount', 'waiver', 'scholarship'], required: true },
    durationType: { type: String, enum: ['standing', 'academic_year', 'fixed_period'], required: true },
    valueType: { type: String, enum: ['fixed', 'percent'], required: true },
    inputValue: { type: Number, required: true, min: 0.01 },
    academicYear: { type: String, trim: true, maxlength: 20, default: '' },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, default: null },
    status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

discountGrantSchema.pre<IDiscountGrant>('validate', function (next) {
  if (this.durationType === 'standing') {
    this.validUntil = null;
  } else if (!this.validUntil) {
    return next(new Error(`validUntil is required when durationType is "${this.durationType}"`));
  } else if (this.validUntil <= this.validFrom) {
    return next(new Error('validUntil must be after validFrom'));
  }
  if (this.durationType === 'academic_year' && !this.academicYear?.trim()) {
    return next(new Error('academicYear is required when durationType is "academic_year"'));
  }
  if (this.valueType === 'percent' && this.inputValue > 100) {
    return next(new Error('Percentage cannot exceed 100'));
  }
  next();
});

discountGrantSchema.index({ student: 1, status: 1, validFrom: 1, validUntil: 1 });
discountGrantSchema.index({ school: 1, status: 1 });

export default mongoose.model<IDiscountGrant>('DiscountGrant', discountGrantSchema);
