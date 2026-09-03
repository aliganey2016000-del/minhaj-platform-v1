/**
 * ClassSchedule Controller
 *
 * CRUD for class schedules + time-locked status check endpoint
 * that determines whether a teacher can currently take attendance
 * for a given course.
 *
 * GET /class-schedules supports:
 *   ?school=&department=&class=&course=&teacher=&day=&status=
 *                  — each accepts one value or a comma-separated list
 *                    (school: super admin only; org_admin is auto-scoped)
 *   ?search=<term> — search by course title, teacher name, or class title
 *   ?sortBy=&sortDir= — sortBy one of organization/department/class/course/
 *                    teacher/day/time/status; sortDir asc|desc
 *   ?page=&limit=  — pagination
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import ClassSchedule, { DayOfWeek } from '../models/class-schedule.model';
import { getCourseScheduleStatus } from '../models/class-schedule.model';
import ClassModel from '../models/class.model';
import Department from '../models/department.model';
import Course from '../models/course.model';
import Teacher from '../models/teacher.model';
import User from '../models/user.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, getOwnTeacherRecord, resolveOrgIdForCreate } from '../utils/tenant-scope';

// A bare `.populate('teacher', 'user profile')` only resolves the Teacher
// document itself — `profile` on it is still just an ObjectId, since
// Mongoose won't follow a second hop without its own nested `populate`
// option. That mismatch (Teacher doc present, name unresolved) is what
// made the schedules table show "Not Assigned"/"undefined undefined" for a
// teacher the Course Builder's own auto-fill (populated properly
// elsewhere) displayed correctly.
const TEACHER_POPULATE = {
  path: 'teacher',
  select: 'user profile',
  populate: { path: 'profile', select: 'firstName lastName' },
};

// Same nested-populate need as TEACHER_POPULATE above: a bare
// `.populate('class', 'title section')` never resolves the Class
// document's own `department` ref, so the Organization -> Department ->
// Class -> Course hierarchy this page now displays needs its own hop.
const CLASS_POPULATE = {
  path: 'class',
  select: 'title section department',
  populate: { path: 'department', select: 'name' },
};

function parseMultiValue(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

const CLASS_SCHEDULE_SORT_FIELDS = new Set(['organization', 'department', 'class', 'course', 'teacher', 'day', 'time', 'status']);

/** Populated-field-aware sort key extractor — everything is already loaded
 *  into memory below, so a populated field (course title, teacher name...)
 *  sorts exactly as easily as a direct one (unlike a DB-level `.sort()`,
 *  which can't reach into a ref before it's populated). */
function scheduleSortValue(sch: any, sortBy: string): string | number {
  switch (sortBy) {
    case 'organization': return (sch.school?.name || '').toLowerCase();
    case 'department': return (sch.class?.department?.name || '').toLowerCase();
    case 'class': return `${sch.class?.title || ''} ${sch.class?.section || ''}`.toLowerCase();
    case 'course': return (sch.course?.title?.en || sch.course?.title || '').toLowerCase();
    case 'teacher': return `${sch.teacher?.profile?.firstName || ''} ${sch.teacher?.profile?.lastName || ''}`.toLowerCase();
    case 'day': return sch.dayOfWeek;
    case 'time': return sch.startTime || '';
    case 'status': return sch.isActive ? 1 : 0;
    default: return 0;
  }
}

interface ScheduleFilterParams {
  school?: unknown;
  course?: unknown;
  teacher?: unknown;
  class?: unknown;
  department?: unknown;
  day?: unknown;
  status?: unknown;
  time?: unknown;
  search?: unknown;
}

/**
 * Resolves every ClassSchedule matching the given params — populated,
 * search/department-filtered, but UNSORTED and UNPAGINATED. Shared by
 * `getAll` (which sorts+paginates the result) and `bulkRemove`'s "select
 * all matching" path (which just needs every id), so "select all across
 * every page" always deletes exactly what the table is currently showing.
 */
