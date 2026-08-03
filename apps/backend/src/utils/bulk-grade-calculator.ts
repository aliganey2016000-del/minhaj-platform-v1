/**
 * Bulk Grade Calculator — computes EVERY student's weighted course grade in
 * one course using a small, fixed number of batch queries, regardless of how
 * many students there are.
 *
 * grade-calculator.ts's computeCourseGrade is a clean per-student function,
 * but calling it once per student (even in parallel via Promise.all) means
 * one course with N students and M grading categories fires up to N*M
 * separate queries — fine for a handful of students, but for an org-wide
 * "View Results" page computing every student's grade in every course, that
 * multiplies into thousands of individual queries and gets slow. This module
 * fetches each category TYPE's raw data for ALL students in one query (an
 * attendance query, an assignments query, a quiz-attempts query, one query
 * per linked exam, one manual-entries query), groups it in memory, then
 * assembles each student's CategoryResult[] from those in-memory maps — the
 * query count depends only on the scheme's categories, never on student count.
 */

import Attendance from '../models/attendance.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import Assignment from '../models/assignment.model';
import QuizAttempt from '../models/quiz-attempt.model';
import Result from '../models/result.model';
import ManualGradeEntry from '../models/manual-grade-entry.model';
import GradingScheme, { IGradingCategory } from '../models/grading-scheme.model';
import { CategoryResult, CourseGradeResult, PreloadedGradingScheme } from './grade-calculator';

interface PercentDetail {
  percent: number;
  detail: string;
}

async function computeAttendancePercentBulk(courseId: string, studentIds: string[]): Promise<Map<string, PercentDetail>> {
  const records = await Attendance.find({ course: courseId, student: { $in: studentIds } }).select('student status').lean();
  const tally = new Map<string, { present: number; total: number }>();
  for (const r of records as any[]) {
    const sid = r.student.toString();
    const entry = tally.get(sid) || { present: 0, total: 0 };
    entry.total++;
    if (r.status === 'present' || r.status === 'excused') entry.present++;
    tally.set(sid, entry);
  }
  const result = new Map<string, PercentDetail>();
  for (const [sid, { present, total }] of tally) {
    result.set(sid, { percent: Math.round((present / total) * 100), detail: `${present}/${total} present` });
  }
  return result;
}

async function computeAssignmentsPercentBulk(
  courseId: string,
  studentIds: string[],
  latePenaltyPercent: number
): Promise<Map<string, PercentDetail>> {
  const submissions = await AssignmentSubmission.find({
    course: courseId,
    student: { $in: studentIds },
    status: { $in: ['graded', 'returned'] },
  }).select('student assignment score isLate').lean();

  const result = new Map<string, PercentDetail>();
  if (submissions.length === 0) return result;

  const assignmentIds = [...new Set(submissions.map((s: any) => s.assignment.toString()))];
  const assignments = await Assignment.find({ _id: { $in: assignmentIds } }).select('totalMarks').lean();
  const maxByAssignment = new Map(assignments.map((a: any) => [a._id.toString(), a.totalMarks || 100]));

  const byStudent = new Map<string, number[]>();
  for (const s of submissions as any[]) {
    const max = maxByAssignment.get(s.assignment.toString()) || 100;
    let pct = max > 0 ? ((s.score || 0) / max) * 100 : 0;
    if (s.isLate) pct = Math.max(0, pct - latePenaltyPercent);
    const sid = s.student.toString();
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid)!.push(pct);
  }
  for (const [sid, percents] of byStudent) {
    const avg = percents.reduce((sum, p) => sum + p, 0) / percents.length;
    result.set(sid, { percent: Math.round(avg), detail: `${percents.length} assignment(s) graded` });
  }
  return result;
}

async function computeQuizzesPercentBulk(courseId: string, studentIds: string[], dropLowest: boolean): Promise<Map<string, PercentDetail>> {
  const attempts = await QuizAttempt.find({ course: courseId, student: { $in: studentIds } }).select('student quizId percentage').lean();

  const bestByStudentQuiz = new Map<string, Map<string, number>>();
  for (const a of attempts as any[]) {
    const sid = a.student.toString();
    if (!bestByStudentQuiz.has(sid)) bestByStudentQuiz.set(sid, new Map());
    const quizMap = bestByStudentQuiz.get(sid)!;
    const existing = quizMap.get(a.quizId);
    if (existing === undefined || a.percentage > existing) quizMap.set(a.quizId, a.percentage);
  }

  const result = new Map<string, PercentDetail>();
  for (const [sid, quizMap] of bestByStudentQuiz) {
    let scores = [...quizMap.values()];
    if (dropLowest && scores.length > 1) scores = scores.slice().sort((a, b) => a - b).slice(1);
    const avg = scores.reduce((sum, p) => sum + p, 0) / scores.length;
    result.set(sid, {
      percent: Math.round(avg),
      detail: `${quizMap.size} quiz(zes), best attempt each${dropLowest && quizMap.size > 1 ? ' (lowest dropped)' : ''}`,
    });
  }
  return result;
}

