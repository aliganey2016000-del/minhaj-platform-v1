import mongoose, { Schema, Document } from 'mongoose';

export interface IAssignment extends Document {
  title: string;
  description: string;
  course: mongoose.Types.ObjectId;
  dueDate: Date;
  totalMarks: number;
  allowLateSubmission: boolean;
  attachments: string[];
  status: 'active' | 'inactive';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAssignment>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    dueDate: { type: Date, required: true },
    totalMarks: { type: Number, required: true, min: 1, default: 100 },
    allowLateSubmission: { type: Boolean, default: false },
    attachments: [{ type: String }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_d: any, r: any) { delete r.__v; return r; } } }
);

schema.index({ course: 1, dueDate: 1 });
schema.index({ status: 1 });

export default mongoose.model<IAssignment>('Assignment', schema);