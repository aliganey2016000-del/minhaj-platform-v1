import mongoose, { Document, Schema } from 'mongoose';

export interface IStudentSequence extends Document {
  key: string;
  seq: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Atomic sequence used for automatically generated student IDs.
 *
 * The old Student pre-validate hook derived the next number with
 * countDocuments()+exists(). That works serially, but bulk import intentionally
 * creates many students concurrently, so several rows could observe the same
 * count and all choose the same ID. MongoDB then rejected most of the rows on
 * the unique (school, studentId) index.
 *
 * One counter document per student-ID namespace lets MongoDB's $inc reserve a
 * unique sequence number atomically, even when many rows are created at once.
 */
const studentSequenceSchema = new Schema<IStudentSequence>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

studentSequenceSchema.index({ key: 1 }, { unique: true });

export default mongoose.models.StudentSequence
  || mongoose.model<IStudentSequence>('StudentSequence', studentSequenceSchema);
