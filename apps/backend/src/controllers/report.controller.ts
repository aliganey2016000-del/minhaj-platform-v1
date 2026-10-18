import { Request, Response } from 'express';
import Payment from '../models/payment.model';
import Refund from '../models/refund.model';
import Invoice from '../models/invoice.model';
import Parent from '../models/parent.model';
import { BadRequestError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import { notifyUsers } from '../utils/notify';
import { castObjectIdFilter } from '../utils/cast-object-id-filter';
import { dateOnlyLabelInTimezone, todaySchoolDateOnly } from '../utils/school-date';

// Date filters use the school day (Africa/Mogadishu, UTC+3), not server UTC.
function parseRange(req: Request): { from: Date; to: Date } {
  const today = dateOnlyLabelInTimezone(new Date());
  const fromText = String(req.query.from || `${today.slice(0, 7)}-01`);
  const toText = String(req.query.to || today);
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T12:00:00+03:00`).getTime())
    && dateOnlyLabelInTimezone(new Date(`${value}T12:00:00+03:00`)) === value;
  if (!valid(fromText) || !valid(toText) || fromText > toText) throw new BadRequestError('Choose a valid from/to date range');
  return {
    from: new Date(`${fromText}T00:00:00.000+03:00`),
    to: new Date(`${toText}T23:59:59.999+03:00`),
  };
}

function dayKey(date: Date): string { return dateOnlyLabelInTimezone(date); }

async function invoiceIdsForPeriod(req: Request, period: unknown): Promise<unknown[] | undefined> {
  if (!period || !String(period).trim()) return undefined;
  return Invoice.find(applyOrgFilter(req, { period: String(period).trim() }, 'school')).distinct('_id');
}

/** Valid school-scoped billing periods for a real dropdown (no guessed semester labels). */
export const getBillingPeriods = async (req: Request, res: Response): Promise<Response> => {
  const values = await Invoice.distinct('period', applyOrgFilter(req, { status: { $ne: 'void' } }, 'school'));
  return ApiResponse.success(res, values.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).sort());
};

export const getCollectionReport = async (req: Request, res: Response): Promise<Response> => {
  const { from, to } = parseRange(req);
  const invoiceIds = await invoiceIdsForPeriod(req, req.query.period);
  const paymentFilter = applyOrgFilter(req, { status: 'completed', createdAt: { $gte: from, $lte: to }, ...(invoiceIds ? { invoice: { $in: invoiceIds } } : {}) }, 'school');
  const refundFilter = applyOrgFilter(req, { createdAt: { $gte: from, $lte: to }, status: 'completed', ...(invoiceIds ? { invoice: { $in: invoiceIds } } : {}) }, 'school');

  const [payments, refunds] = await Promise.all([
    Payment.find(paymentFilter).select('amount discount method type createdAt').lean(),
    Refund.find(refundFilter).select('amount createdAt').lean(),
  ]);

  const byDay = new Map<string, number>();
  const byMethod = new Map<string, number>();
  const byType = new Map<string, number>();
  let grossCollected = 0;

  for (const p of payments) {
    const net = Math.max(0, (p.amount || 0) - (p.discount || 0));
    grossCollected += net;
    const key = dayKey(new Date(p.createdAt));
    byDay.set(key, (byDay.get(key) || 0) + net);
    byMethod.set(p.method, (byMethod.get(p.method) || 0) + net);
    byType.set(p.type, (byType.get(p.type) || 0) + net);
  }

  let totalRefunded = 0;
  for (const r of refunds) {
    totalRefunded += r.amount || 0;
    const key = dayKey(new Date(r.createdAt));
    byDay.set(key, (byDay.get(key) || 0) - (r.amount || 0));
  }

  // Receivables are a current snapshot. The date range applies to collections,
  // while period (if selected) applies to both collections and outstanding invoices.
  const outstandingFilter = applyOrgFilter(req, {
    status: { $ne: 'void' },
    ...(req.query.period ? { period: String(req.query.period).trim() } : {}),
  }, 'school');
  const dueExpr = { $max: [0, { $subtract: [
    { $ifNull: ['$amount', 0] },
    { $add: [{ $ifNull: ['$discount', 0] }, { $ifNull: ['$amountPaid', 0] }] },
  ] }] };
  const [outstandingSummary] = await Invoice.aggregate([
    { $match: castObjectIdFilter(outstandingFilter, ['school']) },
    { $project: { due: dueExpr, dueDate: 1 } },
    { $group: {
      _id: null,
      totalOutstanding: { $sum: '$due' },
      overdueOutstanding: { $sum: { $cond: [{ $lt: ['$dueDate', todaySchoolDateOnly()] }, '$due', 0] } },
      overdueCount: { $sum: { $cond: [{ $and: [{ $lt: ['$dueDate', todaySchoolDateOnly()] }, { $gt: ['$due', 0] }] }, 1, 0] } },
    } },
  ]);

  const totalCollected = grossCollected - totalRefunded;
  return ApiResponse.success(res, {
    totalOutstanding: outstandingSummary?.totalOutstanding || 0,
    overdueOutstanding: outstandingSummary?.overdueOutstanding || 0,
    overdueCount: outstandingSummary?.overdueCount || 0,
    from: from.toISOString(),
    to: to.toISOString(),
    totalCollected,
    grossCollected,
    totalRefunded,
    netCollected: totalCollected,
    transactionCount: payments.length,
    refundCount: refunds.length,
    byDay: Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount })),
    byMethod: Array.from(byMethod.entries()).map(([method, amount]) => ({ method, amount })),
    byType: Array.from(byType.entries()).map(([type, amount]) => ({ type, amount })),
  });
};

export const getCashierReconciliation = async (req: Request, res: Response): Promise<Response> => {
  const { from, to } = parseRange(req);
  const invoiceIds = await invoiceIdsForPeriod(req, req.query.period);
  const paymentFilter = applyOrgFilter(req, { status: 'completed', createdAt: { $gte: from, $lte: to }, ...(invoiceIds ? { invoice: { $in: invoiceIds } } : {}) }, 'school');
  const refundFilter = applyOrgFilter(req, { status: 'completed', createdAt: { $gte: from, $lte: to }, ...(invoiceIds ? { invoice: { $in: invoiceIds } } : {}) }, 'school');

  const [payments, refunds] = await Promise.all([
    Payment.find(paymentFilter).select('amount discount method recordedBy createdAt').populate('recordedBy', 'email').lean(),
    Refund.find(refundFilter).select('amount processedBy createdAt').populate('processedBy', 'email').lean(),
  ]);

  const byCashier = new Map<string, { email: string; count: number; total: number; refunded: number; byMethod: Map<string, number> }>();
  for (const p of payments) {
    const net = Math.max(0, (p.amount || 0) - (p.discount || 0));
    const cashierId = (p.recordedBy as any)?._id?.toString() || 'unknown';
    const email = (p.recordedBy as any)?.email || 'Unknown';
    if (!byCashier.has(cashierId)) byCashier.set(cashierId, { email, count: 0, total: 0, refunded: 0, byMethod: new Map() });
    const entry = byCashier.get(cashierId)!;
    entry.count += 1;
    entry.total += net;
    entry.byMethod.set(p.method, (entry.byMethod.get(p.method) || 0) + net);
  }

  // Refunds are attributed to the user who processed the refund, not the
  // original cashier, so accountability remains faithful to the audit trail.
  for (const r of refunds) {
    const cashierId = (r.processedBy as any)?._id?.toString() || 'unknown';
    const email = (r.processedBy as any)?.email || 'Unknown';
    if (!byCashier.has(cashierId)) byCashier.set(cashierId, { email, count: 0, total: 0, refunded: 0, byMethod: new Map() });
    byCashier.get(cashierId)!.refunded += r.amount || 0;
  }

  const result = Array.from(byCashier.entries()).map(([cashierId, entry]) => ({
    cashierId,
    email: entry.email,
    transactionCount: entry.count,
    totalCollected: entry.total,
    totalRefunded: entry.refunded,
    netCollected: entry.total - entry.refunded,
    byMethod: Array.from(entry.byMethod.entries()).map(([method, amount]) => ({ method, amount })),
  }));

  return ApiResponse.success(res, { from: from.toISOString(), to: to.toISOString(), cashiers: result });
};

export const getOverdueInvoices = async (req: Request, res: Response): Promise<Response> => {
  const filter = applyOrgFilter(req, { status: { $in: ['pending', 'partial'] }, dueDate: { $lt: todaySchoolDateOnly() }, ...(req.query.period ? { period: String(req.query.period).trim() } : {}) }, 'school');
  const invoices = await Invoice.find(filter)
    .populate({ path: 'student', select: 'studentId', populate: { path: 'profile', select: 'firstName lastName' } })
    .populate('school', 'name')
    .sort({ dueDate: 1 })
    .lean({ virtuals: true });
  return ApiResponse.success(res, invoices);
};

export const sendOverdueReminders = async (req: Request, res: Response): Promise<Response> => {
  const period = String(req.body?.period || '').trim();
  const filter = applyOrgFilter(req, { status: { $in: ['pending', 'partial'] }, dueDate: { $lt: todaySchoolDateOnly() }, ...(period ? { period } : {}) }, 'school');
  const invoices = await Invoice.find(filter).populate({ path: 'student', select: 'studentId user parent' }).lean();
  if (invoices.length === 0) return ApiResponse.success(res, { remindersSent: 0 }, 'No overdue invoices found');

  const parentIds = invoices.map((inv: any) => inv.student?.parent).filter(Boolean);
  const parents = parentIds.length > 0 ? await Parent.find({ _id: { $in: parentIds } }).select('user').lean() : [];
  const parentUserById = new Map(parents.map((p: any) => [p._id.toString(), p.user?.toString()]));

  let remindersSent = 0;
  for (const inv of invoices as any[]) {
    const remaining = Math.max(0, inv.amount - (inv.discount || 0) - inv.amountPaid);
    const recipients: string[] = [];
    if (inv.student?.user) recipients.push(inv.student.user.toString());
    const parentUserId = inv.student?.parent ? parentUserById.get(inv.student.parent.toString()) : undefined;
    if (parentUserId) recipients.push(parentUserId);
    if (recipients.length === 0) continue;

    await notifyUsers(recipients, {
      title: 'Payment overdue',
      message: `"${inv.title}" (${remaining.toLocaleString()} remaining) was due ${new Date(inv.dueDate).toLocaleDateString()} and is now overdue. Please settle it as soon as possible.`,
      type: 'warning',
      link: '/payments/fees',
    });
    remindersSent++;
  }

  return ApiResponse.success(res, { remindersSent, overdueCount: invoices.length }, `Sent reminders for ${remindersSent} invoice(s)`);
};

export const exportReport = async (req: Request, res: Response): Promise<void> => {
  const type = req.query.type as string;

  if (type === 'collection') {
    const { from, to } = parseRange(req);
    const invoiceIds = await invoiceIdsForPeriod(req, req.query.period);
    const filter = applyOrgFilter(req, { status: 'completed', createdAt: { $gte: from, $lte: to }, ...(invoiceIds ? { invoice: { $in: invoiceIds } } : {}) }, 'school');
    const refundFilter = applyOrgFilter(req, { status: 'completed', createdAt: { $gte: from, $lte: to }, ...(invoiceIds ? { invoice: { $in: invoiceIds } } : {}) }, 'school');
    const [payments, refunds] = await Promise.all([
      Payment.find(filter).select('amount discount method type createdAt').sort({ createdAt: 1 }).lean(),
      Refund.find(refundFilter).select('amount createdAt').sort({ createdAt: 1 }).lean(),
    ]);
    const headers = ['Date', 'Method', 'Type', 'Amount', 'Discount', 'Net Payment', 'Refunded', 'Net Cash'];
    const rows = payments.map((p) => [
      dayKey(new Date(p.createdAt)), p.method, p.type, p.amount, p.discount || 0,
      Math.max(0, (p.amount || 0) - (p.discount || 0)), 0, Math.max(0, (p.amount || 0) - (p.discount || 0)),
    ]);
    for (const r of refunds) rows.push([dayKey(new Date(r.createdAt)), 'refund', 'refund', 0, 0, 0, r.amount || 0, -(r.amount || 0)]);
    const buffer = buildXlsxBuffer(headers, rows, 'Collection Report');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=collection-report-${dayKey(from)}-to-${dayKey(to)}.xlsx`);
    res.end(buffer);
    return;
  }

  if (type === 'overdue') {
    const filter = applyOrgFilter(req, { status: { $in: ['pending', 'partial'] }, dueDate: { $lt: todaySchoolDateOnly() }, ...(req.query.period ? { period: String(req.query.period).trim() } : {}) }, 'school');
    const invoices = await Invoice.find(filter)
      .populate({ path: 'student', select: 'studentId', populate: { path: 'profile', select: 'firstName lastName' } })
      .sort({ dueDate: 1 }).lean({ virtuals: true });
    const headers = ['Student', 'Student ID', 'Invoice', 'Period', 'Gross', 'Discount', 'Paid', 'Amount Due', 'Due Date'];
    const rows = invoices.map((inv: any) => [
      inv.student?.profile ? `${inv.student.profile.firstName} ${inv.student.profile.lastName}` : '',
      inv.student?.studentId || '', inv.title, inv.period, inv.amount, inv.discount || 0, inv.amountPaid || 0,
      Math.max(0, inv.amount - (inv.discount || 0) - (inv.amountPaid || 0)), dayKey(new Date(inv.dueDate)),
    ]);
    const buffer = buildXlsxBuffer(headers, rows, 'Overdue Invoices');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=overdue-invoices-${dayKey(new Date())}.xlsx`);
    res.end(buffer);
    return;
  }

  if (type === 'reconciliation') {
    const { from, to } = parseRange(req);
    const invoiceIds = await invoiceIdsForPeriod(req, req.query.period);
    const filter = applyOrgFilter(req, { status: 'completed', createdAt: { $gte: from, $lte: to }, ...(invoiceIds ? { invoice: { $in: invoiceIds } } : {}) }, 'school');
    const refundsFilter = applyOrgFilter(req, { status: 'completed', createdAt: { $gte: from, $lte: to }, ...(invoiceIds ? { invoice: { $in: invoiceIds } } : {}) }, 'school');
    const [payments, refunds] = await Promise.all([
      Payment.find(filter).select('amount discount method recordedBy createdAt').populate('recordedBy', 'email').sort({ createdAt: 1 }).lean(),
      Refund.find(refundsFilter).select('amount processedBy createdAt').populate('processedBy', 'email').sort({ createdAt: 1 }).lean(),
    ]);
    const headers = ['Date', 'Cashier', 'Method', 'Amount', 'Discount', 'Net'];
    const rows: (string | number)[][] = payments.map((p) => [
      dayKey(new Date(p.createdAt)), (p.recordedBy as any)?.email || 'Unknown', p.method,
      p.amount, p.discount || 0, Math.max(0, (p.amount || 0) - (p.discount || 0)),
    ]);
    for (const refund of refunds) rows.push([
      dayKey(new Date(refund.createdAt)), (refund.processedBy as any)?.email || 'Unknown', 'refund',
      -refund.amount, 0, -refund.amount,
    ]);
    const buffer = buildXlsxBuffer(headers, rows, 'Cashier Reconciliation');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reconciliation-${dayKey(from)}-to-${dayKey(to)}.xlsx`);
    res.end(buffer);
    return;
  }

  throw new BadRequestError('type must be one of: collection, overdue, reconciliation');
};
