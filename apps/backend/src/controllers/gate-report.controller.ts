/**
 * Interactive Gate — accuracy reporting for teachers/admins.
 *
 * LessonBlockProgress already records every Stop & Check attempt a student
 * makes (correct/incorrect, timestamped, including retries — see
 * lesson-block-progress.model.ts). This controller aggregates that raw
 * attempt log into a report, without ever writing new data.
 *
 * "Accuracy" here always means FIRST-ATTEMPT accuracy: because a block only
 * unlocks the next one once answered correctly, a student can always retry
 * until they get it right — counting every attempt would make every
 * student's accuracy trend toward 100% and say nothing about how well they
 * actually understood the material on their own. Only each question's
 * earliest attempt counts toward accuracy; the retry count is reported
 * separately as "how much they worked at it".
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Course from '../models/course.model';
import CourseContent from '../models/course-content.model';
import LessonBlockProgress from '../models/lesson-block-progress.model';
import Student from '../models/student.model';
import { NotFoundError, ForbiddenError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter, assertOwnsOrg, getOwnTeacherRecord } from '../utils/tenant-scope';

async function assertOwnsCourseIfTeacher(req: Request, course: { teacher?: unknown }): Promise<void> {
  if (req.user?.role !== 'teacher') return;
  const teacher = await getOwnTeacherRecord(req);
  const teacherId = (course.teacher as any)?._id ? (course.teacher as any)._id.toString() : (course.teacher as any)?.toString();
  if (!teacher || teacherId !== teacher._id.toString()) {
    throw new ForbiddenError('You can only access courses assigned to you.');
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface FirstAttemptRow {
  _id: { course: mongoose.Types.ObjectId; student: mongoose.Types.ObjectId; lessonId: mongoose.Types.ObjectId; blockIndex: number; questionIndex: number };
  firstCorrect: boolean;
  attemptCount: number;
  lastAttemptedAt: Date;
}

/**
 * Collapses the raw attempts log down to one row per (student, lesson,
 * block, question) — the first attempt's correctness, how many attempts it
 * took in total, and when it was last touched. The $sort immediately before
 * $group makes $first deterministic (Mongo evaluates accumulators in the
 * order documents arrive from the previous stage).
 */
