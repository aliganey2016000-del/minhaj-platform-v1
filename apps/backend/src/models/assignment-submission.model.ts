import mongoose, { Schema, Document } from 'mongoose';

export interface IAssignmentSubmission extends Document {
  assignment: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  answer: string;
  fileUrl: string;
  content?: string;
  files?: { name: string; url: string; type: string }[];
  isLate: boolean;
  submittedAt: Date;
  status: 'submitted' | 'graded' | 'returned';
  score?: number;
  feedback?: string;
  gradedAt?: Date;
  gradedBy?: mongoose.Types.ObjectId;
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
    content: { type: String, default: '' },
    files: [{ name: String, url: String, type: String }],
    isLate: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['submitted', 'graded', 'returned'], default: 'submitted' },
    score: { type: Number, default: null },
    feedback: { type: String, default: '' },
    gradedAt: { type: Date, default: null },
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { transform(_d: any, r: any) { delete r.__v; return r; } } }
);

// One submission per student per assignment — resubmitting updates the existing record.
schema.index({ assignment: 1, student: 1 }, { unique: true });
// Teacher analytics, gradebook and report-card reads all filter by course;
// without this each of them scanned every submission in the database.
schema.index({ course: 1, student: 1 });

export default mongoose.model<IAssignmentSubmission>('AssignmentSubmission', schema);
