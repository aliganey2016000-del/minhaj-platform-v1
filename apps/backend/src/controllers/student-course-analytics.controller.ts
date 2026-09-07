import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Student from '../models/student.model';
import Course from '../models/course.model';
import Progress from '../models/progress.model';
import QuizAttempt from '../models/quiz-attempt.model';
import LessonBlockProgress from '../models/lesson-block-progress.model';
import LearningSession from '../models/learning-session.model';
import { ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

async function canViewStudent(req: Request, studentId: string): Promise<void> {
  if (req.user?.role === 'admin' || req.user?.role === 'org_admin') return;
  if (req.user?.role !== 'teacher') throw new ForbiddenError('You do not have access to this student.');
  const teacher = await getOwnTeacherRecord(req);
  const courseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
  const visible = await Student.findOne({ _id: studentId, enrolledCourses: { $in: courseIds } }).select('_id').lean();
  if (!visible) throw new ForbiddenError('You do not have access to this student.');
}

const safeDate = (value?: Date | string | null) => value ? new Date(value) : null;

export const getStudentCourseAnalytics = async (req: Request, res: Response): Promise<Response> => {
  const { studentId } = req.params;
  await canViewStudent(req, studentId);

  const student = await Student.findById(studentId).select('status enrolledCourses enrollmentHistory').lean();
  if (!student) throw new NotFoundError('Student');

  const courseIds = (student.enrolledCourses || []).map((id) => new mongoose.Types.ObjectId(id));
  if (!courseIds.length) {
    return ApiResponse.success(res, { totalCourses: 0, totalDurationSeconds: 0, totalActiveSeconds: 0, averageScore: null, correctAnswers: 0, totalQuestions: 0, totalQuizAttempts: 0, totalGateQuestions: 0, totalScoredUnits: 0, completedCourses: 0, inProgressCourses: 0, notStartedCourses: 0, courses: [] });
  }

  const [courses, progressDocs, quizRows, gateRows, sessionRows] = await Promise.all([
    Course.find({ _id: { $in: courseIds } }).select('_id title syllabus status level category').lean(),
    Progress.find({ student: studentId, course: { $in: courseIds } }).select('course completedLessons completedQuizzes completedAssignments totalItems lastAccessed status').lean(),
    QuizAttempt.aggregate([
      { $match: { student: new mongoose.Types.ObjectId(studentId), course: { $in: courseIds } } },
      { $project: {
        course: 1,
        createdAt: 1,
        passed: 1,
        answers: 1,
        percentage: 1,
        attempts: { $literal: 1 },
        correctAnswers: { $size: { $filter: { input: '$answers', as: 'answer', cond: { $eq: ['$$answer.correct', true] } } } },
        totalQuestions: { $size: '$answers' },
      } },
      { $group: {
        _id: '$course',
        averageScore: { $avg: '$percentage' },
        attempts: { $sum: 1 },
        passed: { $sum: { $cond: ['$passed', 1, 0] } },
        correctAnswers: { $sum: '$correctAnswers' },
        totalQuestions: { $sum: '$totalQuestions' },
        lastAttemptAt: { $max: '$createdAt' },
      } },
    ]),
    // Interactive Gate ("Stop & Check") answers are graded quiz work too —
    // they just live in LessonBlockProgress instead of QuizAttempt, which is
    // why this page used to show "—" for a student who had answered plenty
    // of in-lesson questions but never submitted a standalone quiz. Scored
    // FIRST ATTEMPT ONLY, mirroring gate-report.controller.ts and the
    // roster's blended "Avg Quiz Score": a gate block can be retried until
    // correct, so averaging the raw attempt log would push every score to
    // 100%.
    LessonBlockProgress.aggregate([
      { $match: { student: new mongoose.Types.ObjectId(studentId), course: { $in: courseIds } } },
      { $unwind: '$attempts' },
      { $sort: { 'attempts.attemptedAt': 1 } },
      { $group: {
        _id: { course: '$course', lessonId: '$lessonId', blockIndex: '$attempts.blockIndex', questionIndex: '$attempts.questionIndex' },
        firstCorrect: { $first: '$attempts.correct' },
        // Scoring uses the first attempt only, but "last activity" should
        // still reflect a retry, so keep the newest timestamp separately.
        latestAt: { $max: '$attempts.attemptedAt' },
      } },
      { $group: {
        _id: '$_id.course',
        questions: { $sum: 1 },
        correct: { $sum: { $cond: ['$firstCorrect', 1, 0] } },
        lastAttemptAt: { $max: '$latestAt' },
      } },
    ]),
    LearningSession.aggregate([
      { $match: { student: new mongoose.Types.ObjectId(studentId), course: { $in: courseIds } } },
      { $group: { _id: '$course', activeSeconds: { $sum: '$activeSeconds' }, idleSeconds: { $sum: '$idleSeconds' }, watchSeconds: { $sum: '$watchSeconds' }, sessions: { $sum: 1 }, lastSessionAt: { $max: '$startedAt' } } },
    ]),
  ]);

  const progressByCourse = new Map(progressDocs.map((p: any) => [p.course.toString(), p]));
  const quizByCourse = new Map(quizRows.map((q: any) => [q._id.toString(), q]));
  const gateByCourse = new Map(gateRows.map((g: any) => [g._id.toString(), g]));
  const sessionsByCourse = new Map(sessionRows.map((s: any) => [s._id.toString(), s]));

  const rows = courses.map((course: any) => {
    const id = course._id.toString();
    const progress = progressByCourse.get(id);
    const quiz = quizByCourse.get(id);
    const gate = gateByCourse.get(id);
    const sessions = sessionsByCourse.get(id);
    const completedItems = (progress?.completedLessons || 0) + (progress?.completedQuizzes || 0) + (progress?.completedAssignments || 0);
    const totalItems = progress?.totalItems || 0;
    const progressPercent = totalItems > 0 ? Math.min(100, Math.round((completedItems / totalItems) * 100)) : progress?.status === 'completed' ? 100 : 0;
    const completed = progress?.status === 'completed' || progressPercent >= 100;
    const hasActivity = Boolean(progress || sessions || quiz || gate);
    const status = completed ? 'completed' : hasActivity ? 'in_progress' : 'not_started';
    const activeSeconds = sessions?.activeSeconds || 0;
    const idleSeconds = sessions?.idleSeconds || 0;
    const totalDurationSeconds = activeSeconds + idleSeconds;
    const lastAccessed = [safeDate(progress?.lastAccessed), safeDate(sessions?.lastSessionAt), safeDate(quiz?.lastAttemptAt), safeDate(gate?.lastAttemptAt)].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] || null;
    const quizAttempts = quiz?.attempts || 0;
    const gateQuestions = gate?.questions || 0;
    const gateCorrect = gate?.correct || 0;
    const totalQuestions = (quiz?.totalQuestions || 0) + gateQuestions;
    const correctAnswers = (quiz?.correctAnswers || 0) + gateCorrect;

    // Two scored sources, blended by how much work each represents: each
    // standalone quiz attempt contributes its own percentage (a 3-question
    // checkpoint scoring 2/3 = 67% counts once, not three times), and each
    // Stop & Check question counts as one unit at its first-attempt accuracy
    // — the same weighting the roster's blended score already uses. Null
    // only when the student has answered nothing at all in this course.
    const quizAverage = typeof quiz?.averageScore === 'number' ? quiz.averageScore : 0;
    const gateAverage = gateQuestions > 0 ? (gateCorrect / gateQuestions) * 100 : 0;
    const scoredUnits = quizAttempts + gateQuestions;
    const averageScore = scoredUnits > 0
      ? Math.round((quizAverage * quizAttempts + gateAverage * gateQuestions) / scoredUnits)
      : null;

    return {
      id: course._id, title: course.title, level: course.level, category: course.category, courseStatus: course.status, status,
      progressPercent, totalDurationSeconds, activeSeconds, idleSeconds, watchSeconds: sessions?.watchSeconds || 0,
      sessionCount: sessions?.sessions || 0, averageScore, correctAnswers, totalQuestions,
      quizAttempts, gateQuestions, scoredUnits, quizzesPassed: quiz?.passed || 0, lessonsCompleted: progress?.completedLessons || 0,
      totalLessons: Array.isArray(course.syllabus) ? course.syllabus.length : 0, completedItems, totalItems,
      lastAccessed: lastAccessed?.toISOString() || null,
    };
  });

  const totalCorrectAnswers = rows.reduce((sum, row) => sum + row.correctAnswers, 0);
  const totalQuestions = rows.reduce((sum, row) => sum + row.totalQuestions, 0);
  const totalQuizAttempts = rows.reduce((sum, row) => sum + row.quizAttempts, 0);
  const totalGateQuestions = rows.reduce((sum, row) => sum + row.gateQuestions, 0);
  const totalScoredUnits = rows.reduce((sum, row) => sum + row.scoredUnits, 0);
  const weightedScoreSum = rows.reduce((sum, row) => sum + (row.averageScore ?? 0) * row.scoredUnits, 0);
  const averageScore = totalScoredUnits > 0 ? Math.round(weightedScoreSum / totalScoredUnits) : null;
  const activeRows = rows.filter((row) => row.activeSeconds > 0 || row.watchSeconds > 0 || row.sessionCount > 0);
  const totalDurationSeconds = rows.reduce((sum, row) => sum + row.totalDurationSeconds, 0);
  const totalActiveSeconds = rows.reduce((sum, row) => sum + row.activeSeconds, 0);

  return ApiResponse.success(res, {
    totalCourses: rows.length, totalDurationSeconds, totalActiveSeconds, averageScore, correctAnswers: totalCorrectAnswers, totalQuestions, totalQuizAttempts,
    totalGateQuestions, totalScoredUnits,
    completedCourses: rows.filter((row) => row.status === 'completed').length,
    inProgressCourses: rows.filter((row) => row.status === 'in_progress').length,
    notStartedCourses: rows.filter((row) => row.status === 'not_started').length,
    activeCourses: activeRows.length,
    courses: rows.sort((a, b) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (a.status !== 'in_progress' && b.status === 'in_progress') return 1;
      return new Date(b.lastAccessed || 0).getTime() - new Date(a.lastAccessed || 0).getTime();
    }),
  });
};