/**
 * Course Controller
 * Handles course-related HTTP requests:
 * CRUD operations, enrollment, listing.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import Course from '../models/course.model';
import Student from '../models/student.model';
import School from '../models/school.model';
import ClassModel from '../models/class.model';
import Teacher from '../models/teacher.model';
import User from '../models/user.model';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate, getOwnTeacherRecord } from '../utils/tenant-scope';

/**
 * Throws ForbiddenError if the caller is a `teacher` and this course isn't
 * directly assigned to them. No-op for admin/org_admin (already checked via
 * assertOwnsOrg).
 */
async function assertOwnsCourseIfTeacher(req: Request, course: { teacher?: unknown }): Promise<void> {
  if (req.user?.role !== 'teacher') return;
  const teacher = await getOwnTeacherRecord(req);
  const teacherId = (course.teacher as any)?._id ? (course.teacher as any)._id.toString() : (course.teacher as any)?.toString();
  if (!teacher || teacherId !== teacher._id.toString()) {
    throw new ForbiddenError('You can only access courses assigned to you.');
  }
}

// ---------------------------------------------------------------------------
// List Courses (Public — only published)
// ---------------------------------------------------------------------------

export const getAllPublic = async (req: Request, res: Response): Promise<Response> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const category = req.query.category as string | undefined;
  const level = req.query.level as string | undefined;
  const search = req.query.search as string | undefined;

  const filter: Record<string, unknown> = { status: 'published' };

  if (category) filter.category = category;
  if (level) filter.level = level;
  if (search) {
    filter.$or = [
      { 'title.en': { $regex: search, $options: 'i' } },
      { 'title.so': { $regex: search, $options: 'i' } },
      { 'title.ar': { $regex: search, $options: 'i' } },
    ];
  }

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .populate({
        path: 'teacher',
        select: 'teacherId profile',
        populate: { path: 'profile', select: 'firstName lastName' },
      })
      .populate('school', 'name')
      .populate({ path: 'class', select: 'title section' })
      .select('-syllabus')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Course.countDocuments(filter),
  ]);

  return ApiResponse.paginated(res, courses, { page, limit, total });
};

// ---------------------------------------------------------------------------
// List Courses (Admin — all statuses)
// ---------------------------------------------------------------------------

export const getAllAdmin = async (req: Request, res: Response): Promise<Response> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 100;
  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  const classId = req.query.classId as string | undefined;
  if (classId) (filter as any).class = classId;

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  // Teacher: assigned-only access — only courses directly assigned to them,
  // regardless of organization (their own org is implied since a teacher can
  // only be assigned courses within their own school in the first place).
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    scopedFilter.teacher = teacher ? teacher._id : null;
  }

  const [courses, total] = await Promise.all([
    Course.find(scopedFilter)
      .populate({
        path: 'teacher',
        select: 'teacherId profile',
        populate: { path: 'profile', select: 'firstName lastName' },
      })
      .populate('school', 'name')
      .populate({ path: 'class', select: 'title section' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Course.countDocuments(scopedFilter),
  ]);

  return ApiResponse.paginated(res, courses, { page, limit, total });
};

// ---------------------------------------------------------------------------
// Get Single Course (Public — by slug)
// ---------------------------------------------------------------------------

export const getBySlug = async (req: Request, res: Response): Promise<Response> => {
  const course = await Course.findOne({ slug: req.params.slug, status: 'published' })
    .populate({
      path: 'teacher',
      select: 'teacherId profile',
      populate: { path: 'profile', select: 'firstName lastName' },
    })
    .populate('school', 'name')
    .populate({ path: 'class', select: 'title section' })
    .lean();

  if (!course) {
    throw new NotFoundError('Course');
  }

  return ApiResponse.success(res, course);
};

// ---------------------------------------------------------------------------
// Get Single Course (Admin — by ID)
// ---------------------------------------------------------------------------

export const getByIdAdmin = async (req: Request, res: Response): Promise<Response> => {
  const course = await Course.findById(req.params.id)
    .populate({
      path: 'teacher',
      select: 'teacherId profile',
      populate: { path: 'profile', select: 'firstName lastName' },
    })
    .populate('school', 'name')
    .populate({ path: 'class', select: 'title section' })
    .lean();

  if (!course) {
    throw new NotFoundError('Course');
  }
  assertOwnsOrg(req, course, 'school');
  await assertOwnsCourseIfTeacher(req, course);

  return ApiResponse.success(res, course);
};

// ---------------------------------------------------------------------------
// Create Course (Admin, or org_admin — scoped to their own org)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { title, description, category, level, duration, fee, teacher, school, class: classId, maxStudents, syllabus, prerequisites } = req.body;

  // Generate slug from English title
  const slug = title.en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Check for duplicate slug
  const existing = await Course.findOne({ slug });
  if (existing) {
    throw new ConflictError('A course with this title already exists');
  }

  const course = await Course.create({
    title,
    slug,
    description,
    category,
    level,
    duration,
    fee: fee || 0,
    teacher: teacher || null,
    school: resolveOrgIdForCreate(req, school) || null,
    class: classId || null,
    maxStudents,
    syllabus: syllabus || [],
    prerequisites: prerequisites || [],
    status: 'draft',
  });

  const populated = await Course.findById(course._id)
    .populate({
      path: 'teacher',
      select: 'teacherId profile',
      populate: { path: 'profile', select: 'firstName lastName' },
    })
    .populate('school', 'name')
    .populate({ path: 'class', select: 'title section' })
    .lean();

  return ApiResponse.created(res, populated, 'Course created successfully');
};

