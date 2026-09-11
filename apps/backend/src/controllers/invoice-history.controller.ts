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
  const invoices = await Invoice.find({ student: studentId, school: schoolId }).populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' }).populate('feeStructure', 'title feeType').sort({ issueDate: -1, createdAt: -1 }).lean();
  const invoiceIds = invoices.map(inv => inv._id as mongoose.Types.ObjectId);
  const payments = invoiceIds.length ? await Payment.find({ invoice: { $in: invoiceIds } }).sort({ createdAt: -1 }).lean() : [];

  const total = invoices.reduce((sum, inv: any) => sum + Number(inv.amount || 0), 0);
  const paid = invoices.reduce((sum, inv: any) => sum + Number(inv.amountPaid || 0), 0);
  const due = invoices.reduce((sum, inv: any) => sum + Number(inv.amountDue ?? Math.max(0, Number(inv.amount || 0) - Number(inv.amountPaid || 0))), 0);
  const active = invoices.filter((inv: any) => inv.status !== 'void');
  const status = active.length > 0 && active.every((inv: any) => inv.status === 'paid') ? 'paid' : paid > 0 ? 'partial' : 'pending';
  const historyItems = invoices.map((inv: any) => ({ description: `${inv.title} · ${inv.period} · ${String(inv.status).toUpperCase()}`, amount: Number(inv.amount || 0) }));

  const historyInvoice: any = { ...selected, title: 'Student Invoice History', period: `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`, lineItems: historyItems, amount: total, amountPaid: paid, amountDue: due, status, installments: undefined, notes: `Showing all ${invoices.length} invoice${invoices.length === 1 ? '' : 's'} for this student.` };
  return ApiResponse.success(res, { invoice: historyInvoice, payments, invoices, history: { count: invoices.length, total, paid, due } });
};
