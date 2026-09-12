import mongoose from 'mongoose';
import { Request, Response } from 'express';
import Attendance from '../models/attendance.model';
import AttendanceSession from '../models/attendance-session.model';
import DailyAttendance from '../models/daily-attendance.model';
import SchoolCalendarDay from '../models/school-calendar-day.model';
import ClassSchedule from '../models/class-schedule.model';
import Student from '../models/student.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { resolveViewableOrgId } from '../utils/tenant-scope';

const STATUSES = new Set(['present', 'absent', 'late', 'excused']);
const REASONS = new Set(['', 'sick', 'medical', 'family_emergency', 'school_activity', 'suspension', 'transport_delay', 'other']);
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function dateOnly(raw: unknown): Date {
  const value = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestError('Date must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new BadRequestError('A valid date is required.');
  date.setHours(0, 0, 0, 0);
  return date;
}

function timeValue(raw: unknown, label: string): string {
  const value = String(raw || '').trim();
  if (!TIME_RE.test(value)) throw new BadRequestError(`${label} must use HH:MM (24-hour format).`);
  return value;
}

async function schoolContext(req: Request) {
  const id = resolveViewableOrgId(req, req.query.school ?? req.body?.school);
  if (!id || !mongoose.isValidObjectId(id)) throw new BadRequestError('School is required.');
  const school: any = await School.findById(id).select('_id name institutionType organizationType').lean();
  if (!school) throw new NotFoundError('School');
  if (resolveInstitutionType(school) !== 'school') throw new BadRequestError('Daily attendance is available only for schools.');
  return { schoolId: String(school._id), school };
}

async function assertInstructionalDay(schoolId: string, date: Date) {
  const calendarDay: any = await SchoolCalendarDay.findOne({ school: schoolId, date }).select('name type isInstructional').lean();
  if (calendarDay && calendarDay.isInstructional === false) {
    throw new BadRequestError(`Attendance is closed for ${calendarDay.name || calendarDay.type}.`);
  }
  return calendarDay || null;
}

function deriveSectionStatus(rows: any[]): 'present' | 'absent' | 'late' | 'excused' | null {
  if (!rows.length) return null;
  if (rows.some((row) => row.status === 'present')) return 'present';
  if (rows.some((row) => row.status === 'late')) return 'late';
  if (rows.every((row) => row.status === 'excused')) return 'excused';
  if (rows.some((row) => row.status === 'absent')) return 'absent';
  return null;
}

export const getDailyRoster = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const date = dateOnly(req.query.date);
  const calendarDay = await SchoolCalendarDay.findOne({ school: schoolId, date }).select('name type isInstructional notes').lean();
  if (calendarDay && calendarDay.isInstructional === false) {
    return ApiResponse.success(res, { date: String(req.query.date), calendarDay, summary: { total: 0, present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 }, roster: [] });
  }

  const filter: Record<string, unknown> = { school: schoolId, status: 'active', approvalStatus: 'approved' };
  if (req.query.classId) {
    if (!mongoose.isValidObjectId(String(req.query.classId))) throw new BadRequestError('A valid class is required.');
    filter.class = req.query.classId;
  }

  const students: any[] = await Student.find(filter)
    .select('_id studentId profile class')
    .populate('profile', 'firstName lastName')
    .populate('class', 'title section')
    .sort({ studentId: 1 })
    .lean();
  const studentIds = students.map((student) => student._id);
  const [dailyRows, sectionRows] = studentIds.length
    ? await Promise.all([
        DailyAttendance.find({ school: schoolId, date, student: { $in: studentIds } }).lean(),
        Attendance.find({ date, student: { $in: studentIds } }).select('student status').lean(),
      ])
    : [[], []];

  const dailyMap = new Map((dailyRows as any[]).map((row) => [String(row.student), row]));
  const sectionMap = new Map<string, any[]>();
  for (const row of sectionRows as any[]) {
    const key = String(row.student);
    const list = sectionMap.get(key) || [];
    list.push(row);
    sectionMap.set(key, list);
  }

  const summary = { total: students.length, present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
  const roster = students.map((student) => {
    const daily: any = dailyMap.get(String(student._id));
    const derivedStatus = daily ? null : deriveSectionStatus(sectionMap.get(String(student._id)) || []);
    const effectiveStatus = daily?.status || derivedStatus || null;
    if (effectiveStatus && effectiveStatus in summary) (summary as any)[effectiveStatus] += 1;
    else summary.unmarked += 1;
    return {
      _id: student._id,
      studentId: student.studentId,
      name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId,
      class: student.class,
      daily: daily ? {
        _id: daily._id,
        status: daily.status,
        reasonCode: daily.reasonCode || '',
        arrivalTime: daily.arrivalTime || '',
        departureTime: daily.departureTime || '',
        notes: daily.notes || '',
        source: daily.source,
      } : null,
      derivedStatus,
      effectiveStatus,
    };
  });

  return ApiResponse.success(res, { date: String(req.query.date), calendarDay: calendarDay || null, summary, roster });
};

export const markDailyBulk = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  if (!['admin', 'org_admin'].includes(req.user?.role || '')) throw new ForbiddenError('Only school administrators can manage daily attendance.');
  const date = dateOnly(req.body?.date);
  await assertInstructionalDay(schoolId, date);
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length === 0) throw new BadRequestError('records array is required.');

  const studentIds = [...new Set(records.map((row: any) => String(row?.student || '')))];
  if (studentIds.some((id) => !mongoose.isValidObjectId(id))) throw new BadRequestError('Every daily attendance row needs a valid student.');
  const students: any[] = await Student.find({ _id: { $in: studentIds }, school: schoolId, status: 'active', approvalStatus: 'approved' }).select('_id class').lean();
  const studentMap = new Map(students.map((student) => [String(student._id), student]));
  if (students.length !== studentIds.length) throw new ForbiddenError('Daily attendance can only be recorded for active approved students in this school.');

  const ops = records.map((row: any) => {
    const id = String(row.student);
    const student: any = studentMap.get(id);
    const status = String(row.status || '');
    const reasonCode = String(row.reasonCode || '').trim();
    if (!STATUSES.has(status)) throw new BadRequestError(`Invalid daily attendance status for ${id}.`);
    if (!REASONS.has(reasonCode)) throw new BadRequestError(`Invalid attendance reason for ${id}.`);
    const arrivalTime = String(row.arrivalTime || '').trim();
    const departureTime = String(row.departureTime || '').trim();
    if (arrivalTime && !TIME_RE.test(arrivalTime)) throw new BadRequestError('Arrival time must use HH:MM.');
    if (departureTime && !TIME_RE.test(departureTime)) throw new BadRequestError('Departure time must use HH:MM.');
    return {
      updateOne: {
        filter: { school: new mongoose.Types.ObjectId(schoolId), student: student._id, date },
        update: { $set: {
          class: student.class || null,
          status,
          reasonCode,
          arrivalTime,
          departureTime,
          notes: String(row.notes || '').trim().slice(0, 1000),
          source: 'manual',
          markedBy: new mongoose.Types.ObjectId(req.user!.userId),
        } },
        upsert: true,
      },
    };
  });
  await DailyAttendance.bulkWrite(ops as any[]);
  return ApiResponse.success(res, { date, count: records.length }, 'Daily attendance saved successfully');
};