// ---------------------------------------------------------------------------
// Update Course (Admin only)
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Course.findById(req.params.id);
  if (!existing) throw new NotFoundError('Course');
  assertOwnsOrg(req, existing, 'school');

  const allowedUpdates = [
    'title', 'description', 'category', 'level', 'duration',
    'fee', 'teacher', 'school', 'class', 'maxStudents', 'syllabus', 'prerequisites', 'status',
    'startDate', 'endDate', 'thumbnail', 'meetingLink', 'accessMode',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  // org_admin can never move a course to a different organization.
  if (req.user?.role === 'org_admin') {
    if (updates.school !== undefined && String(updates.school) !== String(existing.school)) {
      throw new BadRequestError('Organization cannot be changed. Your organization is fixed.');
    }
    // Allow the update to proceed with the same org (so frontend can send school without error),
    // but strip the field so org_admin can never alter school assignment.
    delete updates.school;
  }

  // If title.en changed, regenerate slug
  if (updates.title && (updates.title as any).en) {
    updates.slug = (updates.title as any).en
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const course = await Course.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!course) {
    throw new NotFoundError('Course');
  }

  const populated = await Course.findById(course._id)
    .populate({
      path: 'teacher',
      select: 'teacherId profile',
      populate: { path: 'profile', select: 'firstName lastName' },
    })
    .populate('school', 'name')
    .populate({ path: 'class', select: 'title section' })
    .lean();

  return ApiResponse.success(res, populated, 'Course updated successfully');
};

// ---------------------------------------------------------------------------
// Toggle Live — Start/end this course's Google Meet session
// (Admin/org_admin, or the course's own assigned teacher)
// ---------------------------------------------------------------------------

export const toggleLive = async (req: Request, res: Response): Promise<Response> => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');
  await assertOwnsCourseIfTeacher(req, course);

  const { isLive } = req.body;
  if (typeof isLive !== 'boolean') {
    throw new BadRequestError('isLive must be true or false');
  }

  if (isLive && !course.meetingLink) {
    throw new BadRequestError('Add a Google Meet link to this course before going live');
  }

  course.isLive = isLive;
  await course.save();

  return ApiResponse.success(
    res,
    { isLive: course.isLive },
    isLive ? 'Course is now live' : 'Live session ended'
  );
};

// ---------------------------------------------------------------------------
// Video Gating Settings — sequential-watch enforcement + per-checkpoint quiz
// questions for this course's video lessons (admin/org_admin/teacher)
// ---------------------------------------------------------------------------

export const getVideoGating = async (req: Request, res: Response): Promise<Response> => {
  const course = await Course.findById(req.params.id).select('videoGating school teacher');
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');
  await assertOwnsCourseIfTeacher(req, course);

  return ApiResponse.success(res, course.videoGating || null);
};

