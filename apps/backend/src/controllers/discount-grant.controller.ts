import { Request, Response } from 'express';
import mongoose from 'mongoose';
import DiscountGrant from '../models/discount-grant.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg } from '../utils/tenant-scope';

const GRANT_TYPES = ['discount', 'waiver', 'scholarship'];
const DURATION_TYPES = ['standing', 'academic_year', 'fixed_period'];

// ---------------------------------------------------------------------------
// POST /discount-grants — Create a recurring discount policy for a student.
// Unlike a FeeAdjustment (one-time, invoice-scoped), this doesn't touch any
// invoice directly — it takes effect the next time an invoice is generated
// for the student while the grant is within its validity window.
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, label, type, durationType, valueType, value, academicYear, validFrom, validUntil, reason } = req.body;

  if (!studentId) throw new BadRequestError('studentId is required');
  if (!label || !String(label).trim()) throw new BadRequestError('A label is required');
  if (!GRANT_TYPES.includes(type)) throw new BadRequestError('type must be one of discount, waiver, scholarship');
  if (!DURATION_TYPES.includes(durationType)) throw new BadRequestError('durationType must be one of standing, academic_year, fixed_period');
  if (!['fixed', 'percent'].includes(valueType)) throw new BadRequestError('valueType must be fixed or percent');
  const numValue = Number(value);
  if (!Number.isFinite(numValue) || numValue <= 0) throw new BadRequestError('A valid value is required');
  if (valueType === 'percent' && numValue > 100) throw new BadRequestError('Percentage cannot exceed 100');
  if (!reason || !String(reason).trim()) throw new BadRequestError('A reason is required for every grant');

  if (durationType !== 'standing' && !validUntil) throw new BadRequestError('validUntil is required unless durationType is standing');
  if (durationType === 'academic_year' && (!academicYear || !String(academicYear).trim())) {
    throw new BadRequestError('academicYear is required when durationType is academic_year');
  }

  const student = await Student.findById(studentId).select('school');
  if (!student) throw new NotFoundError('Student');
  assertOwnsOrg(req, student, 'school');

  const resolvedValidFrom = validFrom ? new Date(validFrom) : new Date();
  if (durationType !== 'standing') {
    const resolvedValidUntil = new Date(validUntil);
    if (resolvedValidUntil <= resolvedValidFrom) throw new BadRequestError('validUntil must be after validFrom');
  }

  const grant = await DiscountGrant.create({
    student: studentId,
    school: student.school || null,
    label: String(label).trim(),
    type,
    durationType,
    valueType,
    inputValue: numValue,
    academicYear: academicYear ? String(academicYear).trim() : '',
    validFrom: resolvedValidFrom,
    validUntil: durationType === 'standing' ? null : new Date(validUntil),
    reason: String(reason).trim(),
    grantedBy: req.user!.userId,
  });

  return ApiResponse.created(res, grant, 'Discount grant created — it will apply to invoices generated from now on');
};

// ---------------------------------------------------------------------------
// GET /discount-grants — History, org-scoped, filterable by student/status.
// effectiveStatus is derived (not stored) since expiry is purely date-based:
// a fixed_period/academic_year grant just ages out on its own without any
// job needing to flip a stored field.
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, status, page = '1', limit = '20' } = req.query;

  const filter: Record<string, unknown> = {};
  if (studentId) filter.student = studentId;
  if (status === 'active' || status === 'revoked') filter.status = status;

  const scopedFilter = applyOrgFilter(req, filter, 'school');
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [grants, total] = await Promise.all([
    DiscountGrant.find(scopedFilter)
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
      .populate('grantedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    DiscountGrant.countDocuments(scopedFilter),
  ]);

  const now = new Date();
  const withEffectiveStatus = grants.map((g: any) => ({
    ...g,
    effectiveStatus: g.status === 'revoked' ? 'revoked' : g.validUntil && new Date(g.validUntil) < now ? 'expired' : 'active',
  }));

  return ApiResponse.paginated(res, withEffectiveStatus, { page: pageNum, limit: limitNum, total });
};

// ---------------------------------------------------------------------------
// PATCH /discount-grants/:id/revoke — Stops a grant from applying to any
// invoice generated after this point. Invoices already issued under it keep
// their discount — same immutable-financial-record rule as everywhere else
// in billing (void, not delete/undo).
// ---------------------------------------------------------------------------

export const revoke = async (req: Request, res: Response): Promise<Response> => {
  const grant = await DiscountGrant.findById(req.params.id);
  if (!grant) throw new NotFoundError('Discount grant');
  assertOwnsOrg(req, grant, 'school');

  if (grant.status === 'revoked') throw new BadRequestError('This grant is already revoked');

  grant.status = 'revoked';
  grant.revokedAt = new Date();
  grant.revokedBy = new mongoose.Types.ObjectId(req.user!.userId);
  grant.revokeReason = req.body?.reason || '';
  await grant.save();

  return ApiResponse.success(res, grant, 'Discount grant revoked');
};
