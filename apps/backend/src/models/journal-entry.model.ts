import mongoose, { Document, Schema } from 'mongoose';

export interface IJournalLine {
  account: mongoose.Types.ObjectId;
  description?: string;
  debit: number;
  credit: number;
}

export interface IJournalEntry extends Document {
  school: mongoose.Types.ObjectId;
  entryNumber: string;
  entryDate: Date;
  description: string;
  sourceType?: string;
  sourceId?: mongoose.Types.ObjectId;
  lines: IJournalLine[];
  postedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const journalLineSchema = new Schema<IJournalLine>(
  {
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    description: { type: String, default: '', trim: true, maxlength: 200 },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const journalEntrySchema = new Schema<IJournalEntry>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    entryNumber: { type: String, required: true, unique: true, index: true },
    entryDate: { type: Date, required: true, default: Date.now, index: true },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    sourceType: { type: String, trim: true, maxlength: 60 },
    sourceId: { type: Schema.Types.ObjectId, index: true },
    lines: {
      type: [journalLineSchema],
      validate: {
        validator: (lines: IJournalLine[]) => Array.isArray(lines) && lines.length >= 2,
        message: 'A journal entry requires at least two lines',
      },
    },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

journalEntrySchema.index({ school: 1, entryDate: -1 });
journalEntrySchema.index({ school: 1, sourceType: 1, sourceId: 1 }, { unique: true, partialFilterExpression: { sourceId: { $type: 'objectId' } } });

journalEntrySchema.pre<IJournalEntry>('validate', function (next) {
  const lines = this.lines || [];
  const debit = Math.round(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0) * 100);
  const credit = Math.round(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0) * 100);
  if (debit <= 0 || debit !== credit) {
    this.invalidate('lines', 'Journal entry must have equal, positive debit and credit totals');
  }
  for (const line of lines) {
    const d = Number(line.debit || 0);
    const c = Number(line.credit || 0);
    if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
      this.invalidate('lines', 'Each journal line must contain either a debit or a credit');
      break;
    }
  }
  next();
});

export default mongoose.model<IJournalEntry>('JournalEntry', journalEntrySchema);