export const updateVideoGating = async (req: Request, res: Response): Promise<Response> => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');
  await assertOwnsCourseIfTeacher(req, course);

  const {
    enabled,
    blockForwardSeeking,
    checkpoints,
    minWatchPercentToUnlock,
    showCheckpointAlerts,
    description,
    checkpointQuestions,
  } = req.body;

  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    throw new BadRequestError('At least one checkpoint percentage is required');
  }
  const minWatch = Number(minWatchPercentToUnlock);
  if (!Number.isFinite(minWatch) || minWatch < 1 || minWatch > 100) {
    throw new BadRequestError('minWatchPercentToUnlock must be a number between 1 and 100');
  }

  course.videoGating = {
    enabled: !!enabled,
    blockForwardSeeking: blockForwardSeeking !== false,
    checkpoints: checkpoints.map((c: unknown) => Number(c)).filter((c: number) => Number.isFinite(c)),
    minWatchPercentToUnlock: minWatch,
    showCheckpointAlerts: showCheckpointAlerts !== false,
    description: description || '',
    checkpointQuestions: checkpointQuestions && typeof checkpointQuestions === 'object' ? checkpointQuestions : {},
  };

  await course.save();

  return ApiResponse.success(res, course.videoGating, 'Video gating settings saved');
};

// ---------------------------------------------------------------------------
// Delete Course (Admin only)
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Course.findById(req.params.id);
  if (!existing) throw new NotFoundError('Course');
  assertOwnsOrg(req, existing, 'school');

  const course = await Course.findByIdAndDelete(req.params.id);

  if (!course) {
    throw new NotFoundError('Course');
  }

  // Remove course from enrolled students
  await Student.updateMany(
    { enrolledCourses: course._id },
    { $pull: { enrolledCourses: course._id } }
  );

  return ApiResponse.noContent(res, 'Course deleted successfully');
};

// ---------------------------------------------------------------------------
// Enroll Student in Course
// ---------------------------------------------------------------------------

export const enrollStudent = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { studentId } = req.body;

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');

  if (course.status !== 'published') {
    throw new BadRequestError('Cannot enroll in a course that is not published');
  }

  if (course.enrolledStudents >= course.maxStudents) {
    throw new BadRequestError('Course has reached maximum capacity');
  }

  const student = await Student.findById(studentId);
  if (!student) throw new NotFoundError('Student');

  if (student.enrolledCourses.some((id) => id.toString() === courseId)) {
    throw new ConflictError('Student is already enrolled in this course');
  }

  // Enroll
  student.enrolledCourses.push(course._id);
  course.enrolledStudents += 1;

  await Promise.all([student.save(), course.save()]);

  return ApiResponse.success(res, null, 'Student enrolled successfully');
};

// ---------------------------------------------------------------------------
// Unenroll Student from Course
// ---------------------------------------------------------------------------

export const unenrollStudent = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { studentId } = req.body;

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');

  const student = await Student.findById(studentId);
  if (!student) throw new NotFoundError('Student');

  if (!student.enrolledCourses.some((id) => id.toString() === courseId)) {
    throw new BadRequestError('Student is not enrolled in this course');
  }

  student.enrolledCourses = student.enrolledCourses.filter(
    (id) => id.toString() !== courseId
  );
  course.enrolledStudents = Math.max(0, course.enrolledStudents - 1);

  await Promise.all([student.save(), course.save()]);

  return ApiResponse.success(res, null, 'Student unenrolled successfully');
};

// ---------------------------------------------------------------------------
// Get Enrolled Students
// ---------------------------------------------------------------------------

export const getEnrolledStudents = async (req: Request, res: Response): Promise<Response> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const course = await Course.findById(req.params.id).select('school teacher');
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');
  await assertOwnsCourseIfTeacher(req, course);

  const students = await Student.find({ enrolledCourses: req.params.id })
    .populate('user', 'email role isActive')
    .populate('profile', 'firstName lastName avatar')
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Student.countDocuments({ enrolledCourses: req.params.id });

  return ApiResponse.paginated(res, students, { page, limit, total });
};

// ---------------------------------------------------------------------------
// Self-Enroll (Student enrolls themselves)
// ---------------------------------------------------------------------------

