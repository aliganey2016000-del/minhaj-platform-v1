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
import { getAutoScheduleWindow } from '../utils/exam-eligibility';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, getOwnTeacherRecord, assertOwnsExamIfTeacher, resolveOrgIdForCreate } from '../utils/tenant-scope';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
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
    const persisted = await Exam.find({
      course: { $in: siblingCourseIds },
      autoSchedule: { $ne: true },
      status: { $ne: 'cancelled' },
      examDate: { $gte: dayStart, $lt: dayEnd },
      ...(input.excludeExamId ? { _id: { $ne: input.excludeExamId } } : {}),
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
    const roomPersisted = await Exam.find({
      school: input.schoolId || null,
      autoSchedule: { $ne: true },
      status: { $ne: 'cancelled' },
      examDate: { $gte: dayStart, $lt: dayEnd },
      room: newRoom,
      ...(input.excludeExamId ? { _id: { $ne: input.excludeExamId } } : {}),
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
  const schoolId = scheduleRulesSchoolId(req);
  const periods = await ExamPeriod.find({ school: schoolId })
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

      const existingExam = existing[0] as any;
      const duration = timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime);
      await validateFixedExamSchedule({
        schoolId,
        classId,
        title: existingExam?.title || period.name,
        examDate: dateKey,
        startTime: shift.startTime,
        endTime: shift.endTime,
        duration,
        room: existingExam?.room || '',
        autoSchedule: false,
        excludeExamId: existingExam?._id ? String(existingExam._id) : undefined,
      });

      if (existingExam) {
        await Exam.findByIdAndUpdate(existingExam._id, {
          title: period.name,
          period: periodId,
          course: courseId,
          examDate: dayStart,
          startTime: shift.startTime,
          endTime: shift.endTime,
          duration,
        }, { runValidators: true });
      } else {
        await Exam.create({
          title: period.name,
          period: periodId,
          course: courseId,
          school: schoolId,
          examDate: dayStart,
          startTime: shift.startTime,
          endTime: shift.endTime,
          duration,
          totalMarks: 100,
          passingMarks: 50,
          room: '',
          instructions: '',
          status: 'scheduled',
          autoSchedule: false,
          createdBy: req.user!.userId,
        });
      }

      saved.push(key);
    } catch (error: any) {
      failures.push({
        key,
        message: error?.message || 'Could not save this schedule cell',
      });
    }
  }

  return ApiResponse.success(res, {
    saved,
    failures,
    total: cells.length,
  }, failures.length ? 'Exam schedule saved with some conflicts' : 'Exam schedule saved successfully');
};

// GET /exams — List all with optional filters
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, status, school, period, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (courseId) filter.course = courseId as string;
  if (period) filter.period = period as string;
  if (status && ['scheduled', 'ongoing', 'completed', 'cancelled'].includes(status as string))
    filter.status = status;
  // applyOrgFilter below auto-scopes org_admin to their own org and leaves
  // admin/teacher unrestricted — `school` lets a super admin (role 'admin')
  // narrow the platform-wide exam list down to one organization, e.g. for
  // Papers & Approval's org picker.
  if (school) filter.school = school as string;

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  // Teacher: assigned-only access — only exams for courses assigned to them.
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const teacherCourseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    scopedFilter.course = { $in: teacherCourseIds };
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));

  const [exams, total] = await Promise.all([
    Exam.find(scopedFilter)
      .populate({
        path: 'course',
        select: 'title.en slug category teacher class school thumbnail enrolledStudents',
        populate: [
          { path: 'teacher', select: 'profile', populate: { path: 'profile', select: 'firstName lastName' } },
          { path: 'class', select: 'title section department', populate: { path: 'department', select: 'name' } },
          { path: 'school', select: 'name' },
        ],
      })
      .populate('school', 'name')
      .populate('period', 'name academicYear term status startDate endDate')
      .populate('createdBy', 'email')
      .sort({ examDate: 1, startTime: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Exam.countDocuments(scopedFilter),
  ]);

  let result = exams;
  if (search) {
    const s = (search as string).toLowerCase();
    result = exams.filter((e: any) => {
      const title = (e.title || '').toLowerCase();
      const courseName = (e.course?.title?.en || '').toLowerCase();
      const room = (e.room || '').toLowerCase();
      return title.includes(s) || courseName.includes(s) || room.includes(s);
    });
  }

  // Attach each exam's paper status (draft/submitted/approved/rejected, or
  // null if no paper exists yet) in one batched lookup — lets callers like
  // Papers & Approval filter/tab by review status without an N+1 fetch.
  const papers = await ExamPaper.find({ exam: { $in: result.map((e: any) => e._id) } })
    .select('exam status')
    .lean();
  const paperStatusByExam: Record<string, string> = {};
  for (const p of papers) paperStatusByExam[p.exam.toString()] = p.status;
  result = result.map((e: any) => ({ ...e, paperStatus: paperStatusByExam[e._id.toString()] || null }));

  return ApiResponse.paginated(res, result, {
    page: pageNum,
    limit: limitNum,
    total: search ? result.length : total,
  });
};

// GET /exams/:id
export const getById = async (req: Request, res: Response): Promise<Response> => {
  const exam = await Exam.findById(req.params.id)
    .populate('course', 'title.en slug category enrolledStudents maxStudents teacher')
    .populate('createdBy', 'email')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  assertOwnsOrg(req, exam, 'school');
  await assertOwnsExamIfTeacher(req, exam);

  return ApiResponse.success(res, exam);
};

// POST /exams
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { course: courseId } = req.body;
  if (!courseId) throw new BadRequestError('course is required');

  const course = await Course.findById(courseId).select('school teacher class');
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');
  await assertOwnsExamIfTeacher(req, { course });

  await validateFixedExamSchedule({
    schoolId: String(course.school || ''),
    classId: course.class ? String(course.class) : '',
    title: req.body.title,
    examDate: req.body.examDate,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    duration: req.body.duration,
    room: req.body.room,
    autoSchedule: !!req.body.autoSchedule,
  });

  // Same duplicate guard as bulkImport, for a manually-scheduled (not
  // auto-scheduled) exam — catches an accidental double-submit of the
  // "Schedule Exam" form.
  if (!req.body.autoSchedule && req.body.title && req.body.examDate && req.body.startTime) {
    const dupExam = await Exam.findOne({
      course: courseId,
      title: req.body.title,
      examDate: new Date(req.body.examDate),
      startTime: req.body.startTime,
    }).lean();
    if (dupExam) throw new ConflictError(`An exam titled "${req.body.title}" already exists for this course on that date and time`);
  }

  const payload = {
    ...req.body,
    // Always stamped from the course's own org — never trust the client here.
    school: course.school || null,
    createdBy: req.user!.userId,
  };
  const exam = await Exam.create(payload);
  const populated = await Exam.findById(exam._id)
    .populate('course', 'title.en slug category')
    .populate('createdBy', 'email')
    .lean();

  return ApiResponse.created(res, populated, 'Exam created successfully');
};

