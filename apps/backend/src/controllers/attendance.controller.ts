/**
 * Attendance Controller
 * Mark attendance, get records by course/student, generate reports
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Attendance from '../models/attendance.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';

// ---------------------------------------------------------------------------
// Bulk Mark Attendance (Admin/Teacher) — POST /attendance
// ---------------------------------------------------------------------------

export const markBulk = async (req: Request, res: Response): Promise<Response> => {
  const { course: courseId, date, records } = req.body;
  // records: [{ student: id, status: 'present'|'absent'|'late'|'excused', notes?: string }]

  if (!courseId || !date || !records || !Array.isArray(records) || records.length === 0) {
    throw new BadRequestError('course, date, and records array are required');
  }

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');

  const attendanceDate = new Date(date);
  attendanceDate.setHours(0, 0, 0, 0);

  const ops = records.map((r: any) => ({
    updateOne: {
      filter: { course: courseId, student: r.student, date: attendanceDate },
      update: { $set: { status: r.status, notes: r.notes || '', markedBy: new mongoose.Types.ObjectId(req.user!.userId) } },
      upsert: true,
    },
  }));

  await Attendance.bulkWrite(ops);

  return ApiResponse.success(res, { course: courseId, date: attendanceDate, count: records.length }, 'Attendance marked successfully');
};

// ---------------------------------------------------------------------------
// Get Attendance by Course + Date (Admin/Teacher)
// ---------------------------------------------------------------------------

export const getByCourseAndDate = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, date } = req.query;
  if (!courseId || !date) throw new BadRequestError('courseId and date query params required');

  const attendanceDate = new Date(date as string);
  attendanceDate.setHours(0, 0, 0, 0);

  const records = await Attendance.find({ course: courseId, date: attendanceDate })
    .populate('student', 'studentId user profile enrolledCourses')
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' } })
    .lean();

  return ApiResponse.success(res, records);
};

// ---------------------------------------------------------------------------
// Get Attendance Summary for a Student
// ---------------------------------------------------------------------------

export const getStudentSummary = async (req: Request, res: Response): Promise<Response> => {
  const studentId = req.params.studentId;
  const studentObj = await Student.findById(studentId).lean();
  if (!studentObj) throw new NotFoundError('Student');

  const stats = await Attendance.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const total = stats.reduce((sum: number, s: any) => sum + s.count, 0);
  const present = stats.find((s: any) => s._id === 'present')?.count || 0;
  const late = stats.find((s: any) => s._id === 'late')?.count || 0;
  const absent = stats.find((s: any) => s._id === 'absent')?.count || 0;
  const excused = stats.find((s: any) => s._id === 'excused')?.count || 0;
  const percentage = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 0;

  return ApiResponse.success(res, {
    studentId: (studentObj as any).studentId,
    total,
    present,
    late,
    absent,
    excused,
    percentage,
  });
};

// ---------------------------------------------------------------------------
// Get MY Attendance Summary (Student self-service)
// ---------------------------------------------------------------------------

export const getMyAttendance = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const stats = await Attendance.aggregate([
    { $match: { student: student._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const total = stats.reduce((sum: number, s: any) => sum + s.count, 0);
  const present = stats.find((s: any) => s._id === 'present')?.count || 0;
  const late = stats.find((s: any) => s._id === 'late')?.count || 0;
  const absent = stats.find((s: any) => s._id === 'absent')?.count || 0;
  const excused = stats.find((s: any) => s._id === 'excused')?.count || 0;
  const percentage = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 0;

  return ApiResponse.success(res, {
    studentId: (student as any).studentId,
    total,
    present,
    late,
    absent,
    excused,
    percentage,
  });
};

// ---------------------------------------------------------------------------
// Get Attendance Report by Course (Admin — aggregated)
// ---------------------------------------------------------------------------

export const getCourseReport = async (req: Request, res: Response): Promise<Response> => {
  const courseId = req.query.courseId as string;
  if (!courseId) throw new BadRequestError('courseId query param required');

  // Get all students enrolled in this course
  const course = await Course.findById(courseId).lean();
  if (!course) throw new NotFoundError('Course');

  const students = await Student.find({ enrolledCourses: courseId })
    .populate('profile', 'firstName lastName')
    .select('studentId enrolledCourses')
    .lean();

  const studentIds = students.map(s => s._id);

  const stats = await Attendance.aggregate([
    { $match: { course: new (require('mongoose').Types.ObjectId)(courseId), student: { $in: studentIds } } },
    { $group: { _id: '$student', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } } } },
  ]);

  const report = students.map(s => {
    const st = stats.find(x => x._id.toString() === s._id.toString());
    const total = st?.total || 0;
    const p = st?.present || 0;
    const l = st?.late || 0;
    return {
      studentId: (s as any).studentId,
      name: `${(s as any).profile?.firstName} ${(s as any).profile?.lastName}`,
      total,
      present: p,
      late: l,
      absent: total - p - l,
      percentage: total > 0 ? Math.round(((p + l * 0.5) / total) * 100) : 0,
    };
  });

  return ApiResponse.success(res, report);
};