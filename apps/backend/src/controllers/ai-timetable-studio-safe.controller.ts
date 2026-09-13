import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import School, { resolveInstitutionType } from '../models/school.model';
import ClassModel from '../models/class.model';
import Course from '../models/course.model';
import Teacher from '../models/teacher.model';
import ClassSchedule from '../models/class-schedule.model';
import TimetableConfig from '../models/timetable-config.model';
import TeacherAvailability from '../models/teacher-availability.model';
import TimetableConstraint from '../models/timetable-constraint.model';
import TimetableDraft from '../models/timetable-draft.model';
import TimetableVersion from '../models/timetable-version.model';
import * as studioCtrl from './ai-timetable-studio.controller';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_PERIODS = [
  { key: 'p1', label: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
  { key: 'p2', label: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
  { key: 'p3', label: 'Period 3', startTime: '09:30', endTime: '10:15', isBreak: false },
  { key: 'break-1', label: 'Break', startTime: '10:15', endTime: '10:35', isBreak: true },
  { key: 'p4', label: 'Period 4', startTime: '10:35', endTime: '11:20', isBreak: false },
  { key: 'p5', label: 'Period 5', startTime: '11:20', endTime: '12:05', isBreak: false },
  { key: 'p6', label: 'Period 6', startTime: '12:05', endTime: '12:50', isBreak: false },
];

type RecoveryConflict = {
  id: string;
  type: string;
  severity: 'error';
  message: string;
  entryIds: string[];
  suggestions: string[];
};

type SafeEntry = {
  sourceSchedule: string;
  class: string;
  course: string;
  teacher: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
  isActive: boolean;
};

function idString(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'object' && value && '_id' in (value as Record<string, unknown>)) {
    return String((value as { _id?: unknown })._id || '');
  }
  return String(value);
}

function isId(value: string): boolean {
  return Boolean(value) && mongoose.isValidObjectId(value);
}

function isIdCastError(error: unknown): boolean {
  const candidate = error as { name?: string; path?: string; kind?: string } | null;
  return Boolean(candidate && candidate.name === 'CastError' && (candidate.path === '_id' || candidate.kind === 'ObjectId'));
}

async function resolveSchool(req: Request, requested?: unknown) {
  const schoolId = String(resolveOrgIdForCreate(req, requested ? String(requested) : undefined) || '');
  if (!schoolId || !mongoose.isValidObjectId(schoolId)) throw new BadRequestError('School is required');
  const school = await School.findById(schoolId).lean();
  if (!school) throw new NotFoundError('School');
  if (resolveInstitutionType(school as any) !== 'school') {
    throw new BadRequestError('AI Timetable Studio is currently available for school organizations');
  }
  return schoolId;
}

function defaultConfig(schoolId: string) {
  return {
    school: schoolId,
    workingDays: [0, 1, 2, 3, 4],
    periods: DEFAULT_PERIODS,
    strictPeriods: false,
    timezone: 'Africa/Mogadishu',
  };
}

async function safePublishedSnapshot(schoolId: string): Promise<{ entries: SafeEntry[]; conflicts: RecoveryConflict[] }> {
  // Do not populate class here. A legacy schedule may reference a class that
  // was deleted before class-reference deletion guards existed; populate()
  // turns that ObjectId into null and the old conflict checker later queried
  // {_id: ''}, producing the production CastError shown in the Studio UI.
  const schedules = await ClassSchedule.find({ school: schoolId, isActive: true }).lean();

  const classIds = [...new Set(schedules.map((item: any) => idString(item.class)).filter(isId))];
  const courseIds = [...new Set(schedules.map((item: any) => idString(item.course)).filter(isId))];
  const teacherIds = [...new Set(schedules.map((item: any) => idString(item.teacher)).filter(isId))];

  const [classes, courses, teachers] = await Promise.all([
    classIds.length ? ClassModel.find({ _id: { $in: classIds }, school: schoolId }).select('_id room title section').lean() : Promise.resolve([]),
    courseIds.length ? Course.find({ _id: { $in: courseIds }, school: schoolId }).select('_id class title').lean() : Promise.resolve([]),
    teacherIds.length ? Teacher.find({ _id: { $in: teacherIds }, school: schoolId }).select('_id').lean() : Promise.resolve([]),
  ]);

  const classMap = new Map((classes as any[]).map((item: any) => [String(item._id), item]));
  const courseMap = new Map((courses as any[]).map((item: any) => [String(item._id), item]));
  const teacherSet = new Set((teachers as any[]).map((item: any) => String(item._id)));
  const entries: SafeEntry[] = [];
  const conflicts: RecoveryConflict[] = [];

  for (const schedule of schedules as any[]) {
    const scheduleId = String(schedule._id);
    const classId = idString(schedule.class);
    const courseId = idString(schedule.course);
    const teacherId = schedule.teacher ? idString(schedule.teacher) : '';
    const cls: any = classMap.get(classId);
    const course: any = courseMap.get(courseId);
    const problems: string[] = [];

    if (!isId(classId) || !cls) problems.push('class');
    if (!isId(courseId) || !course) problems.push('course');
    if (teacherId && (!isId(teacherId) || !teacherSet.has(teacherId))) problems.push('teacher');
    if (course?.class && classId && String(course.class) !== classId) problems.push('course/class assignment');

    const dayOfWeek = Number(schedule.dayOfWeek);
    const startTime = String(schedule.startTime || '').trim();
    const endTime = String(schedule.endTime || '').trim();
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !TIME_RE.test(startTime) || !TIME_RE.test(endTime) || endTime <= startTime) {
      problems.push('day/time');
    }

    if (problems.length) {
      const uniqueProblems = [...new Set(problems)];
      conflicts.push({
        id: `legacy-reference-${scheduleId}`,
        type: 'missing_reference',
        severity: 'error',
        message: `Published schedule ${scheduleId} has an invalid or missing ${uniqueProblems.join(', ')} reference. The Studio opened in recovery mode instead of failing.`,
        entryIds: [scheduleId],
        suggestions: [
          'Delete or repair this legacy schedule from Class Schedules',
          'Then reopen AI Timetable Studio and run Check Conflicts',
        ],
      });
      continue;
    }

    entries.push({
      sourceSchedule: scheduleId,
      class: classId,
      course: courseId,
      teacher: teacherId || null,
      dayOfWeek,
      startTime,
      endTime,
      room: String(schedule.room || cls?.room || ''),
      isActive: schedule.isActive !== false,
    });
  }

  return { entries, conflicts };
}

