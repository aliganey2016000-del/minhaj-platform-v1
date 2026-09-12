import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import ClassSchedule, { DayOfWeek } from '../models/class-schedule.model';
import ClassModel from '../models/class.model';
import Course from '../models/course.model';
import Teacher from '../models/teacher.model';
import User from '../models/user.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_LOOKUP: Record<string, DayOfWeek> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const SCHOOL_HEADERS = [
  'Class / Section',
  'Course / Subject',
  'Teacher / Instructor',
  'Day',
  'Time',
  'Status',
];

const TEACHER_POPULATE = {
  path: 'teacher',
  select: 'teacherId user profile',
  populate: [
    { path: 'profile', select: 'firstName lastName' },
    { path: 'user', select: 'email' },
  ],
};

const CLASS_POPULATE = { path: 'class', select: 'title section' };

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function parseDay(value: unknown): DayOfWeek | null {
  if (typeof value === 'number' && value >= 0 && value <= 6) return value as DayOfWeek;
  const key = normalize(value);
  if (key in DAY_LOOKUP) return DAY_LOOKUP[key];
  const number = Number(key);
  return Number.isInteger(number) && number >= 0 && number <= 6 ? number as DayOfWeek : null;
}

function parseTime(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (hour === 12) hour = 0;
    if (twelveHour[3].toLowerCase() === 'pm') hour += 12;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const twentyFour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFour) return null;
  const hour = Number(twentyFour[1]);
  const minute = Number(twentyFour[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimeRange(value: unknown): { startTime: string; endTime: string } | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parts = raw.split(/\s*(?:-|–|—|\bto\b)\s*/i).filter(Boolean);
  if (parts.length !== 2) return null;
  const startTime = parseTime(parts[0]);
  const endTime = parseTime(parts[1]);
  if (!startTime || !endTime || endTime <= startTime) return null;
  return { startTime, endTime };
}

function parseActive(value: unknown): boolean {
  const raw = normalize(value);
  if (!raw) return true;
  return !['inactive', 'no', 'false', '0', 'disabled'].includes(raw);
}

function splitClassAndSection(value: string): { title: string; section: string } {
  const raw = value.trim();
  const paren = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) return { title: paren[1].trim(), section: paren[2].trim() };
  const dash = raw.match(/^(.*?)\s+(?:-|–|—)\s+([^\s]+)\s*$/);
  if (dash) return { title: dash[1].trim(), section: dash[2].trim() };
  return { title: raw, section: '' };
}

function classLabel(cls: any): string {
  if (!cls) return '';
  return `${cls.title || ''}${cls.section ? ` — ${cls.section}` : ''}`.trim();
}

function teacherLabel(teacher: any): string {
  if (!teacher) return '';
  const fullName = `${teacher.profile?.firstName || ''} ${teacher.profile?.lastName || ''}`.trim();
  const email = teacher.user?.email || '';
  if (fullName && email) return `${fullName} <${email}>`;
  return email || fullName || teacher.teacherId || '';
}

function extractTeacherEmail(value: string): string | null {
  const angle = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plain ? plain[0].toLowerCase() : null;
}

async function resolveSchoolContext(req: Request, requested?: string) {
  const schoolId = String(resolveOrgIdForCreate(req, requested) || '');
  if (!schoolId) throw new BadRequestError('School is required');
  const school = await School.findById(schoolId).lean();
  if (!school) throw new NotFoundError('School not found');
  if (resolveInstitutionType(school as any) !== 'school') {
    throw new BadRequestError('This simplified schedule workflow is only available for schools');
  }
  return { schoolId, school };
}

async function resolveClass(schoolId: string, classValue: string) {
  const { title, section } = splitClassAndSection(classValue);
  const filter: Record<string, any> = {
    school: schoolId,
    title: new RegExp(`^${escapeRegex(title)}$`, 'i'),
  };
  if (section) filter.section = new RegExp(`^${escapeRegex(section)}$`, 'i');
  const matches = await ClassModel.find(filter).limit(3).lean();
  if (!matches.length) throw new Error(`Class / Section "${classValue}" was not found`);
  if (!section && matches.length > 1) {
    throw new Error(`Class "${title}" has multiple sections — include the section, e.g. "${title} — A"`);
  }
  return matches[0];
}

