import { Request, Response } from 'express';
import Payment from '../models/payment.model';
import Refund from '../models/refund.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg } from '../utils/tenant-scope';
import { reverseInvoicePayment, recalcStudentBalance } from '../services/billing.service';

// ---------------------------------------------------------------------------
// POST /refunds — Issue a refund against a completed Payment.
// Never edits Payment.amount (write-once, immutable ledger entry). Creates
// this audit record instead, atomically reverses the linked Invoice's
// amountPaid, and recalculates the student's balance from their invoices.
// ---------------------------------------------------------------------------

export const issueRefund = async (req: Request, res: Response): Promise<Response> => {
  const { paymentId, amount, reason } = req.body;

  if (!paymentId) throw new BadRequestError('paymentId is required');
  if (!amount || amount <= 0) throw new BadRequestError('A valid amount is required');
  if (!reason || !String(reason).trim()) throw new BadRequestError('A reason is required for every refund');

  const payment = await Payment.findById(paymentId);
  if (!payment) throw new NotFoundError('Payment');
  assertOwnsOrg(req, payment, 'school');

  if (!payment.invoice) throw new BadRequestError('This payment has no linked invoice to reverse');
  if (payment.status !== 'completed') throw new BadRequestError('Only completed payments can be refunded');

  const priorRefunds = await Refund.find({ payment: payment._id }).select('amount').lean();
  const refundedSoFar = priorRefunds.reduce((sum, r: any) => sum + (r.amount || 0), 0);
  const refundable = payment.effectiveAmount - refundedSoFar;

  if (amount > refundable + 0.001) {
    throw new BadRequestError(`Refund exceeds refundable amount of ${Math.max(0, refundable)}`);
  }

  const invoice = await reverseInvoicePayment(payment.invoice, Number(amount));

  const refund = await Refund.create({
    payment: payment._id,
    invoice: payment.invoice,
    student: payment.student,
    school: payment.school,
    amount,
    reason: String(reason).trim(),
    status: 'completed',
    processedBy: req.user!.userId,
  });

  // Full refund of this payment — mark it as such. Informational only; the
  // Refund + Invoice records (not Payment.status) are the source of truth
  // for balance math from here on. (payment.status is guaranteed 'completed'
  // here, checked above.)
  if (amount >= refundable - 0.001) {
    payment.status = 'refunded';
    await payment.save();
  }

  await recalcStudentBalance(payment.student);

  return ApiResponse.created(res, { refund, invoice }, 'Refund issued');
};

// ---------------------------------------------------------------------------
// GET /refunds — List refunds, org-scoped, optionally filtered.
// ---------------------------------------------------------------------------

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
