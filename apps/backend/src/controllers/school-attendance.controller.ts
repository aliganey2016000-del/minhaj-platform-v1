import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Attendance from '../models/attendance.model';
import AttendanceSession from '../models/attendance-session.model';
import SubstituteAssignment from '../models/substitute-assignment.model';
import SchoolCalendarDay from '../models/school-calendar-day.model';
import ClassSchedule from '../models/class-schedule.model';
import Student from '../models/student.model';
import Profile from '../models/profile.model';
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
  const classId = String(req.query.classId || '').trim();
  const startTime = String(req.query.startTime || '').trim();
  const endTime = String(req.query.endTime || '').trim();
  if (classId && !mongoose.isValidObjectId(classId)) throw new BadRequestError('A valid class is required');

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

  const scheduleQuery: Record<string, unknown> = { school: schoolId, dayOfWeek, isActive: true, ...teacherFilter };
  if (classId) scheduleQuery.class = classId;
  if (startTime) scheduleQuery.startTime = startTime;
  if (endTime) scheduleQuery.endTime = endTime;

  const schedules = await ClassSchedule.find(scheduleQuery)
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
    const current = bySchedule.get(key) || { total: 0, present: 0, absent: 0, locked: false };
    current.total += 1;
    if (row.status === 'present' || row.status === 'late') current.present += 1;
    else if (row.status === 'absent' || row.status === 'excused') current.absent += 1;
    current.locked = current.locked || !!row.locked;
    bySchedule.set(key, current);
  }
  const completionMap = new Map((completionRows as any[]).map((row) => [String(row.schedule), row]));
  const substituteMap = new Map((substitutes as any[]).map((row) => [String(row.schedule), row]));

  const data = schedules.map((schedule: any) => {
    const summary = bySchedule.get(String(schedule._id)) || { total: 0, present: 0, absent: 0, locked: false };
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
        status: record.status === 'present' || record.status === 'late' ? 'present' : 'absent',
        notes: record.notes || '',
        reasonCode: record.status === 'excused' || record.status === 'absent' ? (record.reasonCode || '') : '',
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

export const getSchoolClassReport = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const classId = String(req.query.classId || '').trim();
  if (!mongoose.isValidObjectId(classId)) throw new BadRequestError('A valid class is required.');

  const fromRaw = String(req.query.dateFrom || '').trim();
  const toRaw = String(req.query.dateTo || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    throw new BadRequestError('Valid dateFrom and dateTo values are required.');
  }
  const from = new Date(`${fromRaw}T00:00:00`);
  const to = new Date(`${toRaw}T23:59:59.999`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw new BadRequestError('Invalid attendance report date range.');
  }

  const students: any[] = await Student.find({
    school: schoolId,
    class: classId,
    status: 'active',
    approvalStatus: 'approved',
  })
    .populate('profile', 'firstName lastName')
    .select('studentId profile')
    .sort({ studentId: 1 })
    .lean();

  const studentIds = students.map((student) => student._id);
  const schedules = await ClassSchedule.find({ school: schoolId, class: classId }).select('_id').lean();
  const scheduleIds = schedules.map((schedule: any) => schedule._id);
  const stats: any[] = studentIds.length && scheduleIds.length
    ? await Attendance.aggregate([
        {
          $match: {
            student: { $in: studentIds },
            schedule: { $in: scheduleIds },
            date: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: '$student',
            total: { $sum: 1 },
            present: {
              $sum: {
                $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0],
              },
            },
            absent: {
              $sum: {
                $cond: [{ $in: ['$status', ['absent', 'excused']] }, 1, 0],
              },
            },
          },
        },
      ])
    : [];

  const statsMap = new Map(stats.map((row) => [String(row._id), row]));
  const rows = students.map((student) => {
    const stat: any = statsMap.get(String(student._id));
    const total = stat?.total || 0;
    const present = stat?.present || 0;
    const absent = stat?.absent || 0;
    return {
      _id: student._id,
      studentId: student.studentId,
      name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId,
      total,
      present,
      absent,
      percentage: total > 0 ? Math.round((present / total) * 100) : 0,
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.present += row.present;
      acc.absent += row.absent;
      acc.records += row.total;
      return acc;
    },
    { present: 0, absent: 0, records: 0 },
  );

  return ApiResponse.success(res, {
    dateFrom: fromRaw,
    dateTo: toRaw,
    classId,
    summary: {
      students: students.length,
      present: totals.present,
      absent: totals.absent,
      presentPercentage: totals.records ? Math.round((totals.present / totals.records) * 100) : 0,
      absentPercentage: totals.records ? Math.round((totals.absent / totals.records) * 100) : 0,
    },
    rows,
  });
};

export const getSchoolClassStudentReport = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const classId = String(req.query.classId || '').trim();
  const studentId = String(req.query.studentId || '').trim();
  if (!mongoose.isValidObjectId(classId) || !mongoose.isValidObjectId(studentId)) {
    throw new BadRequestError('A valid class and student are required.');
  }

  const fromRaw = String(req.query.dateFrom || '').trim();
  const toRaw = String(req.query.dateTo || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    throw new BadRequestError('Valid dateFrom and dateTo values are required.');
  }
  const from = new Date(`${fromRaw}T00:00:00`);
  const to = new Date(`${toRaw}T23:59:59.999`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw new BadRequestError('Invalid attendance report date range.');
  }

  const student: any = await Student.findOne({
    _id: studentId,
    school: schoolId,
    class: classId,
    status: 'active',
    approvalStatus: 'approved',
  })
    .populate('profile', 'firstName lastName')
    .select('studentId profile')
    .lean();
  if (!student) throw new NotFoundError('Student');

  const schedules = await ClassSchedule.find({ school: schoolId, class: classId }).select('_id').lean();
  const scheduleIds = schedules.map((schedule: any) => schedule._id);
  const records: any[] = scheduleIds.length ? await Attendance.find({
    student: student._id,
    schedule: { $in: scheduleIds },
    date: { $gte: from, $lte: to },
  })
    .populate('course', 'title courseCode')
    .populate('schedule', 'startTime endTime')
    .select('date status reasonCode notes course schedule')
    .sort({ date: -1 })
    .lean() : [];

  return ApiResponse.success(res, {
    student: {
      _id: student._id,
      studentId: student.studentId,
      name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId,
    },
    records: records.map((record) => ({
      _id: record._id,
      date: record.date,
      status: record.status === 'present' || record.status === 'late' ? 'present' : 'absent',
      excused: record.status === 'excused' || !!record.reasonCode,
      reasonCode: record.reasonCode || '',
      notes: record.notes || '',
      courseName: record.course?.title?.en || record.course?.courseCode || 'Subject',
      period: record.schedule?.startTime && record.schedule?.endTime
        ? `${record.schedule.startTime}–${record.schedule.endTime}`
        : '',
    })),
  });
};


