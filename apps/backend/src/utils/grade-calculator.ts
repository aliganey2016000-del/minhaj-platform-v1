/**
 * Grade Calculator — computes one student's weighted overall course grade
 * from a GradingScheme, pulling raw data from Attendance, AssignmentSubmission,
 * QuizAttempt, Result (exams), and ManualGradeEntry. Every category is
 * normalized to its own 0-100 average BEFORE its weight is applied, so the
 * result is proportional no matter how many assessments feed a category.
 */

import Attendance from '../models/attendance.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import Assignment from '../models/assignment.model';
import QuizAttempt from '../models/quiz-attempt.model';
import Result from '../models/result.model';
import ManualGradeEntry from '../models/manual-grade-entry.model';
import GradingScheme, { IGradingCategory } from '../models/grading-scheme.model';

export interface CategoryResult {
  key: string;
  label: string;
  weight: number;
  sourceType: string;
  earnedPercent: number;   // 0-100, this category's own normalized average
  contribution: number;    // earnedPercent * (weight/100) — this category's points out of 100
  detail?: string;         // human-readable breakdown, e.g. "8/10 present"
}

export interface CourseGradeResult {
  studentId: string;
  categories: CategoryResult[];
  weightedTotal: number;  // sum of contributions, 0-100, before bonus
  bonusApplied: number;
  finalGrade: number;     // weightedTotal + bonusApplied, capped at 100
  passingScore: number;
  passed: boolean;
}

async function computeAttendancePercent(courseId: string, studentId: string): Promise<{ percent: number; detail: string }> {
  const records = await Attendance.find({ course: courseId, student: studentId }).select('status').lean();
  if (records.length === 0) return { percent: 0, detail: 'No attendance recorded' };
  const present = records.filter((r: any) => r.status === 'present' || r.status === 'excused').length;
  return { percent: Math.round((present / records.length) * 100), detail: `${present}/${records.length} present` };
}

async function computeAssignmentsPercent(
  courseId: string,
  studentId: string,
  latePenaltyPercent: number
): Promise<{ percent: number; detail: string }> {
  const submissions = await AssignmentSubmission.find({ course: courseId, student: studentId, status: { $in: ['graded', 'returned'] } })
    .select('assignment score isLate')
    .lean();
  if (submissions.length === 0) return { percent: 0, detail: 'No graded assignments' };

  const assignmentIds = submissions.map((s: any) => s.assignment);
  const assignments = await Assignment.find({ _id: { $in: assignmentIds } }).select('totalMarks').lean();
  const maxByAssignment = new Map(assignments.map((a: any) => [a._id.toString(), a.totalMarks || 100]));

  const percents = submissions.map((s: any) => {
    const max = maxByAssignment.get(s.assignment.toString()) || 100;
    let pct = max > 0 ? ((s.score || 0) / max) * 100 : 0;
    if (s.isLate) pct = Math.max(0, pct - latePenaltyPercent);
    return pct;
  });
  const avg = percents.reduce((sum, p) => sum + p, 0) / percents.length;
  return { percent: Math.round(avg), detail: `${submissions.length} assignment(s) graded` };
}

async function computeQuizzesPercent(
  courseId: string,
  studentId: string,
  dropLowest: boolean
): Promise<{ percent: number; detail: string }> {
  const attempts = await QuizAttempt.find({ course: courseId, student: studentId }).select('quizId percentage').lean();
  if (attempts.length === 0) return { percent: 0, detail: 'No quiz attempts' };

  // Best attempt per quiz.
  const bestByQuiz = new Map<string, number>();
  for (const a of attempts as any[]) {
    const key = a.quizId;
    const existing = bestByQuiz.get(key);
    if (existing === undefined || a.percentage > existing) bestByQuiz.set(key, a.percentage);
  }
  let scores = [...bestByQuiz.values()];
  if (dropLowest && scores.length > 1) {
    scores = scores.slice().sort((a, b) => a - b).slice(1);
  }
  const avg = scores.reduce((sum, p) => sum + p, 0) / scores.length;
  return { percent: Math.round(avg), detail: `${bestByQuiz.size} quiz(zes), best attempt each${dropLowest && bestByQuiz.size > 1 ? ' (lowest dropped)' : ''}` };
}

async function computeExamPercent(examId: string | undefined, studentId: string): Promise<{ percent: number; detail: string }> {
  if (!examId) return { percent: 0, detail: 'No exam linked to this category' };
  const result = await Result.findOne({ exam: examId, student: studentId }).select('percentage marksObtained totalMarks').lean();
  if (!result) return { percent: 0, detail: 'No result entered yet' };
  return { percent: Math.round((result as any).percentage), detail: `${(result as any).marksObtained}/${(result as any).totalMarks}` };
}

