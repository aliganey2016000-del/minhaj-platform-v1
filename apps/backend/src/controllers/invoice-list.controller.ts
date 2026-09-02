import { Request, Response } from 'express';
import Invoice from '../models/invoice.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';
import { withComputedInvoiceFields } from '../services/billing.service';

const INVOICE_STATUSES = ['pending', 'partial', 'paid', 'void'];

/**
 * List invoices with amountDue/isOverdue computed explicitly (see
 * withComputedInvoiceFields — lean queries never execute schema virtuals).
 */
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { page = '1', limit = '20', status, studentId, feeStructureId, classId, period, school, search } = req.query;

  const filter: Record<string, unknown> = {};
  if (status && INVOICE_STATUSES.includes(status as string)) filter.status = status;
  if (studentId) filter.student = studentId;
  if (feeStructureId) filter.feeStructure = feeStructureId;
  if (period) filter.period = period;
  if (school) filter.school = school;

  if (classId) {
    filter.student = { $in: await Student.find({ class: classId }).distinct('_id') };
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school');
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [invoices, total] = await Promise.all([
    Invoice.find(scopedFilter)
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
      .populate('feeStructure', 'title feeType')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Invoice.countDocuments(scopedFilter),
  ]);

  let result = (invoices as any[]).map(withComputedInvoiceFields);

  if (search) {
    const term = String(search).toLowerCase();
    result = result.filter((invoice: any) => {
      const name = `${invoice.student?.profile?.firstName || ''} ${invoice.student?.profile?.lastName || ''}`.toLowerCase();
      const sid = (invoice.student?.studentId || '').toLowerCase();
      const title = (invoice.title || '').toLowerCase();
      return name.includes(term) || sid.includes(term) || title.includes(term);
    });
  }

  return ApiResponse.paginated(res, result, {
    page: pageNum,
    limit: limitNum,
    total: search ? result.length : total,
  });
};