export const getSchoolDateReport = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const date = attendanceDay(req.query.date);
  const dayOfWeek = date.getDay();
  const requestedStartTime = String(req.query.startTime || '').trim();
  const requestedEndTime = String(req.query.endTime || '').trim();
  if ((requestedStartTime && !requestedEndTime) || (!requestedStartTime && requestedEndTime)) {
    throw new BadRequestError('Both startTime and endTime are required when filtering by period.');
  }

  const calendarDay: any = await SchoolCalendarDay.findOne({ school: schoolId, date })
    .select('name type isInstructional')
    .lean();

  if (calendarDay && calendarDay.isInstructional === false) {
    return ApiResponse.success(res, {
      date: String(req.query.date),
      calendarDay,
      summary: { students: 0, sessions: 0, records: 0, present: 0, absent: 0, presentPercentage: 0, absentPercentage: 0 },
      periods: [],
      classes: [],
    });
  }

  const allSchedules: any[] = await ClassSchedule.find({ school: schoolId, dayOfWeek, isActive: true })
    .populate('class', 'title section')
    .populate('course', 'title courseCode')
    .select('_id class course startTime endTime')
    .sort({ startTime: 1, endTime: 1 })
    .lean();

  const allPeriodMap = new Map<string, { key: string; startTime: string; endTime: string }>();
  for (const schedule of allSchedules) {
    const startTime = String(schedule.startTime || '').slice(0, 5);
    const endTime = String(schedule.endTime || '').slice(0, 5);
    if (!startTime || !endTime) continue;
    const key = `${startTime}|${endTime}`;
    if (!allPeriodMap.has(key)) allPeriodMap.set(key, { key, startTime, endTime });
  }
  const allPeriods = [...allPeriodMap.values()]
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime))
    .map((period, index) => ({ ...period, label: `Period ${index + 1}` }));

  const schedules = requestedStartTime && requestedEndTime
    ? allSchedules.filter((schedule) =>
        String(schedule.startTime || '').slice(0, 5) === requestedStartTime.slice(0, 5)
        && String(schedule.endTime || '').slice(0, 5) === requestedEndTime.slice(0, 5))
    : allSchedules;

  const periodKeys = new Set(schedules.map((schedule) =>
    `${String(schedule.startTime || '').slice(0, 5)}|${String(schedule.endTime || '').slice(0, 5)}`));
  const periods = allPeriods.filter((period) => periodKeys.has(period.key));

  const scheduleIds = schedules.map((schedule) => schedule._id);
  const attendance: any[] = scheduleIds.length
    ? await Attendance.find({ schedule: { $in: scheduleIds }, date })
        .select('schedule student status')
        .lean()
    : [];

  type PeriodAttendance = {
    scheduled: boolean;
    sessions: Set<string>;
    subjects: Set<string>;
    records: number;
    present: number;
    absent: number;
  };

  type ClassAttendance = {
    classId: string;
    className: string;
    sessions: Set<string>;
    students: Set<string>;
    records: number;
    present: number;
    absent: number;
    periods: Map<string, PeriodAttendance>;
  };

  const scheduleMap = new Map(schedules.map((schedule) => [String(schedule._id), schedule]));
  const classMap = new Map<string, ClassAttendance>();

  for (const schedule of schedules) {
    const cls: any = schedule.class;
    if (!cls?._id) continue;
    const classKey = String(cls._id);
    const periodKey = `${String(schedule.startTime || '').slice(0, 5)}|${String(schedule.endTime || '').slice(0, 5)}`;
    const current = classMap.get(classKey) || {
      classId: classKey,
      className: className(cls),
      sessions: new Set<string>(),
      students: new Set<string>(),
      records: 0,
      present: 0,
      absent: 0,
      periods: new Map<string, PeriodAttendance>(),
    };

    current.sessions.add(String(schedule._id));
    const period = current.periods.get(periodKey) || {
      scheduled: true,
      sessions: new Set<string>(),
      subjects: new Set<string>(),
      records: 0,
      present: 0,
      absent: 0,
    };
    period.scheduled = true;
    period.sessions.add(String(schedule._id));
    const subjectName = schedule.course?.title?.en || schedule.course?.courseCode || '';
    if (subjectName) period.subjects.add(subjectName);
    current.periods.set(periodKey, period);
    classMap.set(classKey, current);
  }

  const schoolStudents = new Set<string>();
  let present = 0;
  let absent = 0;

  for (const row of attendance) {
    const schedule: any = scheduleMap.get(String(row.schedule));
    const cls: any = schedule?.class;
    if (!cls?._id) continue;
    const classKey = String(cls._id);
    const current = classMap.get(classKey);
    if (!current) continue;

    const periodKey = `${String(schedule.startTime || '').slice(0, 5)}|${String(schedule.endTime || '').slice(0, 5)}`;
    const period = current.periods.get(periodKey);

    current.records += 1;
    if (period) period.records += 1;

    if (row.student) {
      current.students.add(String(row.student));
      schoolStudents.add(String(row.student));
    }

    if (row.status === 'present' || row.status === 'late') {
      current.present += 1;
      if (period) period.present += 1;
      present += 1;
    } else if (row.status === 'absent' || row.status === 'excused') {
      current.absent += 1;
      if (period) period.absent += 1;
      absent += 1;
    }
  }

  const classes = [...classMap.values()]
    .map((row) => {
      const periodStats: Record<string, {
        scheduled: boolean;
        sessions: number;
        subjects: string[];
        records: number;
        present: number;
        absent: number;
        percentage: number;
      }> = {};

      for (const period of periods) {
        const stats = row.periods.get(period.key);
        periodStats[period.key] = stats
          ? {
              scheduled: true,
              sessions: stats.sessions.size,
              subjects: [...stats.subjects],
              records: stats.records,
              present: stats.present,
              absent: stats.absent,
              percentage: stats.records ? Math.round((stats.present / stats.records) * 100) : 0,
            }
          : {
              scheduled: false,
              sessions: 0,
              subjects: [],
              records: 0,
              present: 0,
              absent: 0,
              percentage: 0,
            };
      }

      return {
        classId: row.classId,
        className: row.className,
        sessions: row.sessions.size,
        students: row.students.size,
        records: row.records,
        present: row.present,
        absent: row.absent,
        percentage: row.records ? Math.round((row.present / row.records) * 100) : 0,
        periods: periodStats,
      };
    })
    .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));

  const records = present + absent;
  return ApiResponse.success(res, {
    date: String(req.query.date),
    calendarDay: calendarDay || null,
    periodFilter: requestedStartTime && requestedEndTime
      ? { startTime: requestedStartTime, endTime: requestedEndTime }
      : null,
    summary: {
      students: schoolStudents.size,
      sessions: schedules.length,
      records,
      present,
      absent,
      presentPercentage: records ? Math.round((present / records) * 100) : 0,
      absentPercentage: records ? Math.round((absent / records) * 100) : 0,
    },
    periods,
    classes,
  });
};

