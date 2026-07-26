/**
 * Exam Paper Model
 * The instructor-authored question set for an exam, subject to admin
 * proofreading/approval before it can be used for "Active Exams".
 * One paper per exam.
 *
 * Questions use the exact same schema as course quizzes (see
 * ./shared/question.schema) — same 10 types, same authoring UI, same
 * grading engine (../utils/question-grading) — so there is one codebase for
 * "what a question looks like" and "how it's graded", not two diverging
 * ones for exam vs quiz.
 */

import mongoose, { Schema, Document } from 'mongoose';
import { questionSchema, type IQuizQuestion } from './shared/question.schema';

/** @deprecated kept as an alias so existing imports keep working — use IQuizQuestion directly in new code. */
export type IPaperQuestion = IQuizQuestion & { _id?: mongoose.Types.ObjectId };

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

const examPaperSchema = new Schema<IExamPaper>(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, default: '' },
    questions: { type: [questionSchema], default: [] },
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