async function findStudent(schoolId: string, rawStudent: unknown) {
  const value = String(rawStudent || '').trim();
  if (!value) throw new BadRequestError('Student ID is required.');
  const student: any = mongoose.isValidObjectId(value)
    ? await Student.findOne({ _id: value, school: schoolId, status: 'active', approvalStatus: 'approved' }).select('_id studentId class').lean()
    : await Student.findOne({ studentId: value.toUpperCase(), school: schoolId, status: 'active', approvalStatus: 'approved' }).select('_id studentId class').lean();
  if (!student) throw new NotFoundError('Student');
  return student;
}

export const checkIn = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  if (!['admin', 'org_admin'].includes(req.user?.role || '')) throw new ForbiddenError('Only school administrators can check students in.');
  const date = dateOnly(req.body?.date);
  await assertInstructionalDay(schoolId, date);
  const student: any = await findStudent(schoolId, req.body?.student);
  const arrivalTime = timeValue(req.body?.arrivalTime, 'Arrival time');

  const firstSchedule: any = student.class
    ? await ClassSchedule.findOne({ school: schoolId, class: student.class, dayOfWeek: date.getDay(), isActive: true }).select('startTime').sort({ startTime: 1 }).lean()
    : null;
  const status = firstSchedule?.startTime && arrivalTime > firstSchedule.startTime ? 'late' : 'present';
  const reasonCode = String(req.body?.reasonCode || (status === 'late' ? 'transport_delay' : '')).trim();
  if (!REASONS.has(reasonCode)) throw new BadRequestError('Invalid attendance reason.');

  const row = await DailyAttendance.findOneAndUpdate(
    { school: schoolId, student: student._id, date },
    { $set: {
      class: student.class || null,
      status,
      reasonCode,
      arrivalTime,
      notes: String(req.body?.notes || '').trim().slice(0, 1000),
      source: 'check_in',
      markedBy: new mongoose.Types.ObjectId(req.user!.userId),
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return ApiResponse.success(res, { studentId: student.studentId, attendance: row }, `Student checked in as ${status}`);
};

export const checkOut = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  if (!['admin', 'org_admin'].includes(req.user?.role || '')) throw new ForbiddenError('Only school administrators can check students out.');
  const date = dateOnly(req.body?.date);
  const student: any = await findStudent(schoolId, req.body?.student);
  const departureTime = timeValue(req.body?.departureTime, 'Departure time');
  const existing: any = await DailyAttendance.findOne({ school: schoolId, student: student._id, date });
  if (!existing) throw new BadRequestError('Check the student in or mark daily attendance before checking out.');
  existing.departureTime = departureTime;
  existing.notes = String(req.body?.notes ?? existing.notes ?? '').trim().slice(0, 1000);
  existing.source = 'check_out';
  existing.markedBy = new mongoose.Types.ObjectId(req.user!.userId);
  await existing.save();
  return ApiResponse.success(res, { studentId: student.studentId, attendance: existing }, 'Student checked out successfully');
};

export const getSchoolDashboard = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const date = dateOnly(req.query.date || new Date().toISOString().slice(0, 10));
  const days = Math.min(120, Math.max(7, Number(req.query.days) || 30));
  const threshold = Math.min(100, Math.max(1, Number(req.query.threshold) || 90));
  const from = new Date(date);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);

  const calendarDay: any = await SchoolCalendarDay.findOne({ school: schoolId, date }).select('name type isInstructional').lean();
  const daySchedules: any[] = calendarDay?.isInstructional === false ? [] : await ClassSchedule.find({ school: schoolId, dayOfWeek: date.getDay(), isActive: true }).select('_id').lean();
  const scheduleIds = daySchedules.map((row) => row._id);
  const [sessions, todayRows, riskStats] = await Promise.all([
    scheduleIds.length ? AttendanceSession.find({ school: schoolId, schedule: { $in: scheduleIds }, date }).select('schedule status locked').lean() : Promise.resolve([]),
    Attendance.aggregate([
      { $match: { date, schedule: { $in: scheduleIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Attendance.aggregate([
      { $match: { date: { $gte: from, $lte: end } } },
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'studentDoc' } },
      { $unwind: '$studentDoc' },
      { $match: { 'studentDoc.school': new mongoose.Types.ObjectId(schoolId), 'studentDoc.status': 'active', 'studentDoc.approvalStatus': 'approved' } },
      { $group: {
        _id: '$student',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
      } },
      { $match: { total: { $gte: 3 } } },
    ]),
  ]);

  const completionMap = new Map((sessions as any[]).map((row) => [String(row.schedule), row]));
  let complete = 0; let partial = 0; let missing = 0;
  for (const schedule of daySchedules) {
    const row: any = completionMap.get(String(schedule._id));
    if (row?.status === 'complete') complete += 1;
    else if (row?.status === 'partial') partial += 1;
    else missing += 1;
  }
  const statusCounts: any = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const row of todayRows as any[]) if (row._id in statusCounts) statusCounts[row._id] = row.count;

  const riskIds = (riskStats as any[])
    .filter((row) => row.total > 0 && Math.round(((row.present + row.late) / row.total) * 100) < threshold)
    .sort((a, b) => ((a.present + a.late) / a.total) - ((b.present + b.late) / b.total))
    .slice(0, 25);
  const students: any[] = riskIds.length
    ? await Student.find({ _id: { $in: riskIds.map((row) => row._id) } }).select('studentId profile class').populate('profile', 'firstName lastName').populate('class', 'title section').lean()
    : [];
  const studentMap = new Map(students.map((student) => [String(student._id), student]));
  const atRisk = riskIds.map((row) => {
    const student: any = studentMap.get(String(row._id));
    return {
      studentId: student?.studentId || '',
      name: `${student?.profile?.firstName || ''} ${student?.profile?.lastName || ''}`.trim() || student?.studentId || 'Student',
      className: student?.class ? `${student.class.title || ''}${student.class.section ? ` (${student.class.section})` : ''}` : '',
      total: row.total,
      present: row.present,
      late: row.late,
      absent: row.absent,
      excused: row.excused,
      rate: Math.round(((row.present + row.late) / row.total) * 100),
    };
  });

  return ApiResponse.success(res, {
    date: String(req.query.date || new Date().toISOString().slice(0, 10)),
    calendarDay: calendarDay || null,
    sessions: { total: daySchedules.length, complete, partial, missing, completionRate: daySchedules.length ? Math.round((complete / daySchedules.length) * 100) : 0 },
    attendance: statusCounts,
    earlyWarning: { windowDays: days, threshold, count: atRisk.length, students: atRisk },
  });
};