// PATCH /exams/:id
export const update = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Exam.findById(req.params.id).populate('course', 'school teacher class');
  if (!existing) throw new NotFoundError('Exam');
  assertOwnsOrg(req, existing, 'school');
  await assertOwnsExamIfTeacher(req, existing);

  // Nobody may move an exam to a different course/org via this endpoint —
  // that would bypass the ownership checks above. Delete the exam and
  // create a new one instead if it truly needs to move.
  const updates = { ...req.body };
  delete updates.course;
  delete updates.school;
  delete updates.createdBy;

  const existingCourse = existing.course as any;
  const nextAutoSchedule = updates.autoSchedule ?? existing.autoSchedule;
  await validateFixedExamSchedule({
    schoolId: String(existing.school || existingCourse?.school || ''),
    classId: existingCourse?.class ? String(existingCourse.class) : '',
    title: updates.title ?? existing.title,
    examDate: updates.examDate ?? existing.examDate,
    startTime: updates.startTime ?? existing.startTime,
    endTime: updates.endTime ?? existing.endTime,
    duration: updates.duration ?? existing.duration,
    room: updates.room ?? existing.room,
    autoSchedule: !!nextAutoSchedule,
    excludeExamId: String(existing._id),
  });

  const exam = await Exam.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  })
    .populate('course', 'title.en slug category')
    .populate('createdBy', 'email')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.success(res, exam, 'Exam updated successfully');
};

// DELETE /exams/:id
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Exam.findById(req.params.id).populate('course', 'school teacher');
  if (!existing) throw new NotFoundError('Exam');
  assertOwnsOrg(req, existing, 'school');
  await assertOwnsExamIfTeacher(req, existing);

  await Exam.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Exam deleted');
};

// Canonical academic-year start (e.g. "2026" from "2026/27", "2026-2027",
// "2026") — used to match a student's class year to their master seating
// plan without depending on the exact separator the admin typed.
const academicYearStartKey = (v: unknown): string => {
  const m = String(v ?? '').trim().match(/(\d{4})/);
  return m ? m[1] : '';
};

// Determine which master seating plan slot (mid vs final) an exam maps to.
// Auto-scheduled exams carry `milestone` explicitly. Manually scheduled ones
// don't, so we fall back to title keywords and then to the student's only
// seating type for the year.
const examTypeOf = (exam: any): 'mid' | 'final' | '' => {
  if (exam.milestone === 'mid' || exam.milestone === 'final') return exam.milestone;
  const title = String(exam.title || '').toLowerCase();
  if (/(\bfinal\b|final exam)/.test(title)) return 'final';
  if (/(\bmid\b|mid[- ]?term|mid exam)/.test(title)) return 'mid';
  return '';
};

