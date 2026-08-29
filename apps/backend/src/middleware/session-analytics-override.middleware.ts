import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import LearningSession from '../models/learning-session.model';

/**
 * Backward-compatible bridge: the existing Student Activity UI already calls
 * /analytics/:studentId. Until that page is fully migrated to session data,
 * replace only its time metrics with server-authoritative session metrics.
 */
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

    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      if (body?.data) {
        const s = summary[0] || { activeSeconds: 0, idleSeconds: 0, watchSeconds: 0, sessions: 0 };
        body.data.totalStudyTimeSeconds = s.activeSeconds;
        body.data.dailyStudyTime = daily.map((d: any) => ({ date: d._id, seconds: d.activeSeconds }));
        body.data.activeStudyTimeSeconds = s.activeSeconds;
        body.data.idleTimeSeconds = s.idleSeconds;
        body.data.videoWatchTimeSeconds = s.watchSeconds;
        body.data.learningSessionCount = s.sessions;
        body.data.durationSource = s.sessions > 0 ? 'learning_sessions' : 'legacy_activity_events';
      }
      return originalJson(body);
    }) as Response['json'];
    next();
  } catch {
    // Analytics must remain available even if the optional session bridge fails.
    next();
  }
}
