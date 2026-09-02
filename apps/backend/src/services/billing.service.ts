/**
 * Billing Service — Invoice is the single source of truth for money owed.
 *
 * Payment amounts remain immutable. Invoice discounts are tracked separately
 * from cash received, so the invariant is always:
 *
 *   amountDue = amount - discount - amountPaid
 *
 * All invoice balance mutations use atomic single-document updates because
 * this deployment currently runs MongoDB without a replica set.
 */

import mongoose from 'mongoose';
import Invoice, { IInvoice } from '../models/invoice.model';
import Payment, { IPayment } from '../models/payment.model';
import Student from '../models/student.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';

type Id = mongoose.Types.ObjectId | string;

export async function recalcStudentBalance(studentId: Id): Promise<void> {
  const invoices = await Invoice.find({ student: studentId, status: { $ne: 'void' } })
    .select('amount discount amountPaid')
    .lean();

  const totalFeesPaid = invoices.reduce((sum, inv: any) => sum + (inv.amountPaid || 0), 0);
  const totalFeesDue = invoices.reduce(
    (sum, inv: any) => sum + Math.max(0, (inv.amount || 0) - (inv.discount || 0) - (inv.amountPaid || 0)),
    0
  );

  await Student.findByIdAndUpdate(studentId, { totalFeesPaid, totalFeesDue });
}

/**
 * Apply cash received plus an optional invoice discount in one atomic update.
 * The guard prevents paid + discounted from exceeding the invoice total even
 * when two cashiers submit at the same time.
 */
export async function applyInvoicePayment(invoiceId: Id, amount: number, discount = 0): Promise<IInvoice> {
  const cash = Number(amount);
  const waiver = Number(discount || 0);
  if (!Number.isFinite(cash) || cash <= 0) throw new BadRequestError('Payment amount must be greater than zero');
  if (!Number.isFinite(waiver) || waiver < 0) throw new BadRequestError('Discount must be zero or greater');
  if (waiver > cash) throw new BadRequestError('Discount cannot exceed payment amount');

  const effectiveCash = cash - waiver;

  const updated = await Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      status: { $ne: 'void' },
      $expr: {
        $lte: [
          { $add: [{ $add: ['$amountPaid', effectiveCash] }, { $add: ['$discount', waiver] }] },
          { $add: ['$amount', 0.001] },
        ],
      },
    },
    [
      {
        $set: {
          amountPaid: { $add: ['$amountPaid', effectiveCash] },
          discount: { $add: ['$discount', waiver] },
        },
      },
      {
        $set: {
          status: {
            $cond: [
              { $gte: [{ $add: ['$amountPaid', '$discount'] }, '$amount'] },
              'paid',
              {
                $cond: [{ $gt: [{ $add: ['$amountPaid', '$discount'] }, 0] }, 'partial', 'pending'],
              },
            ],
          },
        },
      },
    ],
    { new: true }
  );

  if (!updated) {
    const fresh = await Invoice.findById(invoiceId);
    if (!fresh) throw new NotFoundError('Invoice');
    if (fresh.status === 'void') throw new BadRequestError('Cannot collect payment on a voided invoice');
    const remaining = Math.max(0, fresh.amount - (fresh.discount || 0) - (fresh.amountPaid || 0));
    throw new BadRequestError(`Amount exceeds remaining balance of ${remaining}`);
  }

  return updated;
}

export async function reverseInvoicePayment(invoiceId: Id, amount: number): Promise<IInvoice> {
  const cash = Number(amount);
  if (!Number.isFinite(cash) || cash <= 0) throw new BadRequestError('Refund amount must be greater than zero');

  const updated = await Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      $expr: { $gte: ['$amountPaid', cash] },
    },
    [
      { $set: { amountPaid: { $subtract: ['$amountPaid', cash] } } },
      {
        $set: {
          status: {
            $cond: [
              { $eq: ['$status', 'void'] },
              'void',
              {
                $cond: [
                  { $gte: [{ $add: ['$amountPaid', '$discount'] }, '$amount'] },
                  'paid',
                  {
                    $cond: [{ $gt: [{ $add: ['$amountPaid', '$discount'] }, 0] }, 'partial', 'pending'],
                  },
                ],
              },
            ],
          },
        },
      },
    ],
    { new: true }
  );

  if (!updated) {
    const fresh = await Invoice.findById(invoiceId);
    if (!fresh) throw new NotFoundError('Invoice');
    if (fresh.status === 'void') throw new BadRequestError('Cannot refund a payment on a voided invoice');
    throw new BadRequestError('Refund exceeds the cash amount currently applied to this invoice');
  }

  return updated;
}

export interface CollectPaymentParams {
  studentId: Id;
  schoolId?: Id | null;
  invoiceId?: Id | null;
  amount: number;
  discount?: number;
  currency?: string;
  method?: string;
  type?: string;
  notes?: string;
  reference?: string;
  recordedBy: Id;
  idempotencyKey?: string;
}

