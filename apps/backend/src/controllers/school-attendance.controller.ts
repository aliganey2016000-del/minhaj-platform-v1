import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Attendance from '../models/attendance.model';
import AttendanceSession from '../models/attendance-session.model';
import SubstituteAssignment from '../models/substitute-assignment.model';
import SchoolCalendarDay from '../models/school-calendar-day.model';
import ClassSchedule from '../models/class-schedule.model';
import Student from '../models/student.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { getOwnTeacherRecord, resolveViewableOrgId } from '../utils/tenant-scope';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function attendanceDay(raw: unknown): Date {
  const value = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestError('A valid date (YYYY-MM-DD) is required');
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new BadRequestError('A valid date is required');
  date.setHours(0, 0, 0, 0);
  return date;
}

async function schoolContext(req: Request) {
  const requested = (req.query.school || req.body?.school) as string | undefined;
  const schoolId = String(resolveViewableOrgId(req, requested) || '');
  if (!schoolId || !mongoose.isValidObjectId(schoolId)) throw new BadRequestError('School is required');
  const school = await School.findById(schoolId).select('name institutionType organizationType').lean();
  if (!school) throw new NotFoundError('School');
  if (resolveInstitutionType(school as any) !== 'school') throw new BadRequestError('This attendance workflow is only available for schools');
  return { schoolId, school };
}

async function scheduleScope(req: Request, date?: Date): Promise<Record<string, unknown>> {
  if (req.user?.role !== 'teacher') return {};
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');
  if (!date) return { teacher: teacher._id };

  const substitutes = await SubstituteAssignment.find({ teacher: teacher._id, date, active: true }).select('schedule').lean();
  const substituteScheduleIds = substitutes.map((row: any) => row.schedule);
  return substituteScheduleIds.length
    ? { $or: [{ teacher: teacher._id }, { _id: { $in: substituteScheduleIds } }] }
    : { teacher: teacher._id };
}

const TEACHER_POPULATE = {
  path: 'teacher',
  select: 'teacherId profile user',
  populate: [
    { path: 'profile', select: 'firstName lastName' },
    { path: 'user', select: 'email' },
  ],
};

function teacherName(teacher: any): string {
  if (!teacher) return 'Unassigned';
  const name = `${teacher.profile?.firstName || ''} ${teacher.profile?.lastName || ''}`.trim();
  return name || teacher.user?.email || teacher.teacherId || 'Unassigned';
}

function className(cls: any): string {
  if (!cls) return '—';
  return `${cls.title || ''}${cls.section ? ` (${cls.section})` : ''}`.trim();
}

export const getSchoolSessions = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const date = attendanceDay(req.query.date);
  const dayOfWeek = date.getDay();
  const teacherFilter = await scheduleScope(req, date);

  const calendarDay: any = await SchoolCalendarDay.findOne({ school: schoolId, date })
    .select('date type name isInstructional notes')
    .lean();
  if (calendarDay && calendarDay.isInstructional === false) {
    return ApiResponse.success(res, {
      date: String(req.query.date),
      dayName: DAY_NAMES[dayOfWeek],
      calendarDay,
      sessions: [],
    });
  }

  const schedules = await ClassSchedule.find({ school: schoolId, dayOfWeek, isActive: true, ...teacherFilter })
    .populate('class', 'title section')
    .populate('course', 'title courseCode')
    .populate(TEACHER_POPULATE)
    .sort({ startTime: 1 })
    .lean();

  const scheduleIds = schedules.map((s: any) => s._id);
  const [attendance, completionRows, substitutes] = scheduleIds.length
    ? await Promise.all([
        Attendance.find({ schedule: { $in: scheduleIds }, date }).select('schedule status locked').lean(),
        AttendanceSession.find({ school: schoolId, schedule: { $in: scheduleIds }, date })
          .select('schedule expectedStudents recordedStudents status locked takenBy submittedAt unlockReason')
          .lean(),
        SubstituteAssignment.find({ school: schoolId, schedule: { $in: scheduleIds }, date, active: true })
          .populate({ path: 'teacher', select: 'teacherId profile user', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'user', select: 'email' }] })
          .select('schedule teacher reason')
          .lean(),
      ])
    : [[], [], []];

  const bySchedule = new Map<string, any>();
  for (const row of attendance as any[]) {
    const key = String(row.schedule || '');
    const current = bySchedule.get(key) || { total: 0, present: 0, absent: 0, late: 0, excused: 0, locked: false };
    current.total += 1;
    if (row.status in current) current[row.status] += 1;
    current.locked = current.locked || !!row.locked;
    bySchedule.set(key, current);
  }
  const completionMap = new Map((completionRows as any[]).map((row) => [String(row.schedule), row]));
  const substituteMap = new Map((substitutes as any[]).map((row) => [String(row.schedule), row]));

  const data = schedules.map((schedule: any) => {
    const summary = bySchedule.get(String(schedule._id)) || { total: 0, present: 0, absent: 0, late: 0, excused: 0, locked: false };
    const completion: any = completionMap.get(String(schedule._id));
    const substitute: any = substituteMap.get(String(schedule._id));
    const completionStatus = completion?.status || (summary.total > 0 ? 'partial' : 'not_taken');
    return {
      _id: schedule._id,
      class: schedule.class,
      className: className(schedule.class),
      course: schedule.course,
      teacher: schedule.teacher,
      regularTeacherName: teacherName(schedule.teacher),
      teacherName: substitute ? teacherName(substitute.teacher) : teacherName(schedule.teacher),
      isSubstitute: !!substitute,
      substitute: substitute ? { _id: substitute._id, teacher: substitute.teacher, reason: substitute.reason || '' } : null,
      dayOfWeek: schedule.dayOfWeek,
      dayName: DAY_NAMES[schedule.dayOfWeek] || '',
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      attendance: {
        ...summary,
        expectedStudents: completion?.expectedStudents ?? null,
        recordedStudents: completion?.recordedStudents ?? summary.total,
        completionStatus,
        taken: completionStatus === 'complete',
        locked: completion ? !!completion.locked : summary.locked,
      },
    };
  });

  return ApiResponse.success(res, {
    date: String(req.query.date),
    dayName: DAY_NAMES[dayOfWeek],
    calendarDay: calendarDay || null,
    sessions: data,
  });
};

