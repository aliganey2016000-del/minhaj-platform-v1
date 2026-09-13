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
import { parseTimetableRules, explainTimetableConflict } from '../utils/deepseek';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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

interface StudioEntry {
  _id?: string;
  sourceSchedule?: string | null;
  class: string;
  course: string;
  teacher?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  isActive: boolean;
}

interface Conflict {
  id: string;
  type: string;
  severity: 'error' | 'warning';
  message: string;
  entryIds: string[];
  suggestions: string[];
}

function objectIdString(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'object' && value && '_id' in (value as any)) return String((value as any)._id);
  return String(value);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}

function entryId(entry: StudioEntry, index: number) {
  return entry._id || entry.sourceSchedule || `entry-${index}`;
}

function normalizeRoom(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
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

async function resolveSchool(req: Request, requested?: unknown) {
  const schoolId = String(resolveOrgIdForCreate(req, requested ? String(requested) : undefined) || '');
  if (!schoolId || !mongoose.isValidObjectId(schoolId)) throw new BadRequestError('School is required');
  const school = await School.findById(schoolId).lean();
  if (!school) throw new NotFoundError('School');
  if (resolveInstitutionType(school as any) !== 'school') throw new BadRequestError('AI Timetable Studio is currently available for school organizations');
  return { schoolId, school };
}

function validatePeriods(raw: any[]) {
  if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestError('At least one timetable period is required');
  const keys = new Set<string>();
  const periods = raw.map((item, index) => {
    const key = String(item?.key || `period-${index + 1}`).trim();
    const label = String(item?.label || `Period ${index + 1}`).trim();
    const startTime = String(item?.startTime || '').trim();
    const endTime = String(item?.endTime || '').trim();
    if (!key || keys.has(key)) throw new BadRequestError('Timetable period keys must be unique');
    keys.add(key);
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || endTime <= startTime) throw new BadRequestError(`Invalid time range for ${label}`);
    return { key, label, startTime, endTime, isBreak: Boolean(item?.isBreak) };
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 1; i < periods.length; i += 1) {
    if (periods[i].startTime < periods[i - 1].endTime) {
      throw new BadRequestError(`Timetable periods overlap: ${periods[i - 1].label} and ${periods[i].label}`);
    }
  }
  return periods;
}

function sanitizeEntries(raw: unknown): StudioEntry[] {
  if (!Array.isArray(raw)) throw new BadRequestError('entries must be an array');
  if (raw.length > 5000) throw new BadRequestError('A timetable draft cannot contain more than 5000 entries');
  return raw.map((item: any, index) => {
    const cls = objectIdString(item?.class);
    const course = objectIdString(item?.course);
    const teacher = item?.teacher ? objectIdString(item.teacher) : null;
    const dayOfWeek = Number(item?.dayOfWeek);
    const startTime = String(item?.startTime || '').trim();
    const endTime = String(item?.endTime || '').trim();
    if (!mongoose.isValidObjectId(cls)) throw new BadRequestError(`Entry ${index + 1}: valid class is required`);
    if (!mongoose.isValidObjectId(course)) throw new BadRequestError(`Entry ${index + 1}: valid course is required`);
    if (teacher && !mongoose.isValidObjectId(teacher)) throw new BadRequestError(`Entry ${index + 1}: teacher is invalid`);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new BadRequestError(`Entry ${index + 1}: valid day is required`);
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || endTime <= startTime) throw new BadRequestError(`Entry ${index + 1}: valid start/end time is required`);
    return {
      _id: item?._id ? String(item._id) : undefined,
      sourceSchedule: item?.sourceSchedule ? String(item.sourceSchedule) : null,
      class: cls,
      course,
      teacher,
      dayOfWeek,
      startTime,
      endTime,
      room: String(item?.room || '').trim(),
      isActive: item?.isActive !== false,
    };
  });
}

