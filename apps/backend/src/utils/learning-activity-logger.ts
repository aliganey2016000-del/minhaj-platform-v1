/**
 * Learning Activity Logger — single entry point every controller uses to
 * record a LearningActivity event. Never throws: a failed activity write
 * must never break the actual student-facing action (login, lesson view,
 * quiz submit, ...) it's attached to.
 */

import { Request } from 'express';
import mongoose from 'mongoose';
import LearningActivity, { LearningActivityType } from '../models/learning-activity.model';
import { parseUserAgent } from './parse-user-agent';

export interface LogActivityInput {
  userId: string | mongoose.Types.ObjectId;
  type: LearningActivityType;
  student?: string | mongoose.Types.ObjectId;
  school?: string | mongoose.Types.ObjectId;
  course?: string | mongoose.Types.ObjectId;
  lessonId?: string;
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
    const { device, browser, os } = parseUserAgent(input.userAgent);
    await LearningActivity.create({
      user: input.userId,
      student: input.student,
      school: input.school,
      type: input.type,
      course: input.course,
      lessonId: input.lessonId,
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
  } catch {
    // Logging must never break the action it's attached to.
  }
}

/** Convenience wrapper — pulls ip/userAgent/userId off an authenticated Express request. */
export async function logActivityFromRequest(
  req: Request,
  fields: Omit<LogActivityInput, 'userId' | 'ip' | 'userAgent'>
): Promise<void> {
  if (!req.user?.userId) return;
  await logLearningActivity({
    ...fields,
    userId: req.user.userId,
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
  });
}
