/**
 * Learning Activity Logger — single entry point every controller uses to
 * record a LearningActivity event. Never throws: a failed activity write
 * must never break the actual student-facing action attached to it.
 */

import { Request } from 'express';
import mongoose from 'mongoose';
import LearningActivity, { LearningActivityType } from '../models/learning-activity.model';
import Course from '../models/course.model';
import { parseUserAgent } from './parse-user-agent';
import { emitToStudentWatchers, hasActivityWatchers } from '../realtime/socket';

export interface LogActivityInput {
  userId: string | mongoose.Types.ObjectId;
  type: LearningActivityType;
  student?: string | mongoose.Types.ObjectId;
  school?: string | mongoose.Types.ObjectId;
  loginSessionId?: string;
  course?: string | mongoose.Types.ObjectId;
  lessonId?: string;
  lessonTitle?: string;
  resourceName?: string;
  status?: string;
  startedAt?: Date | string;
  endedAt?: Date | string;
  durationSeconds?: number;
  percent?: number;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Settles one event's exact span. Callers supply whatever they actually know —
 * a real start and end, only a duration, or neither — and every reader
 * downstream gets the same answer instead of each one guessing differently.
 *
 * A client-reported span is only trusted when it is self-consistent and not in
 * the future: a wrong device clock would otherwise write a lesson that ended
 * before it started, or one "finished" next week.
 */
export function resolveActivitySpan(
  input: { startedAt?: Date | string; endedAt?: Date | string; durationSeconds?: number },
  now: Date = new Date(),
): { startedAt?: Date; endedAt?: Date; durationSeconds?: number } {
  const duration = Number.isFinite(input.durationSeconds as number) && (input.durationSeconds as number) >= 0
    ? Math.floor(input.durationSeconds as number)
    : undefined;
  let startedAt = toDate(input.startedAt);
  let endedAt = toDate(input.endedAt);

  if (startedAt && startedAt.getTime() > now.getTime()) startedAt = undefined;
  if (endedAt && endedAt.getTime() > now.getTime()) endedAt = now;
  if (startedAt && endedAt && endedAt.getTime() < startedAt.getTime()) endedAt = undefined;

  if (startedAt && endedAt) {
    return { startedAt, endedAt, durationSeconds: Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000) };
  }
  if (startedAt && duration !== undefined) {
    return { startedAt, endedAt: new Date(startedAt.getTime() + duration * 1000), durationSeconds: duration };
  }
  if (endedAt && duration !== undefined) {
    return { startedAt: new Date(endedAt.getTime() - duration * 1000), endedAt, durationSeconds: duration };
  }
  // Only a duration: the event reaches the server as the activity ends, so
  // "now" is its end and the start is that far back.
  if (duration !== undefined) {
    return { startedAt: new Date(now.getTime() - duration * 1000), endedAt: now, durationSeconds: duration };
  }
  // An instant (a click, a login): a real point in time, with no span.
  const at = startedAt || endedAt || now;
  return { startedAt: at, endedAt: at, durationSeconds: undefined };
}

export async function logLearningActivity(input: LogActivityInput): Promise<void> {
  try {
    const { device, browser, os } = parseUserAgent(input.userAgent || '');
    const span = resolveActivitySpan(input);
    const created = await LearningActivity.create({
      user: input.userId,
      student: input.student,
      school: input.school,
      loginSessionId: input.loginSessionId,
      type: input.type,
      course: input.course,
      lessonId: input.lessonId,
      lessonTitle: input.lessonTitle,
      resourceName: input.resourceName,
      status: input.status,
      startedAt: span.startedAt,
      endedAt: span.endedAt,
      durationSeconds: span.durationSeconds,
      percent: input.percent,
      metadata: input.metadata,
      ip: input.ip,
      userAgent: input.userAgent,
      device,
      browser,
      os,
    });

    // Push it straight to any admin/teacher with this student's Activity
    // Events view open, so the feed moves as the student works instead of
    // only on a manual reload. Gated on there actually being a watcher: the
    // course lookup below is pure display data and would otherwise run on
    // every logged event for nobody's benefit.
    const studentId = input.student ? String(input.student) : '';
    if (studentId && hasActivityWatchers(studentId)) {
      const course = input.course
        ? await Course.findById(input.course).select('title').lean().catch(() => null)
        : null;
      emitToStudentWatchers(studentId, 'activity:event', {
        _id: String(created._id),
        type: created.type,
        loginSessionId: created.loginSessionId,
        course: course ? { _id: String((course as any)._id), title: (course as any).title } : null,
        lessonId: created.lessonId,
        lessonTitle: created.lessonTitle,
        resourceName: created.resourceName,
        status: created.status,
        percent: created.percent,
        startedAt: created.startedAt,
        endedAt: created.endedAt,
        durationSeconds: created.durationSeconds,
        metadata: created.metadata,
        createdAt: created.createdAt,
      });
    }
  } catch {
    // Logging must never break the action it's attached to.
  }
}

/** Convenience wrapper — pulls ip/userAgent/userId/login-session-id off an authenticated request. */
export async function logActivityFromRequest(
  req: Request,
  fields: Omit<LogActivityInput, 'userId' | 'ip' | 'userAgent'>
): Promise<void> {
  if (!req.user?.userId) return;
  const headerValue = req.headers['x-login-session-id'];
  const loginSessionId = fields.loginSessionId || (typeof headerValue === 'string' ? headerValue : undefined);
  await logLearningActivity({
    ...fields,
    loginSessionId,
    userId: req.user.userId,
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
  });
}