export const getSchoolClassPeriodReport = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const date = attendanceDay(req.query.date);
  const classId = String(req.query.classId || '').trim();
  const startTime = String(req.query.startTime || '').trim();
  const endTime = String(req.query.endTime || '').trim();

  if (!mongoose.isValidObjectId(classId)) throw new BadRequestError('A valid class is required.');
  if (!startTime || !endTime) throw new BadRequestError('A valid period is required.');

  const schedules: any[] = await ClassSchedule.find({
    school: schoolId,
    class: classId,
    dayOfWeek: date.getDay(),
    startTime,
    endTime,
    isActive: true,
  })
    .populate('class', 'title section')
    .populate('course', 'title courseCode')
    .select('_id class course startTime endTime')
    .lean();

  const students: any[] = await Student.find({
    school: schoolId,
    class: classId,
    status: 'active',
    approvalStatus: 'approved',
  })
    .populate('profile', 'firstName lastName')
    .select('studentId profile')
    .sort({ studentId: 1 })
    .lean();

  const scheduleIds = schedules.map((schedule) => schedule._id);
  const attendance: any[] = scheduleIds.length
    ? await Attendance.find({ schedule: { $in: scheduleIds }, date })
        .select('student status reasonCode')
        .lean()
    : [];

  const recordMap = new Map<string, any>();
  for (const row of attendance) {
    if (!row.student) continue;
    recordMap.set(String(row.student), row);
  }

  let present = 0;
  let absent = 0;
  const rows = students.map((student) => {
    const record = recordMap.get(String(student._id));
    const status = !record
      ? null
      : record.status === 'present' || record.status === 'late'
        ? 'present'
        : 'absent';

    if (status === 'present') present += 1;
    if (status === 'absent') absent += 1;

    return {
      _id: student._id,
      studentId: student.studentId,
      name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId,
      status,
      excused: status === 'absent' && (record?.status === 'excused' || !!record?.reasonCode),
    };
  });

  const marked = present + absent;
  const firstSchedule: any = schedules[0];
  return ApiResponse.success(res, {
    date: String(req.query.date),
    class: firstSchedule?.class
      ? { _id: firstSchedule.class._id, name: className(firstSchedule.class) }
      : { _id: classId, name: 'Class' },
    period: `${startTime}–${endTime}`,
    subjects: schedules.map((schedule) => schedule.course?.title?.en || schedule.course?.courseCode || 'Subject'),
    summary: {
      students: students.length,
      marked,
      present,
      absent,
      presentPercentage: marked ? Math.round((present / marked) * 100) : 0,
      absentPercentage: marked ? Math.round((absent / marked) * 100) : 0,
    },
    rows,
  });
};

