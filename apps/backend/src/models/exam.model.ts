import mongoose, { Schema, Document } from 'mongoose';

export interface IExam extends Document {
  title: string;
  course: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  // Fixed calendar schedule — required unless autoSchedule is on, in which
  // case the exam has no shared date/time at all; each student gets it the
  // moment they personally become eligible (see milestone below).
  examDate?: Date;
  startTime?: string;
  endTime?: string;
  duration: number; // minutes — the attempt's own timer once a student starts it, regardless of scheduling mode
  totalMarks: number;
  passingMarks: number;
  room?: string;
  instructions?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  resultsPublished: boolean;
  // Per-student, progress-driven scheduling instead of a fixed calendar
  // window: each student gets their own personal exam window, computed from
  // the moment THEY finish every chapter tagged with this exam's milestone
  // (see course-content.model.ts IChapter.examMilestone) —
  // ExamEligibility.eligibleAt for that student + these two admin-set
  // offsets:
  autoSchedule: boolean;
  milestone?: 'mid' | 'final' | null;
  /** Days after a student becomes eligible before their personal window opens (0 = opens immediately). */
  autoScheduleDelayDays: number;
  /** How many days a student's personal window stays open once it starts, before it counts as missed. */
  autoScheduleWindowDays: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examSchema = new Schema<IExam>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    // Stamped server-side from the linked course's own org — keeps exams
    // queryable/scoped the same way Course/Class/Student already are.
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    examDate: { type: Date, required: function (this: IExam) { return !this.autoSchedule; } },
    startTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, required: function (this: IExam) { return !this.autoSchedule; } },
    endTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, required: function (this: IExam) { return !this.autoSchedule; } },
    duration: { type: Number, required: true, min: 1 },
    totalMarks: { type: Number, required: true, min: 1 },
    passingMarks: { type: Number, required: true, min: 1 },
    room: { type: String, default: '' },
    instructions: { type: String, default: '' },
    status: { type: String, enum: ['scheduled', 'ongoing', 'completed', 'cancelled'], default: 'scheduled', index: true },
    resultsPublished: { type: Boolean, default: false },
    autoSchedule: { type: Boolean, default: false },
    milestone: { type: String, enum: ['mid', 'final', null], default: null },
    autoScheduleDelayDays: { type: Number, default: 0, min: 0 },
    autoScheduleWindowDays: { type: Number, default: 2, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

examSchema.index({ course: 1, examDate: 1 });

export default mongoose.model<IExam>('Exam', examSchema);