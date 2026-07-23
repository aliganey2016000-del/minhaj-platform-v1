/**
 * Grading Scheme Model — per-course weighted grading configuration.
 *
 * Each category is normalized to its own 0-100 average BEFORE its weight is
 * applied, so the final grade is proportional regardless of how many
 * assessments feed into a category (e.g. 3 quizzes or 10 quizzes both
 * average to a single 0-100 score before the quiz category's weight cuts in).
 *
 * `sourceType` says where a category's 0-100 score comes from:
 *   - 'attendance'  → % of Attendance records marked present/excused
 *   - 'assignments' → average of graded AssignmentSubmission scores (as %),
 *                     each submission's own % reduced by latePenaltyPercent if late
 *   - 'quizzes'     → average of each quiz's BEST attempt %, optionally
 *                     dropping the single lowest quiz (dropLowestQuiz)
 *   - 'exam'        → a specific Exam's Result.percentage for that student
 *                     (categories.examId identifies WHICH exam — e.g. one
 *                     category for "Midterm", pointing at the Midterm Exam
 *                     document, another for "Final Exam")
 *   - 'manual'      → teacher-entered score with no automatic data source
 *                     (e.g. Participation) — see ManualGradeEntry
 */

import mongoose, { Schema, Document } from 'mongoose';

export type GradeCategorySourceType = 'attendance' | 'assignments' | 'quizzes' | 'exam' | 'manual';

export interface IGradingCategory {
  key: string;           // stable slug, e.g. "attendance" — used to key ManualGradeEntry rows
  label: string;         // display name, e.g. "Attendance"
  weight: number;        // 0-100, all categories on a scheme must sum to 100
  sourceType: GradeCategorySourceType;
  examId?: mongoose.Types.ObjectId; // required when sourceType === 'exam'
}

export interface IGradingScheme extends Document {
  _id: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  categories: IGradingCategory[];
  passingScore: number;        // 0-100
  latePenaltyPercent: number;  // deducted from a late assignment submission's own percentage
  bonusCapPercent: number;     // maximum extra credit a teacher may award on top of the weighted total
  dropLowestQuiz: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const gradingCategorySchema = new Schema<IGradingCategory>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    sourceType: { type: String, required: true, enum: ['attendance', 'assignments', 'quizzes', 'exam', 'manual'] },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam' },
  },
  { _id: false }
);

const gradingSchemeSchema = new Schema<IGradingScheme>(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, unique: true, index: true },
    categories: { type: [gradingCategorySchema], default: [] },
    passingScore: { type: Number, default: 60, min: 0, max: 100 },
    latePenaltyPercent: { type: Number, default: 0, min: 0, max: 100 },
    bonusCapPercent: { type: Number, default: 0, min: 0, max: 100 },
    dropLowestQuiz: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IGradingScheme>('GradingScheme', gradingSchemeSchema);
