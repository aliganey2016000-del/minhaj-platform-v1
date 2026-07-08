/**
 * Analytics Controller — Dashboard Stats
 */

import { Request, Response } from 'express';
import User from '../models/user.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import ApiResponse from '../utils/api-response';

export const getDashboardStats = async (_req: Request, res: Response): Promise<Response> => {
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
    Student.countDocuments(),
    Student.countDocuments({ status: 'active' }),
    Course.countDocuments(),
    Course.countDocuments({ status: 'published' }),
    User.countDocuments({ role: 'teacher' }),
    User.countDocuments({ role: 'parent' }),
    User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    Student.aggregate([
      { $group: { _id: null, total: { $sum: '$totalFeesPaid' } } },
    ]).then((r) => (r[0]?.total || 0)),
  ]);

  // Course distribution by category
  const courseDistribution = await Course.aggregate([
    { $match: { status: 'published' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Monthly registrations (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const monthlyRegistrations = await User.aggregate([
    { $match: { createdAt: { $gte: sixMonthsAgo } } },
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
    { $group: { _id: null, totalEnrolled: { $sum: '$enrolledStudents' }, totalCapacity: { $sum: '$maxStudents' } } },
  ]);

  return ApiResponse.success(res, {
    students: { total: totalStudents, active: activeStudents },
    courses: { total: totalCourses, published: publishedCourses },
    teachers: totalTeachers,
    parents: totalParents,
    recentRegistrations,
    totalRevenue,
    courseDistribution: courseDistribution.map((c) => ({ category: c._id, count: c.count })),
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