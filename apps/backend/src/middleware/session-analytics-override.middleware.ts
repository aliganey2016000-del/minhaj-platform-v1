import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import LearningSession from '../models/learning-session.model';

/** Backward-compatible bridge from legacy activity durations to authoritative sessions. */
export async function sessionAnalyticsOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sid = new mongoose.Types.ObjectId(req.params.studentId);
    const [summary, daily] = await Promise.all([
      LearningSession.aggregate([
        { $match: { student: sid } },
        { $group: { _id: null, activeSeconds: { $sum: '$activeSeconds' }, idleSeconds: { $sum: '$idleSeconds' }, watchSeconds: { $sum: '$watchSeconds' }, sessions: { $sum: 1 } } },
      ]),
      LearningSession.aggregate([
        { $match: { student: sid, startedAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } }, activeSeconds: { $sum: '$activeSeconds' }, watchSeconds: { $sum: '$watchSeconds' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const sessionCount = summary[0]?.sessions || 0;
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      if (body?.data && sessionCount > 0) {
        const s = summary[0];
        body.data.totalStudyTimeSeconds = s.activeSeconds;
        body.data.dailyStudyTime = daily.map((d: any) => ({ date: d._id, seconds: d.activeSeconds }));
        body.data.activeStudyTimeSeconds = s.activeSeconds;
        body.data.idleTimeSeconds = s.idleSeconds;
        body.data.videoWatchTimeSeconds = s.watchSeconds;
        body.data.learningSessionCount = sessionCount;
        body.data.durationSource = 'learning_sessions';
      } else if (body?.data) {
        body.data.durationSource = 'legacy_activity_events';
      }
      return originalJson(body);
    }) as Response['json'];
    next();
  } catch {
    next();
  }
}