// GET /exams/my — Student's exams from enrolled courses
export const getMyExams = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const studentRecord = student as any;

  // Current class is the source of truth for the student's current exam
  // timetable. After promotion (e.g. Grade 5 -> Grade 6), old-grade exams
  // stop being part of the live schedule even if historical enrollments are
  // still retained for transcripts/reporting.
  const [myClass, mySchool] = await Promise.all([
    studentRecord.class
      ? ClassModel.findById(studentRecord.class)
          .select('title section department academicYear')
          .populate('department', 'name')
          .lean()
      : null,
    studentRecord.school
      ? School.findById(studentRecord.school).select('name').lean()
      : null,
  ]);

  const courseIds = studentRecord.class
    ? await Course.find({
        class: studentRecord.class,
        ...(studentRecord.school ? { school: studentRecord.school } : {}),
        status: { $ne: 'archived' },
      }).distinct('_id')
    : (student.enrolledCourses || []).map((id: any) => id);

  const rawExams = await Exam.find({ course: { $in: courseIds } })
    .populate({
      path: 'course',
      select: 'title.en slug category thumbnail class school teacher enrolledStudents',
      populate: [
        { path: 'class', select: 'title section department', populate: { path: 'department', select: 'name' } },
        { path: 'school', select: 'name' },
        { path: 'teacher', select: 'profile', populate: { path: 'profile', select: 'firstName lastName' } },
      ],
    })
    .populate('school', 'name')
    .populate('period', 'name academicYear term status startDate endDate')
    .populate('createdBy', 'email')
    .sort({ examDate: 1, startTime: 1 })
    .lean();

  // The live student schedule follows BOTH the student's current class and
  // that class's current academic year. This matters because Classes/Courses
  // are persistent across years: a Grade 6 course can still have last year's
  // exams attached to it. Named periods give us an explicit academic year;
  // legacy exams fall back to their calendar year.
  const currentAcademicYearKey = academicYearStartKey((myClass as any)?.academicYear);
  const currentAcademicStart = currentAcademicYearKey ? Number(currentAcademicYearKey) : 0;
  const exams = (rawExams as any[]).filter((exam: any) => {
    if (exam.period) {
      if (exam.period.status === 'draft') return false;
      const periodYear = academicYearStartKey(exam.period.academicYear);
      return !currentAcademicYearKey || !periodYear || periodYear === currentAcademicYearKey;
    }
    if (!currentAcademicStart || !exam.examDate) return true;
    const examYear = new Date(exam.examDate).getUTCFullYear();
    return examYear === currentAcademicStart || examYear === currentAcademicStart + 1;
  });

  // Join in this student's own attempt status per exam — lets the frontend
  // tell "time's up, you submitted" (completed) apart from "time's up, you
  // never took it" (missed), which the Exam document alone can't express.
  const attempts = await ExamAttempt.find({ exam: { $in: exams.map((e: any) => e._id) }, student: student._id })
    .select('exam status')
    .lean();
  const attemptStatusByExam: Record<string, string> = {};
  for (const a of attempts) attemptStatusByExam[a.exam.toString()] = a.status;

  // Auto-scheduled exams have no shared calendar date — each student gets
  // their own personal window instead, computed from the moment THEY met
  // the prerequisites (see exam-eligibility.ts).
  const windows = await Promise.all(
    exams.map((e: any) => (e.autoSchedule ? getAutoScheduleWindow(e, student._id) : Promise.resolve(null)))
  );

  // A student's own retake requests — lets the frontend show "pending
  // admin approval" or "not allowed, contact administration" instead of
  // just silently re-showing the Request Retake button. Only the latest
  // request per exam matters (an approved one already reopened the window
  // and reset via the ExamAppeal controller, so a stale rejected one from
  // before that shouldn't keep blocking the student).
  const retakeRequests = await ExamAppeal.find({ student: student._id, type: 'retake_request' })
    .select('exam status createdAt')
    .sort({ createdAt: -1 })
    .lean();
  const retakeStatusByExam: Record<string, string> = {};
  for (const r of retakeRequests) {
    const key = r.exam.toString();
    if (!(key in retakeStatusByExam)) retakeStatusByExam[key] = r.status;
  }

  const result = exams.map((e: any, i: number) => {
    const win = windows[i];
    return {
      ...e,
      myAttemptStatus: attemptStatusByExam[e._id.toString()] || null,
      myScheduledStart: win?.scheduledStart || null,
      myScheduledEnd: win?.scheduledEnd || null,
      myMetPrerequisites: win?.metPrerequisites ?? null,
      myRetakeRequestStatus: retakeStatusByExam[e._id.toString()] || null,
    };
  });

  // Attach the student's master seating (room + desk) from the Exam Seating
  // Center. The plan is keyed by academicYear + examType, and an exam's
  // `milestone` is its examType. Academic year is matched on its start year
  // so "2026/27", "2026-2027" and "2026" all align.
  const seating = await ExamSeatingPlan.find({ student: student._id })
    .populate('room', 'name building')
    .lean();
  const myAcademicYearKey = currentAcademicYearKey;
  const seatByType = new Map<string, any>();
  for (const s of seating as any[]) {
    const seatYear = academicYearStartKey(s.academicYear);
    if (myAcademicYearKey && seatYear && seatYear !== myAcademicYearKey) continue;
    if (!seatByType.has(s.examType)) seatByType.set(s.examType, s);
  }

  const examsWithSeating = result.map((e: any) => {
    const type = examTypeOf(e);
    const seat = type ? seatByType.get(type) : (seatByType.size === 1 ? seatByType.values().next().value : null);
    return {
      ...e,
      mySeatRoom: seat?.room?.name || '',
      mySeatBuilding: seat?.room?.building || '',
      mySeat: seat?.deskNumber || '',
    };
  });

  return ApiResponse.success(res, { exams: examsWithSeating, myClass, mySchool });
};