export async function collectPaymentService(
  params: CollectPaymentParams
): Promise<{ payment: IPayment; invoice: IInvoice }> {
  const {
    studentId,
    schoolId,
    amount,
    discount = 0,
    currency = 'USD',
    method = 'cash',
    type,
    notes,
    reference,
    recordedBy,
    idempotencyKey,
  } = params;

  const cash = Number(amount);
  const waiver = Number(discount || 0);
  if (!Number.isFinite(cash) || cash <= 0) throw new BadRequestError('A valid amount is required');
  if (!Number.isFinite(waiver) || waiver < 0 || waiver > cash) throw new BadRequestError('Discount must be between zero and the payment amount');
  if (cash - waiver <= 0) throw new BadRequestError('A payment must have a positive amount after discount');
  if (!/^[A-Z]{3}$/.test(String(currency).toUpperCase())) throw new BadRequestError('Currency must be a 3-letter ISO code');

  // Idempotent replay: return the original financial result before creating
  // another invoice or touching any balance.
  if (idempotencyKey) {
    const existing = await Payment.findOne({ idempotencyKey });
    if (existing) {
      const existingInvoice = existing.invoice ? await Invoice.findById(existing.invoice) : null;
      if (existingInvoice) return { payment: existing, invoice: existingInvoice };
      throw new BadRequestError('This idempotency key is already associated with an invalid payment record');
    }
  }

  let invoice: IInvoice | null;
  let createdAdHocInvoice = false;

  if (params.invoiceId) {
    invoice = await Invoice.findById(params.invoiceId);
    if (!invoice) throw new NotFoundError('Invoice');
    if (invoice.status === 'void') throw new BadRequestError('Cannot collect payment on a voided invoice');
    if (invoice.student.toString() !== studentId.toString()) {
      throw new BadRequestError('Invoice does not belong to the selected student');
    }
  } else {
    invoice = await Invoice.create({
      student: studentId,
      school: schoolId || null,
      feeStructure: null,
      title: 'Ad-hoc Payment',
      period: `walk-in-${new Date().toISOString().slice(0, 10)}-${new mongoose.Types.ObjectId().toHexString().slice(-6)}`,
      lineItems: [{ description: (notes && notes.trim()) || 'Ad-hoc payment', amount: cash }],
      amount: cash,
      discount: 0,
      amountPaid: 0,
      status: 'pending',
      paymentType: (type as IInvoice['paymentType']) || 'tuition',
      dueDate: new Date(),
      issueDate: new Date(),
      generatedBy: recordedBy,
    });
    createdAdHocInvoice = true;
  }

  let updatedInvoice: IInvoice;
  try {
    updatedInvoice = await applyInvoicePayment(invoice._id as mongoose.Types.ObjectId, cash, waiver);
  } catch (err) {
    if (createdAdHocInvoice) await Invoice.findByIdAndDelete(invoice._id).catch(() => {});
    throw err;
  }

  let payment: IPayment;
  try {
    payment = await Payment.create({
      student: studentId,
      school: schoolId || updatedInvoice.school || null,
      amount: cash,
      discount: waiver,
      refundedAmount: 0,
      currency: String(currency).toUpperCase(),
      type: type || updatedInvoice.paymentType,
      method,
      status: 'completed',
      notes: notes || '',
      reference: reference || '',
      recordedBy,
      invoice: updatedInvoice._id,
      idempotencyKey: idempotencyKey || undefined,
    });
  } catch (err: any) {
    const isIdempotencyRace = err.code === 11000 && idempotencyKey && err.keyPattern?.idempotencyKey;

    if (isIdempotencyRace) {
      if (createdAdHocInvoice) {
        await Invoice.findByIdAndDelete(updatedInvoice._id).catch(() => {});
      } else {
        await reverseInvoicePayment(updatedInvoice._id as mongoose.Types.ObjectId, cash - waiver).catch(() => {});
        if (waiver > 0) {
          await Invoice.findByIdAndUpdate(updatedInvoice._id, { $inc: { discount: -waiver } }).catch(() => {});
        }
      }
      const winner = await Payment.findOne({ idempotencyKey });
      if (!winner) throw err;
      const winnerInvoice = winner.invoice ? await Invoice.findById(winner.invoice) : null;
      if (!winnerInvoice) throw new BadRequestError('Idempotent payment exists but its invoice is missing');
      return { payment: winner, invoice: winnerInvoice };
    }

    // Payment creation failed, so remove exactly the financial changes this
    // request made. For an ad-hoc invoice, deleting the new invoice is safest.
    if (createdAdHocInvoice) {
      await Invoice.findByIdAndDelete(updatedInvoice._id).catch(() => {});
    } else {
      await reverseInvoicePayment(updatedInvoice._id as mongoose.Types.ObjectId, cash - waiver).catch(() => {});
      if (waiver > 0) {
        await Invoice.findByIdAndUpdate(updatedInvoice._id, { $inc: { discount: -waiver } }).catch(() => {});
      }
    }
    throw err;
  }

  await recalcStudentBalance(studentId);
  return { payment, invoice: updatedInvoice };
}