/** Minimal shape needed from a GradingScheme — lets a caller that's already looping many students in one course (getClassGrades, getOrgGradebookOverview) pass in the scheme it already fetched once, instead of this function re-fetching the identical document per student. */
export type PreloadedGradingScheme = {
  categories: IGradingCategory[];
  passingScore?: number;
  latePenaltyPercent?: number;
  bonusCapPercent?: number;
  dropLowestQuiz?: boolean;
} | null;

export async function computeCourseGrade(
  courseId: string,
  studentId: string,
  preloadedScheme?: PreloadedGradingScheme
): Promise<CourseGradeResult> {
  const scheme = preloadedScheme !== undefined ? preloadedScheme : await GradingScheme.findOne({ course: courseId }).lean();
  const categories: IGradingCategory[] = scheme?.categories || [];
  const passingScore = scheme?.passingScore ?? 60;
  const latePenaltyPercent = scheme?.latePenaltyPercent ?? 0;
  const dropLowestQuiz = scheme?.dropLowestQuiz ?? false;

  // ALL manual entries for this student in this course fetched in one query
  // (instead of one query per category) — categoryKey lookups below are then
  // just an in-memory Map read, and the remaining per-category source
  // computations run in parallel via Promise.all. This single query also
  // backs the bonus lookup ('__bonus' key) further down, so nothing else
  // touches ManualGradeEntry directly in this function anymore. Both changes
  // were needed after adding the override behavior below turned what used
  // to be N sequential queries (one per category) into 2N — this endpoint
  // computes grades for every (student, category) combo across an entire
  // org's courses, and that regression was slow enough to notice.
  const manualEntries = await ManualGradeEntry.find({ course: courseId, student: studentId }).select('categoryKey score').lean();
  const manualByKey = new Map(manualEntries.map((e: any) => [e.categoryKey, e.score as number]));

  const results: CategoryResult[] = await Promise.all(
    categories.map(async (cat) => {
      let percent = 0;
      let detail = '';
      // A manual entry always wins over the category's configured automatic
      // source, regardless of sourceType — this is what lets an admin/teacher
      // directly key in a score (e.g. from the "Enter Results" bulk sheet)
      // for ANY category, including 'exam'-sourced ones, without needing a
      // real Exam+Result document behind it. 'manual' sourceType categories
      // already worked this way; this generalizes it to every sourceType.
      const overrideScore = cat.sourceType === 'manual' ? undefined : manualByKey.get(cat.key);
      if (overrideScore !== undefined) {
        percent = overrideScore;
        detail = 'Manually entered (override)';
      } else if (cat.sourceType === 'attendance') {
        ({ percent, detail } = await computeAttendancePercent(courseId, studentId));
      } else if (cat.sourceType === 'assignments') {
        ({ percent, detail } = await computeAssignmentsPercent(courseId, studentId, latePenaltyPercent));
      } else if (cat.sourceType === 'quizzes') {
        ({ percent, detail } = await computeQuizzesPercent(courseId, studentId, dropLowestQuiz));
      } else if (cat.sourceType === 'exam') {
        ({ percent, detail } = await computeExamPercent(cat.examId?.toString(), studentId));
      } else if (cat.sourceType === 'manual') {
        const manualScore = manualByKey.get(cat.key);
        percent = manualScore ?? 0;
        detail = manualScore !== undefined ? 'Manually entered' : 'Not entered yet';
      }
      return {
        key: cat.key,
        label: cat.label,
        weight: cat.weight,
        sourceType: cat.sourceType,
        earnedPercent: percent,
        contribution: Math.round(percent * (cat.weight / 100) * 100) / 100,
        detail,
      };
    })
  );

  const weightedTotal = Math.round(results.reduce((sum, r) => sum + r.contribution, 0) * 100) / 100;
  const bonusCap = scheme?.bonusCapPercent ?? 0;
  const bonusApplied = bonusCap > 0 ? Math.min(bonusCap, manualByKey.get('__bonus') || 0) : 0;
  const finalGrade = Math.min(100, Math.round((weightedTotal + bonusApplied) * 100) / 100);

  return {
    studentId,
    categories: results,
    weightedTotal,
    bonusApplied,
    finalGrade,
    passingScore,
    passed: finalGrade >= passingScore,
  };
}

export function validateCategoryWeights(categories: { weight: number }[]): boolean {
  const sum = categories.reduce((s, c) => s + c.weight, 0);
  return Math.abs(sum - 100) < 0.01;
}
