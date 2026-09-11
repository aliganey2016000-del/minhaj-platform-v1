import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Invoice from '../models/invoice.model';
import Payment from '../models/payment.model';
import ApiResponse from '../utils/api-response';
import { NotFoundError } from '../utils/api-error';
import { assertOwnsOrg } from '../utils/tenant-scope';

export const getOne = async (req: Request, res: Response): Promise<Response> => {
  const selected = await Invoice.findById(req.params.id)
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('feeStructure', 'title feeType')
    .populate('school', 'name')
    .lean();
  if (!selected) throw new NotFoundError('Invoice');
  assertOwnsOrg(req, selected, 'school');

  const studentId = selected.student && typeof selected.student === 'object' && '_id' in selected.student ? (selected.student as any)._id : selected.student;
  const schoolId = selected.school && typeof selected.school === 'object' && '_id' in selected.school ? (selected.school as any)._id : selected.school;

  // View Details is intentionally a student-level history view, not a
  // single-invoice view. Load every invoice belonging to the same student and
  // organization so the existing modal can render the complete history.
  const invoices = await Invoice.find({ student: studentId, school: schoolId })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('feeStructure', 'title feeType')
    .sort({ issueDate: -1, createdAt: -1 })
    .lean();

  const invoiceIds = invoices.map(inv => inv._id as mongoose.Types.ObjectId);
  const payments = invoiceIds.length
    ? await Payment.find({ invoice: { $in: invoiceIds } }).sort({ createdAt: -1 }).lean()
    : [];

  // Keep void invoices visible in the history, but do not count them toward
  // the student's current financial totals.
  const active = invoices.filter((inv: any) => inv.status !== 'void');
  const total = active.reduce((sum, inv: any) => sum + Number(inv.amount || 0), 0);
  const paid = active.reduce((sum, inv: any) => sum + Number(inv.amountPaid || 0), 0);
  const due = active.reduce(
    (sum, inv: any) => sum + Number(inv.amountDue ?? Math.max(0, Number(inv.amount || 0) - Number(inv.amountPaid || 0))),
    0,
  );
  const status = active.length > 0 && active.every((inv: any) => inv.status === 'paid')
    ? 'paid'
    : paid > 0
      ? 'partial'
      : 'pending';

  // The existing Invoice Details modal renders invoice.lineItems. Put one
  // clearly labelled history row into lineItems for every invoice, including
  // its individual paid/due values, so the complete history is visible even
  // though the modal was originally designed for a single invoice.
  const historyItems = invoices.map((inv: any) => {
    const amount = Number(inv.amount || 0);
    const amountPaid = Number(inv.amountPaid || 0);
    const amountDue = Number(inv.amountDue ?? Math.max(0, amount - amountPaid));
    const statusLabel = String(inv.status || 'pending').toUpperCase();
    return {
      description: `${inv.title} · ${inv.period} · ${statusLabel} · Paid $${amountPaid.toLocaleString()} · Due $${amountDue.toLocaleString()}`,
      amount,
    };
  });

  const historyInvoice: any = {
    ...selected,
    title: 'Student Invoice History',
    period: `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`,
    lineItems: historyItems,
    amount: total,
    amountPaid: paid,
    amountDue: due,
    status,
    installments: undefined,
    notes: `Showing all ${invoices.length} invoice${invoices.length === 1 ? '' : 's'} for this student. Void invoices remain visible for history but are excluded from current totals.`,
  };

  return ApiResponse.success(res, {
    invoice: historyInvoice,
    payments,
    invoices,
    history: { count: invoices.length, total, paid, due },
  });
};
