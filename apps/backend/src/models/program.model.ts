import mongoose, { Schema, Document } from 'mongoose';

/**
 * Program — the missing layer between Department and Class/Cohort for
 * College and University (Department → Program → Cohort/Class), and the
 * top-level grouping for Training Center (Program → Batch/Cohort), where it
 * has no department. Optional everywhere: a school never uses this, and a
 * college/university/training center that hasn't set one up yet still works
 * (Class.program stays unset until they do).
 */
export interface IProgram extends Document {
  name: string;
  code?: string;
  school: mongoose.Types.ObjectId;
  /** Optional — Training Centers commonly have no Department layer at all. */
  department?: mongoose.Types.ObjectId;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const programSchema = new Schema<IProgram>(
  {
    name: {
      type: String,
      required: [true, 'Program name is required'],
      trim: true,
      maxlength: [200, 'Program name cannot exceed 200 characters'],
    },
    code: { type: String, trim: true, maxlength: 30, default: '' },
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } },
);

programSchema.index({ school: 1, name: 1 }, { unique: true });
programSchema.index({ school: 1, department: 1 });

export default mongoose.model<IProgram>('Program', programSchema);