async function computeExamPercentBulk(examId: string | undefined, studentIds: string[]): Promise<Map<string, PercentDetail>> {
  const result = new Map<string, PercentDetail>();
  if (!examId) return result;
  const results = await Result.find({ exam: examId, student: { $in: studentIds } }).select('student percentage marksObtained totalMarks').lean();
  for (const r of results as any[]) {
    result.set(r.student.toString(), { percent: Math.round(r.percentage), detail: `${r.marksObtained}/${r.totalMarks}` });
  }
  return result;
}

async function fetchManualEntriesBulk(courseId: string, studentIds: string[]): Promise<Map<string, Map<string, number>>> {
  const entries = await ManualGradeEntry.find({ course: courseId, student: { $in: studentIds } }).select('student categoryKey score').lean();
  const byStudent = new Map<string, Map<string, number>>();
  for (const e of entries as any[]) {
    const sid = e.student.toString();
    if (!byStudent.has(sid)) byStudent.set(sid, new Map());
    byStudent.get(sid)!.set(e.categoryKey, e.score);
  }
  return byStudent;
}

/** Same weighted-grade math as computeCourseGrade, computed for every student in `studentIds` at once. */
export async function computeCourseGradesBulk(
  courseId: string,
  studentIds: string[],
  preloadedScheme?: PreloadedGradingScheme
): Promise<Map<string, CourseGradeResult>> {
  const scheme = preloadedScheme !== undefined ? preloadedScheme : await GradingScheme.findOne({ course: courseId }).lean();
  const categories: IGradingCategory[] = scheme?.categories || [];
  const passingScore = scheme?.passingScore ?? 60;
  const latePenaltyPercent = scheme?.latePenaltyPercent ?? 0;
  const dropLowestQuiz = scheme?.dropLowestQuiz ?? false;
  const bonusCap = scheme?.bonusCapPercent ?? 0;

  const results = new Map<string, CourseGradeResult>();
  if (studentIds.length === 0 || categories.length === 0) {
    for (const sid of studentIds) {
      results.set(sid, { studentId: sid, categories: [], weightedTotal: 0, bonusApplied: 0, finalGrade: 0, passingScore, passed: false });
    }
    return results;
  }

  const examCategories = categories.filter((c) => c.sourceType === 'exam');

  const [attendanceMap, assignmentsMap, quizzesMap, examMapEntries, manualMap] = await Promise.all([
    categories.some((c) => c.sourceType === 'attendance') ? computeAttendancePercentBulk(courseId, studentIds) : Promise.resolve(new Map<string, PercentDetail>()),
    categories.some((c) => c.sourceType === 'assignments') ? computeAssignmentsPercentBulk(courseId, studentIds, latePenaltyPercent) : Promise.resolve(new Map<string, PercentDetail>()),
    categories.some((c) => c.sourceType === 'quizzes') ? computeQuizzesPercentBulk(courseId, studentIds, dropLowestQuiz) : Promise.resolve(new Map<string, PercentDetail>()),
    Promise.all(examCategories.map(async (cat) => ({ key: cat.key, map: await computeExamPercentBulk(cat.examId?.toString(), studentIds) }))),
    fetchManualEntriesBulk(courseId, studentIds),
  ]);

  const examMapByCategoryKey = new Map(examMapEntries.map((e) => [e.key, e.map]));

  for (const studentId of studentIds) {
    const manualByKey = manualMap.get(studentId) || new Map<string, number>();

    const categoryResults: CategoryResult[] = categories.map((cat) => {
      let percent = 0;
      let detail = '';

      // A manual entry always wins over the category's configured automatic
      // source, regardless of sourceType — see computeCourseGrade for the
      // full rationale.
      const overrideScore = cat.sourceType === 'manual' ? undefined : manualByKey.get(cat.key);
      if (overrideScore !== undefined) {
        percent = overrideScore;
        detail = 'Manually entered (override)';
      } else if (cat.sourceType === 'attendance') {
        const v = attendanceMap.get(studentId);
        percent = v?.percent ?? 0;
        detail = v?.detail ?? 'No attendance recorded';
      } else if (cat.sourceType === 'assignments') {
        const v = assignmentsMap.get(studentId);
        percent = v?.percent ?? 0;
        detail = v?.detail ?? 'No graded assignments';
      } else if (cat.sourceType === 'quizzes') {
        const v = quizzesMap.get(studentId);
        percent = v?.percent ?? 0;
        detail = v?.detail ?? 'No quiz attempts';
      } else if (cat.sourceType === 'exam') {
        const v = examMapByCategoryKey.get(cat.key)?.get(studentId);
        percent = v?.percent ?? 0;
        detail = v?.detail ?? (cat.examId ? 'No result entered yet' : 'No exam linked to this category');
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
    });

    const weightedTotal = Math.round(categoryResults.reduce((sum, r) => sum + r.contribution, 0) * 100) / 100;
    const bonusApplied = bonusCap > 0 ? Math.min(bonusCap, manualByKey.get('__bonus') || 0) : 0;
    const finalGrade = Math.min(100, Math.round((weightedTotal + bonusApplied) * 100) / 100);

    results.set(studentId, {
      studentId,
      categories: categoryResults,
      weightedTotal,
      bonusApplied,
      finalGrade,
      passingScore,
      passed: finalGrade >= passingScore,
    });
  }

  return results;
}
