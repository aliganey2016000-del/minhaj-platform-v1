/**
 * Attendance Controller
 * Mark attendance, get records by course/student, generate reports
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Attendance from '../models/attendance.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import School from '../models/school.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';

// ---------------------------------------------------------------------------
// Bulk Mark Attendance (Admin/Teacher) — POST /attendance
// ---------------------------------------------------------------------------

export const markBulk = async (req: Request, res: Response): Promise<Response> => {
  const { course: courseId, schedule: scheduleId, date, records } = req.body;
  // records: [{ student: id, status: 'present'|'absent'|'late'|'excused', notes?: string }]

  if (!courseId || !date || !records || !Array.isArray(records) || records.length === 0) {
    throw new BadRequestError('course, date, and records array are required');
  }

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');

  const attendanceDate = new Date(date);
  attendanceDate.setHours(0, 0, 0, 0);

  // A course can meet more than once on the same day (e.g. a 07:30 and an
  // 11:00 session) — scoping by the specific ClassSchedule session keeps
  // those two sessions' attendance independent instead of one session's
  // marks silently showing up as "already taken" on the other.
  const scheduleFilter = scheduleId ? new mongoose.Types.ObjectId(scheduleId) : null;

  // Once submitted, a session locks — the submitter (org_admin/teacher)
  // can't quietly re-edit it afterwards; only a platform Admin can unlock
  // it first (PATCH /attendance/unlock) or submit straight over the lock.
  if (req.user?.role !== 'admin') {
    const alreadyLocked = await Attendance.exists({
      course: courseId,
      date: attendanceDate,
      schedule: scheduleFilter,
      locked: true,
    });
    if (alreadyLocked) {
      throw new ForbiddenError('Attendance for this session is locked. Ask an Admin to unlock it before making changes.');
    }
  }

  const ops = records.map((r: any) => ({
    updateOne: {
      filter: { course: courseId, student: r.student, date: attendanceDate, schedule: scheduleFilter },
      update: { $set: { status: r.status, notes: r.notes || '', markedBy: new mongoose.Types.ObjectId(req.user!.userId), locked: true } },
      upsert: true,
    },
  }));

  await Attendance.bulkWrite(ops);

  return ApiResponse.success(res, { course: courseId, date: attendanceDate, count: records.length }, 'Attendance marked successfully');
};

// ---------------------------------------------------------------------------
// Unlock a Session (Admin-only) — PATCH /attendance/unlock
// ---------------------------------------------------------------------------

export const unlockSession = async (req: Request, res: Response): Promise<Response> => {
  const { course: courseId, schedule: scheduleId, date } = req.body;
  if (!courseId || !date) throw new BadRequestError('course and date are required');

  const attendanceDate = new Date(date);
  attendanceDate.setHours(0, 0, 0, 0);
  const scheduleFilter = scheduleId ? new mongoose.Types.ObjectId(scheduleId) : null;

  const result = await Attendance.updateMany(
    { course: courseId, date: attendanceDate, schedule: scheduleFilter },
    { $set: { locked: false } }
  );

  return ApiResponse.success(res, { modified: result.modifiedCount }, 'Attendance session unlocked');
};

// ---------------------------------------------------------------------------
// Get Attendance by Course + Date (Admin/Teacher)
// ---------------------------------------------------------------------------

export const getByCourseAndDate = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, date, dateFrom, dateTo, schedule: scheduleId } = req.query;
  if (!courseId || (!date && !dateFrom)) {
    throw new BadRequestError('courseId and date (or dateFrom) query params required');
  }

  let dateFilter: unknown;
  if (dateFrom) {
    const from = new Date(dateFrom as string);
    from.setHours(0, 0, 0, 0);
    const to = dateTo ? new Date(dateTo as string) : from;
    to.setHours(23, 59, 59, 999);
    dateFilter = { $gte: from, $lte: to };
  } else {
    const attendanceDate = new Date(date as string);
    attendanceDate.setHours(0, 0, 0, 0);
    dateFilter = attendanceDate;
  }

  const filter: Record<string, unknown> = { course: courseId, date: dateFilter };
  // Scope to one specific session when the caller knows which one it's
  // taking attendance for (see markBulk) — omitted, this matches whatever
  // was marked that day for the course regardless of session.
  if (scheduleId) filter.schedule = new mongoose.Types.ObjectId(scheduleId as string);

  const [records, course] = await Promise.all([
    Attendance.find(filter)
      .populate('student', 'studentId user profile class enrolledCourses')
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' } })
      .populate({ path: 'student', populate: { path: 'class', select: 'title section' } })
      .populate('schedule', 'startTime endTime')
      .sort({ date: -1 })
      .lean(),
    Course.findById(courseId).select('title').lean(),
  ]);

  // "Marked By" is a User (org_admin/teacher/admin), not a Student — Users
  // don't carry a `profile` ref the way Students do, so resolve display
  // names via a separate Profile lookup keyed by user id instead of a
  // direct populate.
  const markerIds = [...new Set(records.map((r: any) => r.markedBy?.toString()).filter(Boolean))];
  const [markerUsers, markerProfiles] = await Promise.all([
    User.find({ _id: { $in: markerIds } }).select('email role').lean(),
    Profile.find({ user: { $in: markerIds } }).select('user firstName lastName').lean(),
  ]);
  const markerMap = new Map(
    markerIds.map((id) => {
      const u = markerUsers.find((mu) => mu._id.toString() === id);
      const p = markerProfiles.find((mp) => mp.user.toString() === id);
      const name = p ? `${p.firstName} ${p.lastName}` : u?.email || 'Unknown';
      return [id, { name, role: u?.role || '' }];
    })
  );

  const enriched = records.map((r: any) => ({
    ...r,
    course: course ? { _id: course._id, title: course.title } : null,
    markedBy: r.markedBy ? markerMap.get(r.markedBy.toString()) || null : null,
  }));

  return ApiResponse.success(res, enriched);
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
  const { dateFrom, dateTo } = req.query;
  if (!courseId) throw new BadRequestError('courseId query param required');

  // Get all students enrolled in this course — or, for class-based
  // organizations, every student in the course's Class.
  const course = await Course.findById(courseId).lean();
  if (!course) throw new NotFoundError('Course');

  const school = course.school ? await School.findById(course.school).select('attendanceType').lean() : null;
  const isClassBased = school?.attendanceType === 'class_based' && !!course.class;
  const studentFilter = isClassBased ? { class: course.class } : { enrolledCourses: courseId };

  const students = await Student.find(studentFilter)
    .populate('profile', 'firstName lastName')
    .select('studentId enrolledCourses')
    .lean();

  const studentIds = students.map(s => s._id);

  const matchStage: Record<string, unknown> = {
    course: new (require('mongoose').Types.ObjectId)(courseId),
    student: { $in: studentIds },
  };
  if (dateFrom) {
    const from = new Date(dateFrom as string);
    from.setHours(0, 0, 0, 0);
    const to = dateTo ? new Date(dateTo as string) : new Date();
    to.setHours(23, 59, 59, 999);
    matchStage.date = { $gte: from, $lte: to };
  }

  const stats = await Attendance.aggregate([
    { $match: matchStage },
    { $group: { _id: '$student', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } } } },
  ]);

  const report = students.map(s => {
    const st = stats.find(x => x._id.toString() === s._id.toString());
    const total = st?.total || 0;
    const p = st?.present || 0;
    const l = st?.late || 0;
    return {
      _id: s._id,
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

// ---------------------------------------------------------------------------
// Get One Student's Day-by-Day History for a Course (Admin — Report drilldown)
// ---------------------------------------------------------------------------

export const getStudentCourseHistory = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, studentId } = req.query;
  if (!courseId || !studentId) throw new BadRequestError('courseId and studentId query params required');

  const records = await Attendance.find({ course: courseId, student: studentId })
    .select('date status notes schedule markedBy')
    .populate('schedule', 'startTime endTime')
    .sort({ date: -1 })
    .lean();

  // Same manual Profile lookup as getByCourseAndDate — Users don't carry a
  // profile ref, so resolve "who marked this" by hand.
  const markerIds = [...new Set(records.map((r: any) => r.markedBy?.toString()).filter(Boolean))];
  const [markerUsers, markerProfiles] = await Promise.all([
    User.find({ _id: { $in: markerIds } }).select('email role').lean(),
    Profile.find({ user: { $in: markerIds } }).select('user firstName lastName').lean(),
  ]);
  const markerMap = new Map(
    markerIds.map((id) => {
      const u = markerUsers.find((mu) => mu._id.toString() === id);
      const p = markerProfiles.find((mp) => mp.user.toString() === id);
      const name = p ? `${p.firstName} ${p.lastName}` : u?.email || 'Unknown';
      return [id, { name, role: u?.role || '' }];
    })
  );

  const enriched = records.map((r: any) => ({
    ...r,
    markedBy: r.markedBy ? markerMap.get(r.markedBy.toString()) || null : null,
  }));

  return ApiResponse.success(res, enriched);
};