async function resolveCourse(schoolId: string, classId: mongoose.Types.ObjectId | string, value: string) {
  const raw = value.trim();
  if (!raw) throw new Error('Course / Subject is required');
  const titleRegex = new RegExp(`^${escapeRegex(raw)}$`, 'i');
  const codeRegex = new RegExp(`^${escapeRegex(raw)}$`, 'i');

  const candidates = await Course.find({
    school: schoolId,
    $or: [{ 'title.en': titleRegex }, { courseCode: codeRegex }],
  }).lean();
  if (!candidates.length) throw new Error(`Course / Subject "${raw}" was not found`);

  const exactClass = candidates.find((course: any) => course.class && String(course.class) === String(classId));
  if (exactClass) return exactClass;
  const unscoped = candidates.find((course: any) => !course.class);
  if (unscoped) return unscoped;
  if (candidates.length === 1) {
    throw new Error(`Course / Subject "${raw}" is assigned to a different class`);
  }
  throw new Error(`Course / Subject "${raw}" is ambiguous for this class — use its Course Code`);
}

async function resolveTeacher(schoolId: string, value: string): Promise<any | null> {
  const raw = value.trim();
  if (!raw) return null;
  const email = extractTeacherEmail(raw);
  if (email) {
    const user = await User.findOne({ email }).lean();
    if (!user) throw new Error(`Teacher email "${email}" was not found`);
    const teacher = await Teacher.findOne({ user: user._id, school: schoolId }).lean();
    if (!teacher) throw new Error(`"${email}" is registered but is not a teacher in this school`);
    return teacher;
  }

  const teacherById = await Teacher.findOne({ school: schoolId, teacherId: new RegExp(`^${escapeRegex(raw)}$`, 'i') }).lean();
  if (teacherById) return teacherById;

  const roster = await Teacher.find({ school: schoolId }).populate('profile', 'firstName lastName').lean();
  const matches = roster.filter((teacher: any) => normalize(`${teacher.profile?.firstName || ''} ${teacher.profile?.lastName || ''}`) === normalize(raw));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Multiple teachers named "${raw}" — use email or Teacher ID`);
  throw new Error(`Teacher / Instructor "${raw}" was not found`);
}

async function getPopulatedSchedule(id: mongoose.Types.ObjectId | string) {
  return ClassSchedule.findById(id)
    .populate('school', 'name institutionType organizationType')
    .populate(CLASS_POPULATE)
    .populate('course', 'title courseCode teacher')
    .populate(TEACHER_POPULATE)
    .lean();
}

async function assertNoConflicts(params: {
  schoolId: string;
  classId: string;
  courseId: string;
  teacherId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
  excludeId?: string;
}) {
  if (!params.active) return;
  const filter: Record<string, any> = {
    school: params.schoolId,
    dayOfWeek: params.dayOfWeek,
    isActive: true,
    startTime: { $lt: params.endTime },
    endTime: { $gt: params.startTime },
  };
  if (params.excludeId) filter._id = { $ne: params.excludeId };

  const overlaps = await ClassSchedule.find(filter)
    .populate(CLASS_POPULATE)
    .populate('course', 'title')
    .populate(TEACHER_POPULATE)
    .lean();

  const duplicate = overlaps.find((item: any) =>
    String(item.class?._id || item.class) === params.classId &&
    String(item.course?._id || item.course) === params.courseId &&
    item.startTime === params.startTime &&
    item.endTime === params.endTime
  );
  if (duplicate) throw new BadRequestError('This schedule already exists for the selected class, subject, day and time');

  const classConflict = overlaps.find((item: any) => String(item.class?._id || item.class) === params.classId);
  if (classConflict) {
    const title = classConflict.course?.title?.en || 'another subject';
    throw new BadRequestError(`Class conflict: ${classLabel(classConflict.class)} already has ${title} from ${classConflict.startTime} to ${classConflict.endTime}`);
  }

  if (params.teacherId) {
    const teacherConflict = overlaps.find((item: any) => String(item.teacher?._id || item.teacher || '') === params.teacherId);
    if (teacherConflict) {
      throw new BadRequestError(`Teacher conflict: ${teacherLabel(teacherConflict.teacher) || 'this teacher'} is already scheduled from ${teacherConflict.startTime} to ${teacherConflict.endTime}`);
    }
  }
}

async function validateReferences(schoolId: string, classId: string, courseId: string, teacherId?: string | null) {
  const [cls, course, teacher] = await Promise.all([
    ClassModel.findOne({ _id: classId, school: schoolId }).lean(),
    Course.findOne({ _id: courseId, school: schoolId }).lean(),
    teacherId ? Teacher.findOne({ _id: teacherId, school: schoolId }).lean() : Promise.resolve(null),
  ]);
  if (!cls) throw new BadRequestError('Selected class does not belong to this school');
  if (!course) throw new BadRequestError('Selected course / subject does not belong to this school');
  if (teacherId && !teacher) throw new BadRequestError('Selected teacher does not belong to this school');
  if ((course as any).class && String((course as any).class) !== String(classId)) {
    throw new BadRequestError('Selected course / subject is assigned to a different class');
  }
  return { cls, course, teacher };
}

export const createSchoolSchedule = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId } = await resolveSchoolContext(req, req.body?.school);
  const classId = String(req.body?.class || '');
  const courseId = String(req.body?.course || '');
  let teacherId = req.body?.teacher ? String(req.body.teacher) : null;
  const dayOfWeek = Number(req.body?.dayOfWeek);
  const startTime = parseTime(req.body?.startTime);
  const endTime = parseTime(req.body?.endTime);
  const isActive = req.body?.isActive !== false;

  if (!classId || !courseId) throw new BadRequestError('Class and Course / Subject are required');
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new BadRequestError('Valid day of week is required');
  if (!startTime || !endTime || endTime <= startTime) throw new BadRequestError('A valid start and end time are required');

  const refs = await validateReferences(schoolId, classId, courseId, teacherId);
  if (!teacherId && (refs.course as any).teacher) teacherId = String((refs.course as any).teacher);

  await assertNoConflicts({ schoolId, classId, courseId, teacherId, dayOfWeek, startTime, endTime, active: isActive });

  if (teacherId && !(refs.course as any).teacher) {
    await Course.findByIdAndUpdate(courseId, { teacher: teacherId });
  }

  const created = await ClassSchedule.create({
    school: schoolId,
    class: classId,
    course: courseId,
    teacher: teacherId || null,
    dayOfWeek,
    startTime,
    endTime,
    isActive,
    createdBy: new mongoose.Types.ObjectId(req.user!.userId),
  });

  return ApiResponse.created(res, await getPopulatedSchedule(created._id), 'Schedule created');
};

export const updateSchoolSchedule = async (req: Request, res: Response): Promise<Response> => {
  const existing = await ClassSchedule.findById(req.params.id).lean();
  if (!existing) throw new NotFoundError('Schedule not found');
  assertOwnsOrg(req, existing, 'school');
  const { schoolId } = await resolveSchoolContext(req, String(existing.school));

  const classId = String(req.body?.class || existing.class);
  const courseId = String(req.body?.course || existing.course);
  let teacherId = req.body?.teacher === '' || req.body?.teacher === null
    ? null
    : req.body?.teacher
      ? String(req.body.teacher)
      : existing.teacher ? String(existing.teacher) : null;
  const dayOfWeek = req.body?.dayOfWeek === undefined ? existing.dayOfWeek : Number(req.body.dayOfWeek);
  const startTime = parseTime(req.body?.startTime ?? existing.startTime);
  const endTime = parseTime(req.body?.endTime ?? existing.endTime);
  const isActive = req.body?.isActive === undefined ? existing.isActive : req.body.isActive !== false;

  if (!startTime || !endTime || endTime <= startTime) throw new BadRequestError('A valid start and end time are required');
  const refs = await validateReferences(schoolId, classId, courseId, teacherId);
  if (!teacherId && req.body?.teacher === undefined && (refs.course as any).teacher) teacherId = String((refs.course as any).teacher);

  await assertNoConflicts({
    schoolId,
    classId,
    courseId,
    teacherId,
    dayOfWeek,
    startTime,
    endTime,
    active: isActive,
    excludeId: req.params.id,
  });

  if (teacherId && !(refs.course as any).teacher) {
    await Course.findByIdAndUpdate(courseId, { teacher: teacherId });
  }

  await ClassSchedule.findByIdAndUpdate(req.params.id, {
    class: classId,
    course: courseId,
    teacher: teacherId || null,
    dayOfWeek,
    startTime,
    endTime,
    isActive,
  }, { runValidators: true });

  return ApiResponse.success(res, await getPopulatedSchedule(req.params.id), 'Schedule updated');
};

export const downloadSchoolTemplate = async (req: Request, res: Response): Promise<void> => {
  await resolveSchoolContext(req, req.query.school as string | undefined);
  const rows = [[
    'Grade 10 — A',
    'Mathematics',
    'teacher@example.com',
    'Sunday',
    '08:00 - 08:45',
    'Active',
  ]];
  const buffer = buildXlsxBuffer(SCHOOL_HEADERS, rows, 'School Schedule Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=school-class-schedules-template.xlsx');
  res.end(buffer);
};

export const exportSchoolSchedules = async (req: Request, res: Response): Promise<void> => {
  const { schoolId } = await resolveSchoolContext(req, req.query.school as string | undefined);
  const schedules = await ClassSchedule.find({ school: schoolId })
    .populate(CLASS_POPULATE)
    .populate('course', 'title courseCode')
    .populate(TEACHER_POPULATE)
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  const rows = schedules.map((item: any) => [
    classLabel(item.class),
    item.course?.title?.en || item.course?.courseCode || '',
    teacherLabel(item.teacher),
    DAYS[item.dayOfWeek] || '',
    `${item.startTime} - ${item.endTime}`,
    item.isActive ? 'Active' : 'Inactive',
  ]);

  const buffer = buildXlsxBuffer(SCHOOL_HEADERS, rows, 'School Class Schedules');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=school-class-schedules-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

export const importSchoolSchedules = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel/CSV file is required (field name "file")');
  const { schoolId } = await resolveSchoolContext(req, req.query.school as string | undefined);

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (!rows.length) throw new BadRequestError('The uploaded file has no data rows');

  const errors: { row: number; message: string }[] = [];
  let created = 0;
  let updated = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    try {
      const classValue = String(getField(row, 'Class / Section', 'Class', 'Class Name') ?? '').trim();
      const courseValue = String(getField(row, 'Course / Subject', 'Course', 'Subject', 'Course Code') ?? '').trim();
      const teacherValue = String(getField(row, 'Teacher / Instructor', 'Teacher', 'Teacher Email', 'Instructor') ?? '').trim();
      const dayValue = getField(row, 'Day', 'Day of Week');
      const timeValue = getField(row, 'Time', 'Time Range', 'Period');
      const statusValue = getField(row, 'Status', 'Active');

      if (!classValue) throw new Error('Class / Section is required');
      if (!courseValue) throw new Error('Course / Subject is required');
      const dayOfWeek = parseDay(dayValue);
      if (dayOfWeek === null) throw new Error(`Invalid day "${dayValue}"`);
      const range = parseTimeRange(timeValue);
      if (!range) throw new Error(`Invalid Time "${timeValue}" — use a range such as 08:00 - 08:45`);
      const isActive = parseActive(statusValue);

      const cls = await resolveClass(schoolId, classValue);
      const course = await resolveCourse(schoolId, cls._id, courseValue);
      const teacher = teacherValue ? await resolveTeacher(schoolId, teacherValue) : null;
      const teacherId = teacher?._id ? String(teacher._id) : (course as any).teacher ? String((course as any).teacher) : null;

      const exact = await ClassSchedule.findOne({
        school: schoolId,
        class: cls._id,
        course: course._id,
        dayOfWeek,
        startTime: range.startTime,
        endTime: range.endTime,
      }).lean();

      await assertNoConflicts({
        schoolId,
        classId: String(cls._id),
        courseId: String(course._id),
        teacherId,
        dayOfWeek,
        startTime: range.startTime,
        endTime: range.endTime,
        active: isActive,
        excludeId: exact ? String(exact._id) : undefined,
      });

      if (exact) {
        await ClassSchedule.findByIdAndUpdate(exact._id, {
          teacher: teacherId || null,
          isActive,
        }, { runValidators: true });
        updated += 1;
      } else {
        await ClassSchedule.create({
          school: schoolId,
          class: cls._id,
          course: course._id,
          teacher: teacherId || null,
          dayOfWeek,
          startTime: range.startTime,
          endTime: range.endTime,
          isActive,
          createdBy: new mongoose.Types.ObjectId(req.user!.userId),
        });
        created += 1;
      }

      if (teacherId && !(course as any).teacher) {
        await Course.findByIdAndUpdate(course._id, { teacher: teacherId });
      }
    } catch (error: any) {
      errors.push({ row: rowNumber, message: error?.message || 'Invalid schedule row' });
    }
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created,
    updated,
    failed: errors.length,
    errors,
  }, `Imported ${created} new and updated ${updated} schedule(s)`);
};
