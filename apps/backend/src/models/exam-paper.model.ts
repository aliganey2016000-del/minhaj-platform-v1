/**
 * Exam Paper Model
 * The instructor-authored question set for an exam, subject to admin
 * proofreading/approval before it can be used for "Active Exams".
 * One paper per exam.
 */

import mongoose, { Schema, Document } from 'mongoose';

export type PaperQuestionType = 'mcq' | 'true_false' | 'short_answer';

export interface IPaperQuestion {
  _id?: mongoose.Types.ObjectId;
  type: PaperQuestionType;
  question: string;
  points: number;
  options?: string[];        // mcq
  correctIndex?: number;     // mcq — 0-based
  correctAnswer?: boolean;   // true_false
  correctText?: string;      // short_answer — reference answer for manual grading
}

export interface IExamPaper extends Document {
  _id: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  title: string;
  instructions?: string;
  questions: IPaperQuestion[];
  totalPoints: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedBy: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewNotes?: string;
  reviewedAt?: Date;
  school?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paperQuestionSchema = new Schema<IPaperQuestion>(
  {
    type: { type: String, enum: ['mcq', 'true_false', 'short_answer'], required: true, default: 'mcq' },
    question: { type: String, required: true, trim: true },
    points: { type: Number, required: true, min: 0, default: 1 },
    options: { type: [String], default: undefined },
    correctIndex: { type: Number, min: 0 },
    correctAnswer: { type: Boolean },
    correctText: { type: String, trim: true },
  },
  { _id: true }
);

const examPaperSchema = new Schema<IExamPaper>(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, default: '' },
    questions: { type: [paperQuestionSchema], default: [] },
    totalPoints: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'submitted', 'approved', 'rejected'], default: 'draft', index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNotes: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

examPaperSchema.pre<IExamPaper>('save', function (next) {
  this.totalPoints = this.questions.reduce((sum, q) => sum + (q.points || 0), 0);
  next();
});

export default mongoose.model<IExamPaper>('ExamPaper', examPaperSchema);
