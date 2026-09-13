import { Request, Response } from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import ClassSchedule from '../models/class-schedule.model';
import ClassModel from '../models/class.model';
import Course from '../models/course.model';
import Teacher from '../models/teacher.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_DAYS = [0, 1, 2, 3, 4];
const DEFAULT_SLOTS = [
  ['08:00', '08:45'], ['08:45', '09:30'], ['09:45', '10:30'], ['10:30', '11:15'],
  ['11:30', '12:15'], ['12:15', '13:00'], ['13:15', '14:00'],
] as const;

type Rule = {
  type: 'teacher_day_off' | 'course_day' | 'no_consecutive' | 'max_teacher_lessons_per_day' | 'prefer_morning';
  teacher?: string;
  course?: string;
  class?: string;
  day?: string;
  value?: number;
  priority?: 'required' | 'preferred';
};

type PlanItem = {
  class: string;
  course: string;
  teacher: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

function norm(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function labelClass(value: any): string {
  return `${value?.title || value?.name || ''}${value?.section ? ` — ${value.section}` : ''}`.trim();
}

function labelTeacher(value: any): string {
  const full = `${value?.profile?.firstName || ''} ${value?.profile?.lastName || ''}`.trim();
  return full || value?.teacherId || value?.user?.email || 'Unassigned';
}

async function schoolIdFor(req: Request): Promise<string> {
  const schoolId = String(resolveOrgIdForCreate(req, req.body?.school || req.query?.school) || '');
  if (!schoolId) throw new BadRequestError('School is required');
  const school = await School.findById(schoolId).select('institutionType organizationType').lean();
  if (!school) throw new NotFoundError('School');
  if (resolveInstitutionType(school as any) !== 'school') throw new BadRequestError('AI Timetable Studio is available for schools only');
  return schoolId;
}

function localRules(prompt: string): Rule[] {
  const rules: Rule[] = [];
  const lower = prompt.toLowerCase();
  const dayNames = DAYS.map((day) => day.toLowerCase());
  for (const day of dayNames) {
    const dayAt = lower.indexOf(day);
    if (dayAt < 0) continue;
    const nearby = prompt.slice(Math.max(0, dayAt - 80), Math.min(prompt.length, dayAt + day.length + 80));
    if (/day\s*off|fasax|free|ha\s+shaqeyn/i.test(nearby)) {
      const teacherMatch = nearby.match(/(?:macallin|teacher)\s+([\p{L} .'-]+)/iu);
      if (teacherMatch) rules.push({ type: 'teacher_day_off', teacher: teacherMatch[1].trim(), day: DAYS[dayNames.indexOf(day)], priority: 'required' });
    }
  }
  const maxMatch = prompt.match(/(?:macallin|teacher).{0,50}(?:ha\s+dhaafin|max(?:imum)?)[^0-9]{0,15}(\d+)/iu);
  if (maxMatch) rules.push({ type: 'max_teacher_lessons_per_day', value: Number(maxMatch[1]), priority: 'required' });
  if (/subax|morning/i.test(prompt)) rules.push({ type: 'prefer_morning', priority: 'preferred' });
  return rules;
}

async function interpretPrompt(prompt: string, context: string): Promise<{ reply: string; rules: Rule[]; aiUsed: boolean }> {
  const fallback = localRules(prompt);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return {
    reply: fallback.length
      ? `Waxaan fahmay ${fallback.length} xeer. Jadwalka waxaa lagu sameeyey xeerarkaas; DeepSeek key maqan awgiis local parser ayaa la isticmaalay.`
      : 'Jadwal aan isku dhac lahayn ayaan sameeyey. DeepSeek key maqan awgiis prompt-ka guud ayaa loo adeegsaday default rules.',
    rules: fallback,
    aiUsed: false,
  };

  const system = `You are the timetable planning assistant for Sahal Education Platform. Convert the admin request into JSON only. Never invent IDs. Return {"reply":"short Somali or same-language explanation","constraints":[{"type":"teacher_day_off|course_day|no_consecutive|max_teacher_lessons_per_day|prefer_morning","teacher":"optional visible name","course":"optional visible title/code","class":"optional visible class","day":"Sunday..Saturday","value":number,"priority":"required|preferred"}]}. Available data: ${context}`;
  try {
    const response = await axios.post('https://api.deepseek.com/chat/completions', {
      model: 'deepseek-v4-flash',
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1200,
    }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60_000 });
    const parsed = JSON.parse(response.data?.choices?.[0]?.message?.content || '{}');
    const allowed = new Set(['teacher_day_off', 'course_day', 'no_consecutive', 'max_teacher_lessons_per_day', 'prefer_morning']);
    const rules = (Array.isArray(parsed.constraints) ? parsed.constraints : [])
      .filter((rule: any) => allowed.has(rule?.type))
      .slice(0, 30) as Rule[];
    return { reply: String(parsed.reply || `Waxaan fahmay ${rules.length} xeer.`), rules, aiUsed: true };
  } catch {
    return { reply: 'DeepSeek lama heli karin hadda; jadwalka waxaa lagu sameeyey xeerarka la fahmi karay iyo conflict checker-ka gudaha.', rules: fallback, aiUsed: false };
  }
}

function validateItems(items: PlanItem[], refs: { classes: any[]; courses: any[]; teachers: any[] }) {
  const conflicts: Array<{ type: string; message: string; suggestion: string; indexes: number[] }> = [];
  const classIds = new Set(refs.classes.map((item) => String(item._id)));
  const teacherIds = new Set(refs.teachers.map((item) => String(item._id)));
  const courseMap = new Map(refs.courses.map((item) => [String(item._id), item]));
  items.forEach((item, index) => {
    const course: any = courseMap.get(String(item.course));
    if (!classIds.has(String(item.class)) || !course) conflicts.push({ type: 'invalid_reference', message: `Row ${index + 1} has an invalid class or course.`, suggestion: 'Select a course that belongs to this school and class.', indexes: [index] });
    else if (course.class && String(course.class) !== String(item.class)) conflicts.push({ type: 'course_class', message: `${course.title?.en || 'Course'} belongs to a different class.`, suggestion: 'Move it back to its assigned class.', indexes: [index] });
    if (item.teacher && !teacherIds.has(String(item.teacher))) conflicts.push({ type: 'invalid_teacher', message: `Row ${index + 1} has an invalid teacher.`, suggestion: 'Leave it Unassigned or choose an active school teacher.', indexes: [index] });
    if (!Number.isInteger(item.dayOfWeek) || item.dayOfWeek < 0 || item.dayOfWeek > 6 || !/^\d{2}:\d{2}$/.test(item.startTime) || item.endTime <= item.startTime) conflicts.push({ type: 'invalid_time', message: `Row ${index + 1} has an invalid day or time.`, suggestion: 'Drop it into a valid timetable slot.', indexes: [index] });
  });
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const a = items[left]; const b = items[right];
      if (a.dayOfWeek !== b.dayOfWeek || a.startTime >= b.endTime || a.endTime <= b.startTime) continue;
      if (a.class === b.class) conflicts.push({ type: 'class_conflict', message: `A class has two lessons on ${DAYS[a.dayOfWeek]} ${a.startTime}.`, suggestion: 'Move one lesson to the nearest empty slot.', indexes: [left, right] });
      if (a.teacher && a.teacher === b.teacher) conflicts.push({ type: 'teacher_conflict', message: `A teacher has two lessons on ${DAYS[a.dayOfWeek]} ${a.startTime}.`, suggestion: 'Move one lesson or assign another teacher.', indexes: [left, right] });
    }
  }
  return conflicts;
}

function validateRules(items: PlanItem[], rules: Rule[], refs: { teachers: any[] }) {
  const conflicts: Array<{ type: string; message: string; suggestion: string; indexes: number[] }> = [];
  for (const rule of rules) {
    if (rule.type === 'teacher_day_off' && rule.teacher && rule.day) {
      const teacher = refs.teachers.find((item) => norm(labelTeacher(item)).includes(norm(rule.teacher)));
      const day = DAYS.findIndex((item) => norm(item) === norm(rule.day));
      if (!teacher || day < 0) continue;
      const indexes = items.map((item, index) => item.teacher === String(teacher._id) && item.dayOfWeek === day ? index : -1).filter((index) => index >= 0);
      if (indexes.length) conflicts.push({ type: 'teacher_day_off', message: `${labelTeacher(teacher)} has ${indexes.length} lesson(s) on the requested day off, ${DAYS[day]}.`, suggestion: `Move those lessons away from ${DAYS[day]}.`, indexes });
    }
    if (rule.type === 'max_teacher_lessons_per_day' && Number(rule.value) > 0) {
      const maximum = Number(rule.value);
      for (const teacher of refs.teachers) for (let day = 0; day < 7; day += 1) {
        const indexes = items.map((item, index) => item.teacher === String(teacher._id) && item.dayOfWeek === day ? index : -1).filter((index) => index >= 0);
        if (indexes.length > maximum) conflicts.push({ type: 'teacher_daily_limit', message: `${labelTeacher(teacher)} has ${indexes.length} lessons on ${DAYS[day]}, above the limit of ${maximum}.`, suggestion: 'Move excess lessons to another day or assign another teacher.', indexes });
      }
    }
  }
  return conflicts;
}

function generateGreedy(courses: any[], teachers: any[], rules: Rule[]): { items: PlanItem[]; warnings: string[] } {
  const teacherLabels = new Map(teachers.map((teacher) => [String(teacher._id), norm(labelTeacher(teacher))]));
  const dayOff = new Map<string, Set<number>>();
  for (const rule of rules.filter((item) => item.type === 'teacher_day_off' && item.teacher && item.day)) {
    const match = teachers.find((teacher) => teacherLabels.get(String(teacher._id))?.includes(norm(rule.teacher)));
    const day = DAYS.findIndex((name) => norm(name) === norm(rule.day));
    if (match && day >= 0) {
      const current = dayOff.get(String(match._id)) || new Set<number>(); current.add(day); dayOff.set(String(match._id), current);
    }
  }
  const maxRule = rules.find((item) => item.type === 'max_teacher_lessons_per_day' && Number(item.value) > 0);
  const maxPerDay = Math.max(1, Math.min(12, Number(maxRule?.value || 7)));
  const occupiedClasses = new Set<string>();
  const occupiedTeachers = new Set<string>();
  const teacherDaily = new Map<string, number>();
  const items: PlanItem[] = [];
  const warnings: string[] = [];

  const sorted = [...courses].sort((a, b) => String(a.class).localeCompare(String(b.class)) || String(a.courseCode || '').localeCompare(String(b.courseCode || '')));
  for (const course of sorted) {
    if (!course.class) { warnings.push(`${course.title?.en || course.courseCode || 'Course'} has no class and was skipped.`); continue; }
    const teacher = course.teacher ? String(course.teacher._id || course.teacher) : null;
    let placed = false;
    for (const day of DEFAULT_DAYS) {
      if (teacher && dayOff.get(teacher)?.has(day)) continue;
      for (const [startTime, endTime] of DEFAULT_SLOTS) {
        const classKey = `${course.class}|${day}|${startTime}`;
        const teacherKey = teacher ? `${teacher}|${day}|${startTime}` : '';
        const dailyKey = teacher ? `${teacher}|${day}` : '';
        if (occupiedClasses.has(classKey) || (teacherKey && occupiedTeachers.has(teacherKey)) || (dailyKey && (teacherDaily.get(dailyKey) || 0) >= maxPerDay)) continue;
        items.push({ class: String(course.class), course: String(course._id), teacher, dayOfWeek: day, startTime, endTime });
        occupiedClasses.add(classKey);
        if (teacherKey) occupiedTeachers.add(teacherKey);
        if (dailyKey) teacherDaily.set(dailyKey, (teacherDaily.get(dailyKey) || 0) + 1);
        placed = true; break;
      }
      if (placed) break;
    }
    if (!placed) warnings.push(`${course.title?.en || course.courseCode || 'Course'} could not be placed. Add a day/period or relax a teacher rule.`);
  }
  return { items, warnings };
}

async function references(schoolId: string) {
  const [classes, courses, teachers] = await Promise.all([
    ClassModel.find({ school: schoolId, status: 'active' }).select('title name section').sort({ gradeLevel: 1, section: 1 }).lean(),
    Course.find({ school: schoolId, class: { $ne: null } }).select('title courseCode class teacher').populate('teacher', 'teacherId profile user').sort({ courseCode: 1 }).lean(),
    Teacher.find({ school: schoolId, status: 'active' }).select('teacherId profile user').populate('profile', 'firstName lastName').populate('user', 'email').lean(),
  ]);
  return { classes: classes as any[], courses: courses as any[], teachers: teachers as any[] };
}

export const generatePlan = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await schoolIdFor(req);
  const prompt = String(req.body?.prompt || 'Create a balanced conflict-free weekly timetable.').trim().slice(0, 4000);
  const refs = await references(schoolId);
  if (!refs.classes.length) throw new BadRequestError('Create active classes before generating a timetable');
  if (!refs.courses.length) throw new BadRequestError('Create or import class courses before generating a timetable');
  const context = `Teachers: ${refs.teachers.map(labelTeacher).join(', ') || 'none assigned'}. Classes: ${refs.classes.map(labelClass).join(', ')}. Days: ${DEFAULT_DAYS.map((day) => DAYS[day]).join(', ')}.`;
  const interpretation = await interpretPrompt(prompt, context);
  const priorRules = Array.isArray(req.body?.constraints) ? req.body.constraints.slice(0, 30) as Rule[] : [];
  const combinedRules = [...priorRules, ...interpretation.rules].slice(-30);
  const inspectExisting = /(?:check|baar).{0,40}(?:conflict|isku\s*dhac)|(?:conflict|isku\s*dhac).{0,40}(?:check|baar)/i.test(prompt);
  const existing = inspectExisting ? await ClassSchedule.find({ school: schoolId, isActive: true }).select('class course teacher dayOfWeek startTime endTime').lean() : [];
  const plan = existing.length
    ? { items: existing.map((item: any) => ({ class: String(item.class), course: String(item.course), teacher: item.teacher ? String(item.teacher) : null, dayOfWeek: item.dayOfWeek, startTime: item.startTime, endTime: item.endTime })), warnings: [] as string[] }
    : generateGreedy(refs.courses, refs.teachers, combinedRules);
  const conflicts = [...validateItems(plan.items, refs), ...validateRules(plan.items, combinedRules, refs)];
  return ApiResponse.success(res, {
    ...plan,
    conflicts,
    constraints: combinedRules,
    reply: interpretation.reply,
    aiUsed: interpretation.aiUsed,
    days: DEFAULT_DAYS,
    slots: DEFAULT_SLOTS,
    references: {
      classes: refs.classes.map((item) => ({ _id: item._id, label: labelClass(item) })),
      courses: refs.courses.map((item) => ({ _id: item._id, label: item.title?.en || item.courseCode, code: item.courseCode, class: item.class })),
      teachers: refs.teachers.map((item) => ({ _id: item._id, label: labelTeacher(item) })),
    },
  });
};

export const validatePlan = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await schoolIdFor(req);
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 1000) as PlanItem[] : [];
  const refs = await references(schoolId);
  const rules = Array.isArray(req.body?.constraints) ? req.body.constraints.slice(0, 30) as Rule[] : [];
  const conflicts = [...validateItems(items, refs), ...validateRules(items, rules, refs)];
  return ApiResponse.success(res, { valid: conflicts.length === 0, conflicts });
};

