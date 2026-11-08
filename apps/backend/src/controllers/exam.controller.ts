import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import Exam from '../models/exam.model';
import ExamPeriod from '../models/exam-period.model';
import Course from '../models/course.model';
import School from '../models/school.model';
import ClassModel from '../models/class.model';
import ExamPaper from '../models/exam-paper.model';
import ExamAttempt from '../models/exam-attempt.model';
import ExamAppeal from '../models/exam-appeal.model';
import ExamSeatingPlan from '../models/exam-seating-plan.model';
import ExamAttendance from '../models/exam-attendance.model';
import ExamAttendanceLog from '../models/exam-attendance-log.model';
import SeatAllocation from '../models/seat-allocation.model';
import ExamEligibility from '../models/exam-eligibility.model';
import ExamIncident from '../models/exam-incident.model';
import ExamInvigilatorAssignment from '../models/exam-invigilator-assignment.model';
import Result from '../models/result.model';
import { getAutoScheduleWindow } from '../utils/exam-eligibility';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, getOwnTeacherRecord, assertOwnsExamIfTeacher, resolveOrgIdForCreate, resolveViewableOrgId } from '../utils/tenant-scope';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import { castObjectIdFilter } from '../utils/cast-object-id-filter';
import { escapeRegex } from '../utils/escape-regex';
import {
  getExamSchedulingRulesForSchool,
  normalizeExamSchedulingRules,
} from '../utils/exam-scheduling-rules';

type PendingFixedExam = {
  schoolId: string;
  classId: string;
  examDate: string;
  startTime: string;
  endTime: string;
  room?: string;
  title?: string;
};