export const getSchoolSession = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const date = attendanceDay(req.query.date);
  const teacherFilter = await scheduleScope(req, date);

  const calendarDay: any = await SchoolCalendarDay.findOne({ school: schoolId, date }).select('name type isInstructional').lean();
  if (calendarDay && calendarDay.isInstructional === false) {
    throw new BadRequestError(`Attendance is closed for ${calendarDay.name || calendarDay.type} on this date.`);
  }

  const schedule = await ClassSchedule.findOne({ _id: req.params.scheduleId, school: schoolId, ...teacherFilter })
    .populate('class', 'title section')
    .populate('course', 'title courseCode')
    .populate(TEACHER_POPULATE)
    .lean();
  if (!schedule) throw new NotFoundError('Schedule');
  if ((schedule as any).dayOfWeek !== date.getDay()) throw new BadRequestError('This class does not meet on the selected date.');

  const classId = (schedule as any).class?._id || (schedule as any).class;
  const courseId = (schedule as any).course?._id || (schedule as any).course;
  const [students, records, completion, substitute] = await Promise.all([
    Student.find({ school: schoolId, class: classId, status: 'active', approvalStatus: 'approved' })
      .populate('profile', 'firstName lastName')
      .select('studentId profile class status approvalStatus')
      .sort({ studentId: 1 })
      .lean(),
    Attendance.find({ schedule: schedule._id, course: courseId, date })
      .select('student status notes reasonCode arrivalTime departureTime locked markedBy updatedAt')
      .lean(),
    AttendanceSession.findOne({ school: schoolId, schedule: schedule._id, date })
      .select('expectedStudents recordedStudents status locked takenBy submittedAt unlockReason')
      .lean(),
    SubstituteAssignment.findOne({ school: schoolId, schedule: schedule._id, date, active: true })
      .populate({ path: 'teacher', select: 'teacherId profile user', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'user', select: 'email' }] })
      .select('teacher reason')
      .lean(),
  ]);

  const recordMap = new Map(records.map((r: any) => [String(r.student), r]));
  const roster = students.map((student: any) => {
    const record: any = recordMap.get(String(student._id));
    return {
      _id: student._id,
      studentId: student.studentId,
      name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId,
      attendance: record ? {
        _id: record._id,
        status: record.status,
        notes: record.notes || '',
        reasonCode: record.reasonCode || '',
        arrivalTime: record.arrivalTime || '',
        departureTime: record.departureTime || '',
        locked: !!record.locked,
        markedBy: record.markedBy,
        updatedAt: record.updatedAt,
      } : null,
    };
  });

  const inferredComplete = students.length > 0 && records.length === students.length;
  const completionStatus = completion?.status || (records.length === 0 ? 'not_taken' : inferredComplete ? 'complete' : 'partial');
  return ApiResponse.success(res, {
    date: String(req.query.date),
    schedule: {
      ...(schedule as any),
      className: className((schedule as any).class),
      regularTeacherName: teacherName((schedule as any).teacher),
      teacherName: substitute ? teacherName((substitute as any).teacher) : teacherName((schedule as any).teacher),
      isSubstitute: !!substitute,
      substitute: substitute ? { _id: (substitute as any)._id, teacher: (substitute as any).teacher, reason: (substitute as any).reason || '' } : null,
    },
    locked: completion ? !!completion.locked : records.some((r: any) => !!r.locked),
    taken: completionStatus === 'complete',
    completionStatus,
    expectedStudents: completion?.expectedStudents ?? students.length,
    recordedStudents: completion?.recordedStudents ?? records.length,
    unlockReason: completion?.unlockReason || '',
    roster,
  });
};

export const getSchoolOptions = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const teacherFilter = await scheduleScope(req);
  const schedules = await ClassSchedule.find({ school: schoolId, isActive: true, ...teacherFilter })
    .populate('class', 'title section')
    .populate('course', 'title courseCode')
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  const seen = new Set<string>();
  const options: any[] = [];
  for (const schedule of schedules as any[]) {
    if (!schedule.class || !schedule.course) continue;
    const key = `${schedule.class._id}:${schedule.course._id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      classId: schedule.class._id,
      className: className(schedule.class),
      courseId: schedule.course._id,
      courseName: schedule.course.title?.en || schedule.course.courseCode || 'Subject',
      courseCode: schedule.course.courseCode || '',
    });
  }

  return ApiResponse.success(res, options);
};
