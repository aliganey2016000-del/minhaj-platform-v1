import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Exam from '../models/exam.model';
import ExamPeriod from '../models/exam-period.model';
import ExamRoom from '../models/exam-room.model';
import ExamSeatingPlan from '../models/exam-seating-plan.model';
import ExamInvigilatorAssignment from '../models/exam-invigilator-assignment.model';
import ExamAttendance from '../models/exam-attendance.model';
import ExamAttendanceLog from '../models/exam-attendance-log.model';
import Teacher from '../models/teacher.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, getOwnTeacherRecord, resolveViewableOrgId } from '../utils/tenant-scope';

const VALID_STATUSES = new Set(['present', 'absent', 'late', 'excused']);
const clean = (value: unknown) => String(value ?? '').trim();

const timeToMinutes = (value: string) => {
  const match = clean(value).match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};

const rangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  return as >= 0 && ae >= 0 && bs >= 0 && be >= 0 && as < be && bs < ae;
};

const dayBounds = (value: unknown) => {
  const raw = new Date(value as any);
  if (Number.isNaN(raw.getTime())) throw new BadRequestError('A valid exam date is required');
  const start = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const dateKey = (value: unknown) => {
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const teacherName = (teacher: any) => {
  const profile = teacher?.profile;
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  return name || teacher?.user?.email || teacher?.teacherId || 'Teacher';
};

async function resolveExamType(period: any): Promise<'mid' | 'final'> {
  const label = `${period?.name || ''} ${period?.term || ''}`.toLowerCase();
  if (/\bfinal\b/.test(label)) return 'final';
  if (/\b(mid|midterm|mid-term)\b/.test(label)) return 'mid';

  const types = await ExamSeatingPlan.distinct('examType', {
    school: period.school,
    academicYear: period.academicYear,
  });

  if (types.length === 1 && (types[0] === 'mid' || types[0] === 'final')) return types[0] as 'mid' | 'final';
  throw new BadRequestError('Could not determine whether this Exam is Mid or Final. Include Mid or Final in the Exam name.');
}

async function loadPeriod(req: Request, periodId: string) {
  if (!mongoose.isValidObjectId(periodId)) throw new BadRequestError('A valid Exam is required');
  const schoolId = resolveViewableOrgId(req, req.query.school || req.body?.school);
  const filter: any = { _id: periodId };
  if (schoolId) filter.school = schoolId;
  const period = await ExamPeriod.findOne(filter).lean() as any;
  if (!period) throw new NotFoundError('Exam');
  assertOwnsOrg(req, period, 'school');
  return period;
}

async function populateAssignment(id: string) {
  return ExamInvigilatorAssignment.findById(id)
    .populate('room', 'name building capacity')
    .populate('period', 'name academicYear term startDate endDate status')
    .populate({
      path: 'teacher',
      select: 'teacherId profile user school status',
      populate: [
        { path: 'profile', select: 'firstName lastName' },
        { path: 'user', select: 'email' },
      ],
    })
    .lean() as any;
}

async function loadAccessibleAssignment(req: Request, assignmentId: string) {
  if (!mongoose.isValidObjectId(assignmentId)) throw new BadRequestError('Invalid invigilation assignment');
  const row = await ExamInvigilatorAssignment.findById(assignmentId).lean() as any;
  if (!row) throw new NotFoundError('Invigilation assignment');

  if (req.user?.role === 'teacher') {
    const own = await getOwnTeacherRecord(req);
    if (!own || String(row.teacher) !== String(own._id)) {
      throw new ForbiddenError('This invigilation duty is not assigned to you.');
    }
  } else {
    assertOwnsOrg(req, row, 'school');
  }
  return row;
}

async function sessionExams(assignment: any) {
  const { start, end } = dayBounds(assignment.examDate);
  return Exam.find({
    school: assignment.school,
    period: assignment.period,
    autoSchedule: { $ne: true },
    status: { $ne: 'cancelled' },
    examDate: { $gte: start, $lt: end },
    startTime: assignment.startTime,
    endTime: assignment.endTime,
  })
    .populate({
      path: 'course',
      select: 'title class',
      populate: { path: 'class', select: 'title section' },
    })
    .lean() as any[];
}

async function buildRoomRoster(assignment: any) {
  const period = await ExamPeriod.findById(assignment.period).lean() as any;
  if (!period) throw new NotFoundError('Exam');

  const exams = await sessionExams(assignment);
  const examByClass = new Map<string, any>();
  for (const exam of exams) {
    const cls = exam.course?.class;
    const classId = String(cls?._id || cls || '');
    if (classId && !examByClass.has(classId)) examByClass.set(classId, exam);
  }

  const allocations = await ExamSeatingPlan.find({
    school: assignment.school,
    academicYear: period.academicYear,
    examType: assignment.examType,
    room: assignment.room,
  })
    .populate({
      path: 'student',
      select: 'studentId profile class',
      populate: [
        { path: 'profile', select: 'firstName lastName' },
        { path: 'class', select: 'title section' },
      ],
    })
    .lean() as any[];

  const candidates = allocations
    .map((allocation) => {
      const student = allocation.student;
      const classId = String(student?.class?._id || student?.class || '');
      const exam = examByClass.get(classId);
      return exam && student ? { student, exam } : null;
    })
    .filter(Boolean) as Array<{ student: any; exam: any }>;

  const examIds = [...new Set(candidates.map(row => String(row.exam._id)))];
  const studentIds = [...new Set(candidates.map(row => String(row.student._id)))];
  const attendance = examIds.length && studentIds.length
    ? await ExamAttendance.find({ exam: { $in: examIds }, student: { $in: studentIds } }).lean() as any[]
    : [];

  const attendanceMap = new Map(
    attendance.map(row => [`${row.exam}::${row.student}`, row])
  );

  return candidates
    .map(row => ({
      student: row.student,
      exam: {
        _id: row.exam._id,
        title: row.exam.title,
        course: row.exam.course ? { _id: row.exam.course._id, title: row.exam.course.title } : null,
      },
      attendance: attendanceMap.get(`${row.exam._id}::${row.student._id}`) || null,
    }))
    .sort((a, b) =>
      String(a.student?.class?.title || '').localeCompare(String(b.student?.class?.title || ''), undefined, { numeric: true })
      || String(a.student?.studentId || '').localeCompare(String(b.student?.studentId || ''), undefined, { numeric: true })
    );
}

export const context = async (req: Request, res: Response): Promise<Response> => {
  const periodId = clean(req.query.periodId);
  const period = await loadPeriod(req, periodId);
  const examType = await resolveExamType(period);
  const { start, end } = period.startDate
    ? dayBounds(period.startDate)
    : { start: new Date(0), end: new Date('2999-12-31T00:00:00.000Z') };

  const exams = await Exam.find({
    school: period.school,
    period: period._id,
    autoSchedule: { $ne: true },
    status: { $ne: 'cancelled' },
    ...(period.startDate ? { examDate: { $gte: start, $lt: period.endDate ? new Date(new Date(period.endDate).getTime() + 86400000) : new Date('2999-12-31T00:00:00.000Z') } } : {}),
  })
    .populate({
      path: 'course',
      select: 'title class',
      populate: { path: 'class', select: 'title section' },
    })
    .sort({ examDate: 1, startTime: 1 })
    .lean() as any[];

  const seating = await ExamSeatingPlan.find({
    school: period.school,
    academicYear: period.academicYear,
    examType,
  })
    .populate({
      path: 'student',
      select: 'class',
      populate: { path: 'class', select: 'title section' },
    })
    .populate('room', 'name building capacity')
    .lean() as any[];

  const assignments = await ExamInvigilatorAssignment.find({ period: period._id, school: period.school })
    .populate('room', 'name building capacity')
    .populate({
      path: 'teacher',
      select: 'teacherId profile user status',
      populate: [
        { path: 'profile', select: 'firstName lastName' },
        { path: 'user', select: 'email' },
      ],
    })
    .lean() as any[];

  const grouped = new Map<string, any[]>();
  for (const exam of exams) {
    const key = `${dateKey(exam.examDate)}::${exam.startTime}::${exam.endTime}`;
    const list = grouped.get(key) || [];
    list.push(exam);
    grouped.set(key, list);
  }

  const sessions = Array.from(grouped.entries()).map(([key, sessionExams]) => {
    const [examDate, startTime, endTime] = key.split('::');
    const classIds = new Set(
      sessionExams.map(exam => String(exam.course?.class?._id || exam.course?.class || '')).filter(Boolean)
    );

    const roomMap = new Map<string, any>();
    for (const seat of seating) {
      const studentClass = String(seat.student?.class?._id || seat.student?.class || '');
      const room = seat.room;
      if (!room?._id || !classIds.has(studentClass)) continue;
      const roomId = String(room._id);
      const current = roomMap.get(roomId) || {
        _id: room._id,
        name: room.name,
        building: room.building,
        capacity: room.capacity,
        students: 0,
      };
      current.students += 1;
      roomMap.set(roomId, current);
    }

    const rooms = Array.from(roomMap.values()).map(room => {
      const assignment = assignments.find(row =>
        dateKey(row.examDate) === examDate
        && row.startTime === startTime
        && row.endTime === endTime
        && String(row.room?._id || row.room) === String(room._id)
      );
      return {
        ...room,
        assignment: assignment ? {
          _id: assignment._id,
          teacher: assignment.teacher ? {
            _id: assignment.teacher._id,
            teacherId: assignment.teacher.teacherId,
            name: teacherName(assignment.teacher),
            email: assignment.teacher.user?.email || '',
          } : null,
        } : null,
      };
    });

    return {
      key,
      examDate,
      startTime,
      endTime,
      exams: sessionExams.map(exam => ({
        _id: exam._id,
        subject: exam.course?.title?.en || exam.title,
        className: [exam.course?.class?.title, exam.course?.class?.section].filter(Boolean).join(' '),
      })),
      rooms,
    };
  });

  return ApiResponse.success(res, {
    period: {
      _id: period._id,
      name: period.name,
      academicYear: period.academicYear,
      status: period.status,
    },
    examType,
    sessions,
  });
};

export const assign = async (req: Request, res: Response): Promise<Response> => {
  const periodId = clean(req.body?.periodId);
  const roomId = clean(req.body?.roomId);
  const teacherId = clean(req.body?.teacherId);
  const examDate = clean(req.body?.examDate);
  const startTime = clean(req.body?.startTime);
  const endTime = clean(req.body?.endTime);

  if (!periodId || !roomId || !teacherId || !examDate || !startTime || !endTime) {
    throw new BadRequestError('Exam, date, shift, room and teacher are required');
  }
  if (!mongoose.isValidObjectId(roomId) || !mongoose.isValidObjectId(teacherId)) {
    throw new BadRequestError('Invalid room or teacher');
  }
  if (timeToMinutes(startTime) < 0 || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new BadRequestError('Invalid exam shift time');
  }

  const period = await loadPeriod(req, periodId);
  const examType = await resolveExamType(period);
  const { start, end } = dayBounds(examDate);

  const [room, teacher, matchingExam] = await Promise.all([
    ExamRoom.findOne({ _id: roomId, school: period.school }).lean(),
    Teacher.findOne({ _id: teacherId, school: period.school, status: 'active' }).lean(),
    Exam.exists({
      school: period.school,
      period: period._id,
      examDate: { $gte: start, $lt: end },
      startTime,
      endTime,
      status: { $ne: 'cancelled' },
      autoSchedule: { $ne: true },
    }),
  ]);

  if (!room) throw new NotFoundError('Exam room');
  if (!teacher) throw new NotFoundError('Teacher');
  if (!matchingExam) throw new BadRequestError('No scheduled exam exists for this date and shift');

  const sameDayTeacherAssignments = await ExamInvigilatorAssignment.find({
    school: period.school,
    teacher: teacher._id,
    examDate: { $gte: start, $lt: end },
  }).lean() as any[];

  const conflict = sameDayTeacherAssignments.find(row =>
    String(row.room) !== roomId && rangesOverlap(startTime, endTime, row.startTime, row.endTime)
  );
  if (conflict) {
    throw new ConflictError('This teacher is already assigned to another exam room during the same time.');
  }

  const saved = await ExamInvigilatorAssignment.findOneAndUpdate(
    {
      school: period.school,
      examDate: start,
      startTime,
      endTime,
      room: room._id,
    },
    {
      $set: {
        period: period._id,
        teacher: teacher._id,
        examType,
        createdBy: new mongoose.Types.ObjectId(req.user!.userId),
      },
      $setOnInsert: { examDate: start, school: period.school, room: room._id, startTime, endTime },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const populated = await populateAssignment(String(saved._id));
  return ApiResponse.success(res, populated, `${teacherName(populated.teacher)} assigned to ${populated.room?.name || 'room'}`);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const row = await ExamInvigilatorAssignment.findById(req.params.assignmentId);
  if (!row) throw new NotFoundError('Invigilation assignment');
  assertOwnsOrg(req, row, 'school');
  await row.deleteOne();
  return ApiResponse.success(res, { deleted: true }, 'Invigilator removed from room');
};

export const myAssignments = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');

  const rows = await ExamInvigilatorAssignment.find({ teacher: teacher._id })
    .populate('room', 'name building capacity')
    .populate('period', 'name academicYear status')
    .sort({ examDate: 1, startTime: 1 })
    .lean() as any[];

  const enriched = await Promise.all(rows.map(async row => {
    const roster = await buildRoomRoster(row);
    const marked = roster.filter(item => item.attendance?.status).length;
    return {
      ...row,
      studentCount: roster.length,
      markedCount: marked,
      completed: roster.length > 0 && marked === roster.length,
    };
  }));

  return ApiResponse.success(res, enriched);
};

export const roster = async (req: Request, res: Response): Promise<Response> => {
  const assignment = await loadAccessibleAssignment(req, req.params.assignmentId);
  const [details, rosterRows] = await Promise.all([
    populateAssignment(String(assignment._id)),
    buildRoomRoster(assignment),
  ]);

  return ApiResponse.success(res, {
    assignment: {
      ...details,
      teacherName: teacherName(details.teacher),
    },
    roster: rosterRows,
  });
};

export const markAttendance = async (req: Request, res: Response): Promise<Response> => {
  const assignment = await loadAccessibleAssignment(req, req.params.assignmentId);
  const rosterRows = await buildRoomRoster(assignment);
  const allowed = new Map(
    rosterRows.map(row => [String(row.student._id), String(row.exam._id)])
  );

  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  if (!records.length) throw new BadRequestError('Attendance records are required');

  for (const record of records) {
    if (!allowed.has(String(record.student))) {
      throw new ForbiddenError('One or more students are not assigned to this invigilation room.');
    }
    if (!VALID_STATUSES.has(String(record.status))) {
      throw new BadRequestError(`Invalid attendance status: ${record.status}`);
    }
  }

  const pairs = records.map((record: any) => ({
    student: String(record.student),
    exam: allowed.get(String(record.student))!,
  }));

  const existing = await ExamAttendance.find({
    $or: pairs.map(pair => ({ exam: pair.exam, student: pair.student })),
  }).select('exam student status notes').lean() as any[];

  const existingMap = new Map(
    existing.map(row => [`${row.exam}::${row.student}`, row])
  );

  const userId = new mongoose.Types.ObjectId(req.user!.userId);
  const now = new Date();
  const ops = records.map((record: any) => {
    const examId = allowed.get(String(record.student))!;
    return {
      updateOne: {
        filter: { exam: examId, student: record.student },
        update: {
          $set: {
            status: record.status,
            notes: clean(record.notes),
            markedBy: userId,
            markedAt: now,
            school: assignment.school,
          },
        },
        upsert: true,
      },
    };
  });

  await ExamAttendance.bulkWrite(ops);

  const updated = await ExamAttendance.find({
    $or: pairs.map(pair => ({ exam: pair.exam, student: pair.student })),
  }).select('_id exam student').lean() as any[];
  const updatedMap = new Map(updated.map(row => [`${row.exam}::${row.student}`, row._id]));

  const logs = records.map((record: any) => {
    const examId = allowed.get(String(record.student))!;
    const mapKey = `${examId}::${record.student}`;
    const before = existingMap.get(mapKey);
    const newNotes = clean(record.notes);
    if (before && before.status === record.status && clean(before.notes) === newNotes) return null;
    return {
      attendance: updatedMap.get(mapKey),
      exam: examId,
      student: record.student,
      changedBy: userId,
      previousStatus: before?.status || null,
      newStatus: record.status,
      previousNotes: clean(before?.notes),
      newNotes,
    };
  }).filter(Boolean);

  if (logs.length) await ExamAttendanceLog.insertMany(logs as any[]);

  return ApiResponse.success(
    res,
    { saved: records.length },
    `Attendance saved for ${records.length} student(s) in this room`
  );
};
