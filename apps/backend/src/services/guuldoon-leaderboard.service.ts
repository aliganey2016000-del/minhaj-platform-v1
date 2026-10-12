import mongoose from 'mongoose';
import Course from '../models/course.model';
import Student from '../models/student.model';
import Profile from '../models/profile.model';
import School from '../models/school.model';
import Subscription from '../models/global-subscription.model';
import GuuldoonAttempt from '../models/guuldoon-attempt.model';
import Pref from '../models/guuldoon-leaderboard-pref.model';

/** Points rules (v1, derived from Guuldoon practice attempts only). */
export const POINTS_PER_QUESTION = 10;
export const DAILY_POINT_CAP = 400;
/** A school is ranked only when it has at least this many subscribed students in the grade. */
export const MIN_SCHOOL_STUDENTS = 3;
const SOMALIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const CACHE_MS = 60 * 1000;

export type LeaderboardPeriod = 'week' | 'month' | 'all';
export const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ['week', 'month', 'all'];

export function periodStart(period: LeaderboardPeriod, now = new Date()): Date | null {
  if (period === 'week') return new Date(now.getTime() - 7 * 86400000);
  if (period === 'month') return new Date(now.getTime() - 30 * 86400000);
  return null;
}

/** Highest points first; on a tie whoever reached the score first ranks higher. */
export function compareEntries(a: { points: number; last: number }, b: { points: number; last: number }): number {
  return b.points - a.points || a.last - b.last;
}

export interface PointsEntry { user: string; points: number; last: number }

const cache = new Map<string, { at: number; rows: PointsEntry[] }>();

/**
 * Points per user for one grade. A question earns points only the first time the
 * student answers it correctly, so repeating a question never adds anything, and a
 * student can earn at most DAILY_POINT_CAP points per (Mogadishu) day.
 */
export async function computePoints(grade: number, period: LeaderboardPeriod): Promise<PointsEntry[]> {
  const key = `${grade}:${period}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;

  const courseIds = await Course.find({ scope: 'global', globalGrade: grade }).distinct('_id');
  if (!courseIds.length) return [];
  const start = periodStart(period);
  const aggregated = await GuuldoonAttempt.aggregate([
    { $match: { course: { $in: courseIds }, correct: true, retry: { $ne: true } } },
    { $group: { _id: { user: '$user', question: '$question' }, at: { $min: '$createdAt' } } },
    ...(start ? [{ $match: { at: { $gte: start } } }] : []),
    { $group: {
      _id: { user: '$_id.user', day: { $dateToString: { format: '%Y-%m-%d', date: { $add: ['$at', SOMALIA_OFFSET_MS] } } } },
      raw: { $sum: POINTS_PER_QUESTION },
      last: { $max: '$at' },
    } },
    { $project: { raw: 1, last: 1, capped: { $cond: [{ $gt: ['$raw', DAILY_POINT_CAP] }, DAILY_POINT_CAP, '$raw'] } } },
    { $group: { _id: '$_id.user', points: { $sum: '$capped' }, last: { $max: '$last' } } },
    { $match: { points: { $gt: 0 } } },
  ]);
  const rows = aggregated.map((row: any) => ({ user: String(row._id), points: row.points as number, last: new Date(row.last).getTime() }));
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

export function clearLeaderboardCache(): void { cache.clear(); }

/** Subscribed students (approved and currently active) for a grade, with their school. */
async function activeSubscriptions(grade: number) {
  const now = new Date();
  const rows = await Subscription.find({ grade, status: 'approved', startsAt: { $lte: now }, expiresAt: { $gt: now } })
    .select('user school').lean();
  const bySchool = new Map<string, string>();
  for (const row of rows as any[]) bySchool.set(String(row.user), String(row.school));
  return bySchool;
}

export interface StudentBoardRow { rank: number; name: string; school: string | null; points: number; isMe: boolean }

function anonymousName(userId: string): string {
  return `Arday #${(parseInt(userId.slice(-4), 16) % 9000) + 1000}`;
}