const examDateKey = (value: unknown): string => {
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const timeToMinutes = (value: unknown): number => {
  const match = String(value ?? '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};

const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
  startA < endB && startB < endA;

async function validateFixedExamSchedule(input: {
  schoolId: string;
  classId?: string;
  title?: string;
  examDate: unknown;
  startTime: unknown;
  endTime: unknown;
  duration: unknown;
  room?: unknown;
  autoSchedule?: boolean;
  excludeExamId?: string;
  excludeExamIds?: string[];
  pending?: PendingFixedExam[];
}): Promise<void> {
  if (input.autoSchedule) return;

  const dateKey = examDateKey(input.examDate);
  const start = timeToMinutes(input.startTime);
  const end = timeToMinutes(input.endTime);
  const duration = Number(input.duration);
  if (!dateKey) throw new BadRequestError('A valid Exam Date is required');
  if (start < 0 || end < 0) throw new BadRequestError('Start Time and End Time must use HH:MM');
  if (end <= start) throw new BadRequestError('End Time must be after Start Time');
  if (!Number.isFinite(duration) || duration <= 0) throw new BadRequestError('Duration must be a positive number of minutes');

  const rules = await getExamSchedulingRulesForSchool(input.schoolId);

  const examDay = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  if (!rules.allowedExamDays.includes(examDay)) {
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][examDay];
    throw new ConflictError(`Exam day restriction: ${dayName} is not enabled in Exam Scheduling Rules.`);
  }

  if (rules.durationValidation && duration > end - start) {
    throw new ConflictError(`Exam duration (${duration} min) does not fit inside the selected time window (${end - start} min)`);
  }

  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const classId = input.classId ? String(input.classId) : '';
  const pending = input.pending || [];
  const newRoom = String(input.room ?? '').trim();

  if (classId) {
    const siblingCourseIds = await Course.find({ class: classId }).distinct('_id');
    const excludedIds = Array.from(new Set([
      ...(input.excludeExamIds || []),
      ...(input.excludeExamId ? [input.excludeExamId] : []),
    ].filter(Boolean)));

    const persisted = await Exam.find({
      course: { $in: siblingCourseIds },
      autoSchedule: { $ne: true },
      schedulePlaced: { $ne: false },
      status: { $ne: 'cancelled' },
      examDate: { $gte: dayStart, $lt: dayEnd },
      ...(excludedIds.length ? { _id: { $nin: excludedIds } } : {}),
    }).select('title startTime endTime room').lean() as any[];

    const sameClassPending = pending.filter((p) => p.classId === classId && p.examDate === dateKey);
    const sameDay = [
      ...persisted.map((e: any) => ({
        title: e.title || 'Exam',
        startTime: e.startTime || '',
        endTime: e.endTime || '',
        room: e.room || '',
      })),
      ...sameClassPending.map((p) => ({
        title: p.title || 'Exam',
        startTime: p.startTime,
        endTime: p.endTime,
        room: p.room || '',
      })),
    ];

    if (sameDay.length + 1 > rules.maxExamsPerClassPerDay) {
      throw new ConflictError(
        `This class already has ${sameDay.length} exam(s) on ${dateKey}. The scheduling rule allows a maximum of ${rules.maxExamsPerClassPerDay} per day.`
      );
    }

    for (const other of sameDay) {
      const otherStart = timeToMinutes(other.startTime);
      const otherEnd = timeToMinutes(other.endTime);
      if (otherStart < 0 || otherEnd < 0) continue;

      if (rules.preventClassOverlap && rangesOverlap(start, end, otherStart, otherEnd)) {
        throw new ConflictError(
          `Class conflict: "${other.title}" already runs ${other.startTime}–${other.endTime} on ${dateKey}.`
        );
      }

      if (rules.minimumGapMinutes > 0) {
        let gap = -1;
        if (otherEnd <= start) gap = start - otherEnd;
        else if (end <= otherStart) gap = otherStart - end;
        if (gap >= 0 && gap < rules.minimumGapMinutes) {
          throw new ConflictError(
            `Exam gap conflict: at least ${rules.minimumGapMinutes} minutes is required between exams for the same class.`
          );
        }
      }
    }
  }

  // Shared rooms are allowed by default. If an institution explicitly turns
  // that rule off, only then does an overlapping exam using the same room
  // become a hard scheduling conflict.
  if (!rules.allowSharedRooms && newRoom) {
    const excludedIds = Array.from(new Set([
      ...(input.excludeExamIds || []),
      ...(input.excludeExamId ? [input.excludeExamId] : []),
    ].filter(Boolean)));

    const roomPersisted = await Exam.find({
      school: input.schoolId || null,
      autoSchedule: { $ne: true },
      schedulePlaced: { $ne: false },
      status: { $ne: 'cancelled' },
      examDate: { $gte: dayStart, $lt: dayEnd },
      room: newRoom,
      ...(excludedIds.length ? { _id: { $nin: excludedIds } } : {}),
    }).select('title startTime endTime').lean() as any[];

    const roomPending = pending.filter(
      (p) => p.schoolId === String(input.schoolId) && p.examDate === dateKey && String(p.room || '').trim() === newRoom
    );
    const sameRoom = [
      ...roomPersisted.map((e: any) => ({ title: e.title || 'Exam', startTime: e.startTime || '', endTime: e.endTime || '' })),
      ...roomPending.map((p) => ({ title: p.title || 'Exam', startTime: p.startTime, endTime: p.endTime })),
    ];

    for (const other of sameRoom) {
      const otherStart = timeToMinutes(other.startTime);
      const otherEnd = timeToMinutes(other.endTime);
      if (otherStart >= 0 && otherEnd >= 0 && rangesOverlap(start, end, otherStart, otherEnd)) {
        throw new ConflictError(
          `Room conflict: ${newRoom} is already being used by "${other.title}" during this time. Enable Shared Rooms to allow multiple classes in one room.`
        );
      }
    }
  }
}

function scheduleRulesSchoolId(req: Request): string {
  const ownOrg = req.user?.role === 'org_admin'
    ? String((req.user as any)?.organizationId?._id || (req.user as any)?.organizationId || '')
    : '';
  const requested = String(req.body?.school || req.query?.school || '');
  const schoolId = ownOrg || requested;
  if (!/^[a-f\d]{24}$/i.test(schoolId)) {
    throw new BadRequestError('A valid Organization is required');
  }
  return schoolId;
}

const utcDateOnly = (value: Date | string): Date => {
  const key = examDateKey(value);
  if (!key) throw new BadRequestError('A valid date is required');
  return new Date(`${key}T00:00:00.000Z`);
};

const buildAllowedExamDates = (
  start: Date,
  allowedDays: number[],
  needed: number,
  end?: Date | null,
): Date[] => {
  if (needed <= 0) return [];
  const dates: Date[] = [];
  const cursor = utcDateOnly(start);
  const endKey = end ? utcDateOnly(end).getTime() : null;

  // Hard safety cap: enough for very long school exam windows without
  // risking an accidental infinite loop when rules are misconfigured.
  for (let guard = 0; guard < 730 && dates.length < needed; guard += 1) {
    if (endKey !== null && cursor.getTime() > endKey) break;
    if (allowedDays.includes(cursor.getUTCDay())) dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (dates.length < needed) {
    throw new BadRequestError(
      `The selected exam date range contains only ${dates.length} allowed exam day(s), but this schedule needs ${needed}.`
    );
  }
  return dates;
};

async function remapPeriodScheduleDates(params: {
  periodId: string;
  schoolId: string;
  newStartDate: Date;
  newEndDate?: Date | null;
}): Promise<number> {
  const exams = await Exam.find({
    period: params.periodId,
    school: params.schoolId,
    autoSchedule: { $ne: true },
    status: { $ne: 'cancelled' },
    examDate: { $ne: null },
  }).select('_id examDate').lean() as any[];

  const sourceDateKeys = Array.from(new Set(
    exams.map((exam) => examDateKey(exam.examDate)).filter(Boolean)
  )).sort();

  if (!sourceDateKeys.length) return 0;

  const rules = await getExamSchedulingRulesForSchool(params.schoolId);
  const targetDates = buildAllowedExamDates(
    params.newStartDate,
    rules.allowedExamDays,
    sourceDateKeys.length,
    params.newEndDate,
  );

  let changed = 0;
  for (let index = 0; index < sourceDateKeys.length; index += 1) {
    const sourceKey = sourceDateKeys[index];
    const sourceStart = new Date(`${sourceKey}T00:00:00.000Z`);
    const sourceEnd = new Date(sourceStart);
    sourceEnd.setUTCDate(sourceEnd.getUTCDate() + 1);
    const result = await Exam.updateMany(
      {
        period: params.periodId,
        school: params.schoolId,
        examDate: { $gte: sourceStart, $lt: sourceEnd },
      },
      { $set: { examDate: targetDates[index] } },
    );
    changed += result.modifiedCount;
  }

  return changed;
}

export const getScheduleRules = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const school = await School.findById(schoolId).select('name examSchedulingRules').lean() as any;
  if (!school) throw new NotFoundError('Organization');
  return ApiResponse.success(res, {
    school: { _id: school._id, name: school.name },
    rules: normalizeExamSchedulingRules(school.examSchedulingRules),
  });
};

export const updateScheduleRules = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const school = await School.findById(schoolId);
  if (!school) throw new NotFoundError('Organization');
  const current = normalizeExamSchedulingRules((school as any).examSchedulingRules);
  const next = normalizeExamSchedulingRules({ ...current, ...(req.body?.rules || {}) });

  if (!next.allowedExamDays.length) {
    throw new BadRequestError('Select at least one allowed exam day');
  }

  for (let index = 0; index < next.examShifts.length; index += 1) {
    const shift = next.examShifts[index];
    const start = timeToMinutes(shift.startTime);
    const end = timeToMinutes(shift.endTime);
    if (start < 0 || end < 0 || start >= end) {
      throw new BadRequestError(`${shift.name}: End Time must be later than Start Time`);
    }
    if (index > 0) {
      const previous = next.examShifts[index - 1];
      const previousEnd = timeToMinutes(previous.endTime);
      if (start < previousEnd) {
        throw new BadRequestError(`${shift.name} overlaps ${previous.name}. Exam shifts cannot overlap.`);
      }
    }
  }

  (school as any).examSchedulingRules = next;
  await school.save();
  return ApiResponse.success(res, {
    school: { _id: school._id, name: school.name },
    rules: next,
  }, 'Exam scheduling rules saved');
};

// GET /exams/periods — reusable named exam periods such as Midterm / Final.
export const getExamPeriods = async (req: Request, res: Response): Promise<Response> => {
  const teacherView = req.user?.role === 'teacher';
  let schoolId = '';

  if (teacherView) {
    const teacher = await getOwnTeacherRecord(req);
    // The authenticated organization is the canonical tenant scope. Older
    // Teacher records may not have school backfilled even though the user is
    // correctly attached to an organization, so teacher.school is only a fallback.
    schoolId = String(
      resolveViewableOrgId(req)
      || (teacher as any)?.school?._id
      || (teacher as any)?.school
      || ''
    );
    if (!/^[a-f\d]{24}$/i.test(schoolId)) return ApiResponse.success(res, []);
  } else {
    schoolId = scheduleRulesSchoolId(req);
  }

  const periods = await ExamPeriod.find({
    school: schoolId,
    ...(teacherView ? { status: 'published' } : {}),
  })
    .populate('school', 'name')
    .sort({ academicYear: -1, startDate: -1, createdAt: -1 })
    .lean();
  return ApiResponse.success(res, periods);
};

// POST /exams/periods — create the exam container before building its grid.
export const createExamPeriod = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const name = String(req.body?.name || '').trim();
  const academicYear = String(req.body?.academicYear || '').trim();
  const term = String(req.body?.term || '').trim();
  const startDate = req.body?.startDate ? new Date(req.body.startDate) : null;
  const endDate = req.body?.endDate ? new Date(req.body.endDate) : null;

  if (!name) throw new BadRequestError('Exam name is required');
  if (!academicYear) throw new BadRequestError('Academic Year is required');
  if (startDate && Number.isNaN(startDate.getTime())) throw new BadRequestError('Start Date is invalid');
  if (endDate && Number.isNaN(endDate.getTime())) throw new BadRequestError('End Date is invalid');
  if (startDate && endDate && endDate < startDate) throw new BadRequestError('End Date must be on or after Start Date');

  try {
    const period = await ExamPeriod.create({
      school: schoolId,
      name,
      academicYear,
      term,
      startDate,
      endDate,
      status: 'draft',
      createdBy: req.user!.userId,
    });
    return ApiResponse.created(res, period, 'Exam created successfully');
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new ConflictError('An exam with this name, academic year and term already exists');
    }
    throw error;
  }
};

