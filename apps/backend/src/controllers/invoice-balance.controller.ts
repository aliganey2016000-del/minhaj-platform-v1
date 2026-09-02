import { Request, Response } from 'express';
import Invoice from '../models/invoice.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';
import { escapeRegex } from '../utils/escape-regex';

/**
 * Invoice-derived student balances.
 *
 * Invoice is the financial source of truth. Student.totalFeesPaid and
 * Student.totalFeesDue are denormalized caches, so this endpoint deliberately
 * derives the numbers from non-void invoices. That prevents newly generated
 * invoices from appearing as $0 in Student Balances before a payment happens.
 */
export const getStudentBalances = async (req: Request, res: Response): Promise<Response> => {
  const { search, classId, sort = 'due' } = req.query;

  const studentFilter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');
  studentFilter.status = { $in: ['active', 'inactive'] };
  studentFilter.approvalStatus = 'approved';
  if (classId) studentFilter.class = classId;

  const students = await Student.find(studentFilter)
    .populate('profile', 'firstName lastName')
    .populate('school', 'name')
    .populate('class', 'title section')
    .select('studentId profile school class discount status')
    .lean();

  const studentIds = students.map((student) => student._id);
  if (studentIds.length === 0) {
    return ApiResponse.success(res, {
      students: [],
      summary: { totalStudents: 0, aggregateFees: 0, aggregatePaid: 0, aggregateDue: 0, collectionRate: 0 },
    });
  }

  const invoiceTotals = await Invoice.aggregate([
    {
      $match: {
        student: { $in: studentIds },
        status: { $ne: 'void' },
      },
    },
    {
      $group: {
        _id: '$student',
        totalFees: { $sum: { $ifNull: ['$amount', 0] } },
        totalDiscount: { $sum: { $ifNull: ['$discount', 0] } },
        totalPaid: { $sum: { $ifNull: ['$amountPaid', 0] } },
      },
    },
  ]);

  const totals = new Map<string, { totalFees: number; totalDiscount: number; totalPaid: number }>();
  for (const row of invoiceTotals) {
    totals.set(String(row._id), {
      totalFees: Number(row.totalFees || 0),
      totalDiscount: Number(row.totalDiscount || 0),
      totalPaid: Number(row.totalPaid || 0),
    });
  }

  let result = students.map((student: any) => {
    const t = totals.get(String(student._id)) || { totalFees: 0, totalDiscount: 0, totalPaid: 0 };
    const totalDue = Math.max(0, t.totalFees - t.totalDiscount - t.totalPaid);
    return {
      _id: student._id,
      studentId: student.studentId,
      profile: student.profile,
      school: student.school,
      class: student.class,
      totalFees: t.totalFees,
      discount: t.totalDiscount || 0,
      totalFeesPaid: t.totalPaid,
      totalFeesDue: totalDue,
      status: student.status,
    };
  });

  if (search) {
    const regex = new RegExp(escapeRegex(search as string), 'i');
    result = result.filter((student: any) =>
      regex.test(student.studentId || '') ||
      regex.test(`${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`),
    );
  }

  result.sort((a, b) => sort === 'paid'
    ? b.totalFeesPaid - a.totalFeesPaid
    : b.totalFeesDue - a.totalFeesDue);

  const aggregateFees = result.reduce((sum, student) => sum + student.totalFees, 0);
  const aggregatePaid = result.reduce((sum, student) => sum + student.totalFeesPaid, 0);
  const aggregateDue = result.reduce((sum, student) => sum + student.totalFeesDue, 0);

  return ApiResponse.success(res, {
    students: result,
    summary: {
      totalStudents: result.length,
      aggregateFees,
      aggregatePaid,
      aggregateDue,
      collectionRate: aggregateFees > 0 ? Math.round((aggregatePaid / aggregateFees) * 100) : 0,
    },
  });
};