export const selfEnroll = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const course = await Course.findById(req.params.id);
  if (!course) throw new NotFoundError('Course');

  if (course.status !== 'published') throw new BadRequestError('Cannot enroll in a course that is not published');
  if (course.enrolledStudents >= course.maxStudents) throw new BadRequestError('Course has reached maximum capacity');
  if (student.enrolledCourses.some((id: any) => id.toString() === req.params.id)) throw new ConflictError('You are already enrolled in this course');

  const studentSchoolId = (student as any).school?.toString();
  const studentClassId = (student as any).class?.toString();
  const courseSchoolId = course.school?.toString();
  const courseClassId = course.class?.toString();
  if (courseSchoolId !== studentSchoolId || (courseClassId && courseClassId !== studentClassId)) {
    throw new ForbiddenError('This course is not available to your organization or class.');
  }

  student.enrolledCourses.push(course._id);
  course.enrolledStudents += 1;
  await Promise.all([student.save(), course.save()]);
  return ApiResponse.success(res, { enrolled: true }, 'Successfully enrolled in course');
};

// ---------------------------------------------------------------------------
// Self-Unenroll (Student unenrolls themselves)
// ---------------------------------------------------------------------------

export const selfUnenroll = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const course = await Course.findById(req.params.id);
  if (!course) throw new NotFoundError('Course');

  if (!student.enrolledCourses.some((id: any) => id.toString() === req.params.id)) throw new BadRequestError('You are not enrolled in this course');

  student.enrolledCourses = student.enrolledCourses.filter((id: any) => id.toString() !== req.params.id);
  course.enrolledStudents = Math.max(0, course.enrolledStudents - 1);
  await Promise.all([student.save(), course.save()]);
  return ApiResponse.success(res, { enrolled: false }, 'Successfully unenrolled from course');
};

// ---------------------------------------------------------------------------
// Available Courses (Student catalog with enrollment status)
// ---------------------------------------------------------------------------

export const getAvailableCourses = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 12));
  const category = req.query.category as string | undefined;
  const level = req.query.level as string | undefined;
  const search = req.query.search as string | undefined;

  // Resolve the student's own org/class first — a student must only ever
  // see courses offered to their organization, and (when the course is
  // class-specific) their exact class. Courses with no `class` set are
  // school-wide electives open to every class in that school.
  let student: Awaited<ReturnType<typeof ensureStudentRecord>> | null = null;
  try {
    student = req.user?.userId ? await ensureStudentRecord(req.user.userId) : null;
  } catch {
    student = null;
  }

  const filter: Record<string, unknown> = { status: 'published' };
  if (category) filter.category = category;
  if (level) filter.level = level;
  if (search) {
    filter.$or = [
      { 'title.en': { $regex: search, $options: 'i' } },
      { 'title.so': { $regex: search, $options: 'i' } },
      { 'title.ar': { $regex: search, $options: 'i' } },
      { 'description.en': { $regex: search, $options: 'i' } },
    ];
  }
  if (student) {
    filter.school = (student as any).school || null;
    filter.class = { $in: [(student as any).class || null, null] };
  }

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .populate({
        path: 'teacher',
        select: 'teacherId profile',
        populate: { path: 'profile', select: 'firstName lastName' },
      })
      .populate('school', 'name')
      .populate({ path: 'class', select: 'title section' })
      .select('title slug description category level duration fee teacher maxStudents enrolledStudents thumbnail status startDate school class')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Course.countDocuments(filter),
  ]);

  const enrolledIds: string[] = student
    ? (student.enrolledCourses || []).map((id: any) => id.toString())
    : [];

  const coursesWithStatus = courses.map((c: any) => ({ ...c, isEnrolled: enrolledIds.includes(c._id.toString()) }));
  return ApiResponse.paginated(res, coursesWithStatus, { page, limit, total });
};

// ---------------------------------------------------------------------------
// List Course Categories
// ---------------------------------------------------------------------------

