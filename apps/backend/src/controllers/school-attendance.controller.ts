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

  const calendarDay: any = await SchoolCalendarDay.findOne({ school: schoolId, date })
    .select('name type isInstructional')
    .lean();

  if (calendarDay && calendarDay.isInstructional === false) {
    return ApiResponse.success(res, {
      date: String(req.query.date),
      calendarDay,
      summary: { students: 0, sessions: 0, records: 0, present: 0, absent: 0, presentPercentage: 0, absentPercentage: 0 },
      classes: [],
    });
  }

  const schedules: any[] = await ClassSchedule.find({ school: schoolId, dayOfWeek, isActive: true })
    .populate('class', 'title section')
    .select('_id class startTime endTime')
    .sort({ startTime: 1 })
    .lean();

  const scheduleIds = schedules.map((schedule) => schedule._id);
  const attendance: any[] = scheduleIds.length
    ? await Attendance.find({ schedule: { $in: scheduleIds }, date })
        .select('schedule student status')
        .lean()
    : [];

  const scheduleMap = new Map(schedules.map((schedule) => [String(schedule._id), schedule]));
  const classMap = new Map<string, {
    classId: string;
    className: string;
    sessions: Set<string>;
    students: Set<string>;
    records: number;
    present: number;
    absent: number;
  }>();

  for (const schedule of schedules) {
    const cls: any = schedule.class;
    if (!cls?._id) continue;
    const key = String(cls._id);
    const current = classMap.get(key) || {
      classId: key,
      className: className(cls),
      sessions: new Set<string>(),
      students: new Set<string>(),
      records: 0,
      present: 0,
      absent: 0,
    };
    current.sessions.add(String(schedule._id));
    classMap.set(key, current);
  }

  const schoolStudents = new Set<string>();
  let present = 0;
  let absent = 0;

  for (const row of attendance) {
    const schedule: any = scheduleMap.get(String(row.schedule));
    const cls: any = schedule?.class;
    if (!cls?._id) continue;
    const key = String(cls._id);
    const current = classMap.get(key);
    if (!current) continue;

    current.records += 1;
    if (row.student) {
      current.students.add(String(row.student));
      schoolStudents.add(String(row.student));
    }
    if (row.status === 'present' || row.status === 'late') {
      current.present += 1;
      present += 1;
    } else if (row.status === 'absent' || row.status === 'excused') {
      current.absent += 1;
      absent += 1;
    }
  }

  const classes = [...classMap.values()]
    .map((row) => ({
      classId: row.classId,
      className: row.className,
      sessions: row.sessions.size,
      students: row.students.size,
      records: row.records,
      present: row.present,
      absent: row.absent,
      percentage: row.records ? Math.round((row.present / row.records) * 100) : 0,
    }))
    .sort((a, b) => a.className.localeCompare(b.className));

  const records = present + absent;
  return ApiResponse.success(res, {
    date: String(req.query.date),
    calendarDay: calendarDay || null,
    summary: {
      students: schoolStudents.size,
      sessions: schedules.length,
      records,
      present,
      absent,
      presentPercentage: records ? Math.round((present / records) * 100) : 0,
      absentPercentage: records ? Math.round((absent / records) * 100) : 0,
    },
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
      name: \`\${student.profile?.firstName || ''} \${student.profile?.lastName || ''}\`.trim() || student.studentId,
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
    period: \`\${startTime}–\${endTime}\`,
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

  const escaped = search.replace(/[.*+?^$(){}|[\]\\]/g, '\\export const getSchoolOptions = async (req: Request, res: Response): Promise<Response> => {');
  const regex = new RegExp(escaped, 'i');
  const profileIds = await Profile.find({
    $or: [{ firstName: regex }, { lastName: regex }],
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
    name: \`\${student.profile?.firstName || ''} \${student.profile?.lastName || ''}\`.trim() || student.studentId,
    className: student.class ? className(student.class) : 'Unassigned',
  })));
};

export const getSchoolStudentOverallReport = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await schoolContext(req);
  const studentId = String(req.params.studentId || '').trim();
  if (!mongoose.isValidObjectId(studentId)) throw new BadRequestError('A valid student is required.');

  const student: any = await Student.findOne({ _id: studentId, school: schoolId })
    .populate('profile', 'firstName lastName')
    .populate('class', 'title section')
    .select('studentId profile class status approvalStatus')
    .lean();
  if (!student) throw new NotFoundError('Student');

  const stats: any[] = await Attendance.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $in: ['$status', ['absent', 'excused']] }, 1, 0] } },
      },
    },
  ]);
  const summaryRow = stats[0] || { total: 0, present: 0, absent: 0 };

  const records: any[] = await Attendance.find({ student: student._id })
    .populate('course', 'title courseCode')
    .populate('schedule', 'startTime endTime')
    .select('date status reasonCode notes course schedule')
    .sort({ date: -1 })
    .limit(200)
    .lean();

  return ApiResponse.success(res, {
    student: {
      _id: student._id,
      studentId: student.studentId,
      name: \`\${student.profile?.firstName || ''} \${student.profile?.lastName || ''}\`.trim() || student.studentId,
      className: student.class ? className(student.class) : 'Unassigned',
    },
    summary: {
      total: summaryRow.total || 0,
      present: summaryRow.present || 0,
      absent: summaryRow.absent || 0,
      percentage: summaryRow.total ? Math.round(((summaryRow.present || 0) / summaryRow.total) * 100) : 0,
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
        ? \`\${record.schedule.startTime}–\${record.schedule.endTime}\`
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