async function firstAttemptRows(courseFilter: Record<string, unknown>): Promise<FirstAttemptRow[]> {
  return LessonBlockProgress.aggregate([
    { $match: courseFilter },
    { $unwind: '$attempts' },
    { $sort: { 'attempts.attemptedAt': 1 } },
    {
      $group: {
        _id: {
          course: '$course',
          student: '$student',
          lessonId: '$lessonId',
          blockIndex: '$attempts.blockIndex',
          questionIndex: '$attempts.questionIndex',
        },
        firstCorrect: { $first: '$attempts.correct' },
        attemptCount: { $sum: 1 },
        lastAttemptedAt: { $max: '$attempts.attemptedAt' },
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// GET /courses/:id/gate-report — full per-student + per-lesson breakdown
// for one course (admin/teacher, scoped to their own org/course).
// ---------------------------------------------------------------------------
export const getCourseGateReport = async (req: Request, res: Response): Promise<Response> => {
  const course = await Course.findById(req.params.id).select('school teacher title');
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');
  await assertOwnsCourseIfTeacher(req, course);

  const courseObjectId = course._id as mongoose.Types.ObjectId;
  const rows = await firstAttemptRows({ course: courseObjectId });

  // Lesson titles — looked up once from CourseContent rather than per-row.
  const content = await CourseContent.findOne({ course: courseObjectId }).select('chapters').lean();
  const lessonTitleMap = new Map<string, string>();
  if (content) {
    for (const chapter of (content as any).chapters || []) {
      for (const item of chapter.items || []) {
        if (item.type === 'lesson') lessonTitleMap.set(item._id.toString(), item.title);
      }
    }
  }

  // gateCompleted / lessons-started come from the progress documents
  // themselves, not the attempts log (a lesson can be "started" via a block
  // with no question at all, which never appears in `rows`).
  const progressDocs = await LessonBlockProgress.find({ course: courseObjectId })
    .select('student lessonId gateCompleted')
    .lean();
  const lessonsStartedByStudent = new Map<string, Set<string>>();
  const lessonsCompletedByStudent = new Map<string, Set<string>>();
  for (const p of progressDocs) {
    const sid = p.student.toString();
    const lid = p.lessonId.toString();
    if (!lessonsStartedByStudent.has(sid)) lessonsStartedByStudent.set(sid, new Set());
    lessonsStartedByStudent.get(sid)!.add(lid);
    if (p.gateCompleted) {
      if (!lessonsCompletedByStudent.has(sid)) lessonsCompletedByStudent.set(sid, new Set());
      lessonsCompletedByStudent.get(sid)!.add(lid);
    }
  }

  type StudentAgg = { questionsAttempted: number; firstAttemptCorrect: number; totalAttempts: number; lastActivityAt: Date };
  type LessonAgg = { questionsAttempted: number; firstAttemptCorrect: number; totalAttempts: number; studentIds: Set<string> };

  const perStudentMap = new Map<string, StudentAgg>();
  const perLessonMap = new Map<string, LessonAgg>();

  for (const row of rows) {
    const studentId = row._id.student.toString();
    const lessonId = row._id.lessonId.toString();

    const s = perStudentMap.get(studentId) || { questionsAttempted: 0, firstAttemptCorrect: 0, totalAttempts: 0, lastActivityAt: row.lastAttemptedAt };
    s.questionsAttempted += 1;
    if (row.firstCorrect) s.firstAttemptCorrect += 1;
    s.totalAttempts += row.attemptCount;
    if (row.lastAttemptedAt > s.lastActivityAt) s.lastActivityAt = row.lastAttemptedAt;
    perStudentMap.set(studentId, s);

    const l = perLessonMap.get(lessonId) || { questionsAttempted: 0, firstAttemptCorrect: 0, totalAttempts: 0, studentIds: new Set<string>() };
    l.questionsAttempted += 1;
    if (row.firstCorrect) l.firstAttemptCorrect += 1;
    l.totalAttempts += row.attemptCount;
    l.studentIds.add(studentId);
    perLessonMap.set(lessonId, l);
  }

  const studentIds = [...perStudentMap.keys()];
  const students = studentIds.length
    ? await Student.find({ _id: { $in: studentIds } }).populate('profile', 'firstName lastName').select('profile').lean()
    : [];
  const studentNameMap = new Map<string, string>(
    students.map((s: any) => [
      s._id.toString(),
      s.profile ? `${s.profile.firstName} ${s.profile.lastName}`.trim() : 'Unknown Student',
    ])
  );

  const perStudent = [...perStudentMap.entries()]
    .map(([studentId, s]) => ({
      studentId,
      name: studentNameMap.get(studentId) || 'Unknown Student',
      firstAttemptAccuracy: round1((s.firstAttemptCorrect / s.questionsAttempted) * 100),
      questionsAttempted: s.questionsAttempted,
      totalAttempts: s.totalAttempts,
      lessonsStarted: lessonsStartedByStudent.get(studentId)?.size || 0,
      lessonsCompleted: lessonsCompletedByStudent.get(studentId)?.size || 0,
      lastActivityAt: s.lastActivityAt,
    }))
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

  const perLesson = [...perLessonMap.entries()]
    .map(([lessonId, l]) => ({
      lessonId,
      lessonTitle: lessonTitleMap.get(lessonId) || 'Untitled Lesson',
      firstAttemptAccuracy: round1((l.firstAttemptCorrect / l.questionsAttempted) * 100),
      studentsAttempted: l.studentIds.size,
      questionsAttempted: l.questionsAttempted,
      totalAttempts: l.totalAttempts,
    }))
    .sort((a, b) => a.lessonTitle.localeCompare(b.lessonTitle));

  const totalQuestionsAttempted = rows.length;
  const totalFirstCorrect = rows.filter((r) => r.firstCorrect).length;
  const totalAttempts = rows.reduce((sum, r) => sum + r.attemptCount, 0);

  return ApiResponse.success(res, {
    course: { _id: course._id, title: (course as any).title },
    studentsCount: perStudentMap.size,
    overallFirstAttemptAccuracy: totalQuestionsAttempted ? round1((totalFirstCorrect / totalQuestionsAttempted) * 100) : 0,
    totalQuestionsAttempted,
    totalAttempts,
    perStudent,
    perLesson,
  });
};

// ---------------------------------------------------------------------------
// GET /courses/gate-accuracy-summary — lightweight per-course accuracy
// badge for course list pages (admin/teacher, scoped).
// ---------------------------------------------------------------------------
export const getGateAccuracySummary = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {});
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    if (!teacher) return ApiResponse.success(res, []);
    filter.teacher = teacher._id;
  }

  const courses = await Course.find(filter).select('_id').lean();
  if (courses.length === 0) return ApiResponse.success(res, []);
  const courseIds = courses.map((c) => c._id);

  const rows = await LessonBlockProgress.aggregate([
    { $match: { course: { $in: courseIds } } },
    { $unwind: '$attempts' },
    { $sort: { 'attempts.attemptedAt': 1 } },
    {
      $group: {
        _id: { course: '$course', student: '$student', lessonId: '$lessonId', blockIndex: '$attempts.blockIndex', questionIndex: '$attempts.questionIndex' },
        firstCorrect: { $first: '$attempts.correct' },
      },
    },
    {
      $group: {
        _id: '$_id.course',
        questionsAttempted: { $sum: 1 },
        firstAttemptCorrect: { $sum: { $cond: ['$firstCorrect', 1, 0] } },
      },
    },
  ]);

  const result = rows.map((r) => ({
    courseId: r._id.toString(),
    firstAttemptAccuracy: round1((r.firstAttemptCorrect / r.questionsAttempted) * 100),
    questionsAttempted: r.questionsAttempted,
  }));

  return ApiResponse.success(res, result);
};
