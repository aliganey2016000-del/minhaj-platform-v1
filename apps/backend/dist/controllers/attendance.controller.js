"use strict";
/**
 * Attendance Controller
 * Mark attendance, get records by course/student, generate reports
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCourseReport = exports.getMyAttendance = exports.getStudentSummary = exports.getByCourseAndDate = exports.markBulk = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const attendance_model_1 = __importDefault(require("../models/attendance.model"));
const student_model_1 = __importDefault(require("../models/student.model"));
const course_model_1 = __importDefault(require("../models/course.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
const ensure_student_1 = __importDefault(require("../utils/ensure-student"));
// ---------------------------------------------------------------------------
// Bulk Mark Attendance (Admin/Teacher) — POST /attendance
// ---------------------------------------------------------------------------
const markBulk = async (req, res) => {
    const { course: courseId, date, records } = req.body;
    // records: [{ student: id, status: 'present'|'absent'|'late'|'excused', notes?: string }]
    if (!courseId || !date || !records || !Array.isArray(records) || records.length === 0) {
        throw new api_error_1.BadRequestError('course, date, and records array are required');
    }
    const course = await course_model_1.default.findById(courseId);
    if (!course)
        throw new api_error_1.NotFoundError('Course');
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    const ops = records.map((r) => ({
        updateOne: {
            filter: { course: courseId, student: r.student, date: attendanceDate },
            update: { $set: { status: r.status, notes: r.notes || '', markedBy: new mongoose_1.default.Types.ObjectId(req.user.userId) } },
            upsert: true,
        },
    }));
    await attendance_model_1.default.bulkWrite(ops);
    return api_response_1.default.success(res, { course: courseId, date: attendanceDate, count: records.length }, 'Attendance marked successfully');
};
exports.markBulk = markBulk;
// ---------------------------------------------------------------------------
// Get Attendance by Course + Date (Admin/Teacher)
// ---------------------------------------------------------------------------
const getByCourseAndDate = async (req, res) => {
    const { courseId, date } = req.query;
    if (!courseId || !date)
        throw new api_error_1.BadRequestError('courseId and date query params required');
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    const records = await attendance_model_1.default.find({ course: courseId, date: attendanceDate })
        .populate('student', 'studentId user profile enrolledCourses')
        .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' } })
        .lean();
    return api_response_1.default.success(res, records);
};
exports.getByCourseAndDate = getByCourseAndDate;
// ---------------------------------------------------------------------------
// Get Attendance Summary for a Student
// ---------------------------------------------------------------------------
const getStudentSummary = async (req, res) => {
    const studentId = req.params.studentId;
    const studentObj = await student_model_1.default.findById(studentId).lean();
    if (!studentObj)
        throw new api_error_1.NotFoundError('Student');
    const stats = await attendance_model_1.default.aggregate([
        { $match: { student: new mongoose_1.default.Types.ObjectId(studentId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const present = stats.find((s) => s._id === 'present')?.count || 0;
    const late = stats.find((s) => s._id === 'late')?.count || 0;
    const absent = stats.find((s) => s._id === 'absent')?.count || 0;
    const excused = stats.find((s) => s._id === 'excused')?.count || 0;
    const percentage = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 0;
    return api_response_1.default.success(res, {
        studentId: studentObj.studentId,
        total,
        present,
        late,
        absent,
        excused,
        percentage,
    });
};
exports.getStudentSummary = getStudentSummary;
// ---------------------------------------------------------------------------
// Get MY Attendance Summary (Student self-service)
// ---------------------------------------------------------------------------
const getMyAttendance = async (req, res) => {
    const student = await (0, ensure_student_1.default)(req.user.userId);
    const stats = await attendance_model_1.default.aggregate([
        { $match: { student: student._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const present = stats.find((s) => s._id === 'present')?.count || 0;
    const late = stats.find((s) => s._id === 'late')?.count || 0;
    const absent = stats.find((s) => s._id === 'absent')?.count || 0;
    const excused = stats.find((s) => s._id === 'excused')?.count || 0;
    const percentage = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 0;
    return api_response_1.default.success(res, {
        studentId: student.studentId,
        total,
        present,
        late,
        absent,
        excused,
        percentage,
    });
};
exports.getMyAttendance = getMyAttendance;
// ---------------------------------------------------------------------------
// Get Attendance Report by Course (Admin — aggregated)
// ---------------------------------------------------------------------------
const getCourseReport = async (req, res) => {
    const courseId = req.query.courseId;
    if (!courseId)
        throw new api_error_1.BadRequestError('courseId query param required');
    // Get all students enrolled in this course
    const course = await course_model_1.default.findById(courseId).lean();
    if (!course)
        throw new api_error_1.NotFoundError('Course');
    const students = await student_model_1.default.find({ enrolledCourses: courseId })
        .populate('profile', 'firstName lastName')
        .select('studentId enrolledCourses')
        .lean();
    const studentIds = students.map(s => s._id);
    const stats = await attendance_model_1.default.aggregate([
        { $match: { course: new (require('mongoose').Types.ObjectId)(courseId), student: { $in: studentIds } } },
        { $group: { _id: '$student', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } } } },
    ]);
    const report = students.map(s => {
        const st = stats.find(x => x._id.toString() === s._id.toString());
        const total = st?.total || 0;
        const p = st?.present || 0;
        const l = st?.late || 0;
        return {
            studentId: s.studentId,
            name: `${s.profile?.firstName} ${s.profile?.lastName}`,
            total,
            present: p,
            late: l,
            absent: total - p - l,
            percentage: total > 0 ? Math.round(((p + l * 0.5) / total) * 100) : 0,
        };
    });
    return api_response_1.default.success(res, report);
};
exports.getCourseReport = getCourseReport;
//# sourceMappingURL=attendance.controller.js.map