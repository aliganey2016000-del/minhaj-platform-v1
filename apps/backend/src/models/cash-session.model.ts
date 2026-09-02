import mongoose, { Document, Schema } from 'mongoose';

export type CashSessionStatus = 'open' | 'closed';

export interface ICashSession extends Document {
  cashier: mongoose.Types.ObjectId;
  school: mongoose.Types.ObjectId;
  status: CashSessionStatus;
  openingBalance: number;
  cashCollected: number;
  cashRefunded: number;
  expectedCash: number;
  closingBalance?: number;
  variance?: number;
  openedAt: Date;
  closedAt?: Date;
  openingNote?: string;
  closingNote?: string;
}

const cashSessionSchema = new Schema<ICashSession>(
  {
    cashier: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    openingBalance: { type: Number, required: true, min: 0 },
    cashCollected: { type: Number, default: 0, min: 0 },
    cashRefunded: { type: Number, default: 0, min: 0 },
    expectedCash: { type: Number, default: 0, min: 0 },
    closingBalance: { type: Number, min: 0 },
    variance: { type: Number },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    openingNote: { type: String, trim: true, maxlength: 500 },
    closingNote: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

cashSessionSchema.index(
  { cashier: 1, school: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);

export default mongoose.model<ICashSession>('CashSession', cashSessionSchema);
