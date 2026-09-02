import { Request, Response } from 'express';
import Invoice from '../models/invoice.model';
import FeeAdjustment from '../models/fee-adjustment.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg } from '../utils/tenant-scope';
import { applyInvoiceDiscount, recalcStudentBalance } from '../services/billing.service';

const ADJUSTMENT_TYPES = ['discount', 'waiver', 'scholarship'];

// ---------------------------------------------------------------------------
// POST /fee-adjustments — Grant a one-time discount/waiver/scholarship
// against a specific invoice. `type` is a label for reporting only; every
// type reduces the invoice's discount field the same way.
// ---------------------------------------------------------------------------

export const grantAdjustment = async (req: Request, res: Response): Promise<Response> => {
  const { invoiceId, type, valueType, value, reason } = req.body;

  if (!invoiceId) throw new BadRequestError('invoiceId is required');
  if (!ADJUSTMENT_TYPES.includes(type)) throw new BadRequestError('type must be one of discount, waiver, scholarship');
  if (!['fixed', 'percent'].includes(valueType)) throw new BadRequestError('valueType must be fixed or percent');
  const numValue = Number(value);
  if (!Number.isFinite(numValue) || numValue <= 0) throw new BadRequestError('A valid value is required');
  if (valueType === 'percent' && numValue > 100) throw new BadRequestError('Percentage cannot exceed 100');
  if (!reason || !String(reason).trim()) throw new BadRequestError('A reason is required for every adjustment');

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new NotFoundError('Invoice');
  assertOwnsOrg(req, invoice, 'school');

  const computedAmount = valueType === 'percent'
    ? Math.round((numValue / 100) * invoice.amount * 100) / 100
    : numValue;
  if (computedAmount <= 0) throw new BadRequestError('Computed amount must be greater than zero');

  const updatedInvoice = await applyInvoiceDiscount(invoice._id as any, computedAmount);

  const adjustment = await FeeAdjustment.create({
    invoice: invoice._id,
    student: invoice.student,
    school: invoice.school,
    type,
    valueType,
    inputValue: numValue,
    amount: computedAmount,
    reason: String(reason).trim(),
    grantedBy: req.user!.userId,
  });

  await recalcStudentBalance(invoice.student);

  return ApiResponse.created(res, { adjustment, invoice: updatedInvoice }, 'Adjustment applied successfully');
};

// ---------------------------------------------------------------------------
// GET /fee-adjustments — History, org-scoped, filterable by student/invoice.
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, invoiceId, type, page = '1', limit = '20' } = req.query;

  const filter: Record<string, unknown> = {};
  if (studentId) filter.student = studentId;
  if (invoiceId) filter.invoice = invoiceId;
  if (type && ADJUSTMENT_TYPES.includes(type as string)) filter.type = type;

  const scopedFilter = applyOrgFilter(req, filter, 'school');
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [adjustments, total] = await Promise.all([
    FeeAdjustment.find(scopedFilter)
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
      .populate('invoice', 'title period amount')
      .populate('grantedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    FeeAdjustment.countDocuments(scopedFilter),
  ]);

  return ApiResponse.paginated(res, adjustments, { page: pageNum, limit: limitNum, total });
};
