import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Student from '../models/student.model';
import Course from '../models/course.model';
import Progress from '../models/progress.model';
import QuizAttempt from '../models/quiz-attempt.model';
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

  const student = await Student.findById(studentId).select('enrolledCourses').lean();
  if (!student) throw new NotFoundError('Student');

  const courseIds = (student.enrolledCourses || []).map((id) => new mongoose.Types.ObjectId(id));
  if (!courseIds.length) {
    return ApiResponse.success(res, { totalCourses: 0, totalDurationSeconds: 0, totalActiveSeconds: 0, averageScore: 0, correctAnswers: 0, totalQuestions: 0, completedCourses: 0, inProgressCourses: 0, notStartedCourses: 0, courses: [] });
  }

  const [courses, progressDocs, quizRows, sessionRows] = await Promise.all([
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
    LearningSession.aggregate([
      { $match: { student: new mongoose.Types.ObjectId(studentId), course: { $in: courseIds } } },
      { $group: { _id: '$course', activeSeconds: { $sum: '$activeSeconds' }, idleSeconds: { $sum: '$idleSeconds' }, watchSeconds: { $sum: '$watchSeconds' }, sessions: { $sum: 1 }, lastSessionAt: { $max: '$startedAt' } } },
    ]),
  ]);

  const progressByCourse = new Map(progressDocs.map((p: any) => [p.course.toString(), p]));
  const quizByCourse = new Map(quizRows.map((q: any) => [q._id.toString(), q]));
  const sessionsByCourse = new Map(sessionRows.map((s: any) => [s._id.toString(), s]));

  const rows = courses.map((course: any) => {
    const id = course._id.toString();
    const progress = progressByCourse.get(id);
    const quiz = quizByCourse.get(id);
    const sessions = sessionsByCourse.get(id);
    const completedItems = (progress?.completedLessons || 0) + (progress?.completedQuizzes || 0) + (progress?.completedAssignments || 0);
    const totalItems = progress?.totalItems || 0;
    const progressPercent = totalItems > 0 ? Math.min(100, Math.round((completedItems / totalItems) * 100)) : progress?.status === 'completed' ? 100 : 0;
    const completed = progress?.status === 'completed' || progressPercent >= 100;
    const hasActivity = Boolean(progress || sessions || quiz);
    const status = completed ? 'completed' : hasActivity ? 'in_progress' : 'not_started';
    const activeSeconds = sessions?.activeSeconds || 0;
    const idleSeconds = sessions?.idleSeconds || 0;
    const totalDurationSeconds = activeSeconds + idleSeconds;
    const lastAccessed = [safeDate(progress?.lastAccessed), safeDate(sessions?.lastSessionAt), safeDate(quiz?.lastAttemptAt)].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] || null;
    const totalQuestions = quiz?.totalQuestions || 0;
    const correctAnswers = quiz?.correctAnswers || 0;
    const averageScore = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

    return {
      id: course._id, title: course.title, level: course.level, category: course.category, courseStatus: course.status, status,
      progressPercent, totalDurationSeconds, activeSeconds, idleSeconds, watchSeconds: sessions?.watchSeconds || 0,
      sessionCount: sessions?.sessions || 0, averageScore, correctAnswers, totalQuestions,
      quizAttempts: quiz?.attempts || 0, quizzesPassed: quiz?.passed || 0, lessonsCompleted: progress?.completedLessons || 0,
      totalLessons: Array.isArray(course.syllabus) ? course.syllabus.length : 0, completedItems, totalItems,
      lastAccessed: lastAccessed?.toISOString() || null,
    };
  });

  const totalCorrectAnswers = rows.reduce((sum, row) => sum + row.correctAnswers, 0);
  const totalQuestions = rows.reduce((sum, row) => sum + row.totalQuestions, 0);
  const averageScore = totalQuestions > 0 ? Math.round((totalCorrectAnswers / totalQuestions) * 100) : 0;
  const activeRows = rows.filter((row) => row.activeSeconds > 0 || row.watchSeconds > 0 || row.sessionCount > 0);
  const totalDurationSeconds = rows.reduce((sum, row) => sum + row.totalDurationSeconds, 0);
  const totalActiveSeconds = rows.reduce((sum, row) => sum + row.activeSeconds, 0);

  return ApiResponse.success(res, {
    totalCourses: rows.length, totalDurationSeconds, totalActiveSeconds, averageScore, correctAnswers: totalCorrectAnswers, totalQuestions,
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