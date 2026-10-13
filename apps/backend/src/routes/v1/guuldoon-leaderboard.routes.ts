import { Router } from 'express';
import Pref from '../../models/guuldoon-leaderboard-pref.model';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError, ForbiddenError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';
import {
  DAILY_POINT_CAP, LEADERBOARD_PERIODS, LeaderboardPeriod, POINTS_PER_QUESTION, STREAK_BONUS_MAX_DAYS, STREAK_BONUS_PER_DAY,
  buildSchoolBoard, buildStudentBoard, clearLeaderboardCache,
} from '../../services/guuldoon-leaderboard.service';

const router = Router();
router.use(authMiddleware);
router.use((req, _res, next) => {
  if (!['admin', 'org_admin', 'teacher', 'student'].includes(req.user?.role || '') || req.user?.isStaff) {
    return next(new ForbiddenError('Guulgaar leaderboard access denied'));
  }
  next();
});

function parseQuery(query: Record<string, unknown>) {
  const grade = Number(query.grade ?? 12);
  if (grade !== 8 && grade !== 12) throw new BadRequestError('grade must be 8 or 12');
  const period = String(query.period ?? 'week') as LeaderboardPeriod;
  if (!LEADERBOARD_PERIODS.includes(period)) throw new BadRequestError('period must be week, month or all');
  return { grade, period };
}

const scoring = { perQuestion: POINTS_PER_QUESTION, streakPerDay: STREAK_BONUS_PER_DAY, streakMaxDays: STREAK_BONUS_MAX_DAYS, dailyCap: DAILY_POINT_CAP };

/** National student ranking. Names are shown only for students who opted in. */
router.get('/students', asyncHandler(async (req, res) => {
  const { grade, period } = parseQuery(req.query);
  const viewer = req.user?.role === 'student' ? String(req.user.userId) : null;
  const board = await buildStudentBoard(grade, period, viewer);
  return ApiResponse.success(res, { grade, period, scoring, ...board });
}));

/** School ranking by average points per subscribed student. */
router.get('/schools', asyncHandler(async (req, res) => {
  const { grade, period } = parseQuery(req.query);
  const board = await buildSchoolBoard(grade, period);
  return ApiResponse.success(res, { grade, period, scoring, ...board });
}));

/** A student chooses whether their name and school are visible on the leaderboard. */
router.patch('/me/visibility', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student') throw new ForbiddenError('Only students can change leaderboard visibility');
  if (typeof req.body?.showName !== 'boolean') throw new BadRequestError('showName must be true or false');
  await Pref.updateOne({ user: req.user.userId }, { $set: { showName: req.body.showName } }, { upsert: true });
  clearLeaderboardCache();
  return ApiResponse.success(res, { showName: req.body.showName });
}));

export default router;
