/**
 * Gamification Controller
 *
 * Manages XP, levels, streaks, badges, and leaderboard.
 * Each student has exactly one Gamification document (created lazily on first access).
 */

import { Request, Response } from 'express';
import Gamification, { ALL_BADGES, xpForLevel, totalXpForLevel } from '../models/gamification.model';
import ApiResponse from '../utils/api-response';
import { NotFoundError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { notifyUser } from '../utils/notify';

/** Fires level-up / new-badge notifications — best-effort, never blocks the response. */
function notifyProgress(userId: string, levelBefore: number, gam: any, newBadgeKeys: string[]) {
  if (gam.level > levelBefore) {
    notifyUser({
      userId,
      title: `Level up! You're now level ${gam.level} 🎉`,
      message: `Keep going — you're on a roll.`,
      type: 'success',
      link: '/student/analytics',
    }).catch(() => {});
  }
  for (const key of newBadgeKeys) {
    const badge = ALL_BADGES.find((b) => b.key === key);
    notifyUser({
      userId,
      title: `New badge earned: ${badge?.name.en || key} 🏅`,
      message: badge?.description.en || 'You earned a new badge.',
      type: 'success',
      link: '/student/analytics',
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get or create gamification record for the current student */
async function getOrCreate(studentId: string) {
  let gam = await Gamification.findOne({ student: studentId });
  if (!gam) {
    gam = await Gamification.create({ student: studentId });
  }
  return gam;
}

/** Real (not simulated) activity for the last 7 calendar days, built from xpLog entries. */
function buildWeeklyActivity(gam: any): { date: string; xpEarned: number; lessonsCompleted: number; quizzesCompleted: number }[] {
  const days: { date: string; xpEarned: number; lessonsCompleted: number; quizzesCompleted: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), xpEarned: 0, lessonsCompleted: 0, quizzesCompleted: 0 });
  }

  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const log of gam.xpLog || []) {
    const dateKey = new Date(log.earnedAt).toISOString().slice(0, 10);
    const bucket = byDate.get(dateKey);
    if (!bucket) continue; // outside the 7-day window
    bucket.xpEarned += log.amount;
    if (log.source === 'lesson_complete') bucket.lessonsCompleted += 1;
    if (log.source === 'quiz_score' || log.source === 'quiz_perfect') bucket.quizzesCompleted += 1;
  }

  return days;
}

/** Check for auto-awarded badges based on current state */
function checkAutoBadges(gam: any): string[] {
  const newlyEarned: string[] = [];
  const alreadyEarned = gam.earnedBadges.map((b: any) => b.badgeKey);

  const awardIf = (key: string, condition: boolean) => {
    if (condition && !alreadyEarned.includes(key)) {
      gam.earnedBadges.push({ badgeKey: key, earnedAt: new Date() });
      newlyEarned.push(key);
    }
  };

  awardIf('bronze_scholar', gam.xp >= 250);
  awardIf('silver_scholar', gam.xp >= 500);
  awardIf('gold_scholar', gam.xp >= 1000);
  awardIf('streak_master', gam.streak.current >= 7);
  awardIf('perfect_score', gam.totalPerfectScores >= 1);
  awardIf('sharpshooter', gam.totalPerfectScores >= 5);
  awardIf('bookworm', gam.totalLessonsCompleted >= 10);
  awardIf('level_5', gam.level >= 5);
  awardIf('level_10', gam.level >= 10);

  return newlyEarned;
}

// ---------------------------------------------------------------------------
// GET /gamification/my
// ---------------------------------------------------------------------------

export const getMyGamification = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  let gam = await getOrCreate(student._id.toString());

  // Check for new badges
  const newBadges = checkAutoBadges(gam);
  if (newBadges.length > 0) {
    await gam.save();
  }

  // Merge in full badge details so the client doesn't need to look them up
  const enrichedBadges = gam.earnedBadges.map((eb: any) => {
    const def = ALL_BADGES.find(b => b.key === eb.badgeKey);
    return { ...eb, badge: def || null };
  });

  return ApiResponse.success(res, {
    _id: gam._id,
    xp: gam.xp,
    level: gam.level,
    xpToNextLevel: gam.xpToNextLevel,
    streak: gam.streak,
    totalBadges: gam.earnedBadges.length,
    earnedBadges: enrichedBadges,
    totalLessonsCompleted: gam.totalLessonsCompleted,
    totalQuizzesCompleted: gam.totalQuizzesCompleted,
    totalPerfectScores: gam.totalPerfectScores,
    totalTimeSpentSeconds: gam.totalTimeSpentSeconds,
    recentXPLog: gam.xpLog.slice(-10).reverse(),
    weeklyActivity: buildWeeklyActivity(gam),
    allBadges: ALL_BADGES, // client can show locked badges
  });
};

