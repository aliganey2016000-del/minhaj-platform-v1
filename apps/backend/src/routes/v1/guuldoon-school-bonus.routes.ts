import { Router } from 'express';
import mongoose from 'mongoose';
import School from '../../models/school.model';
import Student from '../../models/student.model';
import Subscription from '../../models/global-subscription.model';
import Payout from '../../models/guuldoon-school-payout.model';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';
import { DEFAULT_SCHOOL_BONUS_RATE, MAX_SCHOOL_BONUS_RATE, GLOBAL_SUBSCRIPTION_PRICE } from '../../utils/global-subscription';
import { summarizeSchool, summarizeSchools } from '../../services/guuldoon-school-bonus.service';

const router = Router();
router.use(authMiddleware);

const requireSuperAdmin = (user: Express.Request['user']) => {
  if (user?.role !== 'admin' || user.isStaff) throw new ForbiddenError('Only Super Admin can manage school bonuses');
};
const objectId = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) throw new BadRequestError(`Invalid ${label}`);
  return value;
};
const pageOf = (value: unknown) => Math.max(1, Number(value) || 1);

/** Super Admin: every school with its bonus figures. */
router.get('/schools', asyncHandler(async (req, res) => {
  requireSuperAdmin(req.user);
  const rows = await summarizeSchools();
  const totals = rows.reduce((acc, row) => ({
    students: acc.students + row.students,
    verifiedSubscriptions: acc.verifiedSubscriptions + row.verifiedSubscriptions,
    grossUsd: acc.grossUsd + row.grossUsd,
    bonusUsd: acc.bonusUsd + row.bonusUsd,
    pendingUsd: acc.pendingUsd + row.pendingUsd,
  }), { students: 0, verifiedSubscriptions: 0, grossUsd: 0, bonusUsd: 0, pendingUsd: 0 });
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return ApiResponse.success(res, {
    price: GLOBAL_SUBSCRIPTION_PRICE,
    defaultRate: DEFAULT_SCHOOL_BONUS_RATE,
    maxRate: MAX_SCHOOL_BONUS_RATE,
    schools: rows,
    totals: { ...totals, grossUsd: round2(totals.grossUsd), bonusUsd: round2(totals.bonusUsd), pendingUsd: round2(totals.pendingUsd) },
  });
}));

/** Super Admin: set (or clear, with null) one school's bonus rate. */
router.patch('/schools/:id/rate', asyncHandler(async (req, res) => {
  requireSuperAdmin(req.user);
  const id = objectId(req.params.id, 'school ID');
  const rate = req.body.rate;
  if (rate !== null && (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > MAX_SCHOOL_BONUS_RATE)) {
    throw new BadRequestError(`rate must be a number from 0 to ${MAX_SCHOOL_BONUS_RATE}, or null to use the default`);
  }
  const result = await School.updateOne({ _id: id }, { $set: { guuldoonBonusRate: rate } }, { runValidators: true });
  if (result.matchedCount === 0) throw new NotFoundError('School');
  return ApiResponse.success(res, await summarizeSchool(id), 'Bonus rate updated');
}));

/** Super Admin: payout history, optionally for one school. */
router.get('/payouts', asyncHandler(async (req, res) => {
  requireSuperAdmin(req.user);
  const filter: Record<string, unknown> = {};
  if (req.query.schoolId) filter.school = objectId(req.query.schoolId, 'school ID');
  const page = pageOf(req.query.page);
  const limit = 50;
  const [rows, total] = await Promise.all([
    Payout.find(filter).populate('school', 'name').sort({ paidAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Payout.countDocuments(filter),
  ]);
  return ApiResponse.paginated(res, rows, { page, limit, total });
}));

/** Super Admin: record a payout. It can never exceed what the school is still owed. */
router.post('/payouts', asyncHandler(async (req, res) => {
  requireSuperAdmin(req.user);
  const schoolId = objectId(req.body.schoolId, 'school ID');
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestError('Enter a payout amount greater than zero');
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
  const summary = await summarizeSchool(schoolId);
  if (!summary) throw new NotFoundError('School');
  if (amount > summary.pendingUsd + 0.001) throw new BadRequestError(`This school is owed $${summary.pendingUsd.toFixed(2)}; the payout cannot be larger`);
  const payout = await Payout.create({ school: schoolId, amount, note, paidBy: req.user!.userId });
  return ApiResponse.created(res, payout, 'Payout recorded');
}));

/** School administrator: own school's bonus, payouts and subscribed students. */
router.get('/mine', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'org_admin') throw new ForbiddenError('School administrator access required');
  if (!req.user.organizationId || !mongoose.isValidObjectId(req.user.organizationId)) throw new ForbiddenError('Organization required');
  const schoolId = req.user.organizationId;
  const summary = await summarizeSchool(schoolId);
  if (!summary) throw new NotFoundError('School');
  const page = pageOf(req.query.page);
  const limit = 50;
  const filter = { school: schoolId, status: { $in: ['approved', 'pending'] } };
  const [subs, total, payouts] = await Promise.all([
    Subscription.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('user grade status startsAt expiresAt createdAt').lean(),
    Subscription.countDocuments(filter),
    Payout.find({ school: schoolId }).sort({ paidAt: -1 }).limit(100).select('amount note paidAt').lean(),
  ]);
  const students = await Student.find({ school: schoolId, user: { $in: subs.map(sub => sub.user) } }).select('user studentId profile').populate('profile', 'firstName lastName').lean();
  const byUser = new Map(students.map((student: any) => [String(student.user), student]));
  const rows = subs.map((sub: any) => {
    const student: any = byUser.get(String(sub.user));
    const name = [student?.profile?.firstName, student?.profile?.lastName].filter(Boolean).join(' ');
    return { id: String(sub._id), studentId: student?.studentId || '', name: name || 'Student', grade: sub.grade, status: sub.status, startsAt: sub.startsAt || null, expiresAt: sub.expiresAt || null, requestedAt: sub.createdAt };
  });
  return ApiResponse.success(res, { price: GLOBAL_SUBSCRIPTION_PRICE, summary, students: rows, studentsTotal: total, payouts }, 'OK', 200, { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPrevPage: page > 1 });
}));

export default router;
