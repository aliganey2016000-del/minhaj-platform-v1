import mongoose from 'mongoose';
import { Request, Response } from 'express';
import Attendance from '../models/attendance.model';
import Student from '../models/student.model';
import Parent from '../models/parent.model';
import Course from '../models/course.model';
import School from '../models/school.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import WhatsAppMessage from '../models/whatsapp-message.model';
import ClassSchedule from '../models/class-schedule.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { isWhatsAppConfigured, sendWhatsAppMessage } from '../utils/whatsapp';

async function sendAttendanceAlerts(params: {
  courseId: string;
  scheduleId: mongoose.Types.ObjectId | null;
  date: Date;
  records: any[];
  createdBy?: string;
}) {
  const enabled = process.env.WHATSAPP_ATTENDANCE_ALERTS_ENABLED !== 'false';
  const templateName = process.env.WHATSAPP_ATTENDANCE_TEMPLATE?.trim();
  const languageCode = process.env.WHATSAPP_ATTENDANCE_TEMPLATE_LANGUAGE?.trim() || 'en_US';
  if (!enabled || !isWhatsAppConfigured() || !templateName) return;

  const alertRecords = params.records.filter((r) => ['absent', 'late'].includes(String(r.status).toLowerCase()));
  if (!alertRecords.length) return;

  const studentIds = alertRecords.map((r) => r.student).filter(Boolean);
  const students = await Student.find({ _id: { $in: studentIds } })
    .select('studentId parent profile school')
    .populate('profile', 'firstName lastName')
    .populate('parent', 'phone user school')
    .lean();
  const studentMap = new Map(students.map((s: any) => [String(s._id), s]));
  const schedule = params.scheduleId
    ? await ClassSchedule.findById(params.scheduleId).select('startTime endTime dayOfWeek').lean()
    : null;
  const course = await Course.findById(params.courseId).select('title').lean();

  await Promise.allSettled(alertRecords.map(async (record) => {
    const student: any = studentMap.get(String(record.student));
    if (!student?.parent) return;
    const parent: any = student.parent;
    let recipient = String(parent.phone || '').trim();
    if (!recipient && parent.user) {
      const user = await User.findById(parent.user).select('phone').lean();
      recipient = String(user?.phone || '').trim();
    }
    if (!recipient) return;

    const status = String(record.status).toLowerCase();
    const studentName = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId;
    const statusLabel = status === 'absent' ? 'Absent' : 'Late';
    const dateLabel = params.date.toLocaleDateString('en-GB', { timeZone: process.env.APP_TIMEZONE || 'Africa/Mogadishu' });
    const timeLabel = schedule?.startTime && schedule?.endTime ? `${schedule.startTime}–${schedule.endTime}` : '';

    // Keep one alert per student/session/status. Re-submitting an unchanged
    // locked session must never spam a parent.
    const duplicate = await WhatsAppMessage.findOne({
      school: student.school || parent.school,
      parent: parent._id,
      recipient,
      templateName,
      body: `${studentName}|${status}|${params.courseId}|${params.date.toISOString().slice(0, 10)}|${params.scheduleId || 'none'}`,
    }).select('_id').lean();
    if (duplicate) return;

    const body = `${studentName}|${status}|${course?.title || 'Class'}|${dateLabel}|${timeLabel}`;
    const message = await WhatsAppMessage.create({
      school: student.school || parent.school,
      recipient,
      parent: parent._id,
      kind: 'template',
      templateName,
      languageCode,
      body,
      status: 'queued',
      createdBy: params.createdBy,
    });

    try {
      const result = await sendWhatsAppMessage({
        to: recipient,
        templateName,
        languageCode,
        components: [{ type: 'body', parameters: [
          { type: 'text', text: studentName },
          { type: 'text', text: statusLabel },
          { type: 'text', text: course?.title || 'Class' },
          { type: 'text', text: dateLabel },
          { type: 'text', text: timeLabel || '-' },
        ] }],
      });
      message.status = 'sent';
      message.providerMessageId = result.providerMessageId;
      await message.save();
    } catch (error: any) {
      message.status = 'failed';
      message.error = error?.response?.data?.error?.message || error?.message || 'WhatsApp attendance alert failed';
      await message.save();
    }
  }));
}

