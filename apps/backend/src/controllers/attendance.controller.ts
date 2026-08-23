import mongoose from 'mongoose';
import { Request, Response } from 'express';
import Attendance from '../models/attendance.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import School from '../models/school.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import ClassSchedule from '../models/class-schedule.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';

async function sendAttendanceAlerts(_params: { courseId: string; scheduleId: mongoose.Types.ObjectId | null; date: Date; records: any[]; createdBy?: string }) {
  // Attendance WhatsApp delivery is centralized in services/attendance-whatsapp-automation.ts,
  // which wraps Attendance.bulkWrite() at server startup. Keep this compatibility
  // helper intentionally inert so legacy controller paths cannot double-send alerts.
  return;
}

export const markBulk = async (req: Request, res: Response): Promise<Response> => {
  const { course: courseId, schedule: scheduleId, date, records } = req.body;
  if (!courseId || !date || !records || !Array.isArray(records) || records.length === 0) throw new BadRequestError('course, date, and records array are required');
  const course = await Course.findById(courseId); if (!course) throw new NotFoundError('Course');
  const attendanceDate = new Date(date); attendanceDate.setHours(0, 0, 0, 0);
  let scheduleFilter: mongoose.Types.ObjectId | null = scheduleId ? new mongoose.Types.ObjectId(scheduleId) : null;
  if (!scheduleFilter) {
    const daySchedules = await ClassSchedule.find({ course: courseId, dayOfWeek: attendanceDate.getDay() }).select('_id').lean();
    if (daySchedules.length === 1) scheduleFilter = daySchedules[0]._id;
  }
  if (req.user?.role !== 'admin') {
    const alreadyLocked = await Attendance.exists({ course: courseId, date: attendanceDate, schedule: scheduleFilter, locked: true });
    if (alreadyLocked) throw new ForbiddenError('Attendance for this session is locked. Ask an Admin to unlock it before making changes.');
  }
  const ops = records.map((r: any) => ({ updateOne: { filter: { course: courseId, student: r.student, date: attendanceDate, schedule: scheduleFilter }, update: { $set: { status: r.status, notes: r.notes || '', markedBy: new mongoose.Types.ObjectId(req.user!.userId), locked: true } }, upsert: true } }));
  await Attendance.bulkWrite(ops);
  void sendAttendanceAlerts({ courseId, scheduleId: scheduleFilter, date: attendanceDate, records, createdBy: req.user?.userId });
  return ApiResponse.success(res, { course: courseId, date: attendanceDate, count: records.length }, 'Attendance marked successfully');
};

export const unlockSession = async (req: Request, res: Response): Promise<Response> => {
  const { course: courseId, schedule: scheduleId, date } = req.body;
  if (!courseId || !date) throw new BadRequestError('course and date are required');
  const attendanceDate = new Date(date); attendanceDate.setHours(0, 0, 0, 0);
  const scheduleFilter = scheduleId ? new mongoose.Types.ObjectId(scheduleId) : null;
  const result = await Attendance.updateMany({ course: courseId, date: attendanceDate, schedule: scheduleFilter }, { $set: { locked: false } });
  return ApiResponse.success(res, { modified: result.modifiedCount }, 'Attendance session unlocked');
};

export const getByCourseAndDate = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, date, dateFrom, dateTo, schedule: scheduleId } = req.query;
  if (!courseId || (!date && !dateFrom)) throw new BadRequestError('courseId and date (or dateFrom) query params required');
  let dateFilter: unknown;
  if (dateFrom) { const from = new Date(dateFrom as string); from.setHours(0, 0, 0, 0); const to = dateTo ? new Date(dateTo as string) : from; to.setHours(23, 59, 59, 999); dateFilter = { $gte: from, $lte: to }; }
  else { const attendanceDate = new Date(date as string); attendanceDate.setHours(0, 0, 0, 0); dateFilter = attendanceDate; }
  const filter: Record<string, unknown> = { course: courseId, date: dateFilter }; if (scheduleId) filter.schedule = new mongoose.Types.ObjectId(scheduleId as string);
  const [records, course] = await Promise.all([
    Attendance.find(filter).populate('student', 'studentId user profile class enrolledCourses').populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' } }).populate({ path: 'student', populate: { path: 'class', select: 'title section' } }).populate('schedule', 'startTime endTime').sort({ date: -1 }).lean(),
    Course.findById(courseId).select('title').lean(),
  ]);
  const markerIds = [...new Set(records.map((r: any) => r.markedBy?.toString()).filter(Boolean))];
  const [markerUsers, markerProfiles] = await Promise.all([User.find({ _id: { $in: markerIds } }).select('email role').lean(), Profile.find({ user: { $in: markerIds } }).select('user firstName lastName').lean()]);
  const markerMap = new Map(markerIds.map((id) => { const u = markerUsers.find((mu) => mu._id.toString() === id); const p = markerProfiles.find((mp) => mp.user.toString() === id); return [id, { name: p ? `${p.firstName} ${p.lastName}` : u?.email || 'Unknown', role: u?.role || '' }]; }));
  return ApiResponse.success(res, records.map((r: any) => ({ ...r, course: course ? { _id: course._id, title: course.title } : null, markedBy: r.markedBy ? markerMap.get(r.markedBy.toString()) || null : null })));
};