// PATCH /exams/periods/:periodId — rename/publish/close a reusable exam period.
export const updateExamPeriod = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const period = await ExamPeriod.findOne({ _id: req.params.periodId, school: schoolId });
  if (!period) throw new NotFoundError('Exam');

  const updates: Record<string, any> = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) throw new BadRequestError('Exam name is required');
    updates.name = name;
  }
  if (req.body?.academicYear !== undefined) {
    const academicYear = String(req.body.academicYear || '').trim();
    if (!academicYear) throw new BadRequestError('Academic Year is required');
    updates.academicYear = academicYear;
  }
  if (req.body?.term !== undefined) updates.term = String(req.body.term || '').trim();
  if (req.body?.status !== undefined) {
    if (!['draft', 'published', 'closed'].includes(req.body.status)) {
      throw new BadRequestError('Status must be draft, published or closed');
    }
    updates.status = req.body.status;
  }
  if (req.body?.startDate !== undefined) updates.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  if (req.body?.endDate !== undefined) updates.endDate = req.body.endDate ? new Date(req.body.endDate) : null;

  const nextStart = updates.startDate !== undefined ? updates.startDate : period.startDate;
  const nextEnd = updates.endDate !== undefined ? updates.endDate : period.endDate;
  if (nextStart && Number.isNaN(new Date(nextStart).getTime())) throw new BadRequestError('Start Date is invalid');
  if (nextEnd && Number.isNaN(new Date(nextEnd).getTime())) throw new BadRequestError('End Date is invalid');
  if (nextStart && nextEnd && new Date(nextEnd) < new Date(nextStart)) {
    throw new BadRequestError('End Date must be on or after Start Date');
  }

  const oldStartKey = period.startDate ? examDateKey(period.startDate) : '';
  const nextStartKey = nextStart ? examDateKey(nextStart) : '';
  const startDateChanged = !!nextStartKey && nextStartKey !== oldStartKey;

  // If the exam session's start date moves, keep the reusable timetable's
  // Day 1 / Day 2 / ... pattern intact. We remap each existing scheduled
  // date to the next allowed exam day under the current Scheduling Rules.
  // This lets the same timetable be safely reused without hand-editing every cell.
  let remappedExams = 0;
  if (startDateChanged) {
    remappedExams = await remapPeriodScheduleDates({
      periodId: String(period._id),
      schoolId,
      newStartDate: new Date(nextStart),
      newEndDate: nextEnd ? new Date(nextEnd) : null,
    });
  } else if (nextEnd) {
    const afterEnd = await Exam.countDocuments({
      period: period._id,
      school: schoolId,
      autoSchedule: { $ne: true },
      status: { $ne: 'cancelled' },
      examDate: { $gt: utcDateOnly(new Date(nextEnd)) },
    });
    if (afterEnd > 0) {
      throw new BadRequestError(
        'The new End Date is before one or more scheduled exam days. Move the Start Date or extend the End Date.'
      );
    }
  }

  Object.assign(period, updates);
  await period.save();

  if (updates.name) {
    await Exam.updateMany(
      { period: period._id, school: schoolId },
      { $set: { title: updates.name } },
    );
  }

  return ApiResponse.success(res, {
    period,
    remappedExams,
  }, remappedExams
    ? `Exam updated and ${remappedExams} scheduled exam(s) moved to the new date window`
    : 'Exam updated successfully');
};