// ---------------------------------------------------------------------------
// POST /gamification/xp
// Body: { amount, source, description }
// ---------------------------------------------------------------------------

export const addXP = async (req: Request, res: Response): Promise<Response> => {
  const { amount, source, description } = req.body;
  const xpAmount = Math.max(1, parseInt(amount, 10) || 0);

  const student = await ensureStudentRecord(req.user!.userId);
  const gam = await getOrCreate(student._id.toString());

  gam.xp += xpAmount;
  gam.xpLog.push({
    amount: xpAmount,
    source: source || 'manual',
    description: description || `Earned ${xpAmount} XP`,
    earnedAt: new Date(),
  });

  // Level-up check
  let levelsGained = 0;
  while (gam.xp >= totalXpForLevel(gam.level + 1)) {
    gam.level += 1;
    gam.xpToNextLevel = xpForLevel(gam.level);
    levelsGained += 1;
  }
  // also recalc xpToNextLevel if no full level-up
  if (levelsGained === 0) {
    gam.xpToNextLevel = totalXpForLevel(gam.level + 1) - gam.xp;
  }

  // Streak auto-update based on today's activity
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDate = gam.streak.lastActivityDate ? new Date(gam.streak.lastActivityDate) : null;
  if (lastDate) {
    lastDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      gam.streak.current += 1;
    } else if (diffDays > 1) {
      gam.streak.current = 1; // reset
    }
    // same day: no change
  } else {
    gam.streak.current = 1;
  }
  gam.streak.lastActivityDate = new Date();
  if (gam.streak.current > gam.streak.longest) {
    gam.streak.longest = gam.streak.current;
  }

  // Special badges: time-based
  const hour = new Date().getHours();
  const alreadyEarned = gam.earnedBadges.map((b: any) => b.badgeKey);
  if (hour >= 22 && !alreadyEarned.includes('night_owl')) {
    gam.earnedBadges.push({ badgeKey: 'night_owl', earnedAt: new Date() });
  }
  if (hour < 6 && !alreadyEarned.includes('early_bird')) {
    gam.earnedBadges.push({ badgeKey: 'early_bird', earnedAt: new Date() });
  }

  // Check other auto-badges
  checkAutoBadges(gam);

  await gam.save();

  return ApiResponse.success(res, {
    xp: gam.xp,
    level: gam.level,
    xpToNextLevel: gam.xpToNextLevel,
    levelsGained,
    streak: gam.streak,
    earnedBadges: gam.earnedBadges,
  });
};

// ---------------------------------------------------------------------------
// POST /gamification/streak/update
// Automatically called daily — updates streak counter
// ---------------------------------------------------------------------------

