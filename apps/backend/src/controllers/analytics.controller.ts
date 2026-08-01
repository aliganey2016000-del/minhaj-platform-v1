/**
 * Analytics Controller — Dashboard Stats
 */

import { Request, Response } from 'express';
import User from '../models/user.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';

export const getDashboardStats = async (req: Request, res: Response): Promise<Response> => {
  // org_admin must only ever see their own organization's numbers — every
  // query here used to run completely unscoped, so an org_admin's
  // dashboard silently showed platform-wide totals across every tenant.
  const studentFilter = applyOrgFilter(req, {}, 'school');
  const courseFilter = applyOrgFilter(req, {}, 'school');
  const userFilter = applyOrgFilter(req, {}, 'organizationId');

  const [
    totalStudents,
    activeStudents,
    totalCourses,
    publishedCourses,
    totalTeachers,
    totalParents,
    recentRegistrations,
    totalRevenue,
  ] = await Promise.all([
    Student.countDocuments(studentFilter),
    Student.countDocuments({ ...studentFilter, status: 'active' }),
    Course.countDocuments(courseFilter),
    Course.countDocuments({ ...courseFilter, status: 'published' }),
    User.countDocuments({ ...userFilter, role: 'teacher' }),
    User.countDocuments({ ...userFilter, role: 'parent' }),
    User.countDocuments({ ...userFilter, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    Student.aggregate([
      { $match: studentFilter },
      { $group: { _id: null, total: { $sum: '$totalFeesPaid' } } },
    ]).then((r) => (r[0]?.total || 0)),
  ]);

  // Course distribution by category — every course regardless of status
  // (published or draft), so the slices always sum to `totalCourses`
  // above instead of silently under-counting against it.
  const courseDistribution = await Course.aggregate([
    { $match: courseFilter },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Monthly registrations (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const monthlyRegistrations = await User.aggregate([
    { $match: { ...userFilter, createdAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Enrollment stats
  const enrollmentStats = await Course.aggregate([
    { $match: courseFilter },
    { $group: { _id: null, totalEnrolled: { $sum: '$enrolledStudents' }, totalCapacity: { $sum: '$maxStudents' } } },
  ]);

  return ApiResponse.success(res, {
    students: { total: totalStudents, active: activeStudents },
    courses: { total: totalCourses, published: publishedCourses },
    teachers: totalTeachers,
    parents: totalParents,
    recentRegistrations,
    totalRevenue,
    courseDistribution: courseDistribution.map((c) => ({ category: c._id || '', count: c.count })),
    monthlyRegistrations: monthlyRegistrations.map((m) => ({ month: m._id, count: m.count })),
    enrollment: {
      totalEnrolled: enrollmentStats[0]?.totalEnrolled || 0,
      totalCapacity: enrollmentStats[0]?.totalCapacity || 0,
      occupancyRate: enrollmentStats[0]
        ? Math.round((enrollmentStats[0].totalEnrolled / enrollmentStats[0].totalCapacity) * 100)
        : 0,
    },
  });
};