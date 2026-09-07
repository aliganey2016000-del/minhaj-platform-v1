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
  durationSeconds?: number;
  percent?: number;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function logLearningActivity(input: LogActivityInput): Promise<void> {
  try {
    const { device, browser, os } = parseUserAgent(input.userAgent || '');
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
      durationSeconds: input.durationSeconds,
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