// POST /exams/periods/:periodId/duplicate — reuse the complete Grade × Shift
// timetable in a new academic year. The new session starts as Draft; its
// scheduled days are remapped in order to the current allowed exam weekdays.
export const duplicateExamPeriod = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const source = await ExamPeriod.findOne({ _id: req.params.periodId, school: schoolId }).lean() as any;
  if (!source) throw new NotFoundError('Exam');

  const name = String(req.body?.name ?? source.name ?? '').trim();
  const academicYear = String(req.body?.academicYear || '').trim();
  const term = String(req.body?.term ?? source.term ?? '').trim();
  const startDate = req.body?.startDate ? new Date(req.body.startDate) : null;
  const endDate = req.body?.endDate ? new Date(req.body.endDate) : null;

  if (!name) throw new BadRequestError('Exam name is required');
  if (!academicYear) throw new BadRequestError('Academic Year is required');
  if (!startDate || Number.isNaN(startDate.getTime())) throw new BadRequestError('Start Date is required');
  if (endDate && Number.isNaN(endDate.getTime())) throw new BadRequestError('End Date is invalid');
  if (endDate && endDate < startDate) throw new BadRequestError('End Date must be on or after Start Date');

  const sourceExams = await Exam.find({
    period: source._id,
    school: schoolId,
    autoSchedule: { $ne: true },
    status: { $ne: 'cancelled' },
  }).lean() as any[];

  const sourceDateKeys = Array.from(new Set(
    sourceExams.map((exam) => examDateKey(exam.examDate)).filter(Boolean)
  )).sort();

  const rules = await getExamSchedulingRulesForSchool(schoolId);
  const targetDates = buildAllowedExamDates(
    startDate,
    rules.allowedExamDays,
    sourceDateKeys.length,
    endDate,
  );
  const dateMap = new Map<string, Date>(
    sourceDateKeys.map((key, index) => [key, targetDates[index]])
  );

  let createdPeriod: any = null;
  try {
    createdPeriod = await ExamPeriod.create({
      school: schoolId,
      name,
      academicYear,
      term,
      startDate,
      endDate,
      status: 'draft',
      createdBy: req.user!.userId,
    });

    if (sourceExams.length) {
      const clones = sourceExams.map((exam: any) => {
        const sourceDate = examDateKey(exam.examDate);
        return {
          title: name,
          course: exam.course,
          school: schoolId,
          period: createdPeriod._id,
          examDate: sourceDate ? dateMap.get(sourceDate) || startDate : null,
          startTime: exam.startTime,
          endTime: exam.endTime,
          duration: exam.duration,
          totalMarks: exam.totalMarks,
          passingMarks: exam.passingMarks,
          room: exam.room || '',
          instructions: exam.instructions || '',
          status: 'scheduled',
          schedulePlaced: true,
          autoSchedule: false,
          milestone: exam.milestone,
          createdBy: req.user!.userId,
        };
      });
      await Exam.insertMany(clones);
    }

    return ApiResponse.created(res, {
      period: createdPeriod,
      copiedExams: sourceExams.length,
      copiedDays: sourceDateKeys.length,
    }, `${name} created from ${source.name}; ${sourceExams.length} scheduled exam(s) copied`);
  } catch (error: any) {
    if (createdPeriod?._id) {
      await Exam.deleteMany({ period: createdPeriod._id, school: schoolId });
      await ExamPeriod.deleteOne({ _id: createdPeriod._id, school: schoolId });
    }
    if (error?.code === 11000) {
      throw new ConflictError('An exam with this name, academic year and term already exists');
    }
    throw error;
  }
};

// DELETE /exams/periods/:periodId — remove one named annual examination and
// all schedule records owned by it. The operation is organization-scoped.
export const deleteExamPeriod = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const periodId = String(req.params.periodId || '');
  if (!/^[a-f\d]{24}$/i.test(periodId)) throw new BadRequestError('A valid Exam is required');

  const period = await ExamPeriod.findOne({ _id: periodId, school: schoolId }).lean() as any;
  if (!period) throw new NotFoundError('Exam');

  const examIds = await Exam.find({ period: periodId, school: schoolId }).distinct('_id');

  if (examIds.length) {
    await Promise.all([
      ExamAttendanceLog.deleteMany({ exam: { $in: examIds } }),
      ExamAttendance.deleteMany({ exam: { $in: examIds } }),
      SeatAllocation.deleteMany({ exam: { $in: examIds } }),
      ExamEligibility.deleteMany({ exam: { $in: examIds } }),
      ExamIncident.deleteMany({ exam: { $in: examIds } }),
      ExamPaper.deleteMany({ exam: { $in: examIds } }),
      ExamAttempt.deleteMany({ exam: { $in: examIds } }),
      ExamAppeal.deleteMany({ exam: { $in: examIds } }),
      Result.deleteMany({ exam: { $in: examIds } }),
    ]);
  }

  await Promise.all([
    Exam.deleteMany({ period: periodId, school: schoolId }),
    ExamInvigilatorAssignment.deleteMany({ period: periodId, school: schoolId }),
  ]);
  await ExamPeriod.deleteOne({ _id: periodId, school: schoolId });

  return ApiResponse.success(
    res,
    { deletedPeriodId: periodId, deletedExams: examIds.length },
    `${period.name} deleted successfully`
  );
};

