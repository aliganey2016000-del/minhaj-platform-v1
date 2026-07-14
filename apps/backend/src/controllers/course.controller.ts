/**
 * Course Controller
 * Handles course-related HTTP requests:
 * CRUD operations, enrollment, listing.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Course from '../models/course.model';
import Student from '../models/student.model';
import '../models/teacher.model'; // Register Teacher model for population
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

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

  const scopedFilter = applyOrgFilter(req, filter, 'school');

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
    'startDate', 'endDate', 'thumbnail',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  // org_admin can never move a course to a different organization.
  if (req.user?.role === 'org_admin') delete updates.school;

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

  let enrolledIds: string[] = [];
  if (req.user?.userId) {
    try {
      const student = await ensureStudentRecord(req.user.userId);
      enrolledIds = (student.enrolledCourses || []).map((id: any) => id.toString());
    } catch {
      // If student record can't be created (e.g. no profile), just show no enrollments
      enrolledIds = [];
    }
  }

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