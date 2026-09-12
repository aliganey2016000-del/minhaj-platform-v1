/**
 * Analytics Controller — Dashboard Stats
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/user.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import Payment from '../models/payment.model';
import Refund from '../models/refund.model';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';

export const getDashboardStats = async (req: Request, res: Response): Promise<Response> => {
  const studentFilter = applyOrgFilter(req, {}, 'school');
  const courseFilter = applyOrgFilter(req, {}, 'school');
  const userFilter = applyOrgFilter(req, {}, 'organizationId');

  const isOrgAdmin = req.user?.role === 'org_admin';
  const organizationId = req.user?.organizationId;
  const organizationObjectId = organizationId && mongoose.isValidObjectId(organizationId)
    ? new mongoose.Types.ObjectId(organizationId)
    : null;

  const revenuePaymentPipeline: mongoose.PipelineStage[] = [{ $match: { status: 'completed' } }];
  const revenueRefundPipeline: mongoose.PipelineStage[] = [{ $match: { status: 'completed' } }];

  if (isOrgAdmin && organizationObjectId) {
    revenuePaymentPipeline.push(
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: '_revenueStudent' } },
      { $match: { $or: [
        { school: organizationObjectId },
        { school: null, '_revenueStudent.school': organizationObjectId },
      ] } },
    );
    revenueRefundPipeline.push(
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: '_revenueStudent' } },
      { $match: { $or: [
        { school: organizationObjectId },
        { school: null, '_revenueStudent.school': organizationObjectId },
      ] } },
    );
  } else if (isOrgAdmin) {
    revenuePaymentPipeline.push({ $match: { _id: null } });
    revenueRefundPipeline.push({ $match: { _id: null } });
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    totalStudents,
    activeStudents,
    totalCourses,
    publishedCourses,
    totalTeachers,
    totalParents,
    recentRegistrations,
    revenuePayments,
    revenueRefunds,
    courseDistribution,
    monthlyRegistrations,
    enrollmentCount,
    enrollmentCapacity,
  ] = await Promise.all([
    Student.countDocuments(studentFilter),
    Student.countDocuments({ ...studentFilter, status: 'active' }),
    Course.countDocuments(courseFilter),
    Course.countDocuments({ ...courseFilter, status: 'published' }),
    User.countDocuments({ ...userFilter, role: 'teacher' }),
    User.countDocuments({ ...userFilter, role: 'parent' }),
    // Registration means a student registration, not creation of any User account.
    Student.countDocuments({ ...studentFilter, enrollmentDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    Payment.aggregate([
      ...revenuePaymentPipeline,
      { $group: { _id: null, total: { $sum: { $max: [0, { $subtract: ['$amount', { $ifNull: ['$discount', 0] }] }] } } } },
    ]).then((r) => r[0]?.total || 0),
    Refund.aggregate([
      ...revenueRefundPipeline,
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).then((r) => r[0]?.total || 0),
    // Always return a breakdown for all courses. Legacy records without a category
    // are grouped under "uncategorized" rather than disappearing from the chart.
    Course.aggregate([
      { $match: courseFilter },
      { $group: { _id: { $ifNull: ['$category', 'uncategorized'] }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
    // Use Student.enrollmentDate because this is the actual registration event.
    Student.aggregate([
      { $match: { ...studentFilter, enrollmentDate: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$enrollmentDate' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    // enrolledCourses is the current enrollment source used by enrollment.service.ts.
    Student.aggregate([
      { $match: { ...studentFilter, status: 'active' } },
      { $project: { enrolledCourses: { $ifNull: ['$enrolledCourses', []] } } },
      { $unwind: '$enrolledCourses' },
      { $count: 'total' },
    ]).then((r) => r[0]?.total || 0),
    Course.aggregate([
      { $match: courseFilter },
      { $group: { _id: null, total: { $sum: '$maxStudents' } } },
    ]).then((r) => r[0]?.total || 0),
  ]);

  const totalRevenue = Math.max(0, revenuePayments - revenueRefunds);

  // Always provide six monthly points, including zero months.
  const monthKeys: string[] = [];
  const cursor = new Date(sixMonthsAgo);
  for (let i = 0; i < 6; i += 1) {
    monthKeys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const registrationMap = new Map(monthlyRegistrations.map((m) => [m._id, m.count]));

  const totalEnrolled = Number(enrollmentCount || 0);
  const totalCapacity = Number(enrollmentCapacity || 0);
  const occupancyRate = totalCapacity > 0
    ? Math.min(100, Math.round((totalEnrolled / totalCapacity) * 100))
    : 0;

  return ApiResponse.success(res, {
    students: { total: totalStudents, active: activeStudents },
    courses: { total: totalCourses, published: publishedCourses },
    teachers: totalTeachers,
    parents: totalParents,
    recentRegistrations,
    totalRevenue,
    courseDistribution: courseDistribution.map((c) => ({
      category: c._id || 'uncategorized',
      count: c.count,
    })),
    monthlyRegistrations: monthKeys.map((month) => ({
      month,
      count: registrationMap.get(month) || 0,
    })),
    enrollment: {
      totalEnrolled,
      totalCapacity,
      occupancyRate,
    },
  });
};