export const updateStreak = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const gam = await getOrCreate(student._id.toString());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDate = gam.streak.lastActivityDate ? new Date(gam.streak.lastActivityDate) : null;
  if (lastDate) {
    lastDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      gam.streak.current += 1;
    } else if (diffDays > 1) {
      gam.streak.current = 1;
    }
    // same day: no change
  } else {
    gam.streak.current = 1;
  }

  gam.streak.lastActivityDate = new Date();
  if (gam.streak.current > gam.streak.longest) {
    gam.streak.longest = gam.streak.current;
  }

  // Streak milestone XP bonuses
  let bonusXP = 0;
  const alreadyEarned = gam.earnedBadges.map((b: any) => b.badgeKey);
  if (gam.streak.current === 5 && !alreadyEarned.includes('streak_master')) {
    bonusXP = 15;
    gam.xp += bonusXP;
    gam.xpLog.push({ amount: bonusXP, source: 'streak_5', description: '5-day streak bonus', earnedAt: new Date() });
  }
  if (gam.streak.current === 10) {
    bonusXP = 30;
    gam.xp += bonusXP;
    gam.xpLog.push({ amount: bonusXP, source: 'streak_10', description: '10-day streak bonus', earnedAt: new Date() });
  }
  if (gam.streak.current === 30) {
    bonusXP = 100;
    gam.xp += bonusXP;
    gam.xpLog.push({ amount: bonusXP, source: 'streak_30', description: '30-day streak bonus', earnedAt: new Date() });
  }

  checkAutoBadges(gam);
  await gam.save();

  return ApiResponse.success(res, {
    streak: gam.streak,
    bonusXP,
    earnedBadges: gam.earnedBadges,
  });
};

// ---------------------------------------------------------------------------
// POST /gamification/complete-lesson
// Body: { timeSpentSeconds?: number }
// ---------------------------------------------------------------------------

export const completeLesson = async (req: Request, res: Response): Promise<Response> => {
  const { timeSpentSeconds } = req.body;
  const student = await ensureStudentRecord(req.user!.userId);
  const gam = await getOrCreate(student._id.toString());

  const levelBefore = gam.level;
  const baseXP = 10;
  gam.xp += baseXP;
  gam.totalLessonsCompleted += 1;
  if (timeSpentSeconds) {
    gam.totalTimeSpentSeconds += Math.max(0, parseInt(timeSpentSeconds, 10) || 0);
  }
  gam.xpLog.push({
    amount: baseXP,
    source: 'lesson_complete',
    description: 'Completed a lesson',
    earnedAt: new Date(),
  });

  // Level-up
  while (gam.xp >= totalXpForLevel(gam.level + 1)) {
    gam.level += 1;
    gam.xpToNextLevel = xpForLevel(gam.level);
  }
  if (gam.xpToNextLevel === 125 && gam.level === 1) {
    gam.xpToNextLevel = totalXpForLevel(2) - gam.xp;
  }

  const newBadges = checkAutoBadges(gam);
  await gam.save();
  notifyProgress(req.user!.userId, levelBefore, gam, newBadges);

  return ApiResponse.success(res, {
    xp: gam.xp,
    level: gam.level,
    xpToNextLevel: gam.xpToNextLevel,
    totalLessonsCompleted: gam.totalLessonsCompleted,
    streak: gam.streak,
    earnedBadges: gam.earnedBadges,
  });
};

// ---------------------------------------------------------------------------
// POST /gamification/complete-quiz
// Body: { score, totalQuestions, timeSpentSeconds? }
// ---------------------------------------------------------------------------

/**
 * Core quiz-XP award logic, extracted so it can be called directly (no HTTP
 * round-trip) from within another endpoint's DB transaction — specifically
 * quiz.controller.ts's submitAttempt, which needs the QuizAttempt write,
 * the Progress increment, and this XP award to all commit atomically.
 * `session` is an optional Mongoose ClientSession — when provided, every
 * read/write here participates in the caller's transaction.
 */
export interface QuizXPResult {
  xp: number;
  level: number;
  xpToNextLevel: number;
  xpEarned: number;
  totalQuizzesCompleted: number;
  totalPerfectScores: number;
  streak: unknown;
  earnedBadges: unknown;
  levelUp: boolean;
  newBadgeKeys: string[];
}