export const searchSchoolReportStudents = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const search = String(req.query.search || '').trim();
  if (search.length < 2) return ApiResponse.success(res, []);

  const escapeRegex = (value: string) => value.replace(/[.*+?^$(){}|[\]\\]/g, (match) => `\\${match}`);
  const regex = new RegExp(escapeRegex(search), 'i');
  const terms = search.split(/\s+/).filter(Boolean).slice(0, 4);
  const profileIds = await Profile.find({
    $and: terms.map((term) => {
      const termRegex = new RegExp(escapeRegex(term), 'i');
      return { $or: [{ firstName: termRegex }, { lastName: termRegex }] };
    }),
  })
    .select('_id')
    .limit(60)
    .lean();

  const students: any[] = await Student.find({
    school: schoolId,
    status: 'active',
    approvalStatus: 'approved',
    $or: [
      { studentId: regex },
      { profile: { $in: profileIds.map((profile) => profile._id) } },
    ],
  })
    .populate('profile', 'firstName lastName')
    .populate('class', 'title section')
    .select('studentId profile class')
    .sort({ studentId: 1 })
    .limit(30)
    .lean();

  return ApiResponse.success(res, students.map((student) => ({
    _id: student._id,
    studentId: student.studentId,
    name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId,
    className: student.class ? className(student.class) : 'Unassigned',
  })));
};

