import mongoose, { Document, Schema } from 'mongoose';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type NormalBalance = 'debit' | 'credit';

export interface IAccount extends Document {
  school: mongoose.Types.ObjectId;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  description?: string;
  active: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const accountSchema = new Schema<IAccount>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ['asset', 'liability', 'equity', 'revenue', 'expense'], required: true },
    normalBalance: { type: String, enum: ['debit', 'credit'], required: true },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

accountSchema.index({ school: 1, code: 1 }, { unique: true });
accountSchema.index({ school: 1, type: 1, active: 1 });

export default mongoose.model<IAccount>('Account', accountSchema);
