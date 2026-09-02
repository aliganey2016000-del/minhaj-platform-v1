import Payment from '../models/payment.model';
import Refund from '../models/refund.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg } from '../utils/tenant-scope';
import { reverseInvoicePayment, restoreInvoicePayment, recalcStudentBalance } from '../services/billing.service';
import { postRefundToLedger } from '../services/accounting.service';

export const issueRefund = async (req: any, res: any): Promise<any> => {
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

  const effectiveAmount = Math.max(0, payment.amount - (payment.discount || 0));
  const currentRefunded = payment.refundedAmount || 0;
  if (refundAmount > effectiveAmount - currentRefunded + 0.001) {
    throw new BadRequestError(`Refund exceeds refundable amount of ${Math.max(0, effectiveAmount - currentRefunded)}`);
  }

  const reserved = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      status: 'completed',
      $expr: {
        $lte: [
          { $add: [{ $ifNull: ['$refundedAmount', 0] }, refundAmount] },
          { $subtract: ['$amount', { $ifNull: ['$discount', 0] }] },
        ],
      },
    },
    { $inc: { refundedAmount: refundAmount } },
    { new: true }
  );

  if (!reserved) throw new BadRequestError('Refund exceeds the remaining refundable amount');

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
    await restoreInvoicePayment(payment.invoice, refundAmount).catch(() => {});
    await Payment.findByIdAndUpdate(payment._id, { $inc: { refundedAmount: -refundAmount } }).catch(() => {});
    throw err;
  }

  const fullyRefunded = reserved.refundedAmount >= effectiveAmount - 0.001;
  if (fullyRefunded) await Payment.findByIdAndUpdate(payment._id, { status: 'refunded' });

  if (payment.school) {
    try {
      await postRefundToLedger({
        schoolId: payment.school,
        refundId: refund._id,
        amount: refundAmount,
        method: payment.method,
        postedBy: req.user!.userId,
      });
    } catch (err) {
      // The financial operation is not considered complete if its ledger
      // entry cannot be posted. Roll back the business-state reservation so
      // a retry can safely attempt the refund again.
      await Payment.findByIdAndUpdate(payment._id, { $inc: { refundedAmount: -refundAmount }, $set: { status: 'completed' } }).catch(() => {});
      await restoreInvoicePayment(payment.invoice, refundAmount).catch(() => {});
      await Refund.findByIdAndDelete(refund._id).catch(() => {});
      throw err;
    }
  }

  await recalcStudentBalance(payment.student);
  return ApiResponse.created(res, { refund, invoice }, 'Refund issued');
};

export const getAll = async (req: any, res: any): Promise<any> => {
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