export const getCategories = async (_req: Request, res: Response): Promise<Response> => {
  const categories = [
    { value: 'quran', label: { en: 'Quran', so: 'Qur\'aanka', ar: 'القرآن' } },
    { value: 'fiqh', label: { en: 'Fiqh', so: 'Fiqhiga', ar: 'الفقه' } },
    { value: 'aqeedah', label: { en: 'Aqeedah', so: 'Cajiidada', ar: 'العقيدة' } },
    { value: 'seerah', label: { en: 'Seerah', so: 'Siirada', ar: 'السيرة' } },
    { value: 'arabic', label: { en: 'Arabic Language', so: 'Luqadda Carabiga', ar: 'اللغة العربية' } },
    { value: 'tajweed', label: { en: 'Tajweed', so: 'Tajwiidka', ar: 'التجويد' } },
    { value: 'hadith', label: { en: 'Hadith', so: 'Xadiithka', ar: 'الحديث' } },
    { value: 'akhlaq', label: { en: 'Akhlaq', so: 'Akhlaaqda', ar: 'الأخلاق' } },
  ];

  return ApiResponse.success(res, categories);
};

// ---------------------------------------------------------------------------
// GET /courses/export — Export all courses as formatted XLSX
// ---------------------------------------------------------------------------

export const exportCourses = async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');

  const courses = await Course.find(filter)
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'email' } })
    .sort({ createdAt: -1 })
    .lean();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Courses');

  const headers = [
    'Course Title (English)', 'Category', 'Level', 'Organization Name',
    'Class Title', 'Teacher Email', 'Duration (weeks)', 'Price ($)',
    'Capacity', 'Thumbnail URL',
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  courses.forEach((c: any, idx: number) => {
    const row = sheet.addRow([
      c.title?.en || '', c.category || '', c.level || '',
      c.school?.name || '', c.class ? `${c.class.title} ${c.class.section || ''}`.trim() : '',
      c.teacher?.user?.email || '', c.duration || 8, c.fee || 0,
      c.maxStudents || 50, c.thumbnail || '',
    ]);
    if (idx % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    row.alignment = { vertical: 'middle' };
  });

  sheet.columns = headers.map((header, colIdx) => {
    let maxLen = header.length;
    sheet.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
      if (rowNumber > 1) {
        maxLen = Math.max(maxLen, (_row.getCell(colIdx + 1).value?.toString() || '').length);
      }
    });
    return { header, key: header.toLowerCase().replace(/[^a-z]/g, '_'), width: Math.min(maxLen + 4, 50) };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=courses-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
};

// ---------------------------------------------------------------------------
// GET /courses/template — Download empty structured template (XLSX)
// ---------------------------------------------------------------------------

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Course Template');

  const headers = [
    'Course Title (English)', 'Category', 'Level', 'Organization Name',
    'Class Title', 'Teacher Email', 'Duration (weeks)', 'Price ($)',
    'Capacity', 'Thumbnail URL',
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  const sample = sheet.addRow([
    'Quran Recitation', 'quran', 'beginner', 'Madrasa Al-Noor',
    'Quran Beginners A', 'teacher@example.com', '8', '0',
    '50', '',
  ]);
  sample.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  sample.alignment = { vertical: 'middle' };

  sheet.columns = headers.map((h) => ({
    header: h, key: h.toLowerCase().replace(/[^a-z]/g, '_'), width: Math.min(h.length + 8, 28),
  }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=courses-template.xlsx');
  await workbook.xlsx.write(res);
  res.end();
};

// ---------------------------------------------------------------------------
// Helpers for import
// ---------------------------------------------------------------------------

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

const VALID_CATEGORIES = ['quran', 'fiqh', 'aqeedah', 'seerah', 'arabic', 'tajweed', 'hadith', 'akhlaq'];
const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'];

// ---------------------------------------------------------------------------
// POST /courses/import — Transactional bulk import
// ---------------------------------------------------------------------------

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel file is required (field name "file")');

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const ownOrgId = (resolveOrgIdForCreate(req) as string | undefined) || undefined;

  // ── Phase 1: Pre-cache all Organizations, Classes, and Teachers ──
  const schools = await School.find(ownOrgId ? { _id: ownOrgId } : {}).lean();
  const schoolMap = new Map<string, mongoose.Types.ObjectId>();
  for (const s of schools) schoolMap.set((s as any).name.toLowerCase(), s._id);

  const classes = ownOrgId ? await ClassModel.find({ school: ownOrgId }).lean() : [];
  const classMap = new Map<string, mongoose.Types.ObjectId>();
  for (const c of classes) {
    classMap.set(((c as any).title || '').toLowerCase(), c._id);
  }

  const teachers = ownOrgId
    ? await Teacher.find({ school: ownOrgId }).populate('user', 'email').lean()
    : await Teacher.find({}).populate('user', 'email').lean();
  const teacherMap = new Map<string, mongoose.Types.ObjectId>();
  for (const t of teachers) {
    const email = ((t as any).user?.email || '').toLowerCase();
    if (email) teacherMap.set(email, t._id);
  }

  // ── Phase 2: Parse rows ──
  const errors: { row: number; message: string }[] = [];
  const courseDocs: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    const firstCell = String(Object.values(row as Record<string, any>)[0] ?? '').trim().toLowerCase();
    if (firstCell === 'course title (english)' || firstCell === 'course title') continue;

    try {
      const titleEn = String(getField(row, 'Course Title (English)', 'Course Title', 'Title') ?? '').trim();
      const categoryRaw = String(getField(row, 'Category') ?? 'quran').trim().toLowerCase();
      const levelRaw = String(getField(row, 'Level') ?? 'beginner').trim().toLowerCase();
      const schoolName = String(getField(row, 'Organization Name', 'Organization', 'School') ?? '').trim();
      const classTitle = String(getField(row, 'Class Title', 'Class') ?? '').trim();
      const teacherEmail = String(getField(row, 'Teacher Email', 'Teacher') ?? '').trim().toLowerCase();
      const durationRaw = String(getField(row, 'Duration (weeks)', 'Duration') ?? '8').trim();
      const priceRaw = String(getField(row, 'Price ($)', 'Price', 'Fee') ?? '0').trim();
      const capacityRaw = String(getField(row, 'Capacity') ?? '50').trim();
      const thumbnail = String(getField(row, 'Thumbnail URL', 'Thumbnail') ?? '').trim();

      if (!titleEn) throw new Error('Course Title (English) is required');

      const category = VALID_CATEGORIES.includes(categoryRaw) ? categoryRaw : 'quran';
      const level = VALID_LEVELS.includes(levelRaw) ? levelRaw : 'beginner';
      const duration = parseInt(durationRaw, 10) || 8;
      const fee = parseFloat(priceRaw) || 0;
      const maxStudents = parseInt(capacityRaw, 10) || 50;

      // Resolve school
      let schoolId: mongoose.Types.ObjectId | undefined = ownOrgId ? new mongoose.Types.ObjectId(ownOrgId) : undefined;
      if (!schoolId && schoolName) {
        const sid = schoolMap.get(schoolName.toLowerCase());
        if (!sid) throw new Error(`Organization "${schoolName}" not found`);
        schoolId = sid;
      }

      // Resolve class (optional)
      let classId: mongoose.Types.ObjectId | undefined;
      if (classTitle) {
        const cid = classMap.get(classTitle.toLowerCase());
        if (!cid) throw new Error(`Class "${classTitle}" not found`);
        classId = cid;
      }

      // Resolve teacher
      let teacherId: mongoose.Types.ObjectId | undefined;
      if (teacherEmail) {
        const tid = teacherMap.get(teacherEmail);
        if (!tid) throw new Error(`Teacher with email "${teacherEmail}" not found`);
        teacherId = tid;
      }

      // Slug
      const slug = titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      courseDocs.push({
        title: { en: titleEn, so: '', ar: '' },
        slug,
        description: { en: '', so: '', ar: '' },
        category,
        level,
        duration,
        fee,
        maxStudents,
        teacher: teacherId,
        school: schoolId,
        class: classId || undefined,
        thumbnail: thumbnail || undefined,
        status: 'draft',
      });
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  // ── Phase 3: BulkWrite ──
  let inserted = 0;
  if (courseDocs.length > 0) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await Course.insertMany(courseDocs, { session, ordered: false });
        inserted = result.length;
      });
    } catch (txErr: any) {
      if (txErr.insertedDocs) inserted = txErr.insertedDocs.length;
      if (txErr.writeErrors) {
        txErr.writeErrors.forEach((we: any) => {
          errors.push({ row: we.index + 2, message: we.errmsg || 'Insert error' });
        });
      }
    } finally {
      await session.endSession();
    }
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created: inserted,
    failed: errors.length,
    errors,
  }, `Imported ${inserted} of ${rows.length} courses`);
};
