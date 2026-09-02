import mongoose, { Document, Schema } from 'mongoose';

export type ReconciliationStatus = 'open' | 'reconciled';

export interface IFinanceReconciliation extends Document {
  school: mongoose.Types.ObjectId;
  account: mongoose.Types.ObjectId;
  asOf: Date;
  statementBalance: number;
  ledgerBalance: number;
  difference: number;
  status: ReconciliationStatus;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  reconciledBy?: mongoose.Types.ObjectId;
  reconciledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const financeReconciliationSchema = new Schema<IFinanceReconciliation>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    asOf: { type: Date, required: true, index: true },
    statementBalance: { type: Number, required: true },
    ledgerBalance: { type: Number, required: true },
    difference: { type: Number, required: true },
    status: { type: String, enum: ['open', 'reconciled'], default: 'open', index: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reconciledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reconciledAt: { type: Date },
  },
  { timestamps: true }
);

financeReconciliationSchema.index({ school: 1, account: 1, asOf: -1 });

export default mongoose.model<IFinanceReconciliation>('FinanceReconciliation', financeReconciliationSchema);