export const getSchoolTeacherAttendanceComplianceReport = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const toRaw = String(req.query.to || '').trim();
  const daysRaw = Number(req.query.days || 30);
  const days = Number.isFinite(daysRaw) ? Math.min(120, Math.max(1, Math.round(daysRaw))) : 30;

  const to = toRaw ? attendanceDay(toRaw) : (() => {
    const value = new Date();
    value.setHours(23, 59, 59, 999);
    return value;
  })();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  const dateKey = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const schedules: any[] = await ClassSchedule.find({ school: schoolId, isActive: true })
    .populate('class', 'title section')
    .populate('course', 'title courseCode')
    .populate(TEACHER_POPULATE)
    .select('_id class course teacher dayOfWeek startTime endTime createdAt')
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  const scheduleIds = schedules.map((schedule) => schedule._id);
  const [sessions, substitutes, calendarClosures] = await Promise.all([
    scheduleIds.length
      ? AttendanceSession.find({
          school: schoolId,
          schedule: { $in: scheduleIds },
          date: { $gte: from, $lte: to },
        })
          .select('schedule date status takenBy submittedAt recordedStudents expectedStudents')
          .lean()
      : [],
    scheduleIds.length
      ? SubstituteAssignment.find({
          school: schoolId,
          schedule: { $in: scheduleIds },
          date: { $gte: from, $lte: to },
          active: true,
        })
          .populate({ path: 'teacher', select: 'teacherId profile user status', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'user', select: 'email' }] })
          .select('schedule date teacher reason')
          .lean()
      : [],
    SchoolCalendarDay.find({
      school: schoolId,
      date: { $gte: from, $lte: to },
      isInstructional: false,
    })
      .select('date')
      .lean(),
  ]);

  const sessionMap = new Map<string, any>();
  for (const session of sessions as any[]) {
    sessionMap.set(`${String(session.schedule)}:${dateKey(new Date(session.date))}`, session);
  }

  const substituteMap = new Map<string, any>();
  for (const substitute of substitutes as any[]) {
    substituteMap.set(`${String(substitute.schedule)}:${dateKey(new Date(substitute.date))}`, substitute);
  }

  const closedDates = new Set((calendarClosures as any[]).map((row) => dateKey(new Date(row.date))));

  type TeacherComplianceRow = {
    teacherId: string;
    teacherCode: string;
    teacherName: string;
    scheduled: number;
    teacherSubmitted: number;
    submittedByOther: number;
    partial: number;
    missing: number;
    classes: Set<string>;
    courses: Set<string>;
  };

  const rowsMap = new Map<string, TeacherComplianceRow>();
  let unassignedSessions = 0;

  const now = new Date();
  const somaliaNow = new Date(now.getTime() + (3 * 60 * 60 * 1000));
  const currentLocalDateKey = somaliaNow.toISOString().slice(0, 10);
  const currentLocalTime = somaliaNow.toISOString().slice(11, 16);

  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    const occurrenceDate = new Date(cursor);
    occurrenceDate.setHours(0, 0, 0, 0);
    const occurrenceKey = dateKey(occurrenceDate);
    if (closedDates.has(occurrenceKey)) continue;

    for (const schedule of schedules) {
      if (Number(schedule.dayOfWeek) !== occurrenceDate.getDay()) continue;

      const createdAt = schedule.createdAt ? new Date(schedule.createdAt) : null;
      if (createdAt && occurrenceDate < new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate())) continue;

      // Do not penalise a teacher for a lesson that has not finished yet today.
      if (occurrenceKey === currentLocalDateKey && String(schedule.endTime || '') > currentLocalTime) continue;
      // Never count future dates if a future "as of" date was supplied.
      if (occurrenceKey > currentLocalDateKey) continue;

      const key = `${String(schedule._id)}:${occurrenceKey}`;
      const substitute: any = substituteMap.get(key);
      const responsibleTeacher: any = substitute?.teacher || schedule.teacher;

      if (!responsibleTeacher?._id) {
        unassignedSessions += 1;
        continue;
      }

      const teacherKey = String(responsibleTeacher._id);
      const current = rowsMap.get(teacherKey) || {
        teacherId: teacherKey,
        teacherCode: responsibleTeacher.teacherId || '',
        teacherName: teacherName(responsibleTeacher),
        scheduled: 0,
        teacherSubmitted: 0,
        submittedByOther: 0,
        partial: 0,
        missing: 0,
        classes: new Set<string>(),
        courses: new Set<string>(),
      };

      current.scheduled += 1;
      const clsName = className(schedule.class);
      if (clsName && clsName !== '—') current.classes.add(clsName);
      const courseName = schedule.course?.title?.en || schedule.course?.courseCode || '';
      if (courseName) current.courses.add(courseName);

      const session: any = sessionMap.get(key);
      if (!session) {
        current.missing += 1;
      } else if (session.status !== 'complete') {
        current.partial += 1;
      } else if (
        responsibleTeacher.user
        && String(session.takenBy) === String(responsibleTeacher.user?._id || responsibleTeacher.user)
      ) {
        current.teacherSubmitted += 1;
      } else {
        current.submittedByOther += 1;
      }

      rowsMap.set(teacherKey, current);
    }
  }

  const rows = [...rowsMap.values()]
    .map((row) => ({
      teacherId: row.teacherId,
      teacherCode: row.teacherCode,
      teacherName: row.teacherName,
      scheduled: row.scheduled,
      teacherSubmitted: row.teacherSubmitted,
      submittedByOther: row.submittedByOther,
      completed: row.teacherSubmitted + row.submittedByOther,
      partial: row.partial,
      missing: row.missing,
      compliancePercentage: row.scheduled ? Math.round((row.teacherSubmitted / row.scheduled) * 100) : 0,
      completionPercentage: row.scheduled ? Math.round(((row.teacherSubmitted + row.submittedByOther) / row.scheduled) * 100) : 0,
      classes: [...row.classes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      courses: [...row.courses].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }))
    .sort((a, b) =>
      a.compliancePercentage - b.compliancePercentage
      || b.missing - a.missing
      || a.teacherName.localeCompare(b.teacherName));

  const scheduled = rows.reduce((sum, row) => sum + row.scheduled, 0);
  const teacherSubmitted = rows.reduce((sum, row) => sum + row.teacherSubmitted, 0);
  const submittedByOther = rows.reduce((sum, row) => sum + row.submittedByOther, 0);
  const partial = rows.reduce((sum, row) => sum + row.partial, 0);
  const missing = rows.reduce((sum, row) => sum + row.missing, 0);

  return ApiResponse.success(res, {
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
      days,
    },
    summary: {
      teachers: rows.length,
      scheduled,
      teacherSubmitted,
      submittedByOther,
      completed: teacherSubmitted + submittedByOther,
      partial,
      missing,
      unassignedSessions,
      compliancePercentage: scheduled ? Math.round((teacherSubmitted / scheduled) * 100) : 0,
      completionPercentage: scheduled ? Math.round(((teacherSubmitted + submittedByOther) / scheduled) * 100) : 0,
    },
    rows,
  });
};

