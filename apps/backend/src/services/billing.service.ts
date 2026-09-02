/**
 * Billing Service — Invoice is the single source of truth for money owed.
 * Invariant: amountDue = amount - discount - amountPaid.
 */

import mongoose from 'mongoose';
import Invoice, { IInvoice } from '../models/invoice.model';
import Payment, { IPayment } from '../models/payment.model';
import Student from '../models/student.model';
import User from '../models/user.model';
import CashSession from '../models/cash-session.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';

type Id = mongoose.Types.ObjectId | string;
const invoiceDiscount = { $ifNull: ['$discount', 0] };
const invoicePaid = { $ifNull: ['$amountPaid', 0] };

export async function recalcStudentBalance(studentId: Id): Promise<void> {
  const invoices = await Invoice.find({ student: studentId, status: { $ne: 'void' } }).select('amount discount amountPaid').lean();
  const totalFeesPaid = invoices.reduce((sum, inv: any) => sum + (inv.amountPaid || 0), 0);
  const totalFeesDue = invoices.reduce((sum, inv: any) => sum + Math.max(0, (inv.amount || 0) - (inv.discount || 0) - (inv.amountPaid || 0)), 0);
  await Student.findByIdAndUpdate(studentId, { totalFeesPaid, totalFeesDue });
}