// ---------------------------------------------------------------------------
// Bulk Mark Attendance (Admin/Teacher) — POST /attendance
// ---------------------------------------------------------------------------
export const markBulk = async (req: Request, res: Response): Promise<Response> => {
  const { course: courseId, schedule: scheduleId, date, records } = req.body;
  if (!courseId || !date || !records || !Array.isArray(records) || records.length === 0) {
    throw new BadRequestError('course, date, and records array are required');
  }

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');

  const attendanceDate = new Date(date);
  attendanceDate.setHours(0, 0, 0, 0);
  let scheduleFilter: mongoose.Types.ObjectId | null = scheduleId ? new mongoose.Types.ObjectId(scheduleId) : null;
  if (!scheduleFilter) {
    const daySchedules = await ClassSchedule.find({ course: courseId, dayOfWeek: attendanceDate.getDay() }).select('_id').lean();
    if (daySchedules.length === 1) scheduleFilter = daySchedules[0]._id;
  }

  if (req.user?.role !== 'admin') {
    const alreadyLocked = await Attendance.exists({ course: courseId, date: attendanceDate, schedule: scheduleFilter, locked: true });
    if (alreadyLocked) throw new ForbiddenError('Attendance for this session is locked. Ask an Admin to unlock it before making changes.');
  }

  const ops = records.map((r: any) => ({
    updateOne: {
      filter: { course: courseId, student: r.student, date: attendanceDate, schedule: scheduleFilter },
      update: { $set: { status: r.status, notes: r.notes || '', markedBy: new mongoose.Types.ObjectId(req.user!.userId), locked: true } },
      upsert: true,
    },
  }));

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
  if (dateFrom) {
    const from = new Date(dateFrom as string); from.setHours(0, 0, 0, 0);
    const to = dateTo ? new Date(dateTo as string) : from; to.setHours(23, 59, 59, 999);
    dateFilter = { $gte: from, $lte: to };
  } else { const attendanceDate = new Date(date as string); attendanceDate.setHours(0, 0, 0, 0); dateFilter = attendanceDate; }
  const filter: Record<string, unknown> = { course: courseId, date: dateFilter };
  if (scheduleId) filter.schedule = new mongoose.Types.ObjectId(scheduleId as string);
  const [records, course] = await Promise.all([
    Attendance.find(filter).populate('student', 'studentId user profile class enrolledCourses').populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' } }).populate({ path: 'student', populate: { path: 'class', select: 'title section' } }).populate('schedule', 'startTime endTime').sort({ date: -1 }).lean(),
    Course.findById(courseId).select('title').lean(),
  ]);
  const markerIds = [...new Set(records.map((r: any) => r.markedBy?.toString()).filter(Boolean))];
  const [markerUsers, markerProfiles] = await Promise.all([User.find({ _id: { $in: markerIds } }).select('email role').lean(), Profile.find({ user: { $in: markerIds } }).select('user firstName lastName').lean()]);
  const markerMap = new Map(markerIds.map((id) => { const u = markerUsers.find((mu) => mu._id.toString() === id); const p = markerProfiles.find((mp) => mp.user.toString() === id); return [id, { name: p ? `${p.firstName} ${p.lastName}` : u?.email || 'Unknown', role: u?.role || '' }]; }));
  const enriched = records.map((r: any) => ({ ...r, course: course ? { _id: course._id, title: course.title } : null, markedBy: r.markedBy ? markerMap.get(r.markedBy.toString()) || null : null }));
  return ApiResponse.success(res, enriched);
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
  const student = await ensureStudentRecord(req.user!.userId); const studentSchoolId = (student as any).school; const studentClassId = (student as any).class; const school = studentSchoolId ? await School.findById(studentSchoolId).select('attendanceType').lean() : null; const isClassBased = school?.attendanceType === 'class_based' && !!studentClassId;
  const courseFilter = isClassBased ? { class: studentClassId } : { _id: { $in: student.enrolledCourses } };
  const courses = await Course.find(courseFilter).select('title slug category').populate('class', 'title section').lean();
  const stats = await Attendance.aggregate([{ $match: { student: student._id } }, { $group: { _id: { course: '$course', status: '$status' }, count: { $sum: 1 } } }]);
  const byCourse = new Map<string, any>(); for (const row of stats) { const key = String(row._id.course); const item = byCourse.get(key) || { total: 0, present: 0, late: 0, absent: 0, excused: 0 }; item[row._id.status] = row.count; item.total += row.count; byCourse.set(key, item); }
  const result = courses.map((course: any) => { const item = byCourse.get(String(course._id)) || { total: 0, present: 0, late: 0, absent: 0, excused: 0 }; return { course, ...item, percentage: item.total ? Math.round(((item.present + item.late * 0.5) / item.total) * 100) : 0 }; });
  return ApiResponse.success(res, result);
};