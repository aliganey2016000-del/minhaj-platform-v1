import mongoose from 'mongoose';
import { Request, Response } from 'express';
import Attendance from '../models/attendance.model';
import AttendanceSession from '../models/attendance-session.model';
import Student from '../models/student.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ClassSchedule from '../models/class-schedule.model';
import SchoolCalendarDay from '../models/school-calendar-day.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError, ApiError } from '../utils/api-error';

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
  const { course: rawCourseId, schedule: rawScheduleId, date: rawDate, records, clientSubmissionId, expectedRevision } = req.body;
  // Requests generated offline carry a stable key and the server revision
  // originally downloaded with the roster. Both are rechecked after auth.
  if (clientSubmissionId !== undefined && (typeof clientSubmissionId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(clientSubmissionId))) {
    throw new BadRequestError('Invalid offline attendance submission ID.');
  }
  if (clientSubmissionId && expectedRevision !== null && expectedRevision !== undefined &&
      (typeof expectedRevision !== 'string' || !Number.isFinite(Date.parse(expectedRevision)))) {
    throw new BadRequestError('Invalid attendance revision.');
  }
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

  const { school, isSchool, students, studentIds } = await expectedRoster(course);
  if (students.length === 0) throw new BadRequestError('This class/course has no active approved students in its attendance roster.');

  // A class_based school's whole workflow — the complete-roster requirement,
  // the AttendanceSession record admin reports/dashboards read, the
  // session-level lock/unlock audit trail — only exists on the schedule
  // branch below. Submitting without a schedule (reachable from the
  // teacher's generic "My Students" quick-attendance page, which isn't
  // aware of attendanceType) used to silently accept it anyway: it got
  // locked immediately with no completeness check against the real class
  // roster, created no AttendanceSession, and — because the Attendance
  // unique index includes `schedule` — upserted into separate documents
  // from whatever the class's real scheduled session already recorded,
  // leaving two conflicting, independently-"locked" attendance records for
  // the same student/course/date with no way to reconcile them.
  // course_based schools have no class/schedule concept to require here,
  // so they keep working exactly as before.
  if (isSchool && school.attendanceType === 'class_based' && !schedule) {
    throw new BadRequestError('This school takes attendance by scheduled class period. Use Take Attendance for the class’s period instead of the course attendance screen.');
  }

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
    if (isSchool && !['present', 'absent'].includes(status)) {
      throw new BadRequestError('School attendance uses Present and Absent only.');
    }
    let reasonCode = String(record?.reasonCode || '').trim();
    if (!ALLOWED_REASONS.has(reasonCode)) throw new BadRequestError(`Invalid attendance reason for student ${studentId}.`);
    if (status === 'present') reasonCode = '';

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

  // Complete school sessions are immutable. Idempotent replay of the *same*
  // submission returns success without writing or re-triggering notifications.
  const previousSession = isSchool && schedule
    ? await AttendanceSession.findOne({ school: course.school, schedule: schedule._id, date })
    : null;
  if (previousSession?.locked) {
    if (clientSubmissionId && previousSession.syncState === 'applied' &&
        previousSession.syncSubmissionId === clientSubmissionId &&
        String(previousSession.takenBy) === String(req.user!.userId)) {
      return ApiResponse.success(res, {
        course: course._id, schedule: schedule._id, date, completion: 'complete',
        expectedStudents: previousSession.expectedStudents,
        recordedStudents: previousSession.recordedStudents,
        locked: true, replayed: true,
      }, 'Attendance already synced successfully');
    }
    if (clientSubmissionId) throw new ConflictError('This attendance session has already been submitted. Review the live roster before replacing any data.');
    throw new ForbiddenError('Attendance for this session is locked. An authorized school administrator must unlock it with a correction reason.');
  }

  // A roster downloaded before an admin correction or another submission is
  // stale even if the administrator subsequently unlocked the session.
  if (clientSubmissionId) {
    const currentRevision = previousSession?.updatedAt?.toISOString() || null;
    if ((expectedRevision ?? null) !== currentRevision &&
        !(previousSession?.syncSubmissionId === clientSubmissionId &&
          previousSession?.syncState === 'processing')) {
      throw new ConflictError('Attendance changed on the server since your offline download. Your local copy was kept for review.');
    }
  }
  if ((!isSchool || !schedule) && req.user?.role !== 'admin' &&
      await Attendance.exists({ course: course._id, date, schedule: schedule ? schedule._id : null, locked: true })) {
    throw new ForbiddenError('Attendance for this course is locked.');
  }

  const completeRoster = normalized.length >= students.length;
  const locked = isSchool && schedule ? completeRoster : true;
  // Claim the unique (school, schedule, date) session BEFORE writing
  // attendance rows. Competing devices/tabs cannot silently overwrite one
  // another. A crashed request can be retried after a short lease expires.
  const submissionId = clientSubmissionId || new mongoose.Types.ObjectId().toHexString();
  if (isSchool && schedule) {
    const now = new Date();
    const claim = {
      syncSubmissionId: submissionId,
      syncState: 'processing' as const,
      syncClaimedAt: now,
    };
    if (!previousSession) {
      try {
        await AttendanceSession.create({
          school: course.school, schedule: schedule._id, class: schedule.class || course.class || null,
          course: course._id, date, expectedStudents: students.length,
          recordedStudents: 0, status: 'partial', locked: false,
          takenBy: new mongoose.Types.ObjectId(req.user!.userId), submittedAt: now, ...claim,
        });
      } catch (e: any) {
        if (e?.code === 11000) throw new ConflictError('Another device is submitting this session. Keep your saved copy and retry.');
        throw e;
      }
    } else {
      const expired = new Date(Date.now() - 2 * 60_000);
      const acquired = await AttendanceSession.findOneAndUpdate(
        { _id: previousSession._id, locked: false,
          $or: [
            { syncState: { $ne: 'processing' } },
            { syncClaimedAt: { $lt: expired } },
          ] },
        { $set: claim },
        { new: true },
      );
      if (!acquired) throw new ApiError(503, 'Another attendance submission is in progress. Please retry shortly.');
    }
  }

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
          syncSubmissionId: submissionId,
          syncState: 'applied',
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

  const unlockedAt = new Date();
  const unlockedBy = new mongoose.Types.ObjectId(req.user!.userId);
  const reasonText = correctionReason.slice(0, 500);
  session.locked = false;
  // Drop prior idempotency receipt after an audited correction unlock.
  session.syncSubmissionId = undefined;
  session.syncState = undefined;
  session.syncClaimedAt = undefined;
  session.unlockedBy = unlockedBy;
  session.unlockedAt = unlockedAt;
  session.unlockReason = reasonText;
  session.corrections.push({ unlockedBy, unlockedAt, reason: reasonText });
  await session.save();

  return ApiResponse.success(res, { schedule: schedule._id, date, reason: session.unlockReason }, 'Attendance unlocked for correction');
};