export async function buildStudentBoard(grade: number, period: LeaderboardPeriod, viewerUserId: string | null, limit = 50) {
  const [points, subscribed] = await Promise.all([computePoints(grade, period), activeSubscriptions(grade)]);
  const ranked = points.filter((row) => subscribed.has(row.user)).sort(compareEntries);
  const top = ranked.slice(0, limit);
  const mineIndex = viewerUserId ? ranked.findIndex((row) => row.user === viewerUserId) : -1;
  const wanted = new Set(top.map((row) => row.user));
  if (mineIndex >= limit) wanted.add(ranked[mineIndex].user);
  const ids = [...wanted];

  const [students, prefs] = await Promise.all([
    Student.find({ user: { $in: ids }, approvalStatus: 'approved', status: 'active' }).select('user profile school').lean(),
    Pref.find({ user: { $in: ids }, showName: true }).select('user').lean(),
  ]);
  const showName = new Set((prefs as any[]).map((pref) => String(pref.user)));
  const profileIds = (students as any[]).filter((s) => showName.has(String(s.user))).map((s) => s.profile);
  const [profiles, schools] = await Promise.all([
    Profile.find({ _id: { $in: profileIds } }).select('firstName lastName').lean(),
    School.find({ _id: { $in: ids.map((id) => subscribed.get(id)).filter(Boolean) as string[] } }).select('name').lean(),
  ]);
  const profileById = new Map((profiles as any[]).map((p) => [String(p._id), p]));
  const studentByUser = new Map((students as any[]).map((s) => [String(s.user), s]));
  const schoolName = new Map((schools as any[]).map((s) => [String(s._id), s.name as string]));

  const present = (row: PointsEntry, index: number): StudentBoardRow => {
    const named = showName.has(row.user);
    const profile = named ? profileById.get(String(studentByUser.get(row.user)?.profile)) : null;
    const fullName = profile ? `${profile.firstName} ${(profile.lastName || '').trim().charAt(0)}.`.trim() : null;
    return {
      rank: index + 1,
      name: named && fullName ? fullName : anonymousName(row.user),
      school: named ? schoolName.get(subscribed.get(row.user) || '') || null : null,
      points: row.points,
      isMe: row.user === viewerUserId,
    };
  };
  const entries = top.map(present);
  let me: { rank: number; points: number; behind: number; showName: boolean } | null = null;
  if (mineIndex >= 0) {
    const mine = ranked[mineIndex];
    me = {
      rank: mineIndex + 1,
      points: mine.points,
      behind: mineIndex > 0 ? ranked[mineIndex - 1].points - mine.points : 0,
      showName: showName.has(mine.user) || !!(viewerUserId && (await Pref.exists({ user: viewerUserId, showName: true }))),
    };
  } else if (viewerUserId && subscribed.has(viewerUserId)) {
    me = { rank: 0, points: 0, behind: 0, showName: !!(await Pref.exists({ user: viewerUserId, showName: true })) };
  }
  return { entries, me, totalRanked: ranked.length };
}

export interface SchoolBoardRow { rank: number; school: string; students: number; score: number }

/** Schools ranked by average points per subscribed student (students with no points count as zero). */
export async function buildSchoolBoard(grade: number, period: LeaderboardPeriod, limit = 50) {
  const [points, subscribed] = await Promise.all([computePoints(grade, period), activeSubscriptions(grade)]);
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const school of subscribed.values()) counts.set(school, (counts.get(school) || 0) + 1);
  for (const row of points) {
    const school = subscribed.get(row.user);
    if (school) sums.set(school, (sums.get(school) || 0) + row.points);
  }
  const eligible = [...counts.entries()].filter(([, count]) => count >= MIN_SCHOOL_STUDENTS);
  const schools = await School.find({ _id: { $in: eligible.map(([id]) => id) } }).select('name').lean();
  const name = new Map((schools as any[]).map((s) => [String(s._id), s.name as string]));
  const rows = eligible
    .map(([id, count]) => ({ school: name.get(id) || 'School', students: count, score: Math.round((sums.get(id) || 0) / count) }))
    .sort((a, b) => b.score - a.score || b.students - a.students)
    .slice(0, limit)
    .map((row, index): SchoolBoardRow => ({ rank: index + 1, ...row }));
  return { entries: rows, minStudents: MIN_SCHOOL_STUDENTS };
}

export function validObjectId(value: string): boolean { return mongoose.isValidObjectId(value); }