// POST /exams/periods/:periodId/auto-generate — build the whole school exam
// timetable in one action. Courses with the same normalized subject name are
// deliberately placed on the same date + shift inside their education band:
// Primary/Middle (Grades 1-8) and Secondary (Grades 9-12). The generated
// records remain ordinary Exam rows, so admins can freely move individual
// cells afterwards with the existing Grade × Shift editor.
export const autoGeneratePeriodSchedule = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const periodId = String(req.params.periodId || '');
  if (!/^[a-f\d]{24}$/i.test(periodId)) throw new BadRequestError('A valid Exam is required');

  const period = await ExamPeriod.findOne({ _id: periodId, school: schoolId }).lean() as any;
  if (!period) throw new NotFoundError('Exam');
  if (period.status === 'closed') throw new ConflictError('This exam is closed. Reopen it before generating a schedule.');
  if (!period.startDate) throw new BadRequestError('Set the Exam Start Date before using Auto Generate.');

  const overwrite = req.body?.overwrite === true;
  const existingCount = await Exam.countDocuments({
    period: periodId,
    school: schoolId,
    autoSchedule: { $ne: true },
    status: { $ne: 'cancelled' },
  });
  if (existingCount > 0 && !overwrite) {
    throw new ConflictError(
      `This exam already has ${existingCount} scheduled exam(s). Confirm Regenerate to replace the current timetable.`
    );
  }

  const rules = await getExamSchedulingRulesForSchool(schoolId);
  if (!rules.examShifts.length) throw new BadRequestError('Add at least one Exam Shift in Scheduling Rules.');
  if (!rules.allowedExamDays.length) throw new BadRequestError('Select at least one allowed exam day in Scheduling Rules.');

  const classes = await ClassModel.find({ school: schoolId, status: 'active' })
    .select('_id title section school status')
    .sort({ title: 1, section: 1 })
    .lean() as any[];
  if (!classes.length) throw new BadRequestError('No active grades/classes were found for this school.');

  const classIds = classes.map((cls) => cls._id);
  const courses = await Course.find({
    school: schoolId,
    class: { $in: classIds },
    status: { $ne: 'archived' },
  })
    .select('_id title class teacher status')
    .sort({ 'title.en': 1 })
    .lean() as any[];
  if (!courses.length) throw new BadRequestError('No active courses were found for the school classes.');

  const classById = new Map(classes.map((cls) => [String(cls._id), cls]));
  const normalizeSubject = (value: unknown) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const gradeNumber = (cls: any): number | null => {
    const label = `${cls?.title || ''} ${cls?.section || ''}`;
    const explicit = label.match(/\b(?:grade|class|form)\s*(\d{1,2})\b/i);
    const fallback = label.match(/\b(\d{1,2})\b/);
    const value = Number((explicit || fallback)?.[1] || 0);
    return value >= 1 && value <= 12 ? value : null;
  };

  const bandOf = (cls: any): 'primary-middle' | 'secondary' | 'other' => {
    const grade = gradeNumber(cls);
    if (grade !== null && grade >= 9) return 'secondary';
    if (grade !== null && grade <= 8) return 'primary-middle';
    return 'other';
  };

  type SubjectGroup = {
    band: 'primary-middle' | 'secondary' | 'other';
    subjectKey: string;
    subject: string;
    coursesByClass: Map<string, any>;
  };

  const grouped = new Map<string, SubjectGroup>();
  for (const course of courses) {
    const classId = String(course.class || '');
    const cls = classById.get(classId);
    const subject = String(course.title?.en || '').trim();
    const subjectKey = normalizeSubject(subject);
    if (!cls || !subjectKey) continue;

    const band = bandOf(cls);
    const groupKey = `${band}::${subjectKey}`;
    const group = grouped.get(groupKey) || {
      band,
      subjectKey,
      subject,
      coursesByClass: new Map<string, any>(),
    };

    // A class can only sit one exam in this shared subject slot. If legacy
    // data contains duplicate same-name courses, the first active course is
    // used instead of producing two overlapping exams for the same class.
    if (!group.coursesByClass.has(classId)) group.coursesByClass.set(classId, course);
    grouped.set(groupKey, group);
  }

  const groups = Array.from(grouped.values());
  if (!groups.length) throw new BadRequestError('No schedulable course names were found.');

  const byBand = new Map<string, SubjectGroup[]>();
  for (const group of groups) {
    const list = byBand.get(group.band) || [];
    list.push(group);
    byBand.set(group.band, list);
  }
  for (const list of byBand.values()) {
    list.sort((a, b) =>
      b.coursesByClass.size - a.coursesByClass.size
      || a.subject.localeCompare(b.subject, undefined, { numeric: true })
    );
  }

  const maxPerClassPerDay = Math.max(1, Number(rules.maxExamsPerClassPerDay) || 1);
  const usableShiftsPerDay = Math.max(1, Math.min(rules.examShifts.length, maxPerClassPerDay));
  const courseCountByClass = new Map<string, number>();
  for (const group of groups) {
    for (const classId of group.coursesByClass.keys()) {
      courseCountByClass.set(classId, (courseCountByClass.get(classId) || 0) + 1);
    }
  }
  const requiredDays = Math.max(
    1,
    ...Array.from(courseCountByClass.values()).map((count) => Math.ceil(count / usableShiftsPerDay))
  );

  const startDate = utcDateOnly(period.startDate);
  const endDate = period.endDate ? utcDateOnly(period.endDate) : null;
  const examDates = buildAllowedExamDates(
    startDate,
    rules.allowedExamDays,
    requiredDays,
    endDate,
  );

  const firstDay = examDates[0];
  const lastDay = examDates[examDates.length - 1];
  const rangeStart = new Date(firstDay);
  const rangeEnd = new Date(lastDay);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  // Existing exams outside this period are treated as occupied time so Auto
  // Generate never silently creates a class overlap with another exam plan.
  const externalExams = await Exam.find({
    school: schoolId,
    period: { $ne: period._id },
    autoSchedule: { $ne: true },
    schedulePlaced: { $ne: false },
    status: { $ne: 'cancelled' },
    examDate: { $gte: rangeStart, $lt: rangeEnd },
  })
    .populate({ path: 'course', select: 'class' })
    .select('course examDate startTime endTime')
    .lean() as any[];

  const externalByClassDay = new Map<string, Array<{ startTime: string; endTime: string }>>();
  for (const exam of externalExams) {
    const classId = String(exam.course?.class || '');
    const date = examDateKey(exam.examDate);
    if (!classId || !date) continue;
    const mapKey = `${classId}::${date}`;
    const list = externalByClassDay.get(mapKey) || [];
    list.push({ startTime: String(exam.startTime || ''), endTime: String(exam.endTime || '') });
    externalByClassDay.set(mapKey, list);
  }

  const slots = examDates.flatMap((date) =>
    rules.examShifts.map((shift: any, shiftIndex: number) => ({
      date,
      dateKey: examDateKey(date),
      shift,
      shiftIndex,
    }))
  );

  const generatedByClassDay = new Map<string, number>();
  const generatedByClassSlot = new Set<string>();
  const generatedTimesByClassDay = new Map<string, Array<{ startTime: string; endTime: string }>>();
  const assignments: Array<{
    group: SubjectGroup;
    course: any;
    classId: string;
    date: Date;
    dateKey: string;
    shift: any;
    shiftIndex: number;
  }> = [];
  const subjectSchedule: Array<{
    band: string;
    subject: string;
    examDate: string;
    shift: string;
    startTime: string;
    endTime: string;
    classes: string[];
  }> = [];

  const slotWorksForClass = (classId: string, slot: any): boolean => {
    const classDayKey = `${classId}::${slot.dateKey}`;
    const classSlotKey = `${classId}::${slot.dateKey}::${slot.shiftIndex}`;
    if (generatedByClassSlot.has(classSlotKey)) return false;

    const external = externalByClassDay.get(classDayKey) || [];
    const generatedTimes = generatedTimesByClassDay.get(classDayKey) || [];
    const generatedCount = generatedByClassDay.get(classDayKey) || 0;
    if (external.length + generatedCount >= maxPerClassPerDay) return false;

    const start = timeToMinutes(slot.shift.startTime);
    const end = timeToMinutes(slot.shift.endTime);
    for (const other of [...external, ...generatedTimes]) {
      const otherStart = timeToMinutes(other.startTime);
      const otherEnd = timeToMinutes(other.endTime);
      if (otherStart < 0 || otherEnd < 0) continue;
      if (rules.preventClassOverlap && rangesOverlap(start, end, otherStart, otherEnd)) return false;
      if (rules.minimumGapMinutes > 0) {
        let gap = -1;
        if (otherEnd <= start) gap = start - otherEnd;
        else if (end <= otherStart) gap = otherStart - end;
        if (gap >= 0 && gap < rules.minimumGapMinutes) return false;
      }
    }
    return true;
  };

  const bandOrder = ['primary-middle', 'secondary', 'other'];
  for (const band of bandOrder) {
    const bandGroups = byBand.get(band) || [];
    for (const group of bandGroups) {
      const groupCourses = Array.from(group.coursesByClass.entries());
      const slot = slots.find((candidate) =>
        groupCourses.every(([classId]) => slotWorksForClass(classId, candidate))
      );

      if (!slot) {
        const bandLabel = band === 'secondary'
          ? 'Secondary (Grades 9-12)'
          : band === 'primary-middle'
            ? 'Primary/Middle (Grades 1-8)'
            : 'Other classes';
        throw new ConflictError(
          `Auto Generate could not place "${group.subject}" for ${bandLabel}. Extend the exam date range or allow more exams per class/day in Scheduling Rules.`
        );
      }

      const classLabels: string[] = [];
      for (const [classId, course] of groupCourses) {
        const classDayKey = `${classId}::${slot.dateKey}`;
        const classSlotKey = `${classId}::${slot.dateKey}::${slot.shiftIndex}`;
        generatedByClassDay.set(classDayKey, (generatedByClassDay.get(classDayKey) || 0) + 1);
        generatedByClassSlot.add(classSlotKey);
        const generatedTimes = generatedTimesByClassDay.get(classDayKey) || [];
        generatedTimes.push({ startTime: slot.shift.startTime, endTime: slot.shift.endTime });
        generatedTimesByClassDay.set(classDayKey, generatedTimes);

        const cls = classById.get(classId);
        classLabels.push(
          cls ? `${cls.title || ''}${cls.section ? ` - ${cls.section}` : ''}`.trim() : classId
        );
        assignments.push({
          group,
          course,
          classId,
          date: slot.date,
          dateKey: slot.dateKey,
          shift: slot.shift,
          shiftIndex: slot.shiftIndex,
        });
      }

      subjectSchedule.push({
        band,
        subject: group.subject,
        examDate: slot.dateKey,
        shift: slot.shift.name || `Shift ${slot.shiftIndex + 1}`,
        startTime: slot.shift.startTime,
        endTime: slot.shift.endTime,
        classes: classLabels.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      });
    }
  }

  const documents = assignments.map((item) => ({
    title: period.name,
    course: item.course._id,
    school: schoolId,
    period: period._id,
    examDate: item.date,
    startTime: item.shift.startTime,
    endTime: item.shift.endTime,
    duration: timeToMinutes(item.shift.endTime) - timeToMinutes(item.shift.startTime),
    totalMarks: 100,
    passingMarks: 50,
    room: '',
    instructions: '',
    status: 'scheduled',
    schedulePlaced: true,
    autoSchedule: false,
    createdBy: req.user!.userId,
  }));

  // Replace only after the full plan has been computed successfully.
  if (overwrite && existingCount > 0) {
    await Exam.deleteMany({ period: period._id, school: schoolId });
  }
  if (documents.length) await Exam.insertMany(documents);

  // When the admin supplied only a Start Date, persist the generated last day
  // so the day tabs immediately reflect the exact auto-generated timetable.
  if (!period.endDate && lastDay) {
    await ExamPeriod.updateOne(
      { _id: period._id, school: schoolId },
      { $set: { endDate: lastDay } },
    );
  }

  const bandSummary = Array.from(byBand.entries()).map(([band, list]) => ({
    band,
    subjects: list.length,
    exams: assignments.filter((item) => item.group.band === band).length,
  }));

  return ApiResponse.success(res, {
    periodId: period._id,
    created: documents.length,
    sharedSubjectSlots: subjectSchedule.length,
    firstDate: examDateKey(firstDay),
    lastDate: examDateKey(lastDay),
    bandSummary,
    subjectSchedule,
  }, `Generated ${documents.length} exams from ${subjectSchedule.length} shared subject slot(s)`);
};