async function validateEntryReferences(schoolId: string, entries: StudioEntry[]) {
  const classIds = [...new Set(entries.map((entry) => entry.class))];
  const courseIds = [...new Set(entries.map((entry) => entry.course))];
  const teacherIds = [...new Set(entries.map((entry) => entry.teacher).filter(Boolean) as string[])];
  const [classes, courses, teachers] = await Promise.all([
    ClassModel.find({ _id: { $in: classIds }, school: schoolId }).select('_id title section room').lean(),
    Course.find({ _id: { $in: courseIds }, school: schoolId }).select('_id title courseCode class teacher').lean(),
    teacherIds.length ? Teacher.find({ _id: { $in: teacherIds }, school: schoolId }).select('_id teacherId profile user').populate('profile', 'firstName lastName').populate('user', 'email').lean() : Promise.resolve([]),
  ]);
  if (classes.length !== classIds.length) throw new BadRequestError('One or more timetable classes do not belong to this school');
  if (courses.length !== courseIds.length) throw new BadRequestError('One or more timetable courses do not belong to this school');
  if (teachers.length !== teacherIds.length) throw new BadRequestError('One or more timetable teachers do not belong to this school');

  const courseMap = new Map(courses.map((course: any) => [String(course._id), course]));
  for (const entry of entries) {
    const course: any = courseMap.get(entry.course);
    if (course?.class && String(course.class) !== entry.class) {
      throw new BadRequestError(`${course.title?.en || 'Course'} is assigned to a different class`);
    }
  }

  return {
    classes,
    courses,
    teachers,
    classMap: new Map(classes.map((cls: any) => [String(cls._id), cls])),
    courseMap,
    teacherMap: new Map(teachers.map((teacher: any) => [String(teacher._id), teacher])),
  };
}

function classLabel(value: any) {
  return `${value?.title || 'Class'}${value?.section ? ` — ${value.section}` : ''}`;
}

function teacherLabel(value: any) {
  const name = `${value?.profile?.firstName || ''} ${value?.profile?.lastName || ''}`.trim();
  return name || value?.teacherId || value?.user?.email || 'Teacher';
}

async function loadConfig(schoolId: string) {
  return (await TimetableConfig.findOne({ school: schoolId }).lean()) || defaultConfig(schoolId);
}

type EntryRefs = Awaited<ReturnType<typeof validateEntryReferences>>;

