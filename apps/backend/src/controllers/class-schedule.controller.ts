/**
 * ClassSchedule Controller
 *
 * CRUD for class schedules + time-locked status check endpoint
 * that determines whether a teacher can currently take attendance
 * for a given course.
 *
 * GET /class-schedules supports:
 *   ?school=<id>   — filter by organization (super admin); org_admin auto-scoped
 *   ?day=<0-6>     — filter by day of week (0=Sunday…6=Saturday)
 *   ?search=<term> — search by course title, teacher name, or class title
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

// ---------------------------------------------------------------------------
// GET /class-schedules — List schedules (paginated, filterable)
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');

  const { course, teacher, class: classId, day, search } = req.query;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

  if (course) filter.course = course;
  if (teacher) filter.teacher = teacher;
  if (classId) filter.class = classId;
  if (day !== undefined && day !== '') {
    const dayNum = parseInt(day as string, 10);
    if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
      filter.dayOfWeek = dayNum;
    }
  }

  // For search we need to build an $or across populated fields — but populate
  // happens after find(), so we do search post-query for simplicity.
  const hasSearch = typeof search === 'string' && search.trim().length > 0;

  const [schedules, total] = await Promise.all([
    ClassSchedule.find(filter)
      .populate('school', 'name')
      .populate(CLASS_POPULATE)
      .populate('course', 'title')
      .populate(TEACHER_POPULATE)
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean(),
    ClassSchedule.countDocuments(filter),
  ]);

  // Post-populate search + pagination
  let filtered = schedules;
  if (hasSearch) {
    const s = (search as string).toLowerCase();
    filtered = schedules.filter((sch: any) => {
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
    .populate('course', 'title')
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

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
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
      const startRaw = getField(row, 'Start Time', 'Start');
      const endRaw = getField(row, 'End Time', 'End');
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

      const classFilter: Record<string, unknown> = {
        school: schoolId,
        department: departmentDoc._id,
        title: new RegExp(`^${escapeRegex(className)}$`, 'i'),
      };
      if (section) classFilter.section = new RegExp(`^${escapeRegex(section)}$`, 'i');
      const classDoc = await ClassModel.findOne(classFilter).lean();
      if (!classDoc) throw new Error(`Class "${className}${section ? ' ' + section : ''}" not found in department "${departmentName}"`);

      const courseDoc = await Course.findOne({
        school: schoolId,
        'title.en': new RegExp(`^${escapeRegex(courseTitle)}$`, 'i'),
      }).lean();
      if (!courseDoc) throw new Error(`Course "${courseTitle}" not found`);

      const teacherUser = await User.findOne({ email: teacherEmail.toLowerCase(), role: 'teacher' }).lean();
      if (!teacherUser) throw new Error(`Teacher with email "${teacherEmail}" not found`);
      const teacherDoc = await Teacher.findOne({ user: teacherUser._id }).lean();
      if (!teacherDoc) throw new Error(`No teacher profile linked to "${teacherEmail}"`);

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
        teacher: teacherDoc._id,
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
      const startRaw = getField(row, 'Start Time', 'Start');
      const endRaw = getField(row, 'End Time', 'End');
      const activeRaw = getField(row, 'Status', 'Active');

      if (!departmentName) throw new Error('Department is required');
      if (!className) throw new Error('Class is required');
      if (!courseTitle) throw new Error('Course is required');
      if (!teacherEmail) throw new Error('Teacher Email is required');

      // Resolve organization
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

      const classFilter: Record<string, unknown> = {
        school: schoolId,
        department: departmentDoc._id,
        title: new RegExp(`^${escapeRegex(className)}$`, 'i'),
      };
      if (section) classFilter.section = new RegExp(`^${escapeRegex(section)}$`, 'i');
      const classDoc = await ClassModel.findOne(classFilter).lean();
      if (!classDoc) throw new Error(`Class "${className}${section ? ' ' + section : ''}" not found in department "${departmentName}"`);

      const courseDoc = await Course.findOne({
        school: schoolId,
        'title.en': new RegExp(`^${escapeRegex(courseTitle)}$`, 'i'),
      }).lean();
      if (!courseDoc) throw new Error(`Course "${courseTitle}" not found`);

      const teacherUser = await User.findOne({ email: teacherEmail.toLowerCase(), role: 'teacher' }).lean();
      if (!teacherUser) throw new Error(`Teacher with email "${teacherEmail}" not found`);
      const teacherDoc = await Teacher.findOne({ user: teacherUser._id }).lean();
      if (!teacherDoc) throw new Error(`No teacher profile linked to "${teacherEmail}"`);

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
        teacher: teacherDoc._id,
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