// POST /exams/periods/:periodId/move-schedule-group
// Places one grouped department subject into a Day + Shift cell. If that
// target cell already contains another subject group, the displaced exams are
// kept as exam records but marked schedulePlaced=false so their old cell is
// blank and they remain available in the course picker.
export const moveScheduleGroup = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const periodId = String(req.params.periodId || '');
  if (!/^[a-f\d]{24}$/i.test(periodId)) throw new BadRequestError('A valid Exam is required');

  const normalizeIds = (value: unknown): string[] => {
    const raw: unknown[] = Array.isArray(value) ? value : [];
    return Array.from(new Set<string>(
      raw.map((item) => String(item || '')).filter((item) => Boolean(item))
    ));
  };

  const examIds = normalizeIds(req.body?.examIds);
  const displacedExamIds = normalizeIds(req.body?.displacedExamIds)
    .filter((id) => !examIds.includes(id));

  if (!examIds.length) throw new BadRequestError('At least one exam is required');
  if (examIds.length > 200 || displacedExamIds.length > 200) {
    throw new BadRequestError('A maximum of 200 exams can be changed at once');
  }
  if ([...examIds, ...displacedExamIds].some((id) => !/^[a-f\d]{24}$/i.test(id))) {
    throw new BadRequestError('One or more exam ids are invalid');
  }

  const targetDate = examDateKey(req.body?.targetDate);
  const targetShiftIndex = Number(req.body?.targetShiftIndex);
  if (!targetDate) throw new BadRequestError('A valid target date is required');

  const period = await ExamPeriod.findOne({ _id: periodId, school: schoolId }).lean() as any;
  if (!period) throw new NotFoundError('Exam');
  if (period.status === 'closed') {
    throw new ConflictError('This exam is closed and its schedule can no longer be edited');
  }

  const targetDay = new Date(`${targetDate}T00:00:00.000Z`);
  if (period.startDate && targetDay < new Date(period.startDate)) {
    throw new ConflictError('Target date is before this exam\'s Start Date');
  }
  if (period.endDate && targetDay > new Date(period.endDate)) {
    throw new ConflictError('Target date is after this exam\'s End Date');
  }

  const rules = await getExamSchedulingRulesForSchool(schoolId);
  if (!Number.isInteger(targetShiftIndex) || targetShiftIndex < 0 || targetShiftIndex >= rules.examShifts.length) {
    throw new BadRequestError('A valid target shift is required');
  }
  const shift = rules.examShifts[targetShiftIndex];
  const duration = timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime);

  const selectedExams = await Exam.find({
    _id: { $in: examIds },
    school: schoolId,
    period: periodId,
    autoSchedule: { $ne: true },
    status: { $ne: 'cancelled' },
  }).lean() as any[];

  if (selectedExams.length !== examIds.length) {
    throw new BadRequestError('One or more selected exams no longer belong to this examination');
  }

  if (displacedExamIds.length) {
    const displacedCount = await Exam.countDocuments({
      _id: { $in: displacedExamIds },
      school: schoolId,
      period: periodId,
      autoSchedule: { $ne: true },
      status: { $ne: 'cancelled' },
    });
    if (displacedCount !== displacedExamIds.length) {
      throw new BadRequestError('One or more displaced exams no longer belong to this examination');
    }
  }

  const courseIds = selectedExams.map((exam) => String(exam.course || '')).filter(Boolean);
  const courses = await Course.find({ _id: { $in: courseIds }, school: schoolId })
    .select('_id class')
    .lean() as any[];
  const classByCourse = new Map(courses.map((course) => [String(course._id), String(course.class || '')]));
  const excludedIds = [...examIds, ...displacedExamIds];

  const pending: PendingFixedExam[] = [];
  for (const exam of selectedExams) {
    const classId = classByCourse.get(String(exam.course || '')) || '';
    if (!classId) throw new BadRequestError('Could not resolve the class for one of the selected exams');

    await validateFixedExamSchedule({
      schoolId,
      classId,
      title: exam.title || period.name,
      examDate: targetDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      duration,
      room: exam.room || '',
      autoSchedule: false,
      excludeExamIds: excludedIds,
      pending,
    });

    pending.push({
      schoolId,
      classId,
      examDate: targetDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      room: exam.room || '',
      title: exam.title || period.name,
    });
  }

  if (displacedExamIds.length) {
    await Exam.updateMany(
      { _id: { $in: displacedExamIds }, school: schoolId, period: periodId },
      { $set: { schedulePlaced: false } },
      { runValidators: true },
    );
  }

  await Exam.updateMany(
    { _id: { $in: examIds }, school: schoolId, period: periodId },
    {
      $set: {
        schedulePlaced: true,
        examDate: targetDay,
        startTime: shift.startTime,
        endTime: shift.endTime,
        duration,
      },
    },
    { runValidators: true },
  );

  return ApiResponse.success(res, {
    moved: selectedExams.length,
    displaced: displacedExamIds.length,
    targetDate,
    shiftIndex: targetShiftIndex,
    startTime: shift.startTime,
    endTime: shift.endTime,
  }, `${selectedExams.length} exam(s) placed successfully`);
};

