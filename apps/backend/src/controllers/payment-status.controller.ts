import { Request, Response } from 'express';
import Payment from '../models/payment.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyInvoicePayment, recalcStudentBalance } from '../services/billing.service';
import { assertOwnsOrg } from '../utils/tenant-scope';

/**
 * A completed payment represents money actually received and must never be
 * downgraded to pending. Completion is the only supported state transition;
 * it atomically applies the payment to its invoice before the status changes.
 */
export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (status !== 'completed') {
    throw new BadRequestError('The only supported status transition is pending → completed. Use a refund to reverse collected money.');
  }

  const existing = await Payment.findById(req.params.id);
  if (!existing) throw new NotFoundError('Payment');
  assertOwnsOrg(req, existing, 'school');

  if (existing.status === 'refunded') throw new BadRequestError('A refunded payment cannot be completed again');
  if (existing.status === 'completed') return ApiResponse.success(res, existing, 'Payment is already completed');
  if (!existing.invoice) throw new BadRequestError('Pending payment has no linked invoice and cannot be completed safely');

  const effectiveAmount = Math.max(0, existing.amount - (existing.discount || 0));
  if (effectiveAmount <= 0) throw new BadRequestError('Pending payment has no positive collectible amount');

  // Claim the pending -> completed transition atomically before touching the
  // invoice. The check above (existing.status === 'completed') is a plain
  // findById read with no lock: two concurrent "mark completed" requests for
  // the same payment can both read status 'pending', both pass that check,
  // and both then call applyInvoicePayment — which guards against the
  // INVOICE'S remaining balance going negative, but has no idea this is the
  // same payment being applied twice, so if the invoice has enough headroom
  // (e.g. a larger invoice than this one payment) both calls succeed and the
  // invoice is credited twice for money that was only ever received once.
  // The later existing.save() doesn't catch this either — Mongoose has no
  // optimistic concurrency enabled here, so both saves just overwrite status
  // to 'completed' with no conflict. Claiming the transition with a single
  // atomic findOneAndUpdate guarded on status:'pending' means only one of
  // two concurrent callers can ever win it.
  const claimed = await Payment.findOneAndUpdate(
    { _id: existing._id, status: 'pending' },
    { $set: { status: 'completed' } }
  );
  if (!claimed) {
    const fresh = await Payment.findById(existing._id).select('status').lean();
    if ((fresh as any)?.status === 'completed') return ApiResponse.success(res, fresh, 'Payment is already completed');
    throw new BadRequestError('This payment is no longer pending and cannot be completed');
  }

  let invoice;
  try {
    invoice = await applyInvoicePayment(claimed.invoice!, claimed.amount, claimed.discount || 0);
  } catch (err) {
    await Payment.findByIdAndUpdate(claimed._id, { $set: { status: 'pending' } }).catch(() => {});
    throw err;
  }

  await recalcStudentBalance(claimed.student);
  const completed = await Payment.findById(claimed._id);
  return ApiResponse.success(res, { payment: completed, invoice }, 'Payment completed successfully');
};
