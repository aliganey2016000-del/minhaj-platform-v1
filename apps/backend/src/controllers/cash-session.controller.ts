import { Request, Response } from 'express';
import mongoose from 'mongoose';
import CashSession from '../models/cash-session.model';
import Payment from '../models/payment.model';
import Refund from '../models/refund.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg } from '../utils/tenant-scope';

function resolveSchoolId(req: Request): string {
  const id = req.user?.role === 'admin' ? req.body?.schoolId : req.user?.organizationId;
  if (!id || !mongoose.isValidObjectId(id)) throw new BadRequestError('A valid school/organization is required');
  return String(id);
}

export const openSession = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = resolveSchoolId(req);
  const openingBalance = Number(req.body?.openingBalance);
  if (!Number.isFinite(openingBalance) || openingBalance < 0) throw new BadRequestError('Opening balance must be zero or greater');

  const existing = await CashSession.findOne({ cashier: req.user!.userId, school: schoolId, status: 'open' });
  if (existing) throw new BadRequestError('You already have an open cash session for this school');

  const session = await CashSession.create({
    cashier: req.user!.userId,
    school: schoolId,
    openingBalance,
    expectedCash: openingBalance,
    openingNote: req.body?.openingNote,
  });

  return ApiResponse.created(res, session, 'Cash session opened');
};

export const getCurrent = async (req: Request, res: Response): Promise<Response> => {
  const filter = applyOrgFilter(req, { cashier: req.user!.userId, status: 'open' }, 'school');
  const session = await CashSession.findOne(filter).populate('cashier', 'email').populate('school', 'name').lean();
  return ApiResponse.success(res, session, session ? 'Open cash session' : 'No open cash session');
};

export const closeSession = async (req: Request, res: Response): Promise<Response> => {
  const session = await CashSession.findById(req.params.id);
  if (!session) throw new NotFoundError('Cash session');
  assertOwnsOrg(req, session, 'school');
  if (session.status !== 'open') throw new BadRequestError('Cash session is already closed');

  if (req.user!.role === 'cashier' && session.cashier.toString() !== req.user!.userId) {
    throw new BadRequestError('A cashier can only close their own cash session');
  }

  const cashPayments = await Payment.find({ cashSession: session._id, method: 'cash', status: { $in: ['completed', 'refunded'] } })
    .select('amount discount refundedAmount')
    .lean();
  const paymentIds = cashPayments.map((p: any) => p._id);
  const refunds = paymentIds.length
    ? await Refund.find({ payment: { $in: paymentIds }, status: 'completed' }).select('amount').lean()
    : [];

  const cashCollected = cashPayments.reduce((sum: number, p: any) => sum + Math.max(0, (p.amount || 0) - (p.discount || 0)), 0);
  const cashRefunded = refunds.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
  const expectedCash = session.openingBalance + cashCollected - cashRefunded;
  const closingBalance = Number(req.body?.closingBalance);
  if (!Number.isFinite(closingBalance) || closingBalance < 0) throw new BadRequestError('Closing balance must be zero or greater');

  session.cashCollected = cashCollected;
  session.cashRefunded = cashRefunded;
  session.expectedCash = expectedCash;
  session.closingBalance = closingBalance;
  session.variance = closingBalance - expectedCash;
  session.closingNote = req.body?.closingNote;
  session.status = 'closed';
  session.closedAt = new Date();
  await session.save();

  return ApiResponse.success(res, session, 'Cash session closed and reconciled');
};

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = {};
  if (req.query.status && ['open', 'closed'].includes(String(req.query.status))) filter.status = req.query.status;
  if (req.query.cashierId && mongoose.isValidObjectId(req.query.cashierId)) filter.cashier = req.query.cashierId;
  const scoped = applyOrgFilter(req, filter, 'school');
  const sessions = await CashSession.find(scoped)
    .populate('cashier', 'email')
    .populate('school', 'name')
    .sort({ openedAt: -1 })
    .limit(100)
    .lean();
  return ApiResponse.success(res, sessions);
};
