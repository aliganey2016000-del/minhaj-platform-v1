import mongoose, { Document, Schema } from 'mongoose';

export interface IIdSequence extends Document {
  key: string;
  seq: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generic atomic sequence for every human-readable auto-generated ID in the
 * platform that isn't the Student ID (see student-sequence.model.ts, which
 * predates this and is left as its own model/collection).
 *
 * One counter document per `key` namespace (e.g. "parent:PRN-2026",
 * "cert:CERT-2026") lets MongoDB's $inc reserve a unique sequence number
 * atomically even when many rows are created at once — the pattern every
 * `count + 1`-based ID generator in this codebase used to get wrong under
 * concurrency (two concurrent creates read the same count, both mint the
 * same ID, and the loser's unique-index insert fails) and after a deletion
 * (the next count+1 reuses a retired ID).
 */
const idSequenceSchema = new Schema<IIdSequence>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

export default mongoose.models.IdSequence
  || mongoose.model<IIdSequence>('IdSequence', idSequenceSchema);
