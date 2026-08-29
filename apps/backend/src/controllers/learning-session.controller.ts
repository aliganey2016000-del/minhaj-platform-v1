import { Request, Response } from 'express';
import LearningSession, { LearningSessionKind } from '../models/learning-session.model';
import Student from '../models/student.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { parseUserAgent } from '../utils/parse-user-agent';

const MAX_HEARTBEAT_SECONDS = 60;
const IDLE_THRESHOLD_SECONDS = 90;

async function ownStudent(req: Request) {
  const student = await Student.findOne({ user: req.user!.userId }).select('_id school').lean();
  if (!student) throw new ForbiddenError('Only students can start learning sessions.');
  return student;
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

  const existing = await LearningSession.findOne({ clientSessionId, user: req.user!.userId });
  if (existing) return ApiResponse.success(res, existing, 'Session already exists');

  const now = new Date();
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
  const { clientSessionId, active, mediaPositionSeconds, playbackDeltaSeconds } = req.body;
  if (!clientSessionId) throw new BadRequestError('clientSessionId is required.');

  const session = await LearningSession.findOne({ clientSessionId, user: req.user!.userId });
  if (!session) throw new NotFoundError('Learning session');
  if (session.status !== 'active') return ApiResponse.success(res, session, 'Session is no longer active');

  const now = new Date();
  const elapsed = Math.max(0, Math.floor((now.getTime() - session.lastHeartbeatAt.getTime()) / 1000));
  const bounded = Math.min(elapsed, MAX_HEARTBEAT_SECONDS);

  if (elapsed > IDLE_THRESHOLD_SECONDS) {
    session.idleSeconds += elapsed;
  } else if (active !== false) {
    session.activeSeconds += bounded;
    if (session.kind === 'video' || session.kind === 'audio') {
      const playbackDelta = positiveInt(playbackDeltaSeconds);
      session.watchSeconds += Math.min(playbackDelta ?? bounded, MAX_HEARTBEAT_SECONDS);
    }
  } else {
    session.idleSeconds += bounded;
  }

  const mediaPosition = positiveInt(mediaPositionSeconds);
  if (mediaPosition != null) session.lastMediaPositionSeconds = mediaPosition;
  session.lastHeartbeatAt = now;
  await session.save();
  return ApiResponse.success(res, session, 'Heartbeat recorded');
};

export const endSession = async (req: Request, res: Response): Promise<Response> => {
  const { clientSessionId, active } = req.body;
  if (!clientSessionId) throw new BadRequestError('clientSessionId is required.');

  const session = await LearningSession.findOne({ clientSessionId, user: req.user!.userId });
  if (!session) throw new NotFoundError('Learning session');
  if (session.status !== 'active') return ApiResponse.success(res, session, 'Session already ended');

  const now = new Date();
  const elapsed = Math.max(0, Math.floor((now.getTime() - session.lastHeartbeatAt.getTime()) / 1000));
  const bounded = Math.min(elapsed, MAX_HEARTBEAT_SECONDS);
  if (elapsed > IDLE_THRESHOLD_SECONDS || active === false) session.idleSeconds += bounded;
  else session.activeSeconds += bounded;

  session.endedAt = now;
  session.lastHeartbeatAt = now;
  session.status = 'ended';
  await session.save();
  return ApiResponse.success(res, session, 'Session ended');
};

export const expireStaleSessions = async (): Promise<void> => {
  const cutoff = new Date(Date.now() - IDLE_THRESHOLD_SECONDS * 1000);
  const stale = await LearningSession.find({ status: 'active', lastHeartbeatAt: { $lt: cutoff } }).select('_id lastHeartbeatAt');
  if (!stale.length) return;
  await LearningSession.updateMany(
    { _id: { $in: stale.map((s) => s._id) } },
    { $set: { status: 'expired', endedAt: new Date() } },
  );
};