// ---------------------------------------------------------------------------
// GET /exams/browse?classId=<id> — Student-only, read-only exam calendar for
// a class the caller does NOT belong to. Returns only public schedule
// fields (no myAttemptStatus/myScheduledStart/myMetPrerequisites/
// myRetakeRequestStatus — those are specific to the caller's own access,
// which this endpoint deliberately never grants). Auto-scheduled exams have
// no shared date to show here at all — each student's own window is
// computed individually — so those come back with just their autoSchedule/
// milestone flags and no date/time.
// ---------------------------------------------------------------------------

export const browseExams = async (req: Request, res: Response): Promise<Response> => {
  const classId = req.query.classId as string | undefined;
  if (!classId) throw new BadRequestError('classId is required');

  const student = await ensureStudentRecord(req.user!.userId);
  const studentSchool = (student as any).school;

  const targetClass = await ClassModel.findById(classId).select('title section department school academicYear').lean();
  if (!targetClass) throw new NotFoundError('Class');
  if (!studentSchool || String((targetClass as any).school) !== String(studentSchool)) {
    throw new NotFoundError('Class');
  }

  const courseIds = await Course.find({ class: classId }).distinct('_id');
  const exams = await Exam.find({ course: { $in: courseIds } })
    .select('title course period examDate startTime endTime duration totalMarks passingMarks room status autoSchedule milestone')
    .populate({ path: 'course', select: 'title.en slug category thumbnail class school teacher', populate: [
      { path: 'class', select: 'title section department', populate: { path: 'department', select: 'name' } },
      { path: 'school', select: 'name' },
      { path: 'teacher', select: 'profile', populate: { path: 'profile', select: 'firstName lastName' } },
    ] })
    .populate('period', 'name academicYear term status startDate endDate')
    .sort({ examDate: 1, startTime: 1 })
    .lean();

  const targetAcademicYearKey = academicYearStartKey((targetClass as any).academicYear);
  const targetAcademicStart = targetAcademicYearKey ? Number(targetAcademicYearKey) : 0;
  const visible = (exams as any[]).filter((exam: any) => {
    if (exam.period) {
      if (exam.period.status === 'draft') return false;
      const periodYear = academicYearStartKey(exam.period.academicYear);
      return !targetAcademicYearKey || !periodYear || periodYear === targetAcademicYearKey;
    }
    if (!targetAcademicStart || !exam.examDate) return true;
    const examYear = new Date(exam.examDate).getUTCFullYear();
    return examYear === targetAcademicStart || examYear === targetAcademicStart + 1;
  });

  return ApiResponse.success(res, visible);
};

// PATCH /exams/:id/status
export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['scheduled', 'ongoing', 'completed', 'cancelled'].includes(status)) {
    throw new BadRequestError('Valid status required: scheduled, ongoing, completed, or cancelled');
  }

  const existing = await Exam.findById(req.params.id).populate('course', 'school teacher');
  if (!existing) throw new NotFoundError('Exam');
  assertOwnsOrg(req, existing, 'school');
  await assertOwnsExamIfTeacher(req, existing);

  const exam = await Exam.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  )
    .populate('course', 'title.en slug')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.success(res, exam, `Exam status updated to ${status}`);
};

// PATCH /exams/:id/publish-results — Reveal (or hide) this exam's results to students
export const publishResults = async (req: Request, res: Response): Promise<Response> => {
  const { published } = req.body;
  if (typeof published !== 'boolean') throw new BadRequestError('published must be true or false');

  const existing = await Exam.findById(req.params.id).populate('course', 'school teacher');
  if (!existing) throw new NotFoundError('Exam');
  assertOwnsOrg(req, existing, 'school');
  await assertOwnsExamIfTeacher(req, existing);

  const exam = await Exam.findByIdAndUpdate(
    req.params.id,
    { resultsPublished: published },
    { new: true }
  )
    .populate('course', 'title.en slug')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.success(res, exam, published ? 'Results published to students' : 'Results hidden from students');
};

// ---------------------------------------------------------------------------
// POST /exams/bulk-delete — Delete many exams in one request
// ---------------------------------------------------------------------------

export const bulkRemove = async (req: Request, res: Response): Promise<Response> => {
  const ids: string[] = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  if (ids.length === 0) throw new BadRequestError('No exam ids provided');

  const filter: Record<string, unknown> = applyOrgFilter(req, { _id: { $in: ids } }, 'school');

  // Teacher: only their own courses' exams — same scoping assertOwnsExamIfTeacher
  // enforces per-document on the single-delete path above, applied as a
  // query filter here so a stray id for someone else's course is silently
  // excluded rather than aborting the whole batch.
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const teacherCourseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    filter.course = { $in: teacherCourseIds };
  }

  const result = await Exam.deleteMany(filter);
  return ApiResponse.success(res, { deleted: result.deletedCount }, `Deleted ${result.deletedCount} exam(s)`);
};