export const getSchoolAttendanceRiskReport = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const toRaw = String(req.query.to || '').trim();
  const daysRaw = Number(req.query.days || 30);
  const days = Number.isFinite(daysRaw) ? Math.min(120, Math.max(7, Math.round(daysRaw))) : 30;
  const to = toRaw ? attendanceDay(toRaw) : (() => {
    const value = new Date();
    value.setHours(23, 59, 59, 999);
    return value;
  })();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  const students: any[] = await Student.find({
    school: schoolId,
    status: 'active',
    approvalStatus: 'approved',
  })
    .populate('profile', 'firstName lastName')
    .populate('class', 'title section')
    .select('studentId profile class')
    .sort({ studentId: 1 })
    .lean();

  const studentIds = students.map((student) => student._id);
  const schoolSchedules = await ClassSchedule.find({ school: schoolId }).select('_id').lean();
  const schoolScheduleIds = schoolSchedules.map((schedule: any) => schedule._id);

  const dailyRows: any[] = studentIds.length && schoolScheduleIds.length
    ? await Attendance.aggregate([
        {
          $match: {
            student: { $in: studentIds },
            schedule: { $in: schoolScheduleIds },
            date: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: { student: '$student', date: '$date' },
            records: { $sum: 1 },
            present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $in: ['$status', ['absent', 'excused']] }, 1, 0] } },
            hasPresent: { $max: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
            hasAbsent: { $max: { $cond: [{ $in: ['$status', ['absent', 'excused']] }, 1, 0] } },
          },
        },
        { $sort: { '_id.student': 1, '_id.date': 1 } },
      ])
    : [];

  type StudentRiskStats = {
    total: number;
    present: number;
    absent: number;
    days: Array<{ date: Date; fullyAbsent: boolean }>;
  };

  const statsMap = new Map<string, StudentRiskStats>();
  for (const row of dailyRows) {
    const key = String(row._id?.student || '');
    if (!key) continue;
    const current = statsMap.get(key) || { total: 0, present: 0, absent: 0, days: [] };
    current.total += Number(row.records || 0);
    current.present += Number(row.present || 0);
    current.absent += Number(row.absent || 0);
    current.days.push({
      date: new Date(row._id.date),
      fullyAbsent: Number(row.hasAbsent || 0) > 0 && Number(row.hasPresent || 0) === 0,
    });
    statsMap.set(key, current);
  }

  const rows = students
    .map((student) => {
      const stats = statsMap.get(String(student._id));
      if (!stats || stats.total === 0) return null;

      const sortedDays = [...stats.days].sort((a, b) => b.date.getTime() - a.date.getTime());
      let consecutiveAbsentDays = 0;
      for (const day of sortedDays) {
        if (!day.fullyAbsent) break;
        consecutiveAbsentDays += 1;
      }

      const percentage = Math.round((stats.present / stats.total) * 100);
      const enoughHistory = stats.total >= 5;
      const highByPercentage = enoughHistory && percentage < 80;
      const warningByPercentage = enoughHistory && percentage >= 80 && percentage < 90;
      const highByConsecutive = consecutiveAbsentDays >= 3;
      const riskLevel = highByPercentage || highByConsecutive
        ? 'high'
        : warningByPercentage
          ? 'warning'
          : null;

      if (!riskLevel) return null;

      const reasons: string[] = [];
      if (highByPercentage) reasons.push('Attendance below 80%');
      else if (warningByPercentage) reasons.push('Attendance below 90%');
      if (highByConsecutive) reasons.push(`${consecutiveAbsentDays} consecutive absent days`);

      return {
        studentId: student._id,
        admissionNumber: student.studentId,
        name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId,
        classId: student.class?._id || null,
        className: student.class ? className(student.class) : 'Unassigned',
        total: stats.total,
        present: stats.present,
        absent: stats.absent,
        percentage,
        consecutiveAbsentDays,
        lastAttendanceDate: sortedDays[0]?.date || null,
        riskLevel,
        reasons,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      if (a.riskLevel !== b.riskLevel) return a.riskLevel === 'high' ? -1 : 1;
      if (a.percentage !== b.percentage) return a.percentage - b.percentage;
      return b.consecutiveAbsentDays - a.consecutiveAbsentDays;
    });

  const highRisk = rows.filter((row: any) => row.riskLevel === 'high').length;
  const warning = rows.filter((row: any) => row.riskLevel === 'warning').length;
  const consecutiveAbsence = rows.filter((row: any) => row.consecutiveAbsentDays >= 3).length;

  return ApiResponse.success(res, {
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
      days,
    },
    thresholds: {
      highRiskBelowPercentage: 80,
      warningBelowPercentage: 90,
      consecutiveAbsentDays: 3,
      minimumAttendanceRecords: 5,
    },
    summary: {
      activeStudents: students.length,
      studentsWithAttendance: statsMap.size,
      atRisk: rows.length,
      highRisk,
      warning,
      consecutiveAbsence,
    },
    rows,
  });
};

