import { Request, Response } from 'express';
import mongoose from 'mongoose';
import LearningSession, { LearningSessionKind } from '../models/learning-session.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { parseUserAgent } from '../utils/parse-user-agent';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

const MAX_HEARTBEAT_SECONDS = 60;
const IDLE_THRESHOLD_SECONDS = 90;

async function ownStudent(req: Request) {
  const student = await Student.findOne({ user: req.user!.userId }).select('_id school enrolledCourses').lean();
  if (!student) throw new ForbiddenError('Only students can start learning sessions.');
  return student;
}

async function canViewStudent(req: Request, studentId: string): Promise<void> {
  if (req.user?.role === 'admin' || req.user?.role === 'org_admin') return;
  if (req.user?.role !== 'teacher') throw new ForbiddenError('You do not have access to this student.');
  const teacher = await getOwnTeacherRecord(req);
  const courseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
  const student = await Student.findOne({ _id: studentId, enrolledCourses: { $in: courseIds } }).select('_id').lean();
  if (!student) throw new ForbiddenError('You do not have access to this student.');
}

function positiveInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export const startSession = async (req: Request, res: Response): Promise<Response> => {
  const student = await ownStudent(req);
  const { clientSessionId, kind, course, lessonId, lessonTitle, resourceName, metadata } = req.body;
  if (!clientSessionId || typeof clientSessionId !== 'string') throw new BadRequestError('clientSessionId is required.');
  if (!['lesson', 'video', 'audio', 'pdf', 'course', 'general'].includes(kind)) throw new BadRequestError('Invalid session kind.');
  if (course && !(student.enrolledCourses || []).some((id: any) => id.toString() === String(course))) {
    throw new ForbiddenError('You are not enrolled in this course.');
  }
  const existing = await LearningSession.findOne({ clientSessionId, user: req.user!.userId });
  if (existing) return ApiResponse.success(res, existing, 'Session already exists');

  const now = new Date();
  await LearningSession.updateMany(
    { user: req.user!.userId, status: 'active', clientSessionId: { $ne: clientSessionId } },
    { $set: { status: 'expired', endedAt: now } },
  );

  const { device } = parseUserAgent(req.headers['user-agent'] || '');
  const session = await LearningSession.create({
    clientSessionId,
    user: req.user!.userId,
    student: student._id,
    school: student.school,
    kind: kind as LearningSessionKind,
    course,
    lessonId,
    lessonTitle,
    resourceName,
    startedAt: now,
    lastHeartbeatAt: now,
    status: 'active',
    device,
    userAgent: req.headers['user-agent'] || '',
    metadata,
  });
  return ApiResponse.success(res, session, 'Session started');
};

export const heartbeat = async (req: Request, res: Response): Promise<Response> => {
  const { clientSessionId, active, mediaPlaying, mediaPositionSeconds, playbackDeltaSeconds } = req.body;
  if (!clientSessionId) throw new BadRequestError('clientSessionId is required.');
  const session = await LearningSession.findOne({ clientSessionId, user: req.user!.userId });
  if (!session) throw new NotFoundError('Learning session');
  if (session.status !== 'active') return ApiResponse.success(res, session, 'Session is no longer active');

  const now = new Date();
  const elapsed = Math.max(0, Math.floor((now.getTime() - session.lastHeartbeatAt.getTime()) / 1000));
  const bounded = Math.min(elapsed, MAX_HEARTBEAT_SECONDS);

  if (elapsed > IDLE_THRESHOLD_SECONDS) session.idleSeconds += elapsed;
  else if (active !== false) {
    session.activeSeconds += bounded;
    if (mediaPlaying === true || session.kind === 'video' || session.kind === 'audio') {
      const playbackDelta = positiveInt(playbackDeltaSeconds);
      session.watchSeconds += Math.min(playbackDelta ?? bounded, MAX_HEARTBEAT_SECONDS);
    }
  } else session.idleSeconds += bounded;

  const mediaPosition = positiveInt(mediaPositionSeconds);
  if (mediaPosition != null) session.lastMediaPositionSeconds = mediaPosition;
  session.lastHeartbeatAt = now;
  await session.save();
  return ApiResponse.success(res, session, 'Heartbeat recorded');
};

