/**
 * Exam Attempt Model
 * A student's in-progress or submitted attempt at an exam's approved paper
 * ("Active Exams"). One attempt per student per exam.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IExamAnswer {
  questionId: mongoose.Types.ObjectId;
  // mcq: number (option index); true_false: boolean; short_answer: string
  value: mongoose.Schema.Types.Mixed;
}

export interface IExamAttempt extends Document {
  _id: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  paper: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  answers: IExamAnswer[];
  startedAt: Date;
  deadline: Date;
  submittedAt?: Date;
  autoGradedScore: number;
  maxScore: number;
  ungradedQuestionCount: number; // short_answer questions needing manual review
  status: 'in_progress' | 'submitted' | 'auto_submitted';
  school?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examAnswerSchema = new Schema<IExamAnswer>(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    value: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const examAttemptSchema = new Schema<IExamAttempt>(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    paper: { type: Schema.Types.ObjectId, ref: 'ExamPaper', required: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    answers: { type: [examAnswerSchema], default: [] },
    startedAt: { type: Date, required: true, default: Date.now },
    deadline: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    autoGradedScore: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    ungradedQuestionCount: { type: Number, default: 0 },
    status: { type: String, enum: ['in_progress', 'submitted', 'auto_submitted'], default: 'in_progress', index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

// One attempt per student per exam.
examAttemptSchema.index({ exam: 1, student: 1 }, { unique: true });

export default mongoose.model<IExamAttempt>('ExamAttempt', examAttemptSchema);