async function resolveMatchingSchedules(req: Request, params: ScheduleFilterParams): Promise<any[]> {
  const schoolIds = parseMultiValue(params.school);
  const courseIds = parseMultiValue(params.course);
  const teacherIds = parseMultiValue(params.teacher);
  const classIds = parseMultiValue(params.class);
  const departmentIds = parseMultiValue(params.department);
  const dayValues = parseMultiValue(params.day)
    .map((d) => parseInt(d, 10))
    .filter((d) => !isNaN(d) && d >= 0 && d <= 6);
  const statusValues = parseMultiValue(params.status).filter((s) => s === 'active' || s === 'inactive');
  // Time ranges ("07:45-08:25", one or comma-separated) — matched exactly
  // against startTime+endTime post-populate, mirroring what the Time column
  // of the table displays.
  const timeRanges = parseMultiValue(params.time)
    .map((t) => {
      const m = t.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
      return m ? { start: m[1], end: m[2] } : null;
    })
    .filter((r): r is { start: string; end: string } => r !== null);

  const baseFilter: Record<string, unknown> = {};
  if (schoolIds.length > 0) baseFilter.school = { $in: schoolIds };
  const filter: Record<string, unknown> = applyOrgFilter(req, baseFilter, 'school');

  if (courseIds.length > 0) filter.course = { $in: courseIds };
  if (teacherIds.length > 0) filter.teacher = { $in: teacherIds };
  if (classIds.length > 0) filter.class = { $in: classIds };
  if (dayValues.length > 0) filter.dayOfWeek = { $in: dayValues };
  // Both "active" and "inactive" selected together is equivalent to no
  // filter (every schedule matches one or the other) — only constrain the
  // query when exactly one status is picked.
  if (statusValues.length === 1) filter.isActive = statusValues[0] === 'active';

  // For search (and the department filter — Department lives on the
  // populated Class, not directly on ClassSchedule) we need populated
  // documents first — so both happen post-query.
  const hasSearch = typeof params.search === 'string' && params.search.trim().length > 0;

  const schedules = await ClassSchedule.find(filter)
    .populate('school', 'name')
    .populate(CLASS_POPULATE)
    .populate('course', 'title')
    .populate(TEACHER_POPULATE)
    .lean();

  let filtered = schedules;
  if (hasSearch) {
    const s = (params.search as string).toLowerCase();
    filtered = filtered.filter((sch: any) => {
      const courseTitle = (sch.course?.title?.en || sch.course?.title || '').toLowerCase();
      const teacherName = [
        sch.teacher?.profile?.firstName,
        sch.teacher?.profile?.lastName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const className = (sch.class?.title || '').toLowerCase();
      const schoolName = (sch.school?.name || '').toLowerCase();
      return (
        courseTitle.includes(s) ||
        teacherName.includes(s) ||
        className.includes(s) ||
        schoolName.includes(s)
      );
    });
  }
  if (departmentIds.length > 0) {
    const deptSet = new Set(departmentIds);
    filtered = filtered.filter((sch: any) => {
      const deptId = typeof sch.class?.department === 'string' ? sch.class.department : sch.class?.department?._id;
      return !!deptId && deptSet.has(String(deptId));
    });
  }
  if (timeRanges.length > 0) {
    filtered = filtered.filter((sch: any) => {
      const schStart = String(sch.startTime || '').slice(0, 5);
      const schEnd = String(sch.endTime || '').slice(0, 5);
      return timeRanges.some((r) => r.start === schStart && r.end === schEnd);
    });
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// GET /class-schedules — List schedules (paginated, filterable)
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

  let filtered = await resolveMatchingSchedules(req, req.query as ScheduleFilterParams);

  const sortByRaw = typeof req.query.sortBy === 'string' ? req.query.sortBy : '';
  const sortBy = CLASS_SCHEDULE_SORT_FIELDS.has(sortByRaw) ? sortByRaw : null;
  const sortDir = req.query.sortDir === 'desc' ? -1 : 1;
  filtered = sortBy
    ? [...filtered].sort((a, b) => {
        const av = scheduleSortValue(a, sortBy);
        const bv = scheduleSortValue(b, sortBy);
        if (av < bv) return -sortDir;
        if (av > bv) return sortDir;
        return 0;
      })
    : [...filtered].sort((a: any, b: any) => (a.dayOfWeek - b.dayOfWeek) || String(a.startTime).localeCompare(b.startTime));

  const totalFiltered = filtered.length;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  return ApiResponse.paginated(res, paginated, { page, limit, total: totalFiltered });
};

// ---------------------------------------------------------------------------
// GET /class-schedules/:id
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  const schedule = await ClassSchedule.findById(req.params.id)
    .populate('school', 'name')
    .populate(CLASS_POPULATE)
    .populate('course', 'title')
    .populate({ path: 'teacher', populate: { path: 'profile', select: 'firstName lastName' } })
    .lean();

  if (!schedule) throw new NotFoundError('Schedule not found');
  assertOwnsOrg(req, schedule, 'school');

  return ApiResponse.success(res, schedule);
};

// ---------------------------------------------------------------------------
// POST /class-schedules — Create a new schedule
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const payload = {
    ...req.body,
    school: resolveOrgIdForCreate(req, req.body.school),
    createdBy: new mongoose.Types.ObjectId(req.user!.userId),
  };

  // Cross-module auto-assignment + schedule creation: if the selected
  // Course has no instructor yet (the frontend's "State B"), the teacher
  // picked for this schedule becomes the course's assigned teacher too, so
  // Course Management reflects it immediately without a second manual
  // entry. Scoped to the caller's own tenant.
  //
  // No transaction — this deployment's MongoDB is a standalone instance (no
  // replica set), which doesn't support transactions; session.withTransaction()
  // throws immediately there, and this call previously had no catch, so
  // every schedule creation was failing with an uncaught 500.
  if (payload.course && payload.teacher) {
    const courseDoc = await Course.findById(payload.course);
    if (!courseDoc) throw new NotFoundError('Course not found');
    assertOwnsOrg(req, courseDoc, 'school');

    if (!courseDoc.teacher) {
      courseDoc.teacher = payload.teacher;
      await courseDoc.save();
    }
  }

  const created = await ClassSchedule.create(payload);
  const createdId = created._id;

  const schedule = await ClassSchedule.findById(createdId)
    .populate('school', 'name')
    .populate(CLASS_POPULATE)
    .populate('course', 'title')
    .populate(TEACHER_POPULATE)
    .lean();

  return ApiResponse.created(res, schedule, 'Schedule created');
};