function computeConflicts(activeEntries: StudioEntry[], config: any, availability: any[], constraints: any[], refs: EntryRefs): Conflict[] {
  const availabilityMap = new Map(availability.map((item: any) => [String(item.teacher), item]));
  const conflicts: Conflict[] = [];
  const seen = new Set<string>();

  const push = (conflict: Conflict) => {
    const key = `${conflict.type}:${[...conflict.entryIds].sort().join(',')}:${conflict.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      conflicts.push(conflict);
    }
  };

  activeEntries.forEach((entry, index) => {
    const id = entryId(entry, index);
    const cls: any = refs.classMap.get(entry.class);
    const teacher: any = entry.teacher ? refs.teacherMap.get(entry.teacher) : null;
    const room = normalizeRoom(entry.room || cls?.room);

    if (!config.workingDays.includes(entry.dayOfWeek)) {
      push({ id: `working-day-${id}`, type: 'outside_working_day', severity: 'error', message: `${classLabel(cls)} has a lesson on ${DAYS[entry.dayOfWeek]}, which is not a configured working day.`, entryIds: [id], suggestions: ['Move the lesson to a configured working day', 'Change Timetable Settings if this day should be open'] });
    }

    const breaks = (config.periods || []).filter((period: any) => period.isBreak && overlaps(entry.startTime, entry.endTime, period.startTime, period.endTime));
    if (breaks.length) {
      push({ id: `break-${id}`, type: 'break_period', severity: 'error', message: `${classLabel(cls)} overlaps the ${breaks[0].label} (${breaks[0].startTime}–${breaks[0].endTime}).`, entryIds: [id], suggestions: ['Move the lesson to an instructional period'] });
    }

    if (config.strictPeriods) {
      const exact = (config.periods || []).some((period: any) => !period.isBreak && period.startTime === entry.startTime && period.endTime === entry.endTime);
      if (!exact) {
        push({ id: `period-${id}`, type: 'outside_period_grid', severity: 'error', message: `${classLabel(cls)} uses ${entry.startTime}–${entry.endTime}, which does not match a configured teaching period.`, entryIds: [id], suggestions: ['Move the lesson to a configured period', 'Disable strict period enforcement in Timetable Settings'] });
      }
    }

    if (!entry.teacher) {
      push({ id: `unassigned-${id}`, type: 'teacher_unassigned', severity: 'warning', message: `${classLabel(cls)} has an Unassigned teacher for this lesson.`, entryIds: [id], suggestions: ['Assign a teacher now', 'Keep it Unassigned and assign the teacher later'] });
    } else {
      const teacherAvailability: any = availabilityMap.get(entry.teacher);
      if (teacherAvailability?.dayOffs?.includes(entry.dayOfWeek)) {
        push({ id: `dayoff-${id}`, type: 'teacher_day_off', severity: 'error', message: `${teacherLabel(teacher)} is marked off on ${DAYS[entry.dayOfWeek]}.`, entryIds: [id], suggestions: ['Move the lesson to another day', 'Change the teacher availability rule'] });
      }
      const unavailable = teacherAvailability?.unavailableWindows?.find((window: any) => window.dayOfWeek === entry.dayOfWeek && overlaps(entry.startTime, entry.endTime, window.startTime, window.endTime));
      if (unavailable) {
        push({ id: `unavailable-${id}`, type: 'teacher_unavailable', severity: 'error', message: `${teacherLabel(teacher)} is unavailable on ${DAYS[entry.dayOfWeek]} from ${unavailable.startTime} to ${unavailable.endTime}.`, entryIds: [id], suggestions: ['Move the lesson outside the unavailable window', 'Assign another teacher'] });
      }
    }

    if (!room) return;
  });

  for (let i = 0; i < activeEntries.length; i += 1) {
    const a = activeEntries[i];
    const aClass: any = refs.classMap.get(a.class);
    const aRoom = normalizeRoom(a.room || aClass?.room);
    for (let j = i + 1; j < activeEntries.length; j += 1) {
      const b = activeEntries[j];
      if (a.dayOfWeek !== b.dayOfWeek || !overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
      const bClass: any = refs.classMap.get(b.class);
      const aId = entryId(a, i);
      const bId = entryId(b, j);
      if (a.class === b.class) {
        push({ id: `class-${aId}-${bId}`, type: 'class_conflict', severity: 'error', message: `${classLabel(aClass)} has two lessons at the same time on ${DAYS[a.dayOfWeek]}.`, entryIds: [aId, bId], suggestions: ['Move one lesson to another free period'] });
      }
      if (a.teacher && b.teacher && a.teacher === b.teacher) {
        const teacher: any = refs.teacherMap.get(a.teacher);
        push({ id: `teacher-${aId}-${bId}`, type: 'teacher_conflict', severity: 'error', message: `${teacherLabel(teacher)} is assigned to two classes at the same time.`, entryIds: [aId, bId], suggestions: ['Move one lesson', 'Assign another teacher to one lesson'] });
      }
      const bRoom = normalizeRoom(b.room || bClass?.room);
      if (aRoom && bRoom && aRoom === bRoom && a.class !== b.class) {
        push({ id: `room-${aId}-${bId}`, type: 'room_conflict', severity: 'error', message: `Room ${a.room || aClass?.room} is assigned to two classes at the same time.`, entryIds: [aId, bId], suggestions: ['Move one lesson', 'Choose a different room'] });
      }
    }
  }

  for (const availabilityRule of availability as any[]) {
    const teacherId = String(availabilityRule.teacher);
    const teacher: any = refs.teacherMap.get(teacherId);
    for (const day of config.workingDays as number[]) {
      const daily = activeEntries.filter((entry) => entry.teacher === teacherId && entry.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (daily.length > Number(availabilityRule.maxLessonsPerDay || 5)) {
        push({ id: `max-day-${teacherId}-${day}`, type: 'teacher_max_lessons_per_day', severity: 'warning', message: `${teacherLabel(teacher)} has ${daily.length} lessons on ${DAYS[day]}, above the preferred maximum of ${availabilityRule.maxLessonsPerDay}.`, entryIds: daily.map((entry, index) => entryId(entry, activeEntries.indexOf(entry) >= 0 ? activeEntries.indexOf(entry) : index)), suggestions: ['Move one or more lessons to another day'] });
      }
      let run: StudioEntry[] = [];
      for (const entry of daily) {
        if (!run.length || run[run.length - 1].endTime === entry.startTime) run.push(entry);
        else run = [entry];
        if (run.length > Number(availabilityRule.maxConsecutiveLessons || 3)) {
          push({ id: `max-consecutive-${teacherId}-${day}-${entry.startTime}`, type: 'teacher_max_consecutive', severity: 'warning', message: `${teacherLabel(teacher)} has more than ${availabilityRule.maxConsecutiveLessons} consecutive lessons on ${DAYS[day]}.`, entryIds: run.map((item) => entryId(item, activeEntries.indexOf(item))), suggestions: ['Insert a free period between these lessons'] });
          break;
        }
      }
    }
  }

  for (const constraint of constraints as any[]) {
    const severity: 'error' | 'warning' = constraint.priority === 'required' ? 'error' : 'warning';
    const teacherId = constraint.teacher ? String(constraint.teacher) : '';
    const classId = constraint.class ? String(constraint.class) : '';
    const courseId = constraint.course ? String(constraint.course) : '';
    if (constraint.type === 'teacher_day_off' && teacherId && Number.isInteger(constraint.dayOfWeek)) {
      activeEntries.forEach((entry, index) => {
        if (entry.teacher === teacherId && entry.dayOfWeek === constraint.dayOfWeek) {
          const teacher: any = refs.teacherMap.get(teacherId);
          push({ id: `constraint-dayoff-${constraint._id}-${entryId(entry, index)}`, type: 'teacher_day_off', severity, message: constraint.description || `${teacherLabel(teacher)} must be off on ${DAYS[constraint.dayOfWeek]}.`, entryIds: [entryId(entry, index)], suggestions: ['Move the lesson to another day'] });
        }
      });
    }
    if (constraint.type === 'no_day' && Number.isInteger(constraint.dayOfWeek)) {
      activeEntries.forEach((entry, index) => {
        if (entry.dayOfWeek === constraint.dayOfWeek) push({ id: `constraint-noday-${constraint._id}-${entryId(entry, index)}`, type: 'no_day', severity, message: constraint.description || `No lessons are allowed on ${DAYS[constraint.dayOfWeek]}.`, entryIds: [entryId(entry, index)], suggestions: ['Move the lesson to another day'] });
      });
    }
    if (constraint.type === 'lessons_per_week' && classId && courseId) {
      const target = Math.max(0, Number((constraint.payload as any)?.count || 0));
      if (target > 0) {
        const matching = activeEntries.filter((entry) => entry.class === classId && entry.course === courseId);
        if (matching.length !== target) {
          const cls: any = refs.classMap.get(classId);
          const course: any = refs.courseMap.get(courseId);
          push({ id: `weekly-${constraint._id}`, type: 'weekly_lesson_count', severity, message: `${classLabel(cls)} — ${course?.title?.en || 'Course'} has ${matching.length} lesson(s), but the target is ${target} per week.`, entryIds: matching.map((entry) => entryId(entry, activeEntries.indexOf(entry))), suggestions: matching.length < target ? [`Add ${target - matching.length} lesson(s)`] : [`Remove ${matching.length - target} lesson(s)`] });
        }
      }
    }
    if (constraint.type === 'no_consecutive_lessons' && classId && courseId) {
      const matching = activeEntries.filter((entry) => entry.class === classId && entry.course === courseId).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < matching.length; i += 1) {
        const previous = matching[i - 1];
        const current = matching[i];
        if (previous.dayOfWeek === current.dayOfWeek && previous.endTime === current.startTime) {
          const cls: any = refs.classMap.get(classId);
          const course: any = refs.courseMap.get(courseId);
          push({ id: `consecutive-${constraint._id}-${i}`, type: 'consecutive_lessons', severity, message: constraint.description || `${classLabel(cls)} — ${course?.title?.en || 'Course'} must not be scheduled in consecutive periods.`, entryIds: [entryId(previous, activeEntries.indexOf(previous)), entryId(current, activeEntries.indexOf(current))], suggestions: ['Move one lesson to a non-adjacent period'] });
        }
      }
    }
  }

  return conflicts.sort((a, b) => (a.severity === b.severity ? a.type.localeCompare(b.type) : a.severity === 'error' ? -1 : 1));
}

async function buildConflicts(schoolId: string, entries: StudioEntry[]): Promise<Conflict[]> {
  const activeEntries = entries.filter((entry) => entry.isActive);
  const refs = await validateEntryReferences(schoolId, activeEntries);
  const config: any = await loadConfig(schoolId);
  const availability = await TeacherAvailability.find({ school: schoolId }).lean();
  const constraints = await TimetableConstraint.find({ school: schoolId, isActive: true }).lean();
  return computeConflicts(activeEntries, config, availability, constraints, refs);
}

async function currentScheduleEntries(schoolId: string): Promise<StudioEntry[]> {
  const schedules = await ClassSchedule.find({ school: schoolId, isActive: true }).populate('class', 'room').lean();
  return schedules.map((schedule: any) => ({
    sourceSchedule: String(schedule._id),
    class: objectIdString(schedule.class),
    course: objectIdString(schedule.course),
    teacher: schedule.teacher ? objectIdString(schedule.teacher) : null,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    room: String(schedule.room || schedule.class?.room || ''),
    isActive: schedule.isActive !== false,
  }));
}

async function applyEntries(schoolId: string, entries: StudioEntry[], userId: string) {
  await validateEntryReferences(schoolId, entries);
  const current = await ClassSchedule.find({ school: schoolId }).select('_id').lean();
  const currentIds = new Set(current.map((item: any) => String(item._id)));
  const represented = new Set(entries.map((entry) => entry.sourceSchedule).filter((id): id is string => Boolean(id) && currentIds.has(String(id))));
  const toDeactivate = current.filter((item: any) => !represented.has(String(item._id))).map((item: any) => item._id);
  if (toDeactivate.length) await ClassSchedule.updateMany({ _id: { $in: toDeactivate }, school: schoolId }, { $set: { isActive: false } });

  const applied: Array<StudioEntry & { scheduleId: string }> = [];
  for (const entry of entries) {
    const updatePayload = {
      school: schoolId,
      class: entry.class,
      course: entry.course,
      teacher: entry.teacher || null,
      room: entry.room || '',
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
      isActive: entry.isActive !== false,
    };
    let schedule: any = null;
    if (entry.sourceSchedule && currentIds.has(entry.sourceSchedule)) {
      schedule = await ClassSchedule.findOneAndUpdate({ _id: entry.sourceSchedule, school: schoolId }, { $set: updatePayload }, { new: true });
    }
    if (!schedule) {
      schedule = await ClassSchedule.create({ ...updatePayload, createdBy: new mongoose.Types.ObjectId(userId) });
    }
    applied.push({ ...entry, sourceSchedule: String(schedule._id), scheduleId: String(schedule._id) });
  }
  return applied;
}

export const getBootstrap = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.query.school);
  const [config, availability, constraints, draft, versions, schedules] = await Promise.all([
    loadConfig(schoolId),
    TeacherAvailability.find({ school: schoolId }).populate({ path: 'teacher', select: 'teacherId profile user', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'user', select: 'email' }] }).lean(),
    TimetableConstraint.find({ school: schoolId, isActive: true }).sort({ createdAt: -1 }).lean(),
    TimetableDraft.findOne({ school: schoolId, status: 'draft' }).sort({ updatedAt: -1 }).lean(),
    TimetableVersion.find({ school: schoolId }).sort({ version: -1 }).limit(20).select('version label publishedAt publishedBy sourceDraft').lean(),
    currentScheduleEntries(schoolId),
  ]);
  const conflicts = await buildConflicts(schoolId, draft ? sanitizeEntries((draft as any).entries) : schedules);
  return ApiResponse.success(res, { config, availability, constraints, draft, versions, schedules, conflicts });
};

export const updateConfig = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  const workingDays: number[] = Array.isArray(req.body?.workingDays)
    ? [...new Set((req.body.workingDays as unknown[]).map((value) => Number(value)))]
    : [];
  if (!workingDays.length || workingDays.some((day: number) => !Number.isInteger(day) || day < 0 || day > 6)) throw new BadRequestError('Select at least one valid working day');
  const periods = validatePeriods(req.body?.periods || []);
  const config = await TimetableConfig.findOneAndUpdate(
    { school: schoolId },
    { $set: { workingDays, periods, strictPeriods: Boolean(req.body?.strictPeriods), timezone: String(req.body?.timezone || 'Africa/Mogadishu').trim(), updatedBy: req.user!.userId } },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  return ApiResponse.success(res, config, 'Timetable settings saved');
};

export const upsertTeacherAvailability = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  const teacherId = String(req.params.teacherId || '');
  if (!mongoose.isValidObjectId(teacherId) || !(await Teacher.exists({ _id: teacherId, school: schoolId }))) throw new NotFoundError('Teacher');
  const dayOffs: number[] = Array.isArray(req.body?.dayOffs)
    ? [...new Set((req.body.dayOffs as unknown[]).map((value) => Number(value)))]
    : [];
  if (dayOffs.some((day: number) => !Number.isInteger(day) || day < 0 || day > 6)) throw new BadRequestError('Teacher day-offs are invalid');
  const unavailableWindows = Array.isArray(req.body?.unavailableWindows) ? req.body.unavailableWindows.map((window: any) => {
    const dayOfWeek = Number(window?.dayOfWeek);
    const startTime = String(window?.startTime || '').trim();
    const endTime = String(window?.endTime || '').trim();
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !TIME_RE.test(startTime) || !TIME_RE.test(endTime) || endTime <= startTime) throw new BadRequestError('One or more unavailable teacher windows are invalid');
    return { dayOfWeek, startTime, endTime };
  }) : [];
  const maxLessonsPerDay = Math.max(1, Math.min(20, Number(req.body?.maxLessonsPerDay || 5)));
  const maxConsecutiveLessons = Math.max(1, Math.min(12, Number(req.body?.maxConsecutiveLessons || 3)));
  const availability = await TeacherAvailability.findOneAndUpdate(
    { school: schoolId, teacher: teacherId },
    { $set: { dayOffs, unavailableWindows, maxLessonsPerDay, maxConsecutiveLessons, updatedBy: req.user!.userId } },
    { upsert: true, new: true, runValidators: true },
  ).populate({ path: 'teacher', select: 'teacherId profile user', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'user', select: 'email' }] }).lean();
  return ApiResponse.success(res, availability, 'Teacher availability saved');
};

export const createConstraint = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  const type = String(req.body?.type || '').trim();
  if (!type) throw new BadRequestError('Constraint type is required');
  const priority = req.body?.priority === 'preferred' ? 'preferred' : 'required';
  const teacher = req.body?.teacher ? String(req.body.teacher) : null;
  const cls = req.body?.class ? String(req.body.class) : null;
  const course = req.body?.course ? String(req.body.course) : null;
  if (teacher && !(await Teacher.exists({ _id: teacher, school: schoolId }))) throw new NotFoundError('Teacher');
  if (cls && !(await ClassModel.exists({ _id: cls, school: schoolId }))) throw new NotFoundError('Class');
  if (course && !(await Course.exists({ _id: course, school: schoolId }))) throw new NotFoundError('Course');
  const created = await TimetableConstraint.create({
    school: schoolId,
    type,
    priority,
    source: req.body?.source === 'ai' ? 'ai' : 'manual',
    teacher,
    class: cls,
    course,
    dayOfWeek: Number.isInteger(Number(req.body?.dayOfWeek)) ? Number(req.body.dayOfWeek) : null,
    payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {},
    description: String(req.body?.description || '').trim(),
    isActive: true,
    createdBy: req.user!.userId,
  });
  return ApiResponse.created(res, created, 'Timetable rule created');
};

export const deleteConstraint = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.query.school);
  const constraint = await TimetableConstraint.findOneAndUpdate({ _id: req.params.id, school: schoolId }, { $set: { isActive: false } }, { new: true }).lean();
  if (!constraint) throw new NotFoundError('Timetable rule');
  return ApiResponse.success(res, constraint, 'Timetable rule removed');
};

export const checkConflicts = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school || req.query.school);
  const entries = req.body?.entries ? sanitizeEntries(req.body.entries) : await currentScheduleEntries(schoolId);
  const conflicts = await buildConflicts(schoolId, entries);
  return ApiResponse.success(res, {
    conflicts,
    errors: conflicts.filter((item) => item.severity === 'error').length,
    warnings: conflicts.filter((item) => item.severity === 'warning').length,
  });
};

/**
 * Deterministic conflict auto-fix. Tries relocating the offending entry to
 * every configured working day/period slot (skipping breaks and non-working
 * days by construction) and accepts the first slot that reduces the total
 * number of hard conflicts. Reuses one set of DB-backed refs/config/
 * availability/constraints across every candidate slot so the search stays
 * in-memory instead of re-querying the database per slot.
 */
export const autoFixConflict = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  const entries = sanitizeEntries(req.body?.entries);
  const conflictId = String(req.body?.conflictId || '').trim();
  if (!conflictId) throw new BadRequestError('conflictId is required');

  const activeEntries: StudioEntry[] = [];
  const activeOriginalIndexes: number[] = [];
  entries.forEach((entry, index) => {
    if (entry.isActive) {
      activeEntries.push(entry);
      activeOriginalIndexes.push(index);
    }
  });

  const refs = await validateEntryReferences(schoolId, activeEntries);
  const config: any = await loadConfig(schoolId);
  const availability = await TeacherAvailability.find({ school: schoolId }).lean();
  const constraints = await TimetableConstraint.find({ school: schoolId, isActive: true }).lean();

  const currentConflicts = computeConflicts(activeEntries, config, availability, constraints, refs);
  const target = currentConflicts.find((conflict) => conflict.id === conflictId);
  if (!target) {
    return ApiResponse.success(res, { fixed: false, entries, conflicts: currentConflicts, message: 'This conflict no longer applies — it may already be resolved.' });
  }
  if (target.severity !== 'error') {
    return ApiResponse.success(res, { fixed: false, entries, conflicts: currentConflicts, message: 'Only hard conflicts can be fixed automatically. Warnings need a manual decision.' });
  }

  const periods = (config.periods || []).filter((period: any) => !period.isBreak);
  const workingDays: number[] = config.workingDays || [];
  const errorsBefore = currentConflicts.filter((conflict) => conflict.severity === 'error').length;

  const indexById = new Map<string, number>();
  activeEntries.forEach((entry, index) => indexById.set(entryId(entry, index), index));

  for (const candidateEntryKey of target.entryIds) {
    const idx = indexById.get(candidateEntryKey);
    if (idx === undefined) continue;
    const original = activeEntries[idx];

    for (const day of workingDays) {
      for (const period of periods) {
        if (day === original.dayOfWeek && period.startTime === original.startTime && period.endTime === original.endTime) continue;
        const movedEntry: StudioEntry = { ...original, dayOfWeek: day, startTime: period.startTime, endTime: period.endTime };
        const candidateActiveEntries = activeEntries.map((entry, i) => (i === idx ? movedEntry : entry));
        const candidateConflicts = computeConflicts(candidateActiveEntries, config, availability, constraints, refs);
        const errorsAfter = candidateConflicts.filter((conflict) => conflict.severity === 'error').length;
        if (errorsAfter < errorsBefore) {
          const finalEntries = entries.map((entry, i) => (i === activeOriginalIndexes[idx] ? movedEntry : entry));
          return ApiResponse.success(
            res,
            { fixed: true, entries: finalEntries, conflicts: candidateConflicts, movedEntryId: candidateEntryKey, movedTo: { dayOfWeek: day, startTime: period.startTime, endTime: period.endTime } },
            `Moved to ${DAYS[day]} · ${period.label} (${period.startTime}–${period.endTime}) to clear this conflict.`,
          );
        }
      }
    }
  }

  return ApiResponse.success(res, { fixed: false, entries, conflicts: currentConflicts, message: 'No automatic fix was found within the current timetable settings — try moving this lesson manually or adjusting rules.' });
};

export const createDraft = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  await TimetableDraft.updateMany({ school: schoolId, status: 'draft' }, { $set: { status: 'archived' } });
  const entries = req.body?.entries ? sanitizeEntries(req.body.entries) : await currentScheduleEntries(schoolId);
  await validateEntryReferences(schoolId, entries);
  const draft = await TimetableDraft.create({ school: schoolId, name: String(req.body?.name || 'Working Draft').trim(), entries, status: 'draft', createdBy: req.user!.userId, updatedBy: req.user!.userId });
  return ApiResponse.created(res, draft, 'Timetable draft created');
};

export const saveDraft = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  const entries = sanitizeEntries(req.body?.entries);
  await validateEntryReferences(schoolId, entries);
  const draft = await TimetableDraft.findOneAndUpdate(
    { _id: req.params.id, school: schoolId, status: 'draft' },
    { $set: { entries, name: String(req.body?.name || 'Working Draft').trim(), updatedBy: req.user!.userId } },
    { new: true, runValidators: true },
  ).lean();
  if (!draft) throw new NotFoundError('Timetable draft');
  return ApiResponse.success(res, draft, 'Timetable draft saved');
};

export const resetDraft = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  const entries = await currentScheduleEntries(schoolId);
  const draft = await TimetableDraft.findOneAndUpdate(
    { _id: req.params.id, school: schoolId, status: 'draft' },
    { $set: { entries, updatedBy: req.user!.userId } },
    { new: true },
  ).lean();
  if (!draft) throw new NotFoundError('Timetable draft');
  return ApiResponse.success(res, draft, 'Draft reset to the currently published timetable');
};

export const publishDraft = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  const draft: any = await TimetableDraft.findOne({ _id: req.params.id, school: schoolId, status: 'draft' }).lean();
  if (!draft) throw new NotFoundError('Timetable draft');
  const entries = sanitizeEntries(draft.entries);
  const conflicts = await buildConflicts(schoolId, entries);
  const errors = conflicts.filter((item) => item.severity === 'error');
  if (errors.length) throw new BadRequestError(`Publish blocked: resolve ${errors.length} hard timetable conflict(s) first.`);

  const applied = await applyEntries(schoolId, entries, req.user!.userId);
  const latest = await TimetableVersion.findOne({ school: schoolId }).sort({ version: -1 }).select('version').lean();
  const versionNumber = Number((latest as any)?.version || 0) + 1;
  const version = await TimetableVersion.create({
    school: schoolId,
    version: versionNumber,
    label: String(req.body?.label || `Published timetable v${versionNumber}`).trim(),
    entries: applied.map((entry) => ({ scheduleId: entry.scheduleId, class: entry.class, course: entry.course, teacher: entry.teacher || null, dayOfWeek: entry.dayOfWeek, startTime: entry.startTime, endTime: entry.endTime, room: entry.room || '', isActive: entry.isActive })),
    publishedBy: req.user!.userId,
    sourceDraft: draft._id,
  });
  await TimetableDraft.updateOne({ _id: draft._id }, { $set: { status: 'published', publishedAt: new Date(), updatedBy: req.user!.userId, entries: applied.map((entry) => ({ ...entry, sourceSchedule: entry.scheduleId })) } });
  return ApiResponse.success(res, { version, conflicts }, `Timetable v${versionNumber} published`);
};

export const rollbackVersion = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  const version = await TimetableVersion.findOne({ school: schoolId, version: Number(req.params.version) }).lean();
  if (!version) throw new NotFoundError('Timetable version');
  const entries: StudioEntry[] = (version.entries as any[]).map((entry: any) => ({ sourceSchedule: entry.scheduleId ? String(entry.scheduleId) : null, class: String(entry.class), course: String(entry.course), teacher: entry.teacher ? String(entry.teacher) : null, dayOfWeek: entry.dayOfWeek, startTime: entry.startTime, endTime: entry.endTime, room: entry.room || '', isActive: entry.isActive !== false }));
  const conflicts = await buildConflicts(schoolId, entries);
  const errors = conflicts.filter((item) => item.severity === 'error');
  if (errors.length) throw new BadRequestError(`Rollback blocked because this version now violates ${errors.length} hard rule(s).`);
  await applyEntries(schoolId, entries, req.user!.userId);
  return ApiResponse.success(res, { version: version.version }, `Rolled back to timetable v${version.version}`);
};

/**
 * AI Assistant — turns one natural-language admin request into structured,
 * id-validated timetable rule proposals. DeepSeek only ever sees the id/name
 * lists built here; it never receives database write access and nothing is
 * saved until the admin approves a proposal, which goes through the normal
 * createConstraint endpoint like any manually-added rule.
 */
export const parseRulesFromPrompt = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchool(req, req.body?.school);
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) throw new BadRequestError('Describe the timetable rule you want in plain language first.');

  const config: any = await loadConfig(schoolId);
  const [classes, teachers, courses] = await Promise.all([
    ClassModel.find({ school: schoolId }).select('_id title section').lean(),
    Teacher.find({ school: schoolId }).select('_id teacherId profile user').populate('profile', 'firstName lastName').populate('user', 'email').lean(),
    Course.find({ school: schoolId }).select('_id title class').lean(),
  ]);

  const rules = await parseTimetableRules(prompt, {
    workingDays: config.workingDays || [],
    teachers: (teachers as any[]).map((teacher) => ({ id: String(teacher._id), name: teacherLabel(teacher) })),
    classes: (classes as any[]).map((cls) => ({ id: String(cls._id), label: classLabel(cls) })),
    courses: (courses as any[]).map((course) => ({ id: String(course._id), title: course.title?.en || 'Course', classId: course.class ? String(course.class) : null })),
  });

  return ApiResponse.success(res, { rules }, rules.length ? `${rules.length} rule(s) proposed — review and add the ones you want.` : 'No supported rule could be parsed from that request. Try describing one instruction at a time.');
};

/** Plain-language explanation for one conflict card, shown by the "Ask AI" action. Advisory only — never modifies the draft. */
export const explainConflict = async (req: Request, res: Response): Promise<Response> => {
  await resolveSchool(req, req.body?.school);
  const type = String(req.body?.type || '').trim();
  const severity: 'error' | 'warning' = req.body?.severity === 'warning' ? 'warning' : 'error';
  const message = String(req.body?.message || '').trim();
  const suggestions = Array.isArray(req.body?.suggestions) ? req.body.suggestions.map((item: unknown) => String(item)) : [];
  if (!message) throw new BadRequestError('Conflict message is required');

  const explanation = await explainTimetableConflict({ type, severity, message, suggestions });
  return ApiResponse.success(res, { explanation });
};
