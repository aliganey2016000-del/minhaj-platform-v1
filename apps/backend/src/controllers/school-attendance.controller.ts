import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Attendance from '../models/attendance.model';
import ClassSchedule from '../models/class-schedule.model';
import Student from '../models/student.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

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
  const schoolId = String(resolveOrgIdForCreate(req, requested) || '');
  if (!schoolId) throw new BadRequestError('School is required');
  const school = await School.findById(schoolId).select('name institutionType organizationType').lean();
  if (!school) throw new NotFoundError('School');
  if (resolveInstitutionType(school as any) !== 'school') throw new BadRequestError('This attendance workflow is only available for schools');
  return { schoolId, school };
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

  const schedules = await ClassSchedule.find({ school: schoolId, dayOfWeek, isActive: true })
    .populate('class', 'title section')
    .populate('course', 'title courseCode')
    .populate(TEACHER_POPULATE)
    .sort({ startTime: 1 })
    .lean();

  const scheduleIds = schedules.map((s: any) => s._id);
  const attendance = scheduleIds.length
    ? await Attendance.find({ schedule: { $in: scheduleIds }, date }).select('schedule status locked').lean()
    : [];

  const bySchedule = new Map<string, any>();
  for (const row of attendance as any[]) {
    const key = String(row.schedule || '');
    const current = bySchedule.get(key) || { total: 0, present: 0, absent: 0, late: 0, excused: 0, locked: false };
    current.total += 1;
    if (row.status in current) current[row.status] += 1;
    current.locked = current.locked || !!row.locked;
    bySchedule.set(key, current);
  }

  const data = schedules.map((schedule: any) => {
    const summary = bySchedule.get(String(schedule._id)) || { total: 0, present: 0, absent: 0, late: 0, excused: 0, locked: false };
    return {
      _id: schedule._id,
      class: schedule.class,
      className: className(schedule.class),
      course: schedule.course,
      teacher: schedule.teacher,
      teacherName: teacherName(schedule.teacher),
      dayOfWeek: schedule.dayOfWeek,
      dayName: DAY_NAMES[schedule.dayOfWeek] || '',
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      attendance: { ...summary, taken: summary.total > 0 },
    };
  });

  return ApiResponse.success(res, { date: String(req.query.date), dayName: DAY_NAMES[dayOfWeek], sessions: data });
};

export const getSchoolSession = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const date = attendanceDay(req.query.date);
  const schedule = await ClassSchedule.findOne({ _id: req.params.scheduleId, school: schoolId })
    .populate('class', 'title section')
    .populate('course', 'title courseCode')
    .populate(TEACHER_POPULATE)
    .lean();
  if (!schedule) throw new NotFoundError('Schedule');

  const classId = (schedule as any).class?._id || (schedule as any).class;
  const courseId = (schedule as any).course?._id || (schedule as any).course;
  const [students, records] = await Promise.all([
    Student.find({ school: schoolId, class: classId, status: 'active', approvalStatus: 'approved' })
      .populate('profile', 'firstName lastName')
      .select('studentId profile class status')
      .sort({ studentId: 1 })
      .lean(),
    Attendance.find({ schedule: schedule._id, course: courseId, date })
      .select('student status notes locked markedBy updatedAt')
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
        locked: !!record.locked,
        markedBy: record.markedBy,
        updatedAt: record.updatedAt,
      } : null,
    };
  });

  return ApiResponse.success(res, {
    date: String(req.query.date),
    schedule: {
      ...(schedule as any),
      className: className((schedule as any).class),
      teacherName: teacherName((schedule as any).teacher),
    },
    locked: records.some((r: any) => !!r.locked),
    taken: records.length > 0,
    roster,
  });
};

export const getSchoolOptions = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const schedules = await ClassSchedule.find({ school: schoolId, isActive: true })
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
