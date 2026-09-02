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
import DiscountGrant from '../models/discount-grant.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { postInvoiceToLedger, postPaymentToLedger } from './accounting.service';

type Id = mongoose.Types.ObjectId | string;
const invoiceDiscount = { $ifNull: ['$discount', 0] };
const invoicePaid = { $ifNull: ['$amountPaid', 0] };

// Invoice.amountDue/grossAmountDue/isOverdue are schema virtuals, which only
// run on hydrated documents — a .lean() query (used everywhere for list
// endpoints) never executes them, virtuals:true option or not, since this
// project has no lean-virtuals plugin installed. Any lean invoice response
// that needs these fields must compute them explicitly with this helper.
export function withComputedInvoiceFields<T extends { amount: number; discount?: number; amountPaid?: number; status: string; dueDate: Date | string }>(
  invoice: T
): T & { amountDue: number; grossAmountDue: number; isOverdue: boolean } {
  const amount = Number(invoice.amount || 0);
  const discount = Number(invoice.discount || 0);
  const amountPaid = Number(invoice.amountPaid || 0);
  return {
    ...invoice,
    amountDue: Math.max(0, amount - discount - amountPaid),
    grossAmountDue: Math.max(0, amount - amountPaid),
    isOverdue: invoice.status !== 'paid' && invoice.status !== 'void' && new Date(invoice.dueDate) < new Date(),
  };
}

export async function recalcStudentBalance(studentId: Id): Promise<void> {
  const invoices = await Invoice.find({ student: studentId, status: { $ne: 'void' } })
    .select('amount discount amountPaid school paymentType title issueDate generatedBy')
    .lean();
  const totalFees = invoices.reduce((sum, inv: any) => sum + (inv.amount || 0), 0);
  const totalFeesPaid = invoices.reduce((sum, inv: any) => sum + (inv.amountPaid || 0), 0);
  const totalFeesDue = invoices.reduce((sum, inv: any) => sum + Math.max(0, (inv.amount || 0) - (inv.discount || 0) - (inv.amountPaid || 0)), 0);

  // Balance recalculation is already called after invoice creation throughout
  // the billing flows, so it also serves as the safe reconciliation point for
  // any invoice that has not yet been represented in the double-entry ledger.
  // The accounting source key makes this idempotent.
  for (const invoice of invoices as any[]) {
    if (invoice.school && invoice.generatedBy) {
      await postInvoiceToLedger({
        schoolId: invoice.school,
        invoiceId: invoice._id,
        amount: invoice.amount,
        discount: invoice.discount || 0,
        paymentType: invoice.paymentType,
        description: `Invoice: ${invoice.title || 'Student fee'}`,
        postedBy: invoice.generatedBy,
        entryDate: invoice.issueDate,
      });
    }
  }

  await Student.findByIdAndUpdate(studentId, { totalFees, totalFeesPaid, totalFeesDue });
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

// A discount/waiver granted independently of collecting cash — e.g. a
// scholarship applied against an unpaid or partially-paid invoice. Same
// atomic-guard shape as applyInvoicePayment: the update only lands if the
// invoice still has enough remaining balance to absorb it, so two admins
// granting overlapping discounts on the same invoice can't push it negative.
export async function applyInvoiceDiscount(invoiceId: Id, amount: number): Promise<IInvoice> {
  const waiver = Number(amount);
  if (!Number.isFinite(waiver) || waiver <= 0) throw new BadRequestError('Discount amount must be greater than zero');
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId, status: { $ne: 'void' }, $expr: { $lte: [{ $add: [invoiceDiscount, waiver] }, { $subtract: [{ $add: ['$amount', 0.001] }, invoicePaid] }] } },
    [
      { $set: { discount: { $add: [invoiceDiscount, waiver] } } },
      { $set: { status: { $cond: [{ $gte: [{ $add: ['$amountPaid', '$discount'] }, '$amount'] }, 'paid', { $cond: [{ $gt: [{ $add: ['$amountPaid', '$discount'] }, 0] }, 'partial', 'pending'] }] } } },
    ],
    { new: true }
  );
  if (!updated) {
    const fresh = await Invoice.findById(invoiceId);
    if (!fresh) throw new NotFoundError('Invoice');
    if (fresh.status === 'void') throw new BadRequestError('Cannot apply a discount to a voided invoice');
    const remaining = Math.max(0, fresh.amount - (fresh.discount || 0) - (fresh.amountPaid || 0));
    throw new BadRequestError(`Discount exceeds remaining balance of ${remaining}`);
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

// ---------------------------------------------------------------------------
// Standing discounts — DiscountGrant is a recurring policy tied to a student
// (not an invoice), so it has to be looked up and applied every time a new
// invoice is generated, unlike FeeAdjustment which is applied once by hand.
// ---------------------------------------------------------------------------

export type ActiveGrantLite = { _id: mongoose.Types.ObjectId; valueType: 'fixed' | 'percent'; inputValue: number };

// One query for every student in a generation batch, keyed by studentId, so
// callers looping over many students (e.g. generateBulk) don't run a query
// per student.
export async function getActiveDiscountGrants(studentIds: Id[], onDate: Date = new Date()): Promise<Map<string, ActiveGrantLite[]>> {
  const grants = await DiscountGrant.find({
    student: { $in: studentIds },
    status: 'active',
    validFrom: { $lte: onDate },
    $or: [{ validUntil: null }, { validUntil: { $gte: onDate } }],
  }).select('_id student valueType inputValue').lean();

  const map = new Map<string, ActiveGrantLite[]>();
  for (const g of grants as any[]) {
    const key = g.student.toString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ _id: g._id, valueType: g.valueType, inputValue: g.inputValue });
  }
  return map;
}

// Stacks every active grant onto a gross amount: percent grants are summed
// and capped at 100%, fixed grants are summed on top of that, and the total
// is capped at grossAmount so a stack of grants can never push an invoice's
// discount past its own face value.
export function sumGrantDiscount(grants: ActiveGrantLite[] | undefined, grossAmount: number): { discount: number; grantIds: mongoose.Types.ObjectId[] } {
  if (!grants || grants.length === 0) return { discount: 0, grantIds: [] };
  let percentSum = 0;
  let fixedSum = 0;
  for (const g of grants) {
    if (g.valueType === 'percent') percentSum += g.inputValue;
    else fixedSum += g.inputValue;
  }
  percentSum = Math.min(percentSum, 100);
  const raw = (percentSum / 100) * grossAmount + fixedSum;
  const discount = Math.round(Math.min(raw, grossAmount) * 100) / 100;
  return { discount, grantIds: grants.map((g) => g._id) };
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
  paymentDate?: Date;
  recordedBy: Id;
  idempotencyKey?: string;
}

export async function collectPaymentService(params: CollectPaymentParams): Promise<{ payment: IPayment; invoice: IInvoice }> {
  const { studentId, schoolId, amount, discount = 0, currency = 'USD', method = 'cash', type, notes, reference, paymentDate, recordedBy, idempotencyKey } = params;
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
      ...(paymentDate ? { createdAt: paymentDate } : {}),
    });

    if (updatedInvoice.school) {
      await postPaymentToLedger({
        schoolId: updatedInvoice.school,
        paymentId: payment._id,
        amount: cash,
        discount: waiver,
        method,
        postedBy: recordedBy,
        entryDate: paymentDate,
      });
    }

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