export async function awardQuizXP(
  studentId: string,
  userId: string,
  { score, totalQuestions, timeSpentSeconds }: { score: number; totalQuestions: number; timeSpentSeconds?: number },
  session?: any
): Promise<QuizXPResult> {
  let gam = await Gamification.findOne({ student: studentId }).session(session || null);
  if (!gam) {
    gam = (await Gamification.create([{ student: studentId }], { session }))[0];
  }

  const levelBefore = gam.level;
  const pct = totalQuestions > 0 ? score / totalQuestions : 0;
  let xpEarned = 0;

  if (pct === 1) {
    xpEarned = 40;
    gam.totalPerfectScores += 1;
    gam.xpLog.push({ amount: 40, source: 'quiz_perfect', description: 'Perfect quiz score (100%)', earnedAt: new Date() });
  } else if (pct >= 0.8) {
    xpEarned = 20;
    gam.xpLog.push({ amount: 20, source: 'quiz_score', description: `Quiz score ${Math.round(pct * 100)}%`, earnedAt: new Date() });
  } else {
    xpEarned = 5; // participation XP
    gam.xpLog.push({ amount: 5, source: 'quiz_score', description: `Quiz completed (${Math.round(pct * 100)}%)`, earnedAt: new Date() });
  }

  gam.xp += xpEarned;
  gam.totalQuizzesCompleted += 1;
  if (timeSpentSeconds) {
    gam.totalTimeSpentSeconds += Math.max(0, parseInt(timeSpentSeconds as any, 10) || 0);
    // Speed Demon badge
    const alreadyEarned = gam.earnedBadges.map((b: any) => b.badgeKey);
    if (parseInt(timeSpentSeconds as any, 10) < 60 && pct >= 0.8 && !alreadyEarned.includes('speed_demon')) {
      gam.earnedBadges.push({ badgeKey: 'speed_demon', earnedAt: new Date() });
    }
  }

  // Level-up
  while (gam.xp >= totalXpForLevel(gam.level + 1)) {
    gam.level += 1;
    gam.xpToNextLevel = xpForLevel(gam.level);
  }
  if (gam.xpToNextLevel === 125 && gam.level === 1) {
    gam.xpToNextLevel = totalXpForLevel(2) - gam.xp;
  }

  const newBadges = checkAutoBadges(gam);
  await gam.save({ session });
  notifyProgress(userId, levelBefore, gam, newBadges);

  return {
    xp: gam.xp,
    level: gam.level,
    xpToNextLevel: gam.xpToNextLevel,
    xpEarned,
    totalQuizzesCompleted: gam.totalQuizzesCompleted,
    totalPerfectScores: gam.totalPerfectScores,
    streak: gam.streak,
    earnedBadges: gam.earnedBadges,
    levelUp: gam.level > levelBefore,
    newBadgeKeys: newBadges,
  };
}

export const completeQuiz = async (req: Request, res: Response): Promise<Response> => {
  const { score, totalQuestions, timeSpentSeconds } = req.body;
  const student = await ensureStudentRecord(req.user!.userId);
  const result = await awardQuizXP(student._id.toString(), req.user!.userId, { score, totalQuestions, timeSpentSeconds });
  return ApiResponse.success(res, result);
};

// ---------------------------------------------------------------------------
// GET /gamification/leaderboard
// Query: ?limit=20&courseId=... (optional course filter)
// ---------------------------------------------------------------------------

export const getLeaderboard = async (req: Request, res: Response): Promise<Response> => {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

  const leaderboard = await Gamification.find()
    .sort({ xp: -1 })
    .limit(limit)
    .populate('student', 'studentId')
    .populate({
      path: 'student',
      select: 'studentId user school',
      populate: [
        { path: 'user', select: 'email' },
        { path: 'profile', select: 'firstName lastName avatar' },
      ],
    })
    .lean();

  const result = leaderboard.map((entry: any, index: number) => ({
    rank: index + 1,
    studentId: entry.student?.studentId,
    name: entry.student?.profile
      ? `${entry.student.profile.firstName} ${entry.student.profile.lastName}`.trim()
      : (entry.student?.user?.email || 'Unknown'),
    avatar: entry.student?.profile?.avatar,
    xp: entry.xp,
    level: entry.level,
    badges: entry.earnedBadges?.length || 0,
    streak: entry.streak?.current || 0,
  }));

  return ApiResponse.success(res, result);
};