// ---------------------------------------------------------------------------
// PUT /class-schedules/:id — Update a schedule
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const existingSchedule = await ClassSchedule.findById(req.params.id).lean();
  if (!existingSchedule) throw new NotFoundError('Schedule not found');
  assertOwnsOrg(req, existingSchedule, 'school');

  // Same cross-module assignment as create(): applies when the admin edits
  // a schedule under "State B" (teacher-less course) and picks a teacher —
  // the course only gets auto-assigned if it still has none. No transaction
  // (see create() above) — this call previously had no catch either, so
  // every schedule update was failing with an uncaught 500.
  const courseId = req.body.course || existingSchedule.course;
  const teacherId = req.body.teacher;

  if (courseId && teacherId) {
    const courseDoc = await Course.findById(courseId);
    if (!courseDoc) throw new NotFoundError('Course not found');
    assertOwnsOrg(req, courseDoc, 'school');

    if (!courseDoc.teacher) {
      courseDoc.teacher = teacherId;
      await courseDoc.save();
    }
  }

  const updated = await ClassSchedule.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );
  if (!updated) throw new NotFoundError('Schedule not found');
  const updatedId = updated._id;

  const schedule = await ClassSchedule.findById(updatedId)
    .populate('school', 'name')
    .populate(CLASS_POPULATE)
    .populate('course', 'title')
    .populate(TEACHER_POPULATE)
    .lean();

  return ApiResponse.success(res, schedule, 'Schedule updated');
};

// ---------------------------------------------------------------------------
// DELETE /class-schedules/:id
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const existingSchedule = await ClassSchedule.findById(req.params.id).lean();
  if (!existingSchedule) throw new NotFoundError('Schedule not found');
  assertOwnsOrg(req, existingSchedule, 'school');

  const schedule = await ClassSchedule.findByIdAndDelete(req.params.id);
  if (!schedule) throw new NotFoundError('Schedule not found');
  return ApiResponse.success(res, null, 'Schedule deleted');
};

// ---------------------------------------------------------------------------
// POST /class-schedules/bulk-delete — Delete many schedules in one request
// (no Trash/restore for this resource — single delete above is already
// permanent, so bulk matches that instead of introducing a second behavior)
// ---------------------------------------------------------------------------

export const bulkRemove = async (req: Request, res: Response): Promise<Response> => {
  let ids: string[];

  if (req.body?.selectAllMatching) {
    // "Select all across every page" — resolve ids from the SAME matching
    // logic getAll uses (with whatever filters were active on the table),
    // not just whatever happened to be loaded on the current page.
    const matched = await resolveMatchingSchedules(req, (req.body?.filters || {}) as ScheduleFilterParams);
    ids = matched.map((sch: any) => String(sch._id));
  } else {
    ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
  }
  if (ids.length === 0) throw new BadRequestError('No schedule ids provided');

  // Scoping through applyOrgFilter (not just trusting the ids the client
  // sent) means an org_admin can never delete another org's schedule even
  // if a stray id from elsewhere ended up in the request — it's just
  // silently excluded from the match, same spirit as assertOwnsOrg on the
  // single-delete path above.
  const filter: Record<string, unknown> = applyOrgFilter(req, { _id: { $in: ids } }, 'school');
  const result = await ClassSchedule.deleteMany(filter);

  return ApiResponse.success(res, { deleted: result.deletedCount }, `Deleted ${result.deletedCount} schedule(s)`);
};

