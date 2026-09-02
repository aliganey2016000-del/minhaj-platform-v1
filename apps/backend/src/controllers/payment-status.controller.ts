import { Request, Response } from 'express';
import Payment from '../models/payment.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyInvoicePayment, reverseInvoicePayment, recalcStudentBalance } from '../services/billing.service';
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

  const invoice = await applyInvoicePayment(existing.invoice, existing.amount, existing.discount || 0);

  try {
    existing.status = 'completed';
    await existing.save();
  } catch (err) {
    await reverseInvoicePayment(existing.invoice, effectiveAmount).catch(() => {});
    if ((existing.discount || 0) > 0) {
      await (await import('../models/invoice.model')).default.findByIdAndUpdate(existing.invoice, { $inc: { discount: -(existing.discount || 0) } }).catch(() => {});
    }
    throw err;
  }

  await recalcStudentBalance(existing.student);
  return ApiResponse.success(res, { payment: existing, invoice }, 'Payment completed successfully');
};
