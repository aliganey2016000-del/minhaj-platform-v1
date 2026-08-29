/**
 * Billing Service — Invoice is the single source of truth for money owed.
 *
 * Every code path that records a payment or a refund must go through the
 * functions here. This is the ONLY place that writes Student.totalFeesPaid /
 * totalFeesDue (always derived from that student's own Invoices), and the
 * only place that mutates Invoice.amountPaid (always via an atomic
 * single-document update — this app's MongoDB runs standalone with no
 * replica set, so multi-document transactions are not available; safety
 * comes from atomic $inc-style updates + a unique idempotency-key index
 * instead, matching the rest of this codebase's convention).
 */

import mongoose from 'mongoose';
import Invoice, { IInvoice } from '../models/invoice.model';
import Payment, { IPayment } from '../models/payment.model';
import Student from '../models/student.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';

type Id = mongoose.Types.ObjectId | string;

// ---------------------------------------------------------------------------
// recalcStudentBalance — the ONLY writer of Student.totalFeesPaid/totalFeesDue.
// Pure rollup of that student's non-void invoices; never reads Payment.
// ---------------------------------------------------------------------------

export async function recalcStudentBalance(studentId: Id): Promise<void> {
  const invoices = await Invoice.find({ student: studentId, status: { $ne: 'void' } })
    .select('amount amountPaid')
    .lean();

  const totalFeesPaid = invoices.reduce((sum, inv: any) => sum + (inv.amountPaid || 0), 0);
  const totalFeesDue = invoices.reduce(
    (sum, inv: any) => sum + Math.max(0, (inv.amount || 0) - (inv.amountPaid || 0)),
    0
  );

  await Student.findByIdAndUpdate(studentId, { totalFeesPaid, totalFeesDue });
}

// ---------------------------------------------------------------------------
// applyInvoicePayment — atomically increments amountPaid, guarded so it can
// never push the invoice past its own total even under a concurrent race.
// ---------------------------------------------------------------------------

export async function applyInvoicePayment(invoiceId: Id, amount: number): Promise<IInvoice> {
  const updated = await Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      status: { $ne: 'void' },
      $expr: { $lte: [{ $add: ['$amountPaid', amount] }, { $add: ['$amount', 0.001] }] },
    },
    [
      {
        $set: {
          amountPaid: { $add: ['$amountPaid', amount] },
          status: {
            $cond: [{ $gte: [{ $add: ['$amountPaid', amount] }, '$amount'] }, 'paid', 'partial'],
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
    const remaining = fresh.amount - fresh.amountPaid;
    throw new BadRequestError(`Amount exceeds remaining balance of ${remaining}`);
  }

  return updated;
}

// ---------------------------------------------------------------------------
// reverseInvoicePayment — atomically decrements amountPaid for a refund,
// clamped at 0. Recomputes status down through partial/pending; never
// resurrects 'void' or auto-flips back to 'paid'.
// ---------------------------------------------------------------------------

export async function reverseInvoicePayment(invoiceId: Id, amount: number): Promise<IInvoice> {
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId },
    [
      { $set: { amountPaid: { $max: [0, { $subtract: ['$amountPaid', amount] }] } } },
      {
        $set: {
          status: {
            $cond: [
              { $eq: ['$status', 'void'] },
              'void',
              {
                $cond: [
                  { $lte: ['$amountPaid', 0] },
                  'pending',
                  { $cond: [{ $gte: ['$amountPaid', '$amount'] }, 'paid', 'partial'] },
                ],
              },
            ],
          },
        },
      },
    ],
    { new: true }
  );

  if (!updated) throw new NotFoundError('Invoice');
  return updated;
}

// ---------------------------------------------------------------------------
// collectPaymentService — the single entry point for recording money
// received from a student, whether or not an invoice was picked ahead of
// time. Every new Payment ends up linked to an Invoice.
// ---------------------------------------------------------------------------

export interface CollectPaymentParams {
  studentId: Id;
  schoolId?: Id | null;
  invoiceId?: Id | null;
  amount: number;
  discount?: number;
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
  const { studentId, schoolId, amount, discount = 0, method = 'cash', type, notes, reference, recordedBy, idempotencyKey } = params;

  if (!amount || amount <= 0) throw new BadRequestError('A valid amount is required');

  // Idempotent replay: an earlier call with this exact key already succeeded.
  if (idempotencyKey) {
    const existing = await Payment.findOne({ idempotencyKey });
    if (existing) {
      const existingInvoice = existing.invoice ? await Invoice.findById(existing.invoice) : null;
      if (existingInvoice) return { payment: existing, invoice: existingInvoice };
    }
  }

  let invoice: IInvoice | null;
  if (params.invoiceId) {
    invoice = await Invoice.findById(params.invoiceId);
    if (!invoice) throw new NotFoundError('Invoice');
    if (invoice.status === 'void') throw new BadRequestError('Cannot collect payment on a voided invoice');
  } else {
    // Walk-in / ad-hoc payment with no pre-existing invoice — create a
    // minimal one so this payment still has a single source of truth to
    // live against, same as every other payment.
    invoice = await Invoice.create({
      student: studentId,
      school: schoolId || null,
      feeStructure: null,
      title: 'Ad-hoc Payment',
      period: `walk-in-${new Date().toISOString().slice(0, 10)}`,
      lineItems: [{ description: (notes && notes.trim()) || 'Ad-hoc payment', amount }],
      amount,
      amountPaid: 0,
      status: 'pending',
      paymentType: (type as IInvoice['paymentType']) || 'tuition',
      dueDate: new Date(),
      issueDate: new Date(),
      generatedBy: recordedBy,
    });
  }

  const updatedInvoice = await applyInvoicePayment(invoice._id as mongoose.Types.ObjectId, Number(amount));

  let payment: IPayment;
  try {
    payment = await Payment.create({
      student: studentId,
      school: schoolId || updatedInvoice.school || null,
      amount,
      discount,
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
    // A duplicate-key error can come from EITHER unique index on this model
    // (idempotencyKey OR receiptNumber) — err.keyPattern tells us which one
    // actually fired. Only treat it as "lost a race against an identical
    // concurrent retry" when it's really the idempotencyKey index; anything
    // else (a receiptNumber collision, a validation error, etc.) is a
    // genuine failure to create the Payment.
    const isIdempotencyRace = err.code === 11000 && idempotencyKey && err.keyPattern?.idempotencyKey;

    if (isIdempotencyRace) {
      // This call already bumped the invoice above — roll that back before
      // returning the winner, or the invoice would be double-counted.
      await reverseInvoicePayment(updatedInvoice._id as mongoose.Types.ObjectId, Number(amount));
      const winner = await Payment.findOne({ idempotencyKey });
      if (!winner) {
        // Shouldn't happen (something else must have created the colliding
        // key), but never report success with no actual Payment record.
        throw err;
      }
      const winnerInvoice = winner.invoice ? await Invoice.findById(winner.invoice) : updatedInvoice;
      return { payment: winner, invoice: (winnerInvoice as IInvoice) || updatedInvoice };
    }

    // Any other failure to create the Payment — the invoice was already
    // incremented above; reverse it so it doesn't stay desynced from the
    // fact that no Payment record actually exists for that amount.
    await reverseInvoicePayment(updatedInvoice._id as mongoose.Types.ObjectId, Number(amount)).catch(() => {});
    throw err;
  }

  await recalcStudentBalance(studentId);

  return { payment, invoice: updatedInvoice };
}