// POST /exams/periods/:periodId/reset-schedule-groups
// Clears the selected department timetable without deleting any exams/courses.
export const resetScheduleGroups = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const periodId = String(req.params.periodId || '');
  if (!/^[a-f\d]{24}$/i.test(periodId)) throw new BadRequestError('A valid Exam is required');

  const rawIds: unknown[] = Array.isArray(req.body?.examIds) ? req.body.examIds : [];
  const examIds = Array.from(new Set<string>(
    rawIds.map((item) => String(item || '')).filter((item) => Boolean(item))
  ));

  if (!examIds.length) throw new BadRequestError('No department exams were provided');
  if (examIds.length > 500) throw new BadRequestError('A maximum of 500 exams can be reset at once');
  if (examIds.some((id) => !/^[a-f\d]{24}$/i.test(id))) {
    throw new BadRequestError('One or more exam ids are invalid');
  }

  const period = await ExamPeriod.findOne({ _id: periodId, school: schoolId }).lean() as any;
  if (!period) throw new NotFoundError('Exam');
  if (period.status === 'closed') {
    throw new ConflictError('This exam is closed and its schedule can no longer be edited');
  }

  const matched = await Exam.countDocuments({
    _id: { $in: examIds },
    school: schoolId,
    period: periodId,
    autoSchedule: { $ne: true },
    status: { $ne: 'cancelled' },
  });
  if (matched !== examIds.length) {
    throw new BadRequestError('One or more selected exams no longer belong to this examination');
  }

  await Exam.updateMany(
    { _id: { $in: examIds }, school: schoolId, period: periodId },
    { $set: { schedulePlaced: false } },
    { runValidators: true },
  );

  return ApiResponse.success(res, { reset: examIds.length }, `${examIds.length} exam(s) cleared from the timetable`);
};

// POST /exams/periods/:periodId/edit-department-schedule
// Updates one Day/Date row or one Shift column for a single department view.
// The frontend supplies only the affected department exam IDs; records remain
// attached to their existing courses/classes and are validated before saving.
export const editDepartmentSchedule = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const periodId = String(req.params.periodId || '');
  if (!/^[a-f\\d]{24}$/i.test(periodId)) throw new BadRequestError('A valid Exam is required');

  const rawIds: unknown[] = Array.isArray(req.body?.examIds) ? req.body.examIds : [];
  const examIds = Array.from(new Set(rawIds.map((item) => String(item || '')).filter(Boolean)));
  if (!examIds.length) throw new BadRequestError('No scheduled department exams were selected');
  if (examIds.length > 500) throw new BadRequestError('A maximum of 500 exams can be edited at once');
  if (examIds.some((id) => !/^[a-f\\d]{24}$/i.test(id))) throw new BadRequestError('One or more exam ids are invalid');

  const editType = String(req.body?.editType || '');
  if (editType !== 'date' && editType !== 'shift') {
    throw new BadRequestError('Choose whether to edit a Day/Date or a Shift');
  }

  const period = await ExamPeriod.findOne({ _id: periodId, school: schoolId }).lean() as any;
  if (!period) throw new NotFoundError('Exam');
  if (period.status === 'closed') {
    throw new ConflictError('This exam is closed and its schedule can no longer be edited');
  }

  const exams = await Exam.find({
    _id: { $in: examIds },
    school: schoolId,
    period: periodId,
    autoSchedule: { $ne: true },
    schedulePlaced: { $ne: false },
    status: { $ne: 'cancelled' },
  }).lean() as any[];
  if (exams.length !== examIds.length) {
    throw new BadRequestError('One or more selected exams are no longer scheduled in this examination');
  }

  const excludedIds = exams.map((exam) => String(exam._id));
  let targetDate = '';
  let startTime = '';
  let endTime = '';
  let updateFields: Record<string, unknown> = {};

  if (editType === 'date') {
    targetDate = examDateKey(req.body?.targetDate);
    if (!targetDate) throw new BadRequestError('Choose a valid new exam date');
    const targetDay = new Date(`${targetDate}T00:00:00.000Z`);
    if (period.startDate && targetDay < new Date(period.startDate)) {
      throw new ConflictError('The new date is before this examination Start Date');
    }
    if (period.endDate && targetDay > new Date(period.endDate)) {
      throw new ConflictError('The new date is after this examination End Date');
    }
    updateFields = { examDate: targetDay };
  } else {
    startTime = String(req.body?.startTime || '').trim();
    endTime = String(req.body?.endTime || '').trim();
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (start < 0 || end < 0) throw new BadRequestError('Start Time and End Time must use HH:MM');
    if (end <= start) throw new BadRequestError('Shift End Time must be after Start Time');
    updateFields = { startTime, endTime };
  }

  const courseIds = exams.map((exam) => String(exam.course || '')).filter(Boolean);
  const courses = await Course.find({ _id: { $in: courseIds }, school: schoolId })
    .select('_id class')
    .lean() as any[];
  const classByCourse = new Map(courses.map((course) => [String(course._id), String(course.class || '')]));
  const pending: PendingFixedExam[] = [];

  for (const exam of exams) {
    const classId = classByCourse.get(String(exam.course || '')) || '';
    if (!classId) throw new BadRequestError('Could not resolve the class for one of the selected exams');
    const examDate = editType === 'date' ? targetDate : examDateKey(exam.examDate);
    const examStart = editType === 'shift' ? startTime : String(exam.startTime || '');
    const examEnd = editType === 'shift' ? endTime : String(exam.endTime || '');
    const duration = Number(exam.duration || (timeToMinutes(examEnd) - timeToMinutes(examStart)));

    await validateFixedExamSchedule({
      schoolId,
      classId,
      title: exam.title || period.name,
      examDate,
      startTime: examStart,
      endTime: examEnd,
      duration,
      room: exam.room || '',
      autoSchedule: false,
      excludeExamIds: excludedIds,
      pending,
    });

    pending.push({
      schoolId,
      classId,
      examDate,
      startTime: examStart,
      endTime: examEnd,
      room: exam.room || '',
      title: exam.title || period.name,
    });
  }

  await Exam.updateMany(
    { _id: { $in: excludedIds }, school: schoolId, period: periodId },
    { $set: updateFields },
    { runValidators: true },
  );

  return ApiResponse.success(
    res,
    { updated: exams.length, editType, targetDate: targetDate || undefined, startTime: startTime || undefined, endTime: endTime || undefined },
    editType === 'date'
      ? `Updated the date for ${exams.length} department exam(s)`
      : `Updated the shift time for ${exams.length} department exam(s)`,
  );
};

