import mongoose, { Schema, Document } from 'mongoose';

export interface IAssignmentSubmission extends Document {
  assignment: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  answer: string;
  fileUrl: string;
  isLate: boolean;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAssignmentSubmission>(
  {
    assignment: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    answer: { type: String, default: '' },
    fileUrl: { type: String, default: '' },
    isLate: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { transform(_d: any, r: any) { delete r.__v; return r; } } }
);

// One submission per student per assignment — resubmitting updates the existing record.
schema.index({ assignment: 1, student: 1 }, { unique: true });

export default mongoose.model<IAssignmentSubmission>('AssignmentSubmission', schema);
