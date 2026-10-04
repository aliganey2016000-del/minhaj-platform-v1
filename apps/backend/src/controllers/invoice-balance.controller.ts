import { Request, Response } from 'express';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';
import { escapeRegex } from '../utils/escape-regex';
import { castObjectIdFilter } from '../utils/cast-object-id-filter';

/**
 * Invoice-derived student balances.
 *
 * Invoice is the financial source of truth. Student.totalFeesPaid and
 * Student.totalFeesDue are denormalized caches, so this endpoint deliberately
 * derives the numbers from non-void invoices. That prevents newly generated
 * invoices from appearing as $0 in Student Balances before a payment happens.
 *
 * Pagination, search and the outstanding-only filter are all pushed into a
 * single aggregation (rather than loading every matching student plus every
 * one of their invoices into Node and paginating in memory) so the response
 * time and payload no longer grow with the size of the whole roster.
 */
export const getStudentBalances = async (req: Request, res: Response): Promise<Response> => {
  const { search, classId, sort = 'due', page = '1', limit = '20', outstandingOnly } = req.query;

  const studentFilter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');
  studentFilter.status = { $in: ['active', 'inactive'] };
  studentFilter.approvalStatus = 'approved';
  if (classId) studentFilter.class = classId;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));
  const matchStage = castObjectIdFilter(studentFilter, ['school', 'class']);

  const postJoinMatch: Record<string, unknown>[] = [];
  if (outstandingOnly === 'true') {
    postJoinMatch.push({ totalFeesDue: { $gt: 0 } });
  }
  if (search) {
    const regex = new RegExp(escapeRegex(search as string), 'i');
    postJoinMatch.push({
      $or: [{ studentId: regex }, { fullName: regex }],
    });
  }

  const [facetResult] = await Student.aggregate([
    { $match: matchStage },
    { $lookup: { from: 'profiles', localField: 'profile', foreignField: '_id', as: 'profileDoc' } },
    { $unwind: { path: '$profileDoc', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'invoices',
        let: { studentId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$student', '$$studentId'] }, status: { $ne: 'void' } } },
          {
            $group: {
              _id: null,
              totalFees: { $sum: { $ifNull: ['$amount', 0] } },
              totalDiscount: { $sum: { $ifNull: ['$discount', 0] } },
              totalPaid: { $sum: { $ifNull: ['$amountPaid', 0] } },
            },
          },
        ],
        as: 'invoiceTotals',
      },
    },
    { $unwind: { path: '$invoiceTotals', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        fullName: { $concat: [{ $ifNull: ['$profileDoc.firstName', ''] }, ' ', { $ifNull: ['$profileDoc.lastName', ''] }] },
        totalFees: { $ifNull: ['$invoiceTotals.totalFees', 0] },
        discount: { $ifNull: ['$invoiceTotals.totalDiscount', 0] },
        totalFeesPaid: { $ifNull: ['$invoiceTotals.totalPaid', 0] },
        totalFeesDue: {
          $max: [
            0,
            {
              $subtract: [
                { $ifNull: ['$invoiceTotals.totalFees', 0] },
                { $add: [{ $ifNull: ['$invoiceTotals.totalDiscount', 0] }, { $ifNull: ['$invoiceTotals.totalPaid', 0] }] },
              ],
            },
          ],
        },
      },
    },
    ...(postJoinMatch.length ? [{ $match: postJoinMatch.length === 1 ? postJoinMatch[0] : { $and: postJoinMatch } }] : []),
    {
      $facet: {
        data: [
          { $sort: sort === 'paid' ? { totalFeesPaid: -1 as const } : { totalFeesDue: -1 as const } },
          { $skip: (pageNum - 1) * limitNum },
          { $limit: limitNum },
          {
            $project: {
              _id: 1,
              studentId: 1,
              school: 1,
              class: 1,
              status: 1,
              totalFees: 1,
              discount: 1,
              totalFeesPaid: 1,
              totalFeesDue: 1,
              profile: { firstName: '$profileDoc.firstName', lastName: '$profileDoc.lastName' },
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
        totals: [
          {
            $group: {
              _id: null,
              aggregateFees: { $sum: '$totalFees' },
              aggregatePaid: { $sum: '$totalFeesPaid' },
              aggregateDue: { $sum: '$totalFeesDue' },
            },
          },
        ],
      },
    },
  ]);

  const dataRows: any[] = facetResult?.data || [];
  const total = facetResult?.totalCount?.[0]?.count || 0;
  const totalsRow = facetResult?.totals?.[0];
  const aggregateFees = totalsRow?.aggregateFees || 0;
  const aggregatePaid = totalsRow?.aggregatePaid || 0;
  const aggregateDue = totalsRow?.aggregateDue || 0;

  // school/class need to stay populated objects ({_id, name}/{_id, title,
  // section}) to match the previous response shape, which $lookup alone
  // doesn't give us cheaply inline — populate just this page's rows.
  const populated = dataRows.length
    ? await Student.populate(dataRows, [
        { path: 'school', select: 'name' },
        { path: 'class', select: 'title section' },
      ])
    : dataRows;

  const result = populated.map((student: any) => ({
    _id: student._id,
    studentId: student.studentId,
    profile: student.profile,
    school: student.school,
    class: student.class,
    totalFees: student.totalFees,
    discount: student.discount || 0,
    totalFeesPaid: student.totalFeesPaid,
    totalFeesDue: student.totalFeesDue,
    status: student.status,
  }));

  return ApiResponse.success(res, {
    students: result,
    summary: {
      totalStudents: total,
      aggregateFees,
      aggregatePaid,
      aggregateDue,
      collectionRate: aggregateFees > 0 ? Math.round((aggregatePaid / aggregateFees) * 100) : 0,
    },
    meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  });
};