export const getStudentSummary = async (req: Request, res: Response): Promise<Response> => {
  const studentId = req.params.studentId; const studentObj = await Student.findById(studentId).lean(); if (!studentObj) throw new NotFoundError('Student');
  const stats = await Attendance.aggregate([{ $match: { student: new mongoose.Types.ObjectId(studentId) } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  const total = stats.reduce((sum: number, s: any) => sum + s.count, 0); const present = stats.find((s: any) => s._id === 'present')?.count || 0; const late = stats.find((s: any) => s._id === 'late')?.count || 0; const absent = stats.find((s: any) => s._id === 'absent')?.count || 0; const excused = stats.find((s: any) => s._id === 'excused')?.count || 0; const percentage = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 0;
  return ApiResponse.success(res, { studentId: (studentObj as any).studentId, total, present, late, absent, excused, percentage });
};

export const getMyAttendance = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId); const stats = await Attendance.aggregate([{ $match: { student: student._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  const total = stats.reduce((sum: number, s: any) => sum + s.count, 0); const present = stats.find((s: any) => s._id === 'present')?.count || 0; const late = stats.find((s: any) => s._id === 'late')?.count || 0; const absent = stats.find((s: any) => s._id === 'absent')?.count || 0; const excused = stats.find((s: any) => s._id === 'excused')?.count || 0; const percentage = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 0;
  return ApiResponse.success(res, { studentId: (student as any).studentId, total, present, late, absent, excused, percentage });
};

export const getMyAttendanceByCourse = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const studentSchoolId = (student as any).school; const studentClassId = (student as any).class;
  const school = studentSchoolId ? await School.findById(studentSchoolId).select('attendanceType').lean() : null;
  const isClassBased = school?.attendanceType === 'class_based' && !!studentClassId;
  const courseFilter = isClassBased ? { class: studentClassId } : { _id: { $in: student.enrolledCourses } };
  const courses = await Course.find(courseFilter).select('title slug category').populate('class', 'title section').lean();
  const stats = await Attendance.aggregate([{ $match: { student: student._id } }, { $group: { _id: '$course', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } } } }]);
  const statsMap = new Map(stats.map((s: any) => [s._id.toString(), s]));
  const result = courses.map((course: any) => { const s: any = statsMap.get(course._id.toString()); const total = s?.total || 0; return { courseId: course._id, code: course.slug?.toUpperCase() || '', title: course.title?.en || 'Unknown Course', section: course.class ? `${course.class.title} (${course.class.section})` : course.category || '', days: total, present: s?.present || 0, absent: s?.absent || 0, late: s?.late || 0, excused: s?.excused || 0, presentPercentage: total > 0 ? Math.round(((s?.present || 0) / total) * 100) : 0, absentPercentage: total > 0 ? Math.round(((s?.absent || 0) / total) * 100) : 0 }; }).sort((a: any, b: any) => b.days - a.days);
  return ApiResponse.success(res, result);
};

export const getMyCourseHistory = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.query; if (!courseId) throw new BadRequestError('courseId query param required');
  const student = await ensureStudentRecord(req.user!.userId);
  const records = await Attendance.find({ course: courseId, student: student._id }).select('date status notes schedule markedBy').populate('schedule', 'startTime endTime').sort({ date: -1 }).lean();
  const markerIds = [...new Set(records.map((r: any) => r.markedBy?.toString()).filter(Boolean))];
  const markerProfiles = await Profile.find({ user: { $in: markerIds } }).select('user firstName lastName').lean();
  const markerMap = new Map(markerProfiles.map((p) => [p.user.toString(), `${p.firstName} ${p.lastName}`]));
  return ApiResponse.success(res, records.map((r: any) => ({ ...r, markedBy: r.markedBy ? markerMap.get(r.markedBy.toString()) || null : null })));
};

export const getCourseReport = async (req: Request, res: Response): Promise<Response> => {
  const courseId = req.query.courseId as string; const { dateFrom, dateTo } = req.query; if (!courseId) throw new BadRequestError('courseId query param required');
  const course = await Course.findById(courseId).lean(); if (!course) throw new NotFoundError('Course');
  const school = course.school ? await School.findById(course.school).select('attendanceType').lean() : null;
  const isClassBased = school?.attendanceType === 'class_based' && !!course.class; const studentFilter = isClassBased ? { class: course.class } : { enrolledCourses: courseId };
  const students = await Student.find(studentFilter).populate('profile', 'firstName lastName').select('studentId enrolledCourses').lean(); const studentIds = students.map(s => s._id);
  const matchStage: Record<string, unknown> = { course: new mongoose.Types.ObjectId(courseId), student: { $in: studentIds } };
  if (dateFrom) { const from = new Date(dateFrom as string); from.setHours(0,0,0,0); const to = dateTo ? new Date(dateTo as string) : new Date(); to.setHours(23,59,59,999); matchStage.date = { $gte: from, $lte: to }; }
  const stats = await Attendance.aggregate([{ $match: matchStage }, { $group: { _id: '$student', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } } } }]);
  const report = students.map((s: any) => { const st = stats.find((x: any) => x._id.toString() === s._id.toString()); const total = st?.total || 0; const p = st?.present || 0; const l = st?.late || 0; return { _id: s._id, studentId: s.studentId, name: `${s.profile?.firstName} ${s.profile?.lastName}`, total, present: p, late: l, absent: total - p - l, percentage: total > 0 ? Math.round(((p + l * 0.5) / total) * 100) : 0 }; });
  return ApiResponse.success(res, report);
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const getReportInsights = async (req: Request, res: Response): Promise<Response> => {
  const courseId = req.query.courseId as string; const { dateFrom, dateTo } = req.query; if (!courseId) throw new BadRequestError('courseId query param required');
  const course = await Course.findById(courseId).lean(); if (!course) throw new NotFoundError('Course');
  const school = course.school ? await School.findById(course.school).select('attendanceType').lean() : null; const isClassBased = school?.attendanceType === 'class_based' && !!course.class; const studentFilter = isClassBased ? { class: course.class } : { enrolledCourses: courseId };
  const students = await Student.find(studentFilter).populate('profile', 'firstName lastName').select('studentId').lean(); const studentIds = students.map((s) => s._id);
  const matchStage: Record<string, unknown> = { course: new mongoose.Types.ObjectId(courseId), student: { $in: studentIds } };
  if (dateFrom) { const from = new Date(dateFrom as string); from.setHours(0,0,0,0); const to = dateTo ? new Date(dateTo as string) : new Date(); to.setHours(23,59,59,999); matchStage.date = { $gte: from, $lte: to }; }
  const [dayStats, perStudentStats] = await Promise.all([
    Attendance.aggregate([{ $match: { ...matchStage, status: 'absent' } }, { $group: { _id: { $dayOfWeek: '$date' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 1 }]),
    Attendance.aggregate([{ $match: matchStage }, { $group: { _id: '$student', total: { $sum: 1 }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } } } }]),
  ]);
  const mostAbsentDay = dayStats[0] ? { day: DAY_NAMES[dayStats[0]._id - 1], count: dayStats[0].count } : null;
  const topAttenders = perStudentStats.filter((s: any) => s.total > 0 && s.absent === 0).sort((a: any, b: any) => b.total - a.total).slice(0, 5).map((s: any) => { const student: any = students.find((st: any) => st._id.toString() === s._id.toString()); return { studentId: student?.studentId || '', name: student ? `${student.profile?.firstName} ${student.profile?.lastName}` : 'Unknown', total: s.total }; });
  return ApiResponse.success(res, { mostAbsentDay, topAttenders });
};

export const getStudentCourseHistory = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, studentId } = req.query; if (!courseId || !studentId) throw new BadRequestError('courseId and studentId query params required');
  const records = await Attendance.find({ course: courseId, student: studentId }).select('date status notes schedule markedBy').populate('schedule', 'startTime endTime').sort({ date: -1 }).lean();
  const markerIds = [...new Set(records.map((r: any) => r.markedBy?.toString()).filter(Boolean))];
  const [markerUsers, markerProfiles] = await Promise.all([User.find({ _id: { $in: markerIds } }).select('email role').lean(), Profile.find({ user: { $in: markerIds } }).select('user firstName lastName').lean()]);
  const markerMap = new Map(markerIds.map((id) => { const u = markerUsers.find((mu) => mu._id.toString() === id); const p = markerProfiles.find((mp) => mp.user.toString() === id); return [id, { name: p ? `${p.firstName} ${p.lastName}` : u?.email || 'Unknown', role: u?.role || '' }]; }));
  return ApiResponse.success(res, records.map((r: any) => ({ ...r, markedBy: r.markedBy ? markerMap.get(r.markedBy.toString()) || null : null })));
};