// Backward-compatible route names used by the department cell editor.
export const assignScheduleCell = moveScheduleGroup;
export const resetDepartmentSchedule = resetScheduleGroups;

// POST /exams/schedule-grid — bulk-save editable cells from the rules-driven grid.
// Each changed cell is applied independently so a single conflict does not discard
// other valid changes. Course changes are allowed here only when the replacement
// course belongs to the exact same class and organization represented by the row.
export const saveScheduleGrid = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = scheduleRulesSchoolId(req);
  const periodId = String(req.body?.periodId || '');
  const dateKey = examDateKey(req.body?.examDate);
  if (!/^[a-f\d]{24}$/i.test(periodId)) throw new BadRequestError('Create or select an Exam before editing its schedule');
  if (!dateKey) throw new BadRequestError('A valid Exam Date is required');

  const period = await ExamPeriod.findOne({ _id: periodId, school: schoolId }).lean() as any;
  if (!period) throw new NotFoundError('Exam');
  if (period.status === 'closed') throw new ConflictError('This exam is closed and its schedule can no longer be edited');

  const scheduledDate = new Date(`${dateKey}T00:00:00.000Z`);
  if (period.startDate && scheduledDate < new Date(period.startDate)) {
    throw new ConflictError('Exam Date is before this exam\'s Start Date');
  }
  if (period.endDate && scheduledDate > new Date(period.endDate)) {
    throw new ConflictError('Exam Date is after this exam\'s End Date');
  }

  const rules = await getExamSchedulingRulesForSchool(schoolId);
  const examDay = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  if (!rules.allowedExamDays.includes(examDay)) {
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][examDay];
    throw new ConflictError(`Exam day restriction: ${dayName} is not enabled in Exam Scheduling Rules.`);
  }

  const cells = Array.isArray(req.body?.cells) ? req.body.cells : [];
  if (!cells.length) throw new BadRequestError('At least one changed schedule cell is required');
  if (cells.length > 500) throw new BadRequestError('A maximum of 500 schedule cells can be saved at once');

  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const saved: string[] = [];
  const failures: { key: string; message: string }[] = [];

  for (const rawCell of cells) {
    const key = String(rawCell?.key || '');
    try {
      const classId = String(rawCell?.classId || '');
      const shiftIndex = Number(rawCell?.shiftIndex);
      const courseId = String(rawCell?.courseId || '');

      if (!/^[a-f\d]{24}$/i.test(classId)) throw new BadRequestError('A valid class is required');
      if (!Number.isInteger(shiftIndex) || shiftIndex < 0 || shiftIndex >= rules.examShifts.length) {
        throw new BadRequestError('A valid exam shift is required');
      }

      const cls = await ClassModel.findOne({ _id: classId, school: schoolId }).select('title section school').lean() as any;
      if (!cls) throw new NotFoundError('Class');

      const shift = rules.examShifts[shiftIndex];
      const siblingCourseIds = await Course.find({ class: classId, school: schoolId }).distinct('_id');

      // HH:MM strings sort lexicographically, so these predicates safely locate
      // any existing exam occupying the configured shift window.
      const existing = await Exam.find({
        period: periodId,
        course: { $in: siblingCourseIds },
        autoSchedule: { $ne: true },
        status: { $ne: 'cancelled' },
        examDate: { $gte: dayStart, $lt: dayEnd },
        startTime: { $lt: shift.endTime },
        endTime: { $gt: shift.startTime },
      }).sort({ createdAt: 1 });

      if (!courseId) {
        if (existing.length) {
          await Exam.deleteMany({ _id: { $in: existing.map((exam: any) => exam._id) } });
        }
        saved.push(key);
        continue;
      }

      if (!/^[a-f\d]{24}$/i.test(courseId)) throw new BadRequestError('A valid course is required');
      const course = await Course.findOne({ _id: courseId, class: classId, school: schoolId })
        .select('title teacher class school')
        .lean() as any;
      if (!course) throw new BadRequestError('The selected course does not belong to this grade/class');

      if (existing.length > 1) {
        throw new ConflictError('Multiple exams already overlap this grid cell. Resolve the duplicate exams before editing this cell.');
      }