export const endSession = async (req: Request, res: Response): Promise<Response> => {
  const { clientSessionId, active, mediaPlaying, playbackDeltaSeconds } = req.body;
  if (!clientSessionId) throw new BadRequestError('clientSessionId is required.');
  const session = await LearningSession.findOne({ clientSessionId, user: req.user!.userId });
  if (!session) throw new NotFoundError('Learning session');
  if (session.status !== 'active') return ApiResponse.success(res, session, 'Session already ended');

  const now = new Date();
  const elapsed = Math.max(0, Math.floor((now.getTime() - session.lastHeartbeatAt.getTime()) / 1000));
  const bounded = Math.min(elapsed, MAX_HEARTBEAT_SECONDS);
  if (elapsed > IDLE_THRESHOLD_SECONDS || active === false) session.idleSeconds += bounded;
  else {
    session.activeSeconds += bounded;
    if (mediaPlaying === true || session.kind === 'video' || session.kind === 'audio') {
      const playbackDelta = positiveInt(playbackDeltaSeconds);
      session.watchSeconds += Math.min(playbackDelta ?? bounded, MAX_HEARTBEAT_SECONDS);
    }
  }
  session.endedAt = now;
  session.lastHeartbeatAt = now;
  session.status = 'ended';
  await session.save();
  return ApiResponse.success(res, session, 'Session ended');
};

export const getStudentAnalytics = async (req: Request, res: Response): Promise<Response> => {
  const { studentId } = req.params;
  await canViewStudent(req, studentId);
  const student = await Student.findById(studentId).select('_id').lean();
  if (!student) throw new NotFoundError('Student');
  const sid = new mongoose.Types.ObjectId(studentId);
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const match: Record<string, unknown> = { student: sid };
  if (from || to) match.startedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

  const [summary, byKind, daily, sessions] = await Promise.all([
    LearningSession.aggregate([
      { $match: match },
      { $group: { _id: null, activeSeconds: { $sum: '$activeSeconds' }, idleSeconds: { $sum: '$idleSeconds' }, watchSeconds: { $sum: '$watchSeconds' }, sessions: { $sum: 1 } } },
    ]),
    LearningSession.aggregate([
      { $match: match },
      { $group: { _id: '$kind', activeSeconds: { $sum: '$activeSeconds' }, watchSeconds: { $sum: '$watchSeconds' }, sessions: { $sum: 1 } } },
      { $sort: { activeSeconds: -1 } },
    ]),
    LearningSession.aggregate([
      { $match: { ...match, startedAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } }, activeSeconds: { $sum: '$activeSeconds' }, watchSeconds: { $sum: '$watchSeconds' } } },
      { $sort: { _id: 1 } },
    ]),
    LearningSession.find(match).sort({ startedAt: -1 }).limit(100).lean(),
  ]);

  return ApiResponse.success(res, {
    totalActiveSeconds: summary[0]?.activeSeconds || 0,
    totalIdleSeconds: summary[0]?.idleSeconds || 0,
    totalWatchSeconds: summary[0]?.watchSeconds || 0,
    sessionCount: summary[0]?.sessions || 0,
    byKind: byKind.map((x: any) => ({ kind: x._id, activeSeconds: x.activeSeconds, watchSeconds: x.watchSeconds, sessions: x.sessions })),
    daily: daily.map((x: any) => ({ date: x._id, activeSeconds: x.activeSeconds, watchSeconds: x.watchSeconds })),
    sessions: sessions.map((s: any) => ({ _id: s._id, kind: s.kind, course: s.course, lessonId: s.lessonId, lessonTitle: s.lessonTitle, resourceName: s.resourceName, startedAt: s.startedAt, endedAt: s.endedAt, activeSeconds: s.activeSeconds, idleSeconds: s.idleSeconds, watchSeconds: s.watchSeconds, status: s.status })),
  });
};

export const expireStaleSessions = async (): Promise<void> => {
  const cutoff = new Date(Date.now() - IDLE_THRESHOLD_SECONDS * 1000);
  const stale = await LearningSession.find({ status: 'active', lastHeartbeatAt: { $lt: cutoff } }).select('_id');
  if (!stale.length) return;
  await LearningSession.updateMany({ _id: { $in: stale.map((s) => s._id) } }, { $set: { status: 'expired', endedAt: new Date() } });
};