// ---------------------------------------------------------------------------
// GET /class-schedules/status/:courseId — Time-locked status check
// ---------------------------------------------------------------------------

export const checkScheduleStatus = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  if (!courseId) throw new BadRequestError('courseId is required');

  const status = await getCourseScheduleStatus(courseId);

  return ApiResponse.success(res, status);
};

// ---------------------------------------------------------------------------
// GET /class-schedules/my — Student's own schedule
// ---------------------------------------------------------------------------

export const getMySchedules = async (req: Request, res: Response): Promise<Response> => {
  const Student = mongoose.model('Student');
  const student = await Student.findOne({ user: req.user!.userId }).lean();
  if (!student) throw new NotFoundError('Student record');

  const schedules = await ClassSchedule.find({
    class: (student as any).class,
    isActive: true,
  })
    // isLive lets the student schedule page show a "Join Class" action for
    // whatever course the teacher currently has live (see student-schedule.tsx).
    .populate('course', 'title isLive')
    .populate({ path: 'teacher', populate: { path: 'profile', select: 'firstName lastName' } })
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, schedules);
};

// ---------------------------------------------------------------------------
// GET /class-schedules/my-teaching — Teacher's own teaching schedule
// ---------------------------------------------------------------------------

export const getMyScheduleAsTeacher = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new NotFoundError('Teacher record');

  const schedules = await ClassSchedule.find({
    teacher: teacher._id,
    isActive: true,
  })
    .populate('school', 'name')
    .populate(CLASS_POPULATE)
    .populate('course', 'title')
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, schedules);
};

// ---------------------------------------------------------------------------
// POST /class-schedules/bulk-import — Excel bulk import
//
// Expected columns (case-insensitive header row): School, Class, Section,
// Course, Teacher Email, Day, Start Time, End Time, Active.
// `School` is ignored (and forced to the caller's own org) for org_admin.
// Rows are processed independently — a bad row is reported but does not
// abort the rest of the import.
// ---------------------------------------------------------------------------

const DAY_LOOKUP: Record<string, DayOfWeek> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function parseDay(value: unknown): DayOfWeek | null {
  if (typeof value === 'number' && value >= 0 && value <= 6) return value as DayOfWeek;
  const key = String(value ?? '').trim().toLowerCase();
  if (key in DAY_LOOKUP) return DAY_LOOKUP[key];
  const asNum = Number(key);
  if (!isNaN(asNum) && asNum >= 0 && asNum <= 6) return asNum as DayOfWeek;
  return null;
}

/** Normalizes "7:30 AM", "07:30", "7:30", "19:05" etc. to 24h "HH:MM". */
function parseTime(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2];
    const meridiem = ampmMatch[3].toUpperCase();
    if (hour === 12) hour = 0;
    if (meridiem === 'PM') hour += 12;
    if (hour > 23) return null;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  const h24Match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const hour = parseInt(h24Match[1], 10);
    const minute = h24Match[2];
    if (hour > 23 || parseInt(minute, 10) > 59) return null;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  return null;
}

/**
 * Real pasted data often has one combined "Time" cell — "10:00 AM - 12:30
 * PM" — instead of separate Start Time / End Time columns, since that's how
 * a schedule reads naturally. Dedicated Start/End columns win when present;
 * only when BOTH are missing do we look for a single range cell and split
 * it on a dash/en-dash/"to" between the two halves.
 */
function resolveTimeRange(row: Record<string, any>): { startRaw: unknown; endRaw: unknown } {
  const startRaw = getField(row, 'Start Time', 'Start');
  const endRaw = getField(row, 'End Time', 'End');
  if (String(startRaw ?? '').trim() && String(endRaw ?? '').trim()) return { startRaw, endRaw };

  const rangeRaw = getField(row, 'Time', 'Time Range', 'Schedule Time', 'Period');
  const range = String(rangeRaw ?? '').trim();
  if (!range) return { startRaw, endRaw };

  const parts = range.split(/\s*(?:-|–|—|\bto\b)\s*/i);
  if (parts.length === 2 && parts[0] && parts[1]) return { startRaw: parts[0], endRaw: parts[1] };
  return { startRaw, endRaw };
}

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

/**
 * Real-world pasted/exported data very often writes a class as one combined
 * string — "Grade 2 (B)" or "Grade 2 - B" — even when the template has a
 * separate Section column, because that's how the class reads on-screen
 * elsewhere in the app (see courses-manage.tsx's `{c.title} - {c.section}`).
 * An explicit Section cell always wins; only when it's blank do we try to
 * split a trailing "(X)" or "- X" off the class name so "Grade 2 (B)" still
 * resolves instead of failing to match the stored "Grade 2" + "B".
 */