export async function applyInvoicePayment(invoiceId: Id, amount: number, discount = 0): Promise<IInvoice> {
  const cash = Number(amount);
  const waiver = Number(discount || 0);
  if (!Number.isFinite(cash) || cash <= 0) throw new BadRequestError('Payment amount must be greater than zero');
  if (!Number.isFinite(waiver) || waiver < 0) throw new BadRequestError('Discount must be zero or greater');
  if (waiver > cash) throw new BadRequestError('Discount cannot exceed payment amount');
  const effectiveCash = cash - waiver;
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId, status: { $ne: 'void' }, $expr: { $lte: [{ $add: [{ $add: [invoicePaid, effectiveCash] }, { $add: [invoiceDiscount, waiver] }] }, { $add: ['$amount', 0.001] }] } },
    [
      { $set: { amountPaid: { $add: [invoicePaid, effectiveCash] }, discount: { $add: [invoiceDiscount, waiver] } } },
      { $set: { status: { $cond: [{ $gte: [{ $add: ['$amountPaid', { $ifNull: ['$discount', 0] }] }, '$amount'] }, 'paid', { $cond: [{ $gt: [{ $add: ['$amountPaid', { $ifNull: ['$discount', 0] }] }, 0] }, 'partial', 'pending'] }] } } },
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
    { _id: invoiceId, $expr: { $gte: [invoicePaid, cash] } },
    [
      { $set: { amountPaid: { $subtract: [invoicePaid, cash] } } },
      { $set: { status: { $cond: [{ $eq: ['$status', 'void'] }, 'void', { $cond: [{ $gte: [{ $add: ['$amountPaid', { $ifNull: ['$discount', 0] }] }, '$amount'] }, 'paid', { $cond: [{ $gt: [{ $add: ['$amountPaid', { $ifNull: ['$discount', 0] }] }, 0] }, 'partial', 'pending'] }] }] } } },
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

export async function restoreInvoicePayment(invoiceId: Id, amount: number): Promise<IInvoice> {
  const cash = Number(amount);
  if (!Number.isFinite(cash) || cash <= 0) throw new BadRequestError('Restore amount must be greater than zero');
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId, status: { $ne: 'void' } },
    [
      { $set: { amountPaid: { $add: [invoicePaid, cash] } } },
      { $set: { status: { $cond: [{ $gte: [{ $add: ['$amountPaid', { $ifNull: ['$discount', 0] }] }, '$amount'] }, 'paid', { $cond: [{ $gt: [{ $add: ['$amountPaid', { $ifNull: ['$discount', 0] }] }, 0] }, 'partial', 'pending'] }] } } },
    ],
    { new: true }
  );
  if (!updated) throw new NotFoundError('Invoice');
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

export async function collectPaymentService(params: CollectPaymentParams): Promise<{ payment: IPayment; invoice: IInvoice }> {
  const { studentId, schoolId, amount, discount = 0, currency = 'USD', method = 'cash', type, notes, reference, recordedBy, idempotencyKey } = params;
  const cash = Number(amount);
  const waiver = Number(discount || 0);
  if (!Number.isFinite(cash) || cash <= 0) throw new BadRequestError('A valid amount is required');
  if (!Number.isFinite(waiver) || waiver < 0 || waiver > cash) throw new BadRequestError('Discount must be between zero and the payment amount');
  if (cash - waiver <= 0) throw new BadRequestError('A payment must have a positive amount after discount');
  if (!/^[A-Z]{3}$/.test(String(currency).toUpperCase())) throw new BadRequestError('Currency must be a 3-letter ISO code');

  let cashSessionId: mongoose.Types.ObjectId | undefined;
  if (String(method).toLowerCase() === 'cash') {
    const operator = await User.findById(recordedBy).select('role organizationId').lean();
    if (operator?.role === 'cashier') {
      if (!schoolId) throw new BadRequestError('Cashier payments require an organization/school');
      const session = await CashSession.findOne({ cashier: recordedBy, school: schoolId, status: 'open' });
      if (!session) throw new BadRequestError('Open cash session required before accepting cash payments');
      cashSessionId = session._id as mongoose.Types.ObjectId;
    }
  }

  if (idempotencyKey) {
    const existing = await Payment.findOne({ idempotencyKey });
    if (existing) {
      const existingInvoice = existing.invoice ? await Invoice.findById(existing.invoice) : null;
      if (existingInvoice) return { payment: existing, invoice: existingInvoice };
      throw new BadRequestError('This idempotency key is already associated with an invalid payment record');
    }
  }

  let invoice: IInvoice;
  let createdAdHocInvoice = false;
  if (params.invoiceId) {
    const found = await Invoice.findById(params.invoiceId);
    if (!found) throw new NotFoundError('Invoice');
    if (found.status === 'void') throw new BadRequestError('Cannot collect payment on a voided invoice');
    if (found.student.toString() !== studentId.toString()) throw new BadRequestError('Invoice does not belong to the selected student');
    invoice = found;
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

  try {
    const payment = await Payment.create({
      student: studentId,
      school: schoolId || updatedInvoice.school || null,
      cashSession: cashSessionId,
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
    await recalcStudentBalance(studentId);
    return { payment, invoice: updatedInvoice };
  } catch (err: any) {
    const isIdempotencyRace = err.code === 11000 && idempotencyKey && err.keyPattern?.idempotencyKey;
    if (isIdempotencyRace) {
      if (createdAdHocInvoice) await Invoice.findByIdAndDelete(updatedInvoice._id).catch(() => {});
      else {
        await reverseInvoicePayment(updatedInvoice._id as mongoose.Types.ObjectId, cash - waiver).catch(() => {});
        if (waiver > 0) await Invoice.findByIdAndUpdate(updatedInvoice._id, { $inc: { discount: -waiver } }).catch(() => {});
      }
      const winner = await Payment.findOne({ idempotencyKey });
      if (!winner) throw err;
      const winnerInvoice = winner.invoice ? await Invoice.findById(winner.invoice) : null;
      if (!winnerInvoice) throw new BadRequestError('Idempotent payment exists but its invoice is missing');
      return { payment: winner, invoice: winnerInvoice };
    }
    if (createdAdHocInvoice) await Invoice.findByIdAndDelete(updatedInvoice._id).catch(() => {});
    else {
      await reverseInvoicePayment(updatedInvoice._id as mongoose.Types.ObjectId, cash - waiver).catch(() => {});
      if (waiver > 0) await Invoice.findByIdAndUpdate(updatedInvoice._id, { $inc: { discount: -waiver } }).catch(() => {});
    }
    throw err;
  }
}
