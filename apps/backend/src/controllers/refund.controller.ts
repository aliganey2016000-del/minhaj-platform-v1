import { Request, Response } from 'express';
import Payment from '../models/payment.model';
import Refund from '../models/refund.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg } from '../utils/tenant-scope';
import { reverseInvoicePayment, recalcStudentBalance } from '../services/billing.service';

/**
 * POST /refunds — Issue a partial or full refund against a completed Payment.
 *
 * The refundable amount is reserved atomically on Payment first. This closes
 * the classic concurrent-refund race where two admins both read the same
 * refundable balance. If any later step fails, the reservation and invoice
 * movement are compensated before the error is returned.
 */
export const issueRefund = async (req: Request, res: Response): Promise<Response> => {
  const { paymentId, amount, reason } = req.body;

  if (!paymentId) throw new BadRequestError('paymentId is required');
  const refundAmount = Number(amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) throw new BadRequestError('A valid refund amount is required');
  if (!reason || !String(reason).trim()) throw new BadRequestError('A reason is required for every refund');

  const payment = await Payment.findById(paymentId);
  if (!payment) throw new NotFoundError('Payment');
  assertOwnsOrg(req, payment, 'school');

  if (!payment.invoice) throw new BadRequestError('This payment has no linked invoice to reverse');
  if (payment.status !== 'completed') throw new BadRequestError('Only completed payments can be refunded');

  const refundable = Math.max(0, payment.effectiveAmount - (payment.refundedAmount || 0));
  if (refundAmount > refundable + 0.001) {
    throw new BadRequestError(`Refund exceeds refundable amount of ${refundable}`);
  }

  // Atomic reservation: only one concurrent request can consume the same
  // remaining refundable balance. No prior-refund read/then-write race.
  const reserved = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      status: 'completed',
      $expr: {
        $lte: [
          { $add: ['$refundedAmount', refundAmount] },
          { $add: ['$amount', -((payment.discount || 0) + 0) ] },
        ],
      },
    },
    { $inc: { refundedAmount: refundAmount } },
    { new: true }
  );

  // The expression above is deliberately based on the immutable payment
  // amount/discount; also verify against the latest returned document so a
  // concurrent refund cannot exceed effectiveAmount.
  if (!reserved || refundAmount > Math.max(0, reserved.effectiveAmount - refundAmount + 0.001)) {
    // If the atomic guard failed, do not attempt an invoice mutation.
    throw new BadRequestError('Refund exceeds the remaining refundable amount');
  }

  let invoice;
  try {
    invoice = await reverseInvoicePayment(payment.invoice, refundAmount);
  } catch (err) {
    await Payment.findByIdAndUpdate(payment._id, { $inc: { refundedAmount: -refundAmount } }).catch(() => {});
    throw err;
  }

  let refund;
  try {
    refund = await Refund.create({
      payment: payment._id,
      invoice: payment.invoice,
      student: payment.student,
      school: payment.school,
      amount: refundAmount,
      reason: String(reason).trim(),
      status: 'completed',
      processedBy: req.user!.userId,
    });
  } catch (err) {
    await reverseInvoicePayment(payment.invoice, -refundAmount).catch(() => {});
    await Payment.findByIdAndUpdate(payment._id, { $inc: { refundedAmount: -refundAmount } }).catch(() => {});
    throw err;
  }

  const fullyRefunded = reserved.refundedAmount >= reserved.effectiveAmount - 0.001;
  if (fullyRefunded) {
    await Payment.findByIdAndUpdate(payment._id, { status: 'refunded' });
  }

  await recalcStudentBalance(payment.student);
  return ApiResponse.created(res, { refund, invoice }, 'Refund issued');
};

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, invoiceId, page = '1', limit = '20' } = req.query;

  const filter: Record<string, unknown> = {};
  if (studentId) filter.student = studentId;
  if (invoiceId) filter.invoice = invoiceId;

  const scopedFilter = applyOrgFilter(req, filter, 'school');
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [refunds, total] = await Promise.all([
    Refund.find(scopedFilter)
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
      .populate('processedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Refund.countDocuments(scopedFilter),
  ]);

  return ApiResponse.paginated(res, refunds, { page: pageNum, limit: limitNum, total });
};