// ---------------------------------------------------------------------------
// GET /exams/export — Export scoped exams as formatted XLSX
// ---------------------------------------------------------------------------

export const exportData = async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');
  if (req.query?.period && /^[a-f\d]{24}$/i.test(String(req.query.period))) {
    filter.period = String(req.query.period);
  }
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const teacherCourseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    filter.course = { $in: teacherCourseIds };
  }

  const exams = await Exam.find(filter)
    .populate({
      path: 'course',
      select: 'title.en class teacher school',
      populate: [
        { path: 'class', select: 'title section' },
        { path: 'teacher', select: 'profile user', populate: [
          { path: 'profile', select: 'firstName lastName' },
          { path: 'user', select: 'email' },
        ] },
      ],
    })
    .populate('school', 'name')
    .populate('period', 'name academicYear term status startDate endDate')
    .sort({ examDate: 1, startTime: 1 })
    .lean();

  const schoolIds = Array.from(new Set(
    (exams as any[])
      .map((exam: any) => String(exam.school?._id || exam.school || ''))
      .filter((id: string) => /^[a-f\d]{24}$/i.test(id))
  ));
  const rulesBySchool = new Map<string, any>();
  await Promise.all(schoolIds.map(async (schoolId) => {
    try {
      rulesBySchool.set(schoolId, await getExamSchedulingRulesForSchool(schoolId));
    } catch {
      rulesBySchool.set(schoolId, null);
    }
  }));

  const teacherLabel = (course: any): string => {
    const name = [course?.teacher?.profile?.firstName, course?.teacher?.profile?.lastName]
      .filter(Boolean).join(' ').trim();
    return name || course?.teacher?.user?.email || '';
  };

  const classLabel = (course: any): string => {
    const cls = course?.class;
    if (!cls?.title) return '';
    return cls.section ? `${cls.title} - ${cls.section}` : cls.title;
  };

  const shiftLabel = (exam: any): string => {
    if (exam.autoSchedule) return 'Automatic';
    const schoolId = String(exam.school?._id || exam.school || '');
    const rules = rulesBySchool.get(schoolId);
    const shift = rules?.examShifts?.find((item: any) =>
      item.startTime === exam.startTime && item.endTime === exam.endTime
    );
    return shift?.name || '';
  };

  const headers = [
    'Organization',
    'Exam Period',
    'Academic Year',
    'Term / Semester',
    'Grade / Class',
    'Course Title',
    'Teacher',
    'Exam Title',
    'Exam Date',
    'Shift',
    'Start Time',
    'End Time',
    'Duration (min)',
    'Total Marks',
    'Passing Marks',
    'Room',
    'Period Status',
    'Exam Status',
    'Scheduling',
    'Instructions',
  ];

  const rows = (exams as any[]).map((e: any) => [
    e.school?.name || '',
    e.period?.name || '',
    e.period?.academicYear || '',
    e.period?.term || '',
    classLabel(e.course),
    e.course?.title?.en || '',
    teacherLabel(e.course),
    e.title || '',
    e.autoSchedule ? '' : examDateKey(e.examDate),
    shiftLabel(e),
    e.autoSchedule ? '' : (e.startTime || ''),
    e.autoSchedule ? '' : (e.endTime || ''),
    e.duration,
    e.totalMarks,
    e.passingMarks,
    e.room || '',
    e.period?.status || '',
    e.status,
    e.autoSchedule ? 'Automatic' : 'Manual',
    e.instructions || '',
  ]);

  const buffer = buildXlsxBuffer(headers, rows, 'Exams');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=exams-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// GET /exams/template — Download the period-aware bulk-import template.
// New imports can be linked directly to the same Exam Period used by the
// Table Grid. Legacy files without period columns are still accepted.
// ---------------------------------------------------------------------------

export const downloadTemplate = async (req: Request, res: Response): Promise<void> => {
  const isOrgAdmin = req.user?.role === 'org_admin';
  const sharedHeaders = [
    'Exam Period',
    'Academic Year',
    'Term / Semester',
    'Grade / Class',
    'Course Title',
    'Exam Title',
    'Exam Date (YYYY-MM-DD)',
    'Shift',
    'Start Time (HH:MM)',
    'End Time (HH:MM)',
    'Duration (minutes)',
    'Total Marks',
    'Passing Marks',
    'Room',
    'Instructions',
  ];
  const headers = isOrgAdmin ? sharedHeaders : ['Organization', ...sharedHeaders];

  const sampleShared = [
    'Midterm Exam',
    '2026/27',
    'Term 1',
    'Grade 5 - A',
    'Mathematics',
    'Midterm Exam',
    '2026-09-26',
    'Shift 1',
    '08:00',
    '10:00',
    '120',
    '100',
    '50',
    'Room 5',
    '',
  ];
  const sampleRow = isOrgAdmin ? sampleShared : ['Balad Primary and Secondary School', ...sampleShared];

  const buffer = buildXlsxBuffer(headers, [sampleRow], 'Exams Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=exams-template.xlsx');
  res.end(buffer);
};

