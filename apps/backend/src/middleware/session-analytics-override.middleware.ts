import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import LearningSession from '../models/learning-session.model';
import LearningActivity from '../models/learning-activity.model';

function safeTimezone(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return 'UTC';
  }
}

/** Backward-compatible bridge from legacy activity durations to authoritative sessions. */
export async function sessionAnalyticsOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sid = new mongoose.Types.ObjectId(req.params.studentId);
    const timezone = safeTimezone(req.headers['x-timezone']);
    const from = new Date(Date.now() - 30 * 86400000);

    const [summary, sessionDaily, legacyDaily, legacyAllDaily] = await Promise.all([
      LearningSession.aggregate([
        { $match: { student: sid } },
        { $group: { _id: null, activeSeconds: { $sum: '$activeSeconds' }, idleSeconds: { $sum: '$idleSeconds' }, watchSeconds: { $sum: '$watchSeconds' }, sessions: { $sum: 1 } } },
      ]),
      LearningSession.aggregate([
        { $match: { student: sid, startedAt: { $gte: from } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone } }, activeSeconds: { $sum: '$activeSeconds' }, watchSeconds: { $sum: '$watchSeconds' } } },
        { $sort: { _id: 1 } },
      ]),
      LearningActivity.aggregate([
        { $match: { student: sid, durationSeconds: { $gt: 0 }, createdAt: { $gte: from } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } }, seconds: { $sum: '$durationSeconds' } } },
      ]),
      LearningActivity.aggregate([
        { $match: { student: sid, durationSeconds: { $gt: 0 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } }, seconds: { $sum: '$durationSeconds' } } },
      ]),
    ]);

    const sessionByDay = new Map(sessionDaily.map((d: any) => [d._id, d]));
    const legacyByDay = new Map(legacyDaily.map((d: any) => [d._id, d.seconds]));
    const mergedDaily = new Map<string, { seconds: number; watchSeconds: number }>();

    for (const d of sessionDaily) {
      const legacySeconds = legacyByDay.get(d._id) || 0;
      // Sessions are authoritative when they contain tracked time. If a day
      // still has legacy duration but no session time, preserve that historical
      // duration instead of turning a real activity day into "Time not recorded".
      mergedDaily.set(d._id, {
        seconds: d.activeSeconds > 0 ? d.activeSeconds : legacySeconds,
        watchSeconds: d.watchSeconds || 0,
      });
    }
    for (const d of legacyDaily) {
      if (!sessionByDay.has(d._id)) mergedDaily.set(d._id, { seconds: d.seconds, watchSeconds: 0 });
    }

    const legacyAllByDay = new Map(legacyAllDaily.map((d: any) => [d._id, d.seconds]));
    const sessionAllDays = await LearningSession.aggregate([
      { $match: { student: sid } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone } }, activeSeconds: { $sum: '$activeSeconds' } } },
    ]);
    let fallbackTotal = 0;
    for (const d of sessionAllDays) {
      if ((d.activeSeconds || 0) === 0) fallbackTotal += legacyAllByDay.get(d._id) || 0;
      legacyAllByDay.delete(d._id);
    }
    fallbackTotal += [...legacyAllByDay.values()].reduce((sum, seconds) => sum + seconds, 0);

    const sessionCount = summary[0]?.sessions || 0;
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      if (body?.data && sessionCount > 0) {
        const s = summary[0];
        body.data.totalStudyTimeSeconds = s.activeSeconds + fallbackTotal;
        body.data.dailyStudyTime = [...mergedDaily.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ date, seconds: value.seconds }));
        body.data.activeStudyTimeSeconds = s.activeSeconds + fallbackTotal;
        body.data.idleTimeSeconds = s.idleSeconds;
        body.data.videoWatchTimeSeconds = s.watchSeconds;
        body.data.learningSessionCount = sessionCount;
        body.data.durationSource = 'learning_sessions_with_legacy_fallback';
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
