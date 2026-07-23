/**
 * Learning Activity Controller — Student Activity Tracking & Analytics.
 *
 * Permissions: admin (and org_admin, scoped to their own org) see every
 * student; teacher sees only students enrolled in one of their own courses
 * (mirrors the same scoping already used by student.controller.ts getAll).
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import LearningActivity from '../models/learning-activity.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import Progress from '../models/progress.model';
import QuizAttempt from '../models/quiz-attempt.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter, getOwnTeacherRecord } from '../utils/tenant-scope';
import { logActivityFromRequest } from '../utils/learning-activity-logger';
import { isUserOnline } from '../realtime/socket';

// ---------------------------------------------------------------------------
// Shared scoping — the set of Student _ids the caller is allowed to see.
// Returns undefined for admin/org_admin (no restriction beyond org filter,
// already applied separately); an array of ids for teacher.
// ---------------------------------------------------------------------------
async function visibleStudentIds(req: Request): Promise<mongoose.Types.ObjectId[] | undefined> {
  if (req.user?.role !== 'teacher') return undefined;
  const teacher = await getOwnTeacherRecord(req);
  const courseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
  const students = await Student.find({ enrolledCourses: { $in: courseIds } }).distinct('_id');
  return students;
}

async function assertCanViewStudent(req: Request, studentId: string): Promise<void> {
  if (req.user?.role === 'admin' || req.user?.role === 'org_admin') return;
  const ids = await visibleStudentIds(req);
  if (!ids || !ids.some((id) => id.toString() === studentId)) {
    throw new ForbiddenError('You do not have access to this student.');
  }
}

// ---------------------------------------------------------------------------
// Date range presets
// ---------------------------------------------------------------------------
function resolveDateRange(query: Request['query']): { from?: Date; to?: Date } {
  const preset = query.datePreset as string | undefined;
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (preset === 'today') return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (preset === 'last7') {
    const from = new Date(now); from.setDate(from.getDate() - 6);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  if (preset === 'last30') {
    const from = new Date(now); from.setDate(from.getDate() - 29);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  if (preset === 'thisMonth') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
  }
  const from = query.dateFrom ? new Date(query.dateFrom as string) : undefined;
  const to = query.dateTo ? new Date(query.dateTo as string) : undefined;
  return { from, to: to ? endOfDay(to) : undefined };
}

// ---------------------------------------------------------------------------
// POST /activity/event — generic client-driven event logger. Any
// authenticated student logs their OWN events; the student/school refs are
// resolved server-side from the token, never trusted from the request body.
// ---------------------------------------------------------------------------
export const logEvent = async (req: Request, res: Response): Promise<Response> => {
  const { type, course, lessonId, resourceName, status, durationSeconds, percent, metadata } = req.body;
  if (!type) throw new BadRequestError('Activity type is required.');

  const studentRecord = await Student.findOne({ user: req.user!.userId }).select('_id school').lean();

  await logActivityFromRequest(req, {
    student: studentRecord?._id,
    school: studentRecord?.school as any,
    type,
    course,
    lessonId,
    resourceName,
    status,
    durationSeconds,
    percent,
    metadata,
  });

  return ApiResponse.success(res, null, 'Logged');
};

// ---------------------------------------------------------------------------
// GET /activity/roster — students visible to the caller, with online status
// and a quick activity summary. Supports search + course filter + pagination.
// ---------------------------------------------------------------------------
export const getRoster = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
  const search = (req.query.search as string) || '';
  const courseId = req.query.courseId as string | undefined;

  const filter: Record<string, unknown> = {};
  const ids = await visibleStudentIds(req);
  if (ids) filter._id = { $in: ids };
  if (courseId) filter.enrolledCourses = courseId;

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  const searchFilter = search
    ? {
        $or: [
          { studentId: { $regex: search, $options: 'i' } },
        ],
      }
    : {};

  const [students, total] = await Promise.all([
    Student.find({ ...scopedFilter, ...searchFilter })
      .populate('user', 'email lastSeenAt')
      .populate('profile', 'firstName lastName')
      .populate('school', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Student.countDocuments({ ...scopedFilter, ...searchFilter }),
  ]);

  const studentIds = students.map((s: any) => s._id);
  const [lastActivities, avgScores] = await Promise.all([
    LearningActivity.aggregate([
      { $match: { student: { $in: studentIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$student', lastActivityAt: { $first: '$createdAt' }, lastActivityType: { $first: '$type' } } },
    ]),
    QuizAttempt.aggregate([
      { $match: { student: { $in: studentIds } } },
      { $group: { _id: '$student', avgScore: { $avg: '$percentage' }, attempts: { $sum: 1 } } },
    ]),
  ]);
  const lastActivityMap = new Map(lastActivities.map((a: any) => [a._id.toString(), a]));
  const avgScoreMap = new Map(avgScores.map((a: any) => [a._id.toString(), a]));

  const data = students.map((s: any) => {
    const userId = s.user?._id?.toString();
    const last = lastActivityMap.get(s._id.toString());
    const scoreInfo = avgScoreMap.get(s._id.toString());
    return {
      _id: s._id,
      studentId: s.studentId,
      name: `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim(),
      email: s.user?.email,
      school: s.school?.name,
      online: userId ? isUserOnline(userId) : false,
      lastSeenAt: s.user?.lastSeenAt || null,
      lastActivityAt: last?.lastActivityAt || null,
      lastActivityType: last?.lastActivityType || null,
      avgQuizScore: scoreInfo ? Math.round(scoreInfo.avgScore) : null,
      quizAttempts: scoreInfo?.attempts || 0,
    };
  });

  return ApiResponse.paginated(res, data, { page, limit, total });
};

// ---------------------------------------------------------------------------
// GET /activity/timeline/:studentId — chronological activity log for one
// student, with the full filter set (date range/preset, course, lesson,
// type, status, search).
// ---------------------------------------------------------------------------
export const getTimeline = async (req: Request, res: Response): Promise<Response> => {
  const { studentId } = req.params;
  await assertCanViewStudent(req, studentId);

  const student = await Student.findById(studentId).select('user').lean();
  if (!student) throw new NotFoundError('Student');

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit as string) || 50));
  const { from, to } = resolveDateRange(req.query);

  const filter: Record<string, unknown> = { student: studentId };
  if (from || to) {
    filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  }
  if (req.query.course) filter.course = req.query.course;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.lessonId) filter.lessonId = req.query.lessonId;
  if (req.query.search) {
    (filter as any).$or = [
      { resourceName: { $regex: req.query.search, $options: 'i' } },
      { type: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [events, total] = await Promise.all([
    LearningActivity.find(filter)
      .populate('course', 'title')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LearningActivity.countDocuments(filter),
  ]);

  return ApiResponse.paginated(res, events, { page, limit, total });
};

// ---------------------------------------------------------------------------
// GET /activity/analytics/:studentId — aggregated learning analytics.
// ---------------------------------------------------------------------------
export const getAnalytics = async (req: Request, res: Response): Promise<Response> => {
  const { studentId } = req.params;
  await assertCanViewStudent(req, studentId);

  const student = await Student.findById(studentId).select('user').lean();
  if (!student) throw new NotFoundError('Student');

  const sid = new mongoose.Types.ObjectId(studentId);

  const [durationAgg, dailyAgg, progressDocs, quizAgg, lastEvent, videoAgg] = await Promise.all([
    LearningActivity.aggregate([
      { $match: { student: sid, durationSeconds: { $gt: 0 } } },
      { $group: { _id: null, totalSeconds: { $sum: '$durationSeconds' } } },
    ]),
    LearningActivity.aggregate([
      { $match: { student: sid, durationSeconds: { $gt: 0 }, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, seconds: { $sum: '$durationSeconds' } } },
      { $sort: { _id: 1 } },
    ]),
    Progress.find({ student: studentId }).populate('course', 'title').lean(),
    QuizAttempt.aggregate([
      { $match: { student: sid } },
      { $group: { _id: null, avgScore: { $avg: '$percentage' }, attempts: { $sum: 1 }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
    ]),
    LearningActivity.findOne({ student: sid }).sort({ createdAt: -1 }).lean(),
    LearningActivity.aggregate([
      { $match: { student: sid, type: 'video_progress' } },
      { $group: { _id: null, avgPercent: { $avg: '$percent' } } },
    ]),
  ]);

  // Learning streak — consecutive days (ending today or yesterday) with at least one activity.
  const activeDays = await LearningActivity.aggregate([
    { $match: { student: sid } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
    { $sort: { _id: -1 } },
    { $limit: 400 },
  ]);
  const dateSet = new Set(activeDays.map((d: any) => d._id));
  let streak = 0;
  const cursor = new Date();
  // Allow the streak to still count if today has no activity yet but yesterday does.
  if (!dateSet.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const userIdStr = student.user?.toString();

  return ApiResponse.success(res, {
    totalStudyTimeSeconds: durationAgg[0]?.totalSeconds || 0,
    dailyStudyTime: dailyAgg.map((d: any) => ({ date: d._id, seconds: d.seconds })),
    courseProgress: progressDocs.map((p: any) => ({
      course: p.course?.title?.en || 'Unknown',
      status: p.status,
      completedLessons: p.completedLessons,
      totalItems: p.totalItems,
      lastAccessed: p.lastAccessed,
    })),
    avgQuizScore: quizAgg[0] ? Math.round(quizAgg[0].avgScore) : null,
    quizAttempts: quizAgg[0]?.attempts || 0,
    quizzesPassed: quizAgg[0]?.passed || 0,
    avgVideoCompletion: videoAgg[0]?.avgPercent ? Math.round(videoAgg[0].avgPercent) : null,
    learningStreakDays: streak,
    lastActivity: lastEvent ? { type: lastEvent.type, at: lastEvent.createdAt, resourceName: lastEvent.resourceName } : null,
    online: userIdStr ? isUserOnline(userIdStr) : false,
  });
};

// ---------------------------------------------------------------------------
// GET /activity/export/:studentId — CSV/XLSX export of the timeline
// (same filters as getTimeline, minus pagination).
// ---------------------------------------------------------------------------
export const exportTimeline = async (req: Request, res: Response): Promise<void> => {
  const { studentId } = req.params;
  await assertCanViewStudent(req, studentId);

  const student = await Student.findById(studentId)
    .populate('profile', 'firstName lastName')
    .select('profile studentId')
    .lean();
  if (!student) throw new NotFoundError('Student');

  const { from, to } = resolveDateRange(req.query);
  const filter: Record<string, unknown> = { student: studentId };
  if (from || to) {
    filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  }
  if (req.query.course) filter.course = req.query.course;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;

  const events = await LearningActivity.find(filter).populate('course', 'title').sort({ createdAt: -1 }).lean();

  const format = (req.query.format as string) === 'csv' ? 'csv' : 'xlsx';
  const headers = ['Date', 'Activity Type', 'Resource', 'Course', 'Status', 'Start', 'End', 'Duration (s)', 'Percent', 'Device', 'Browser', 'OS', 'IP'];
  const rows = events.map((e: any) => {
    const end = new Date(e.createdAt);
    const start = e.durationSeconds ? new Date(end.getTime() - e.durationSeconds * 1000) : end;
    return [
      end.toLocaleDateString(),
      e.type,
      e.resourceName || '',
      e.course?.title?.en || '',
      e.status || '',
      start.toLocaleTimeString(),
      end.toLocaleTimeString(),
      e.durationSeconds ?? '',
      e.percent ?? '',
      e.device || '',
      e.browser || '',
      e.os || '',
      e.ip || '',
    ];
  });

  const studentName = `${(student as any).profile?.firstName || ''}-${(student as any).profile?.lastName || ''}`.replace(/\s+/g, '');

  if (format === 'csv') {
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=activity-${studentName}.csv`);
    res.end('﻿' + csv);
    return;
  }

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Activity Log');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=activity-${studentName}.xlsx`);
  res.end(buffer);
};