function getExamImportField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const target = name.toLowerCase();
    const key = keys.find((k) => k.trim().toLowerCase() === target)
      ?? keys.find((k) => k.trim().toLowerCase().startsWith(target));
    if (key !== undefined) return row[key];
  }
  return undefined;
}

const normalizeImportText = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeImportClass = (value: unknown): string =>
  normalizeImportText(value).replace(/[\s_\-–—]+/g, '');

const importPeriodKey = (schoolId: string, name: string, academicYear: string, term: string): string =>
  [schoolId, normalizeImportText(name), normalizeImportText(academicYear), normalizeImportText(term)].join('|||');

// ---------------------------------------------------------------------------
// POST /exams/import — Bulk import manually-scheduled exams from Excel/CSV.
// Period-aware rows feed BOTH List and Table Grid because they are stored as
// ordinary Exam records linked to an ExamPeriod. Legacy rows remain supported.
// ---------------------------------------------------------------------------

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const ownOrgId = resolveOrgIdForCreate(req) as string | undefined;
  const createdBy = req.user!.userId;

  let schoolIdByName: Map<string, string> | null = null;
  if (!ownOrgId) {
    const allSchools = await School.find({}, { name: 1 }).lean();
    schoolIdByName = new Map(
      allSchools.map((s: any) => [normalizeImportText(s.name), s._id.toString()])
    );
  }
  const relevantSchoolIds = ownOrgId ? [ownOrgId] : Array.from(schoolIdByName!.values());

  const [allCourses, allClasses, allPeriods] = await Promise.all([
    Course.find(
      { school: { $in: relevantSchoolIds }, status: { $ne: 'archived' } },
      { title: 1, school: 1, class: 1, teacher: 1 }
    ).lean(),
    ClassModel.find(
      { school: { $in: relevantSchoolIds } },
      { title: 1, section: 1, school: 1 }
    ).lean(),
    ExamPeriod.find({ school: { $in: relevantSchoolIds } }).lean(),
  ]);

  const classIdsByAlias = new Map<string, Set<string>>();
  for (const cls of allClasses as any[]) {
    const schoolId = String(cls.school || '');
    const title = String(cls.title || '').trim();
    const section = String(cls.section || '').trim();
    const aliases = new Set<string>([
      title,
      section ? `${title} ${section}` : '',
      section ? `${title} - ${section}` : '',
      section ? `${title}-${section}` : '',
    ].filter(Boolean).map(normalizeImportClass));
    for (const alias of aliases) {
      const key = `${schoolId}|||${alias}`;
      const current = classIdsByAlias.get(key) || new Set<string>();
      current.add(String(cls._id));
      classIdsByAlias.set(key, current);
    }
  }

  const courseCandidatesByTitle = new Map<string, any[]>();
  for (const course of allCourses as any[]) {
    const key = `${course.school}|||${normalizeImportText(course.title?.en)}`;
    const list = courseCandidatesByTitle.get(key) || [];
    list.push(course);
    courseCandidatesByTitle.set(key, list);
  }

  const periodsByKey = new Map<string, any>();
  const periodsById = new Map<string, any>();
  for (const period of allPeriods as any[]) {
    periodsByKey.set(
      importPeriodKey(String(period.school), period.name, period.academicYear, period.term || ''),
      period
    );
    periodsById.set(String(period._id), period);
  }

  const existingExams = await Exam.find(
    { course: { $in: (allCourses as any[]).map((course: any) => course._id) } },
    { course: 1, period: 1, title: 1, examDate: 1, startTime: 1 }
  ).lean();

  const dedupeKeyFor = (
    periodId: string,
    courseId: string,
    title: string,
    date: string,
    startTime: string,
  ): string => [
    periodId || 'legacy',
    courseId,
    normalizeImportText(title),
    date,
    startTime,
  ].join('|||');

  const existingExamKeys = new Set(
    (existingExams as any[]).map((e: any) =>
      dedupeKeyFor(
        e.period ? String(e.period) : '',
        String(e.course),
        e.title,
        examDateKey(e.examDate),
        e.startTime,
      )
    )
  );

  let teacherCourseIdSet: Set<string> | null = null;
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const ids = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    teacherCourseIdSet = new Set(ids.map((id: any) => id.toString()));
  }

  const rulesBySchool = new Map<string, any>();
  const getRules = async (schoolId: string) => {
    if (!rulesBySchool.has(schoolId)) {
      rulesBySchool.set(schoolId, await getExamSchedulingRulesForSchool(schoolId));
    }
    return rulesBySchool.get(schoolId);
  };

  const periodRanges = new Map<string, { min: Date; max: Date }>();
  const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const errors: { row: number; message: string }[] = [];
  const documents: any[] = [];
  const pendingSchedules: PendingFixedExam[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    try {
      const cellValues = Object.values(row).map((v) => String(v ?? '').trim());
      if (cellValues.every((v) => v === '')) continue;

      const schoolName = String(getExamImportField(row, 'Organization', 'School') ?? '').trim();
      const periodName = String(getExamImportField(row, 'Exam Period', 'Period') ?? '').trim();
      const academicYear = String(getExamImportField(row, 'Academic Year', 'Year') ?? '').trim();
      const term = String(getExamImportField(row, 'Term / Semester', 'Term', 'Semester') ?? '').trim();
      const classLabel = String(getExamImportField(row, 'Grade / Class', 'Class', 'Grade') ?? '').trim();
      const courseTitle = String(getExamImportField(row, 'Course Title', 'Course') ?? '').trim();
      const examTitleRaw = String(getExamImportField(row, 'Exam Title', 'Title') ?? '').trim();
      const examDateRaw = getExamImportField(row, 'Exam Date', 'Date');
      const shiftName = String(getExamImportField(row, 'Shift') ?? '').trim();
      let startTime = String(getExamImportField(row, 'Start Time', 'Start') ?? '').trim();
      let endTime = String(getExamImportField(row, 'End Time', 'End') ?? '').trim();
      const durationRaw = getExamImportField(row, 'Duration');
      const totalMarksRaw = getExamImportField(row, 'Total Marks');
      const passingMarksRaw = getExamImportField(row, 'Passing Marks');
      const room = String(getExamImportField(row, 'Room') ?? '').trim();
      const instructions = String(getExamImportField(row, 'Instructions') ?? '').trim();

      if (!courseTitle) throw new Error('Course Title is required');
      if (!examDateRaw) throw new Error('Exam Date is required');
      if (!!periodName !== !!academicYear) {
        throw new Error('Exam Period and Academic Year must be provided together');
      }

      let schoolId: string | undefined = ownOrgId;
      if (!schoolId) {
        if (!schoolName) throw new Error('Organization is required');
        schoolId = schoolIdByName!.get(normalizeImportText(schoolName));
        if (!schoolId) throw new Error(`Organization "${schoolName}" not found`);
      }

      let classId = '';
      if (classLabel) {
        const matches = classIdsByAlias.get(`${schoolId}|||${normalizeImportClass(classLabel)}`);
        if (!matches?.size) throw new Error(`Grade/Class "${classLabel}" not found`);
        if (matches.size > 1) throw new Error(`Grade/Class "${classLabel}" is ambiguous; include its section`);
        classId = Array.from(matches)[0];
      }

      const courseCandidates = courseCandidatesByTitle.get(
        `${schoolId}|||${normalizeImportText(courseTitle)}`
      ) || [];
      const matchingCourses = classId
        ? courseCandidates.filter((course: any) => String(course.class || '') === classId)
        : courseCandidates;

      if (!matchingCourses.length) {
        throw new Error(classLabel
          ? `Course "${courseTitle}" was not found in "${classLabel}"`
          : `Course "${courseTitle}" not found`);
      }
      if (matchingCourses.length > 1) {
        throw new Error(`Multiple courses named "${courseTitle}" exist; provide Grade / Class to identify the correct one`);
      }
      const courseDoc = matchingCourses[0];
      classId = classId || String(courseDoc.class || '');

      if (teacherCourseIdSet && !teacherCourseIdSet.has(String(courseDoc._id))) {
        throw new Error(`You are not the assigned teacher for "${courseTitle}"`);
      }

      const examDate = new Date(examDateRaw as any);
      if (Number.isNaN(examDate.getTime())) throw new Error(`Invalid Exam Date "${examDateRaw}"`);
      const examDateString = examDate.toISOString().slice(0, 10);

      if (shiftName) {
        const rules = await getRules(String(schoolId));
        const configuredShift = rules.examShifts.find((shift: any) =>
          normalizeImportText(shift.name) === normalizeImportText(shiftName)
        );
        if (!configuredShift) {
          throw new Error(`Shift "${shiftName}" is not configured in Exam Scheduling Rules`);
        }
        if (startTime && startTime !== configuredShift.startTime) {
          throw new Error(`${configuredShift.name} must start at ${configuredShift.startTime}`);
        }
        if (endTime && endTime !== configuredShift.endTime) {
          throw new Error(`${configuredShift.name} must end at ${configuredShift.endTime}`);
        }
        startTime = startTime || configuredShift.startTime;
        endTime = endTime || configuredShift.endTime;
      }

      if (!startTime) throw new Error('Start Time or Shift is required');
      if (!endTime) throw new Error('End Time or Shift is required');
      if (!HHMM.test(startTime)) throw new Error(`Invalid Start Time "${startTime}" (expected HH:MM)`);
      if (!HHMM.test(endTime)) throw new Error(`Invalid End Time "${endTime}" (expected HH:MM)`);
      if (endTime <= startTime) throw new Error('End Time must be after Start Time');

      const calculatedDuration = timeToMinutes(endTime) - timeToMinutes(startTime);
      const duration = String(durationRaw ?? '').trim() ? Number(durationRaw) : calculatedDuration;
      if (!duration || duration <= 0) throw new Error('Duration must be a positive number of minutes');

      const totalMarks = Number(totalMarksRaw);
      if (!totalMarks || totalMarks <= 0) throw new Error('Total Marks must be a positive number');
      const passingMarks = Number(passingMarksRaw);
      if (!passingMarks || passingMarks <= 0) throw new Error('Passing Marks must be a positive number');

      let periodDoc: any = null;
      if (periodName && academicYear) {
        periodDoc = periodsByKey.get(importPeriodKey(String(schoolId), periodName, academicYear, term)) || null;
        if (periodDoc?.status === 'closed') {
          throw new Error(`Exam Period "${periodName}" is closed and cannot be imported into`);
        }
      }

      const examTitle = examTitleRaw || periodName;
      if (!examTitle) throw new Error('Exam Title is required');

      if (periodDoc) {
        const duplicateKey = dedupeKeyFor(
          String(periodDoc._id),
          String(courseDoc._id),
          examTitle,
          examDateString,
          startTime,
        );
        if (existingExamKeys.has(duplicateKey)) {
          throw new Error(`An exam titled "${examTitle}" already exists for "${courseTitle}" on ${examDateString} at ${startTime} — skipped to avoid a duplicate`);
        }
      } else if (!periodName) {
        const duplicateKey = dedupeKeyFor(
          '',
          String(courseDoc._id),
          examTitle,
          examDateString,
          startTime,
        );
        if (existingExamKeys.has(duplicateKey)) {
          throw new Error(`An exam titled "${examTitle}" already exists for "${courseTitle}" on ${examDateString} at ${startTime} — skipped to avoid a duplicate`);
        }
      }

      const pendingSchedule: PendingFixedExam = {
        schoolId: String(schoolId),
        classId,
        examDate: examDateString,
        startTime,
        endTime,
        room,
        title: examTitle,
      };

      await validateFixedExamSchedule({
        schoolId: pendingSchedule.schoolId,
        classId: pendingSchedule.classId,
        title: examTitle,
        examDate,
        startTime,
        endTime,
        duration,
        room,
        autoSchedule: false,
        pending: pendingSchedules,
      });

      if (periodName && academicYear && !periodDoc) {
        if (req.user?.role === 'teacher') {
          throw new Error(`Exam Period "${periodName}" does not exist. Ask an administrator to create it first`);
        }
        periodDoc = await ExamPeriod.create({
          school: schoolId,
          name: periodName,
          academicYear,
          term,
          startDate: examDate,
          endDate: examDate,
          status: 'draft',
          createdBy,
        });
        periodsByKey.set(importPeriodKey(String(schoolId), periodName, academicYear, term), periodDoc);
        periodsById.set(String(periodDoc._id), periodDoc);
      }

      const periodId = periodDoc ? String(periodDoc._id) : '';
      const duplicateKey = dedupeKeyFor(
        periodId,
        String(courseDoc._id),
        examTitle,
        examDateString,
        startTime,
      );
      if (existingExamKeys.has(duplicateKey)) {
        throw new Error(`An exam titled "${examTitle}" already exists for "${courseTitle}" on ${examDateString} at ${startTime} — skipped to avoid a duplicate`);
      }

      existingExamKeys.add(duplicateKey);
      pendingSchedules.push(pendingSchedule);

      if (periodId) {
        const current = periodRanges.get(periodId);
        const day = utcDateOnly(examDate);
        if (!current) periodRanges.set(periodId, { min: day, max: day });
        else {
          if (day < current.min) current.min = day;
          if (day > current.max) current.max = day;
        }
      }

      documents.push({
        title: periodDoc?.name || examTitle,
        course: courseDoc._id,
        school: courseDoc.school || schoolId,
        period: periodDoc?._id || null,
        examDate,
        startTime,
        endTime,
        duration,
        totalMarks,
        passingMarks,
        room: room || '',
        instructions: instructions || '',
        status: 'scheduled',
        autoSchedule: false,
        createdBy,
      });
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  let inserted = 0;
  if (documents.length > 0) {
    try {
      const result = await Exam.insertMany(documents, { ordered: false });
      inserted = result.length;
    } catch (txErr: any) {
      if (txErr.insertedDocs) inserted = txErr.insertedDocs.length;
      if (txErr.writeErrors) {
        txErr.writeErrors.forEach((we: any) => {
          errors.push({ row: 0, message: we.err?.errmsg || we.errmsg || 'Insert error' });
        });
      } else if (inserted === 0) {
        errors.push({ row: 0, message: txErr.message || 'Import failed.' });
      }
    }
  }

  for (const [periodId, range] of periodRanges.entries()) {
    const period = periodsById.get(periodId);
    const currentStart = period?.startDate ? utcDateOnly(period.startDate) : null;
    const currentEnd = period?.endDate ? utcDateOnly(period.endDate) : null;
    const nextStart = !currentStart || range.min < currentStart ? range.min : currentStart;
    const nextEnd = !currentEnd || range.max > currentEnd ? range.max : currentEnd;
    await ExamPeriod.updateOne(
      { _id: periodId },
      { $set: { startDate: nextStart, endDate: nextEnd } }
    );
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created: inserted,
    failed: errors.length,
    errors,
  }, `Imported ${inserted} of ${rows.length} exams`);
};