export const publishPlan = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await schoolIdFor(req);
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 1000) as PlanItem[] : [];
  if (!items.length) throw new BadRequestError('The timetable draft is empty');
  const refs = await references(schoolId);
  const rules = Array.isArray(req.body?.constraints) ? req.body.constraints.slice(0, 30) as Rule[] : [];
  const conflicts = [...validateItems(items, refs), ...validateRules(items, rules, refs)];
  if (conflicts.length) throw new BadRequestError(`Resolve ${conflicts.length} timetable conflict(s) before publishing`);

  const existing = await ClassSchedule.countDocuments({ school: schoolId, isActive: true });
  if (existing && req.body?.replaceExisting !== true) throw new BadRequestError(`This school already has ${existing} active schedule(s). Confirm replacement before publishing.`);
  if (existing) await ClassSchedule.deleteMany({ school: schoolId, isActive: true });
  await ClassSchedule.insertMany(items.map((item) => ({
    school: new mongoose.Types.ObjectId(schoolId),
    class: new mongoose.Types.ObjectId(item.class),
    course: new mongoose.Types.ObjectId(item.course),
    teacher: item.teacher ? new mongoose.Types.ObjectId(item.teacher) : null,
    dayOfWeek: item.dayOfWeek,
    startTime: item.startTime,
    endTime: item.endTime,
    isActive: true,
    createdBy: new mongoose.Types.ObjectId(req.user!.userId),
  })), { ordered: true });
  return ApiResponse.success(res, { published: items.length, replaced: existing }, `Published ${items.length} timetable lessons`);
};
