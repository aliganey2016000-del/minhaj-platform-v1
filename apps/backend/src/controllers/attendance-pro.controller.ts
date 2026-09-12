import mongoose from 'mongoose';
import { Request, Response } from 'express';
import Attendance from '../models/attendance.model';
import AttendanceSession from '../models/attendance-session.model';
import Student from '../models/student.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ClassSchedule from '../models/class-schedule.model';
import SchoolCalendarDay from '../models/school-calendar-day.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';

const ALLOWED_STATUSES = new Set(['present', 'absent', 'late', 'excused']);
const ALLOWED_REASONS = new Set([
  '',
  'sick',
  'medical',
  'family_emergency',
  'school_activity',
  'suspension',
  'transport_delay',
  'other',
]);
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function attendanceDate(raw: unknown): Date {
  const value = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestError('A valid attendance date (YYYY-MM-DD) is required.');
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestError('A valid attendance date is required.');
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function validateOptionalTime(value: unknown, label: string): string {
  const text = String(value || '').trim();
  if (text && !TIME_RE.test(text)) throw new BadRequestError(`${label} must use HH:MM (24-hour format).`);
  return text;
}

async function expectedRoster(course: any) {
  if (!course?.school) throw new BadRequestError('Attendance course is not assigned to an organization.');
  const school: any = await School.findById(course.school).select('attendanceType institutionType organizationType').lean();
  if (!school) throw new NotFoundError('School');

  const base: Record<string, unknown> = {
    school: course.school,
    status: 'active',
    approvalStatus: 'approved',
  };
  const filter = school.attendanceType === 'class_based' && course.class
    ? { ...base, class: course.class }
    : { ...base, enrolledCourses: course._id };

  const students = await Student.find(filter).select('_id').lean();
  return {
    school,
    isSchool: resolveInstitutionType(school) === 'school',
    students,
    studentIds: new Set(students.map((student: any) => String(student._id))),
  };
}

export const markBulk = async (req: Request, res: Response): Promise<Response> => {
  const { course: rawCourseId, schedule: rawScheduleId, date: rawDate, records } = req.body;
  if (!rawCourseId || !rawDate || !Array.isArray(records) || records.length === 0) {
    throw new BadRequestError('course, date, and records array are required');
  }

  const course: any = (req as any).attendanceCourse;
  if (!course) throw new NotFoundError('Course');
  const date = attendanceDate(rawDate);

  let schedule: any = (req as any).attendanceSchedule || null;
  if (!schedule && rawScheduleId) {
    schedule = await ClassSchedule.findById(rawScheduleId).select('_id school class course teacher dayOfWeek').lean();
  }
  if (schedule && Number(schedule.dayOfWeek) !== date.getDay()) {
    throw new BadRequestError('The selected schedule does not meet on this attendance date.');
  }

  const { isSchool, students, studentIds } = await expectedRoster(course);
  if (students.length === 0) throw new BadRequestError('This class/course has no active approved students in its attendance roster.');

  if (isSchool) {
    const calendarDay = await SchoolCalendarDay.findOne({ school: course.school, date }).select('name type isInstructional').lean();
    if (calendarDay && calendarDay.isInstructional === false) {
      throw new BadRequestError(`Attendance cannot be taken on ${calendarDay.name || calendarDay.type}; the school calendar marks this date as non-instructional.`);
    }
  }

  const seen = new Set<string>();
  const normalized = records.map((record: any) => {
    const studentId = String(record?.student || '');
    if (!mongoose.isValidObjectId(studentId)) throw new BadRequestError('Every attendance row must contain a valid student.');
    if (seen.has(studentId)) throw new BadRequestError('The same student appears more than once in this attendance submission.');
    seen.add(studentId);
    if (!studentIds.has(studentId)) throw new ForbiddenError('Attendance can only be recorded for students in this class/course roster.');

    const status = String(record?.status || '');
    if (!ALLOWED_STATUSES.has(status)) throw new BadRequestError(`Invalid attendance status for student ${studentId}.`);
    const reasonCode = String(record?.reasonCode || '').trim();
    if (!ALLOWED_REASONS.has(reasonCode)) throw new BadRequestError(`Invalid attendance reason for student ${studentId}.`);

    return {
      student: new mongoose.Types.ObjectId(studentId),
      status,
      notes: String(record?.notes || '').trim().slice(0, 1000),
      reasonCode,
      arrivalTime: validateOptionalTime(record?.arrivalTime, 'Arrival time'),
      departureTime: validateOptionalTime(record?.departureTime, 'Departure time'),
    };
  });

  // Schools use affirmative section attendance: a scheduled lesson becomes
  // Complete only when the entire active/approved class roster is submitted.
  // Other institution types retain their older partial/course-based workflow.
  if (isSchool && schedule && normalized.length !== students.length) {
    throw new BadRequestError(`Complete roster required: ${normalized.length} of ${students.length} students were submitted.`);
  }

  const scheduleFilter = schedule ? schedule._id : null;
  if (req.user?.role !== 'admin') {
    const lockedSession = isSchool && schedule
      ? await AttendanceSession.exists({ school: course.school, schedule: schedule._id, date, locked: true })
      : await Attendance.exists({ course: course._id, date, schedule: scheduleFilter, locked: true });
    if (lockedSession) {
      throw new ForbiddenError('Attendance for this session is locked. An authorized school administrator must unlock it with a correction reason.');
    }
  }

  const completeRoster = normalized.length >= students.length;
  const locked = isSchool && schedule ? completeRoster : true;
  const ops = normalized.map((record) => ({
    updateOne: {
      filter: { course: course._id, student: record.student, date, schedule: scheduleFilter },
      update: {
        $set: {
          status: record.status,
          notes: record.notes,
          reasonCode: record.reasonCode,
          arrivalTime: record.arrivalTime,
          departureTime: record.departureTime,
          markedBy: new mongoose.Types.ObjectId(req.user!.userId),
          locked,
        },
      },
      upsert: true,
    },
  }));

  await Attendance.bulkWrite(ops as any[]);

  const completion: 'partial' | 'complete' = completeRoster ? 'complete' : 'partial';
  if (isSchool && schedule) {
    await AttendanceSession.findOneAndUpdate(
      { school: course.school, schedule: schedule._id, date },
      {
        $set: {
          class: schedule.class || course.class || null,
          course: course._id,
          expectedStudents: students.length,
          recordedStudents: normalized.length,
          status: completion,
          locked: completion === 'complete',
          takenBy: new mongoose.Types.ObjectId(req.user!.userId),
          submittedAt: new Date(),
          unlockedBy: null,
          unlockedAt: null,
          unlockReason: '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  return ApiResponse.success(
    res,
    {
      course: course._id,
      schedule: schedule?._id || null,
      date,
      expectedStudents: students.length,
      recordedStudents: normalized.length,
      completion: isSchool && schedule ? completion : 'complete',
      locked,
    },
    isSchool && schedule
      ? 'Attendance submitted and locked successfully'
      : 'Attendance marked successfully',
  );
};

export const unlockSchoolSession = async (req: Request, res: Response): Promise<Response> => {
  const { course: rawCourseId, schedule: rawScheduleId, date: rawDate, reason } = req.body;
  if (!rawCourseId || !rawScheduleId || !rawDate) throw new BadRequestError('course, schedule, and date are required');
  const correctionReason = String(reason || '').trim();
  if (correctionReason.length < 3) throw new BadRequestError('A correction reason is required to unlock submitted attendance.');

  const course: any = (req as any).attendanceCourse;
  const schedule: any = (req as any).attendanceSchedule;
  if (!course || !schedule) throw new NotFoundError('Attendance session');
  const date = attendanceDate(rawDate);

  const school: any = await School.findById(course.school).select('institutionType organizationType').lean();
  if (!school || resolveInstitutionType(school) !== 'school') throw new BadRequestError('This correction workflow is only available for schools.');

  const session = await AttendanceSession.findOne({ school: course.school, schedule: schedule._id, date });
  if (!session) throw new NotFoundError('Attendance session');

  await Attendance.updateMany(
    { course: course._id, schedule: schedule._id, date },
    { $set: { locked: false } },
  );

  session.locked = false;
  session.unlockedBy = new mongoose.Types.ObjectId(req.user!.userId);
  session.unlockedAt = new Date();
  session.unlockReason = correctionReason.slice(0, 500);
  await session.save();

  return ApiResponse.success(res, { schedule: schedule._id, date, reason: session.unlockReason }, 'Attendance unlocked for correction');
};