function splitClassAndSection(className: string, section: string): { name: string; section: string } {
  if (section) return { name: className, section };
  const parenMatch = className.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) return { name: parenMatch[1].trim(), section: parenMatch[2].trim() };
  const dashMatch = className.match(/^(.*?)\s+[-–]\s+(\S+)\s*$/);
  if (dashMatch) return { name: dashMatch[1].trim(), section: dashMatch[2].trim() };
  return { name: className, section: '' };
}

/**
 * The Teacher column is documented (and validated) as an email — the one
 * value guaranteed unique — but real pasted data very often has the
 * teacher's display name instead (that's all the admin sees anywhere else
 * in the app, e.g. Manage Teachers). Only fall back to a name match when
 * the cell plainly isn't an email (no "@"); require it to resolve to
 * exactly one teacher at this school, since names alone aren't unique.
 */
async function resolveTeacherId(teacherIdentifier: string, schoolId: string): Promise<mongoose.Types.ObjectId> {
  if (teacherIdentifier.includes('@')) {
    const teacherUser = await User.findOne({ email: teacherIdentifier.toLowerCase(), role: 'teacher' }).lean();
    if (!teacherUser) throw new Error(`Teacher with email "${teacherIdentifier}" not found`);
    const teacherDoc = await Teacher.findOne({ user: teacherUser._id }).lean();
    if (!teacherDoc) throw new Error(`No teacher profile linked to "${teacherIdentifier}"`);
    return teacherDoc._id;
  }

  const candidates = await Teacher.find({ school: schoolId })
    .populate('profile', 'firstName lastName')
    .lean();
  const normalized = teacherIdentifier.trim().toLowerCase().replace(/\s+/g, ' ');
  const matches = candidates.filter((t: any) => {
    const full = `${t.profile?.firstName || ''} ${t.profile?.lastName || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
    return full === normalized;
  });
  if (matches.length === 0) throw new Error(`Teacher "${teacherIdentifier}" not found at this organization — use their email to disambiguate`);
  if (matches.length > 1) throw new Error(`Multiple teachers named "${teacherIdentifier}" — use their email instead`);
  return (matches[0] as any)._id;
}

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel/CSV file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const ownOrgId = resolveOrgIdForCreate(req) as string | undefined;

  const errors: { row: number; message: string }[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // header is row 1
    const row = rows[i];

    try {
      const schoolName = String(getField(row, 'School', 'Organization') ?? '').trim();
      const departmentName = String(getField(row, 'Department') ?? '').trim();
      const className = String(getField(row, 'Class') ?? '').trim();
      const section = String(getField(row, 'Section') ?? '').trim();
      const courseTitle = String(getField(row, 'Course') ?? '').trim();
      const teacherEmail = String(getField(row, 'Teacher Email', 'Teacher') ?? '').trim();
      const dayRaw = getField(row, 'Day', 'Day of Week');
      const { startRaw, endRaw } = resolveTimeRange(row);
      const activeRaw = getField(row, 'Status', 'Active');

      if (!departmentName) throw new Error('Department is required');
      if (!className) throw new Error('Class is required');
      if (!courseTitle) throw new Error('Course is required');
      if (!teacherEmail) throw new Error('Teacher Email is required');

      // Resolve organization: org_admin is always forced to their own org.
      let schoolId: string | undefined = ownOrgId;
      if (!schoolId) {
        if (!schoolName) throw new Error('School is required');
        const school = await School.findOne({ name: new RegExp(`^${escapeRegex(schoolName)}$`, 'i') }).lean();
        if (!school) throw new Error(`School "${schoolName}" not found`);
        schoolId = school._id.toString();
      }

      const departmentDoc = await Department.findOne({
        tenantId: schoolId,
        name: new RegExp(`^${escapeRegex(departmentName)}$`, 'i'),
      }).lean();
      if (!departmentDoc) throw new Error(`Department "${departmentName}" not found`);

      const { name: resolvedClassName, section: resolvedSection } = splitClassAndSection(className, section);
      const classFilter: Record<string, unknown> = {
        school: schoolId,
        department: departmentDoc._id,
        title: new RegExp(`^${escapeRegex(resolvedClassName)}$`, 'i'),
      };
      if (resolvedSection) classFilter.section = new RegExp(`^${escapeRegex(resolvedSection)}$`, 'i');
      const classDoc = await ClassModel.findOne(classFilter).lean();
      if (!classDoc) throw new Error(`Class "${resolvedClassName}${resolvedSection ? ' ' + resolvedSection : ''}" not found in department "${departmentName}"`);

      const courseDoc = await Course.findOne({
        school: schoolId,
        'title.en': new RegExp(`^${escapeRegex(courseTitle)}$`, 'i'),
      }).lean();
      if (!courseDoc) throw new Error(`Course "${courseTitle}" not found`);

      const teacherId = await resolveTeacherId(teacherEmail, schoolId);

      const dayOfWeek = parseDay(dayRaw);
      if (dayOfWeek === null) throw new Error(`Invalid day of week "${dayRaw}"`);

      const startTime = parseTime(startRaw);
      if (!startTime) throw new Error(`Invalid start time "${startRaw}"`);
      const endTime = parseTime(endRaw);
      if (!endTime) throw new Error(`Invalid end time "${endRaw}"`);
      if (endTime <= startTime) throw new Error('End time must be after start time');

      const isActive = activeRaw === '' || activeRaw === undefined
        ? true
        : !['no', 'false', '0', 'inactive'].includes(String(activeRaw).trim().toLowerCase());

      await ClassSchedule.create({
        school: schoolId,
        class: classDoc._id,
        course: courseDoc._id,
        teacher: teacherId,
        dayOfWeek,
        startTime,
        endTime,
        isActive,
        createdBy: new mongoose.Types.ObjectId(req.user!.userId),
      });

      created += 1;
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created,
    failed: errors.length,
    errors,
  }, `Imported ${created} of ${rows.length} schedules`);
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// GET /class-schedules/export — Export all schedules as formatted XLSX
// ---------------------------------------------------------------------------

const DAY_NAMES_EXPORT = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const exportSchedules = async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');

  const schedules = await ClassSchedule.find(filter)
    .populate('school', 'name')
    .populate(CLASS_POPULATE)
    .populate('course', 'title')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'email' } })
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  const headers = ['Day of Week', 'Class Name', 'Course / Subject', 'Teacher Email', 'Start Time', 'End Time', 'Status'];
  const rows = schedules.map((sch: any) => [
    DAY_NAMES_EXPORT[sch.dayOfWeek] || '',
    sch.class ? `${sch.class.title} ${sch.class.section || ''}`.trim() : '',
    sch.course?.title?.en || sch.course?.title || '',
    sch.teacher?.user?.email || '',
    sch.startTime,
    sch.endTime,
    sch.isActive ? 'Active' : 'Inactive',
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = headers.map((h, colIdx) => {
    const maxLen = rows.reduce((max, row) => Math.max(max, String(row[colIdx] ?? '').length), h.length);
    return { wch: Math.min(maxLen + 4, 50) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Class Schedules');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=class-schedules-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// GET /class-schedules/template — Download empty structured template (XLSX)
// ---------------------------------------------------------------------------

export const downloadTemplate = async (req: Request, res: Response): Promise<void> => {
  const isOrgAdmin = req.user?.role === 'org_admin';

  // Column order mirrors the Organization -> Department -> Class -> Course
  // hierarchy shown on the Class Schedules page/table (Department is
  // required — a Class always belongs to exactly one). Start/End Time stay
  // as two columns rather than one combined "Time" range so parseTime()
  // can validate each independently; Teacher is keyed by email (unique)
  // rather than display name, which two teachers could share.
  const headers = isOrgAdmin
    ? ['Department', 'Class', 'Section', 'Course', 'Teacher Email', 'Day', 'Start Time', 'End Time', 'Status']
    : ['Organization', 'Department', 'Class', 'Section', 'Course', 'Teacher Email', 'Day', 'Start Time', 'End Time', 'Status'];

  const sampleRow = isOrgAdmin
    ? ['Primary', 'Quran Beginners', 'A', 'Quran Recitation', 'teacher@example.com', 'Sunday', '08:00', '09:30', 'Scheduled']
    : ['Madrasa Al-Noor', 'Primary', 'Quran Beginners', 'A', 'Quran Recitation', 'teacher@example.com', 'Sunday', '08:00', '09:30', 'Scheduled'];

  const sheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  sheet['!cols'] = headers.map((h) => ({ wch: Math.min(h.length + 8, 28) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Schedules Template');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=class-schedules-template.xlsx');
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// POST /class-schedules/import — Transactional bulk import with insertMany
// ---------------------------------------------------------------------------

export const bulkImportTransactional = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const ownOrgId = resolveOrgIdForCreate(req) as string | undefined;
  const createdBy = new mongoose.Types.ObjectId(req.user!.userId);

  const errors: { row: number; message: string }[] = [];
  const documents: any[] = [];

  // ---------------------------------------------------------------------
  // Batch-resolve every School/Department/Class/Course/Teacher the file
  // could reference, UP FRONT, instead of the ~5-6 sequential DB round-
  // trips per row this used to do (400 rows -> 2000+ round-trips against
  // the remote Atlas cluster — easily enough to blow a request/proxy
  // timeout partway through, which is what made large files appear to
  // silently stop partway through import). Schools/Departments/Classes/
  // Courses/Teachers are all small per-organization reference tables, so
  // fetching each one ONCE (regardless of row count) and matching entirely
  // in memory below is both correct and dramatically faster.
  // ---------------------------------------------------------------------

  let schoolIdByName: Map<string, string> | null = null;
  if (!ownOrgId) {
    const allSchools = await School.find({}, { name: 1 }).lean();
    schoolIdByName = new Map(allSchools.map((s: any) => [String(s.name).trim().toLowerCase(), s._id.toString()]));
  }

  // Every school a row could resolve to — org_admin is always their own
  // org; super admin depends on each row's own School column, so every
  // known school stays in scope (still one query per collection either way).
  const relevantSchoolIds = ownOrgId ? [ownOrgId] : Array.from(schoolIdByName!.values());

  const [allDepartments, allClasses, allCourses, nameScopedTeachers] = await Promise.all([
    Department.find({ tenantId: { $in: relevantSchoolIds } }).lean(),
    ClassModel.find({ school: { $in: relevantSchoolIds } }).lean(),
    Course.find({ school: { $in: relevantSchoolIds } }).lean(),
    Teacher.find({ school: { $in: relevantSchoolIds } }).populate('profile', 'firstName lastName').lean(),
  ]);

  const departmentByKey = new Map<string, any>();
  for (const d of allDepartments as any[]) departmentByKey.set(`${d.tenantId}|||${String(d.name).trim().toLowerCase()}`, d);

  // Keyed by title only (not title+section) — a row with no Section value
  // matches on title alone, same as the original `findOne` with no section
  // clause in its filter; classCandidates[0] mirrors that query returning
  // whichever doc Mongo found first when several sections share a title.
  const classesByTitleKey = new Map<string, any[]>();
  for (const c of allClasses as any[]) {
    const key = `${c.school}|||${c.department}|||${String(c.title).trim().toLowerCase()}`;
    if (!classesByTitleKey.has(key)) classesByTitleKey.set(key, []);
    classesByTitleKey.get(key)!.push(c);
  }

  const courseByKey = new Map<string, any>();
  for (const co of allCourses as any[]) courseByKey.set(`${co.school}|||${String(co.title?.en || '').trim().toLowerCase()}`, co);

  // Teacher-by-email lookup is intentionally NOT scoped to relevantSchoolIds
  // — the original resolveTeacherId() looked up the email globally (via
  // User, not Teacher.school), so preserving that means a separate,
  // narrowly-scoped fetch keyed off exactly the email-looking identifiers
  // the file actually references (bounded by distinct emails, not rows).
  const teacherIdentifiers = new Set<string>();
  for (const row of rows) {
    const t = String(getField(row, 'Teacher Email', 'Teacher') ?? '').trim();
    if (t) teacherIdentifiers.add(t);
  }
  const emailIdentifiers = Array.from(teacherIdentifiers).filter((t) => t.includes('@')).map((t) => t.toLowerCase());
  const emailUsers = emailIdentifiers.length > 0
    ? await User.find({ email: { $in: emailIdentifiers }, role: 'teacher' }).lean()
    : [];
  const userIdByEmail = new Map(emailUsers.map((u: any) => [String(u.email).toLowerCase(), String(u._id)]));
  const emailUserIds = emailUsers.map((u: any) => u._id);
  const emailTeachers = emailUserIds.length > 0 ? await Teacher.find({ user: { $in: emailUserIds } }).lean() : [];
  const teacherByUserId = new Map(emailTeachers.map((t: any) => [String(t.user), t]));

  function resolveTeacherIdBatched(identifier: string, schoolId: string): mongoose.Types.ObjectId {
    if (identifier.includes('@')) {
      const userId = userIdByEmail.get(identifier.toLowerCase());
      if (!userId) throw new Error(`Teacher with email "${identifier}" not found`);
      const teacherDoc = teacherByUserId.get(userId);
      if (!teacherDoc) throw new Error(`No teacher profile linked to "${identifier}"`);
      return teacherDoc._id;
    }
    const normalized = identifier.trim().toLowerCase().replace(/\s+/g, ' ');
    const matches = nameScopedTeachers.filter((t: any) => {
      if (String(t.school) !== String(schoolId)) return false;
      const full = `${t.profile?.firstName || ''} ${t.profile?.lastName || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
      return full === normalized;
    });
    if (matches.length === 0) throw new Error(`Teacher "${identifier}" not found at this organization — use their email to disambiguate`);
    if (matches.length > 1) throw new Error(`Multiple teachers named "${identifier}" — use their email instead`);
    return (matches[0] as any)._id;
  }

  // ---- Row loop — purely in-memory now, no awaits ----
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // header is row 1
    const row = rows[i];

    try {
      const schoolName = String(getField(row, 'School', 'Organization') ?? '').trim();
      const departmentName = String(getField(row, 'Department') ?? '').trim();
      const className = String(getField(row, 'Class') ?? '').trim();
      const section = String(getField(row, 'Section') ?? '').trim();
      const courseTitle = String(getField(row, 'Course') ?? '').trim();
      const teacherEmail = String(getField(row, 'Teacher Email', 'Teacher') ?? '').trim();
      const dayRaw = getField(row, 'Day', 'Day of Week');
      const { startRaw, endRaw } = resolveTimeRange(row);
      const activeRaw = getField(row, 'Status', 'Active');

      if (!departmentName) throw new Error('Department is required');
      if (!className) throw new Error('Class is required');
      if (!courseTitle) throw new Error('Course is required');
      if (!teacherEmail) throw new Error('Teacher Email is required');

      // Resolve organization
      let schoolId: string | undefined = ownOrgId;
      if (!schoolId) {
        if (!schoolName) throw new Error('School is required');
        schoolId = schoolIdByName!.get(schoolName.toLowerCase());
        if (!schoolId) throw new Error(`School "${schoolName}" not found`);
      }

      const departmentDoc = departmentByKey.get(`${schoolId}|||${departmentName.toLowerCase()}`);
      if (!departmentDoc) throw new Error(`Department "${departmentName}" not found`);

      const { name: resolvedClassName, section: resolvedSection } = splitClassAndSection(className, section);
      const classCandidates = classesByTitleKey.get(`${schoolId}|||${departmentDoc._id}|||${resolvedClassName.toLowerCase()}`) || [];
      const classDoc = resolvedSection
        ? classCandidates.find((c: any) => String(c.section || '').trim().toLowerCase() === resolvedSection.toLowerCase())
        : classCandidates[0];
      if (!classDoc) throw new Error(`Class "${resolvedClassName}${resolvedSection ? ' ' + resolvedSection : ''}" not found in department "${departmentName}"`);

      const courseDoc = courseByKey.get(`${schoolId}|||${courseTitle.toLowerCase()}`);
      if (!courseDoc) throw new Error(`Course "${courseTitle}" not found`);

      const teacherId = resolveTeacherIdBatched(teacherEmail, schoolId);

      const dayOfWeek = parseDay(dayRaw);
      if (dayOfWeek === null) throw new Error(`Invalid day of week "${dayRaw}"`);

      const startTime = parseTime(startRaw);
      if (!startTime) throw new Error(`Invalid start time "${startRaw}"`);
      const endTime = parseTime(endRaw);
      if (!endTime) throw new Error(`Invalid end time "${endRaw}"`);
      if (endTime <= startTime) throw new Error('End time must be after start time');

      const isActive = activeRaw === '' || activeRaw === undefined
        ? true
        : !['no', 'false', '0', 'inactive'].includes(String(activeRaw).trim().toLowerCase());

      documents.push({
        school: new mongoose.Types.ObjectId(schoolId),
        class: classDoc._id,
        course: courseDoc._id,
        teacher: teacherId,
        dayOfWeek,
        startTime,
        endTime,
        isActive,
        createdBy,
      });
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  // No transaction — this deployment's MongoDB is a standalone instance (no
  // replica set), which doesn't support transactions; session.withTransaction()
  // throws immediately there, and every prior "successful" import under that
  // code path inserted zero documents. insertMany with ordered:false still
  // continues past individual row errors and reports what succeeded.
  let inserted = 0;
  if (documents.length > 0) {
    try {
      const result = await ClassSchedule.insertMany(documents, { ordered: false });
      inserted = result.length;
    } catch (txErr: any) {
      if (txErr.insertedDocs) inserted = txErr.insertedDocs.length;
      if (txErr.writeErrors) {
        txErr.writeErrors.forEach((we: any) => {
          errors.push({ row: we.index + 2, message: we.err?.errmsg || we.errmsg || 'Insert error' });
        });
      } else if (inserted === 0) {
        errors.push({ row: 0, message: txErr.message || 'Import failed.' });
      }
    }
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created: inserted,
    failed: errors.length,
    errors,
  }, `Imported ${inserted} of ${rows.length} schedules`);
};
