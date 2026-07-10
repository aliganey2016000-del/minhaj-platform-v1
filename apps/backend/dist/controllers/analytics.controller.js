"use strict";
/**
 * Analytics Controller — Dashboard Stats
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = void 0;
const user_model_1 = __importDefault(require("../models/user.model"));
const student_model_1 = __importDefault(require("../models/student.model"));
const course_model_1 = __importDefault(require("../models/course.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const getDashboardStats = async (_req, res) => {
    const [totalStudents, activeStudents, totalCourses, publishedCourses, totalTeachers, totalParents, recentRegistrations, totalRevenue,] = await Promise.all([
        student_model_1.default.countDocuments(),
        student_model_1.default.countDocuments({ status: 'active' }),
        course_model_1.default.countDocuments(),
        course_model_1.default.countDocuments({ status: 'published' }),
        user_model_1.default.countDocuments({ role: 'teacher' }),
        user_model_1.default.countDocuments({ role: 'parent' }),
        user_model_1.default.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
        student_model_1.default.aggregate([
            { $group: { _id: null, total: { $sum: '$totalFeesPaid' } } },
        ]).then((r) => (r[0]?.total || 0)),
    ]);
    // Course distribution by category
    const courseDistribution = await course_model_1.default.aggregate([
        { $match: { status: 'published' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
    ]);
    // Monthly registrations (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyRegistrations = await user_model_1.default.aggregate([
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
    const enrollmentStats = await course_model_1.default.aggregate([
        { $group: { _id: null, totalEnrolled: { $sum: '$enrolledStudents' }, totalCapacity: { $sum: '$maxStudents' } } },
    ]);
    return api_response_1.default.success(res, {
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
exports.getDashboardStats = getDashboardStats;
//# sourceMappingURL=analytics.controller.js.map