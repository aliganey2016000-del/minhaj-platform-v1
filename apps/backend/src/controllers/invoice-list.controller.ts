import { Request, Response } from 'express';
import Invoice from '../models/invoice.model';
import Student from '../models/student.model';
import Profile from '../models/profile.model';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';
import { withComputedInvoiceFields } from '../services/billing.service';

const INVOICE_STATUSES = ['pending', 'partial', 'paid', 'void'];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * List invoices with amountDue/isOverdue computed explicitly (see
 * withComputedInvoiceFields — lean queries never execute schema virtuals).
 *
 * IMPORTANT: search is resolved at the database/filter level BEFORE skip/limit.
 * The old implementation paginated invoices first and only then searched the
 * current page. That meant a student with invoices spread across multiple
 * pages could appear to have only one (or a few) invoices when searched.
 */
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { page = '1', limit = '20', status, studentId, feeStructureId, classId, period, school, search } = req.query;

  const filter: Record<string, any> = {};
  if (status && INVOICE_STATUSES.includes(status as string)) filter.status = status;
  if (studentId) filter.student = studentId;
  if (feeStructureId) filter.feeStructure = feeStructureId;
  if (period) filter.period = period;
  if (school) filter.school = school;

  if (classId) {
    filter.student = { $in: await Student.find({ class: classId }).distinct('_id') };
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school') as Record<string, any>;
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  // Resolve student/name search BEFORE pagination. Student names live in
  // Profile, so first find matching profiles, then intersect with students
  // belonging to the same organization.
  const searchTerm = typeof search === 'string' ? search.trim() : '';
  if (searchTerm) {
    const regex = new RegExp(escapeRegex(searchTerm), 'i');
    const [matchingProfiles, matchingStudents] = await Promise.all([
      Profile.find({ $or: [{ firstName: regex }, { lastName: regex }] }).distinct('_id'),
      Student.find({ ...((scopedFilter.school ? { school: scopedFilter.school } : {})), studentId: regex }).distinct('_id'),
    ]);

    const nameStudentIds = matchingProfiles.length
      ? await Student.find({
          ...((scopedFilter.school ? { school: scopedFilter.school } : {})),
          profile: { $in: matchingProfiles },
        }).distinct('_id')
      : [];

    const candidateStudentIds = Array.from(new Set([
      ...matchingStudents.map(String),
      ...nameStudentIds.map(String),
    ]));

    const searchConditions: Record<string, any>[] = [
      { title: regex },
    ];
    if (candidateStudentIds.length > 0) {
      searchConditions.push({ student: { $in: candidateStudentIds } });
    }

    // Keep all existing filters (status, fee structure, class, school, etc.)
    // and add the search condition. This is then used for BOTH count and
    // paginated retrieval, so pagination never hides matching invoices.
    scopedFilter.$or = searchConditions;
  }

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

  const result = (invoices as any[]).map(withComputedInvoiceFields);

  return ApiResponse.paginated(res, result, {
    page: pageNum,
    limit: limitNum,
    total,
  });
};