export const getSchoolStudentOverallReport = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const studentId = String(req.params.studentId || '').trim();
  if (!mongoose.isValidObjectId(studentId)) throw new BadRequestError('A valid student is required.');

  const student: any = await Student.findOne({ _id: studentId, school: schoolId })
    .populate('profile', 'firstName lastName')
    .populate('class', 'title section')
    .populate('enrolledCourses', 'title courseCode')
    .select('studentId profile class status approvalStatus enrolledCourses')
    .lean();
  if (!student) throw new NotFoundError('Student');

  const schoolSchedules = await ClassSchedule.find({ school: schoolId }).select('_id').lean();
  const schoolScheduleIds = schoolSchedules.map((schedule: any) => schedule._id);

  const stats: any[] = schoolScheduleIds.length ? await Attendance.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId), schedule: { $in: schoolScheduleIds } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $in: ['$status', ['absent', 'excused']] }, 1, 0] } },
      },
    },
  ]) : [];
  const summaryRow = stats[0] || { total: 0, present: 0, absent: 0 };

  // Course-level totals are intentionally calculated by distinct attendance
  // dates so "Total Days" is not inflated if the same subject has more than
  // one timetable session on a single day.
  const courseStats: any[] = schoolScheduleIds.length ? await Attendance.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        schedule: { $in: schoolScheduleIds },
        course: { $ne: null },
      },
    },
    {
      $group: {
        _id: {
          course: '$course',
          day: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        },
        presentOnDay: {
          $max: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] },
        },
        absentOnDay: {
          $max: { $cond: [{ $in: ['$status', ['absent', 'excused']] }, 1, 0] },
        },
      },
    },
    {
      $group: {
        _id: '$_id.course',
        totalDays: { $sum: 1 },
        present: { $sum: '$presentOnDay' },
        absent: {
          $sum: {
            $cond: [
              { $eq: ['$presentOnDay', 1] },
              0,
              '$absentOnDay',
            ],
          },
        },
      },
    },
  ]) : [];

  const courseStatsMap = new Map(courseStats.map((row: any) => [String(row._id), row]));
  const courseMap = new Map<string, { _id: any; name: string; code: string }>();

  for (const course of student.enrolledCourses || []) {
    if (!course?._id) continue;
    courseMap.set(String(course._id), {
      _id: course._id,
      name: course.title?.en || course.courseCode || 'Subject',
      code: course.courseCode || '',
    });
  }

  if (student.class?._id) {
    const activeSchedules: any[] = await ClassSchedule.find({
      school: schoolId,
      class: student.class._id,
      isActive: true,
    })
      .populate('course', 'title courseCode')
      .select('course')
      .lean();

    for (const schedule of activeSchedules) {
      const course = schedule.course;
      if (!course?._id || courseMap.has(String(course._id))) continue;
      courseMap.set(String(course._id), {
        _id: course._id,
        name: course.title?.en || course.courseCode || 'Subject',
        code: course.courseCode || '',
      });
    }
  }

  const records: any[] = schoolScheduleIds.length ? await Attendance.find({
    student: student._id,
    schedule: { $in: schoolScheduleIds },
  })
    .populate('course', 'title courseCode')
    .populate('schedule', 'startTime endTime')
    .select('date status reasonCode notes course schedule')
    .sort({ date: -1 })
    .limit(200)
    .lean() : [];

  // Older data may have attendance records without a current enrolledCourses
  // link. Keep those subjects visible rather than hiding valid history.
  for (const record of records) {
    const course = record.course;
    if (!course?._id || courseMap.has(String(course._id))) continue;
    courseMap.set(String(course._id), {
      _id: course._id,
      name: course.title?.en || course.courseCode || 'Subject',
      code: course.courseCode || '',
    });
  }

  const courses = [...courseMap.values()]
    .map((course) => {
      const row: any = courseStatsMap.get(String(course._id)) || { totalDays: 0, present: 0, absent: 0 };
      const totalDays = Number(row.totalDays || 0);
      const present = Number(row.present || 0);
      const absent = Number(row.absent || 0);
      return {
        _id: course._id,
        courseName: course.name,
        courseCode: course.code,
        totalDays,
        present,
        absent,
        presentPercentage: totalDays ? Math.round((present / totalDays) * 100) : 0,
      };
    })
    .sort((a, b) => a.courseName.localeCompare(b.courseName, undefined, { numeric: true }));

  return ApiResponse.success(res, {
    student: {
      _id: student._id,
      studentId: student.studentId,
      name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId,
      className: student.class ? className(student.class) : 'Unassigned',
    },
    summary: {
      total: summaryRow.total || 0,
      present: summaryRow.present || 0,
      absent: summaryRow.absent || 0,
      percentage: summaryRow.total ? Math.round(((summaryRow.present || 0) / summaryRow.total) * 100) : 0,
    },
    courses,
    records: records.map((record) => ({
      _id: record._id,
      date: record.date,
      status: record.status === 'present' || record.status === 'late' ? 'present' : 'absent',
      excused: record.status === 'excused' || !!record.reasonCode,
      reasonCode: record.reasonCode || '',
      notes: record.notes || '',
      courseName: record.course?.title?.en || record.course?.courseCode || 'Subject',
      period: record.schedule?.startTime && record.schedule?.endTime
        ? `${record.schedule.startTime}–${record.schedule.endTime}`
        : '',
    })),
  });
};

export const getSchoolOptions = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const teacherFilter = await scheduleScope(req);
  const dateValue = String(req.query.date || '').trim();
  const scheduleQuery: Record<string, unknown> = { school: schoolId, isActive: true, ...teacherFilter };
  if (dateValue) scheduleQuery.dayOfWeek = attendanceDay(dateValue).getDay();

  const schedules = await ClassSchedule.find(scheduleQuery)
    .populate('class', 'title section')
    .populate('course', 'title courseCode')
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  const seen = new Set<string>();
  const options: any[] = [];
  for (const schedule of schedules as any[]) {
    if (!schedule.class || !schedule.course) continue;
    const key = dateValue
      ? `${schedule.class._id}:${schedule.course._id}:${schedule.startTime}:${schedule.endTime}`
      : `${schedule.class._id}:${schedule.course._id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      classId: schedule.class._id,
      className: className(schedule.class),
      courseId: schedule.course._id,
      courseName: schedule.course.title?.en || schedule.course.courseCode || 'Subject',
      courseCode: schedule.course.courseCode || '',
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    });
  }

  return ApiResponse.success(res, options);
};