async function fallbackBootstrap(req: Request, res: Response, originalError: unknown): Promise<Response> {
  const schoolId = await resolveSchool(req, req.query.school);
  const [config, availability, constraints, draft, versions, snapshot] = await Promise.all([
    TimetableConfig.findOne({ school: schoolId }).lean(),
    // Avoid populate during recovery. The frontend accepts either a teacher id
    // or a populated teacher object and already has the school's teacher list.
    TeacherAvailability.find({ school: schoolId }).lean(),
    TimetableConstraint.find({ school: schoolId, isActive: true }).sort({ createdAt: -1 }).lean(),
    TimetableDraft.findOne({ school: schoolId, status: 'draft' }).sort({ updatedAt: -1 }).lean(),
    TimetableVersion.find({ school: schoolId }).sort({ version: -1 }).limit(20).select('version label publishedAt publishedBy sourceDraft').lean(),
    safePublishedSnapshot(schoolId),
  ]);

  const conflicts = [...snapshot.conflicts];
  if (conflicts.length === 0) {
    const value = String((originalError as any)?.value ?? '').trim();
    conflicts.push({
      id: 'legacy-reference-recovery',
      type: 'missing_reference',
      severity: 'error',
      message: `AI Timetable Studio recovered from an invalid legacy ObjectId${value ? ` (${value})` : ''}. Review timetable references before publishing.`,
      entryIds: [],
      suggestions: ['Run Check Conflicts', 'Review legacy schedules and teacher availability records'],
    });
  }

  return ApiResponse.success(res, {
    config: config || defaultConfig(schoolId),
    availability,
    constraints,
    // A draft that exists remains visible; no recovery path deletes or edits it.
    draft,
    versions,
    schedules: snapshot.entries,
    conflicts,
    recoveryMode: true,
  }, 'AI Timetable Studio opened in recovery mode');
}

export const getBootstrap = async (req: Request, res: Response): Promise<Response> => {
  try {
    return await studioCtrl.getBootstrap(req, res);
  } catch (error) {
    if (!isIdCastError(error)) throw error;
    return fallbackBootstrap(req, res, error);
  }
};

export const checkConflicts = async (req: Request, res: Response): Promise<Response> => {
  try {
    return await studioCtrl.checkConflicts(req, res);
  } catch (error) {
    // Only recover the published-timetable scan. Client-submitted draft data
    // must keep the strict validator so malformed ids cannot be hidden.
    if (!isIdCastError(error) || req.body?.entries) throw error;
    const schoolId = await resolveSchool(req, req.body?.school || req.query.school);
    const snapshot = await safePublishedSnapshot(schoolId);
    return ApiResponse.success(res, {
      conflicts: snapshot.conflicts,
      errors: snapshot.conflicts.length,
      warnings: 0,
      recoveryMode: true,
    }, 'Timetable conflicts checked in recovery mode');
  }
};

export const createDraft = async (req: Request, res: Response): Promise<Response> => {
  // Explicit client entries keep the normal strict validation path. Only the
  // "start from published timetable" action needs recovery-aware filtering.
  if (req.body?.entries) return studioCtrl.createDraft(req, res);

  const schoolId = await resolveSchool(req, req.body?.school);
  const snapshot = await safePublishedSnapshot(schoolId);

  // Build the safe snapshot before archiving an existing working draft. The
  // previous controller archived first, so a legacy reference crash could
  // destroy the user's active draft even though no replacement was created.
  await TimetableDraft.updateMany({ school: schoolId, status: 'draft' }, { $set: { status: 'archived' } });
  const draft = await TimetableDraft.create({
    school: schoolId,
    name: String(req.body?.name || 'Working Draft').trim(),
    entries: snapshot.entries,
    status: 'draft',
    createdBy: req.user!.userId,
    updatedBy: req.user!.userId,
  });
  return ApiResponse.created(res, draft, snapshot.conflicts.length ? 'Timetable draft created in recovery mode' : 'Timetable draft created');
};

export const resetDraft = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await resolveSchool(req, req.body?.school);
  const snapshot = await safePublishedSnapshot(schoolId);
  const draft = await TimetableDraft.findOneAndUpdate(
    { _id: req.params.id, school: schoolId, status: 'draft' },
    { $set: { entries: snapshot.entries, updatedBy: req.user!.userId } },
    { new: true },
  ).lean();
  if (!draft) throw new NotFoundError('Timetable draft');
  return ApiResponse.success(res, draft, snapshot.conflicts.length ? 'Draft reset in recovery mode; invalid legacy schedules were excluded' : 'Draft reset to the currently published timetable');
};
