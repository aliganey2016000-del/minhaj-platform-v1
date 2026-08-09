/**
 * Course Controller
 * Handles course-related HTTP requests:
 * CRUD operations, enrollment, listing.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import Course from '../models/course.model';
import CourseCategory from '../models/course-category.model';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import Student from '../models/student.model';
import School from '../models/school.model';
import ClassModel from '../models/class.model';
import Teacher from '../models/teacher.model';
import User from '../models/user.model';
import Exam from '../models/exam.model';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate, getOwnTeacherRecord } from '../utils/tenant-scope';
import { moveToTrash } from '../utils/trash';

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
  const school = req.query.school as string | undefined;
  if (school) (filter as any).school = school;

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
      .populate('school', 'name attendanceType')
      .populate({ path: 'class', select: 'title section' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Course.countDocuments(scopedFilter),
  ]);

  // For class-based organizations, the course's own `enrolledStudents`
  // counter only tracks individual course enrollment — but attendance for
  // these orgs is actually rostered off the whole Class (see
  // getEnrolledStudents), so the dropdown/label shown to admins would say
  // "1 enrolled" while Take Attendance lists 26 students. Compute the real
  // roster size per class so callers can display a number that matches
  // what Take Attendance will actually show.
  const classBasedClassIds = [
    ...new Set(
      courses
        .filter((c: any) => c.school?.attendanceType === 'class_based' && c.class?._id)
        .map((c: any) => c.class._id.toString())
    ),
  ];
  let classRosterCounts: Record<string, number> = {};
  if (classBasedClassIds.length > 0) {
    const counts = await Student.aggregate([
      { $match: { class: { $in: classBasedClassIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: '$class', count: { $sum: 1 } } },
    ]);
    classRosterCounts = Object.fromEntries(counts.map((c: any) => [c._id.toString(), c.count]));
  }

  const withEffectiveEnrolled = courses.map((c: any) => ({
    ...c,
    effectiveEnrolled:
      c.school?.attendanceType === 'class_based' && c.class?._id
        ? classRosterCounts[c.class._id.toString()] || 0
        : c.enrolledStudents,
  }));

  return ApiResponse.paginated(res, withEffectiveEnrolled, { page, limit, total });
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
    .populate({
      path: 'class',
      select: 'title section department',
      populate: { path: 'department', select: 'name' },
    })
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

  const resolvedSchool = resolveOrgIdForCreate(req, school) || null;
  if (category && resolvedSchool) {
    const categoryExists = await CourseCategory.exists({ school: resolvedSchool, slug: String(category).toLowerCase() });
    if (!categoryExists) throw new BadRequestError(`Category "${category}" does not exist for this organization`);
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
    school: resolvedSchool,
    class: classId || null,
    maxStudents,
    syllabus: syllabus || [],
    prerequisites: prerequisites || [],
    status: 'draft',
  });

  // Every course gets a Mid Exam and a Final Exam shell right away — no
  // date/time, auto-scheduled per student off course progress (see
  // exam-attempt.controller.ts isEligibleForAutoScheduledExam) — so a
  // teacher can start writing each paper's questions immediately instead
  // of an admin having to remember to manually schedule these first.
  // Best-effort: a hiccup here must never fail course creation itself.
  try {
    await Exam.create([
      {
        title: 'Mid Exam', course: course._id, school: course.school || null,
        duration: 60, totalMarks: 100, passingMarks: 50,
        autoSchedule: true, milestone: 'mid', createdBy: req.user!.userId,
      },
      {
        title: 'Final Exam', course: course._id, school: course.school || null,
        duration: 60, totalMarks: 100, passingMarks: 50,
        autoSchedule: true, milestone: 'final', createdBy: req.user!.userId,
      },
    ]);
  } catch (err) {
    // Was a silent catch — a validation failure here left the course
    // created with no Mid/Final Exam and zero trace of why. Log it so a
    // real bug doesn't look identical to "not deployed yet".
    console.error(`❌ Failed to auto-create Mid/Final exams for course ${course._id}:`, err);
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

  if (updates.category) {
    const schoolForCategory = updates.school || existing.school;
    if (schoolForCategory) {
      const categoryExists = await CourseCategory.exists({ school: schoolForCategory, slug: String(updates.category).toLowerCase() });
      if (!categoryExists) throw new BadRequestError(`Category "${updates.category}" does not exist for this organization`);
    }
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

  // No meetingLink required anymore — the live classroom is an embedded
  // Jitsi room keyed off the course's own id (see frontend jitsi-room.tsx),
  // not a stored external link. meetingLink is kept only for courses still
  // using an external Google Meet link.

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

  const enrolledStudents = await Student.find({ enrolledCourses: existing._id }).select('_id').lean();

  await moveToTrash({
    entityType: 'Course',
    label: existing.title?.en || 'Course',
    school: existing.school,
    snapshots: [{ modelName: 'Course', data: existing.toObject() }],
    restoreMeta: { enrolledStudentIds: enrolledStudents.map((s) => s._id) },
    req,
  });

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
  // Callers (Take Attendance, exam results) need the FULL roster to mark
  // every student, not a paginated slice — the old default of 20 silently
  // cut off classes/courses with more students than that (e.g. a 26-student
  // class-based roster only showing its first 20 in the attendance list).
  const limit = parseInt(req.query.limit as string) || 1000;

  const course = await Course.findById(req.params.id).select('school teacher class');
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');
  await assertOwnsCourseIfTeacher(req, course);

  // Class-based organizations auto-roster every student in the course's
  // Class for attendance, instead of requiring individual course enrollment.
  const school = course.school ? await School.findById(course.school).select('attendanceType').lean() : null;
  const isClassBased = school?.attendanceType === 'class_based' && !!course.class;

  const studentFilter = isClassBased
    ? { class: course.class }
    : { enrolledCourses: req.params.id };

  const students = await Student.find(studentFilter)
    .populate('user', 'email role isActive')
    .populate('profile', 'firstName lastName avatar')
    .populate('class', 'title section')
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Student.countDocuments(studentFilter);

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

// A course is scoped to (organization, department, grade level) — NEVER to
// a section, a batch/cohort, or one specific academic year's Class
// document. "Grade 2 in Department X" is the same curriculum slot every
// year; a course assigned to it belongs to whichever cohort currently
// fills that grade, not to the one Class document that existed when the
// course was created. A student who has reached grade N has, by
// definition, also already passed through every grade below N, so their
// eligible classes are every class in their own department with
// gradeLevel <= their current one — regardless of section, academicYear,
// or batch, and regardless of whether THIS student's own promotion chain
// happens to have a recorded predecessor at every grade (test/seed data
// can have gaps; a plain numeric comparison doesn't depend on that chain
// being unbroken the way walking `promotedTo` backward would).
//
// By default Browse Courses only shows the student's CURRENT grade — a
// student in Grade 12 shouldn't be handed 40+ courses spanning Grade 1
// through 12 on every visit. `includeEarlierGrades` widens the scope to
// every earlier grade too, for the explicit "show earlier grades" toggle.
// A grade the student hasn't reached yet is excluded either way
// (gradeLevel > current never matches).
async function resolveEligibleClassIds(
  currentClassId: mongoose.Types.ObjectId | string | null | undefined,
  schoolId: unknown,
  includeEarlierGrades: boolean
): Promise<mongoose.Types.ObjectId[]> {
  if (!currentClassId) return [];

  const currentClass = await ClassModel.findById(currentClassId).select('department gradeLevel').lean();
  if (!currentClass) return [];
  if (currentClass.gradeLevel === null || currentClass.gradeLevel === undefined) {
    // No grade level set on this class — can't safely compare "at or
    // before" without one, so fall back to exact-class matching only.
    return [new mongoose.Types.ObjectId(currentClassId)];
  }

  const eligible = await ClassModel.find({
    school: schoolId,
    department: currentClass.department,
    gradeLevel: includeEarlierGrades ? { $lte: currentClass.gradeLevel, $ne: null } : currentClass.gradeLevel,
  }).select('_id').lean();

  return eligible.map((c) => c._id);
}

// Lets the frontend label the "show earlier grades" toggle with an
// accurate count up front, without fetching those courses first.
async function countEarlierGradeCourses(currentClassId: mongoose.Types.ObjectId | string | null | undefined, schoolId: unknown): Promise<number> {
  if (!currentClassId) return 0;
  const currentClass = await ClassModel.findById(currentClassId).select('department gradeLevel').lean();
  if (!currentClass || currentClass.gradeLevel === null || currentClass.gradeLevel === undefined) return 0;

  const earlierClassIds = await ClassModel.find({
    school: schoolId, department: currentClass.department, gradeLevel: { $lt: currentClass.gradeLevel, $ne: null },
  }).select('_id').lean();
  if (earlierClassIds.length === 0) return 0;

  return Course.countDocuments({ school: schoolId, status: 'published', class: { $in: earlierClassIds.map((c) => c._id) } });
}

export const getAvailableCourses = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 12));
  const category = req.query.category as string | undefined;
  const level = req.query.level as string | undefined;
  const search = req.query.search as string | undefined;
  const includeEarlierGrades = req.query.includeEarlierGrades === 'true';

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
  let earlierGradesCount: number | undefined;
  if (student) {
    filter.school = (student as any).school || null;
    const eligibleClassIds = await resolveEligibleClassIds((student as any).class || null, filter.school, includeEarlierGrades);
    filter.class = { $in: [...eligibleClassIds, null] };
    if (!includeEarlierGrades) {
      earlierGradesCount = await countEarlierGradeCourses((student as any).class || null, filter.school);
    }
  }

  // `class` is a reference, so its gradeLevel can't be sorted on directly
  // via `.find().sort()`. When earlier grades are included, courses should
  // read as a natural progression (Grade 1, then 2, then 3...) rather than
  // creation-date order, which jumbles every grade together. Resolve the
  // full matching ID list ordered by grade first (electives with no class
  // sort last), THEN paginate that ordered list, so ordering stays correct
  // across pages instead of only within whatever page happened to load.
  const orderedMatches = await Course.find(filter).select('_id class').populate('class', 'gradeLevel').sort({ createdAt: -1 }).lean();
  orderedMatches.sort((a: any, b: any) => {
    const gA = a.class?.gradeLevel ?? Number.MAX_SAFE_INTEGER;
    const gB = b.class?.gradeLevel ?? Number.MAX_SAFE_INTEGER;
    return gA - gB;
  });
  const total = orderedMatches.length;
  const pageIds = orderedMatches.slice((page - 1) * limit, (page - 1) * limit + limit).map((c: any) => c._id);
  const pageOrder = new Map(pageIds.map((id, i) => [String(id), i]));

  const coursesUnordered = await Course.find({ _id: { $in: pageIds } })
    .populate({
      path: 'teacher',
      select: 'teacherId profile',
      populate: { path: 'profile', select: 'firstName lastName' },
    })
    .populate('school', 'name')
    .populate({ path: 'class', select: 'title section gradeLevel' })
    .select('title slug description category level duration fee teacher maxStudents enrolledStudents thumbnail status startDate school class')
    .lean();
  const courses = coursesUnordered.sort((a: any, b: any) => (pageOrder.get(String(a._id)) ?? 0) - (pageOrder.get(String(b._id)) ?? 0));

  const enrolledIds: string[] = student
    ? (student.enrolledCourses || []).map((id: any) => id.toString())
    : [];

  const coursesWithStatus = courses.map((c: any) => ({ ...c, isEnrolled: enrolledIds.includes(c._id.toString()) }));
  return ApiResponse.paginated(res, coursesWithStatus, { page, limit, total }, undefined, { earlierGradesCount });
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

  const headers = [
    'Course Title (English)', 'Category', 'Level', 'Organization Name',
    'Class Title', 'Teacher Email', 'Duration (weeks)', 'Price ($)',
    'Capacity', 'Thumbnail URL',
  ];
  const rows = courses.map((c: any) => [
    c.title?.en || '', c.category || '', c.level || '',
    c.school?.name || '', c.class ? `${c.class.title} ${c.class.section || ''}`.trim() : '',
    c.teacher?.user?.email || '', c.duration || 8, c.fee || 0,
    c.maxStudents || 50, c.thumbnail || '',
  ]);

  const buffer = buildXlsxBuffer(headers, rows, 'Courses');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=courses-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// GET /courses/template — Download empty structured template (XLSX)
// ---------------------------------------------------------------------------

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = [
    'Course Title (English)', 'Category', 'Level', 'Organization Name',
    'Class Title', 'Teacher Email', 'Duration (weeks)', 'Price ($)',
    'Capacity', 'Thumbnail URL',
  ];
  const rows = [[
    'Quran Recitation', 'quran', 'beginner', 'Madrasa Al-Noor',
    'Quran Beginners A', 'teacher@example.com', '8', '0',
    '50', '',
  ]];
  const buffer = buildXlsxBuffer(headers, rows, 'Course Template');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=courses-template.xlsx');
  res.end(buffer);
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

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

  // `slug` is globally unique (not scoped per organization — see
  // course.model.ts), so a re-import of the same file (e.g. after fixing a
  // typo'd teacher email in the spreadsheet) must resolve each row's slug
  // against every existing course, not just this org's. Rows whose
  // title+class combination already produced a course update it in place
  // instead of colliding on the unique index — see Phase 2 below.
  const existingCourses = await Course.find({}).select('slug school').lean();
  const slugMap = new Map<string, { id: mongoose.Types.ObjectId; school: mongoose.Types.ObjectId }>();
  for (const c of existingCourses) slugMap.set((c as any).slug, { id: c._id, school: (c as any).school });

  const teachers = ownOrgId
    ? await Teacher.find({ school: ownOrgId }).populate('user', 'email').lean()
    : await Teacher.find({}).populate('user', 'email').lean();
  const teacherMap = new Map<string, mongoose.Types.ObjectId>();
  for (const t of teachers) {
    const email = ((t as any).user?.email || '').toLowerCase();
    if (email) teacherMap.set(email, t._id);
  }

  // Categories are per-organization now — keyed by `${schoolId}:${slug}` so
  // a super-admin import spanning multiple orgs can't cross-match another
  // school's category of the same name.
  const categories = ownOrgId ? await CourseCategory.find({ school: ownOrgId }).lean() : await CourseCategory.find({}).lean();
  const categoryMap = new Set<string>();
  for (const c of categories) categoryMap.add(`${(c as any).school.toString()}:${(c as any).slug}`);

  // ── Phase 1.5: Auto-create any category a row references that doesn't
  // exist yet for its organization — collected once per distinct
  // (school, slug) pair first, so a category shared by many rows (the
  // common case) is created once, not once per row. A row whose
  // organization can't be resolved is skipped here; Phase 2 reports that
  // row's own "Organization not found" error instead.
  const missingCategories = new Map<string, { school: mongoose.Types.ObjectId; slug: string; name: string }>();
  for (const row of rows) {
    const firstCell = String(Object.values(row as Record<string, any>)[0] ?? '').trim().toLowerCase();
    if (firstCell === 'course title (english)' || firstCell === 'course title') continue;

    const categoryRaw = String(getField(row, 'Category') ?? '').trim().toLowerCase();
    if (!categoryRaw) continue;

    const schoolName = String(getField(row, 'Organization Name', 'Organization', 'School') ?? '').trim();
    let schoolId: mongoose.Types.ObjectId | undefined = ownOrgId ? new mongoose.Types.ObjectId(ownOrgId) : undefined;
    if (!schoolId && schoolName) schoolId = schoolMap.get(schoolName.toLowerCase());
    if (!schoolId) continue;

    const key = `${schoolId.toString()}:${categoryRaw}`;
    if (categoryMap.has(key) || missingCategories.has(key)) continue;
    const name = categoryRaw.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    missingCategories.set(key, { school: schoolId, slug: categoryRaw, name });
  }

  if (missingCategories.size > 0) {
    try {
      await CourseCategory.insertMany(
        Array.from(missingCategories.values()).map((c) => ({ name: c.name, slug: c.slug, school: c.school })),
        { ordered: false }
      );
    } catch {
      // A concurrent import or a name/slug collision on a subset — the ones
      // that did succeed still need to be usable below, and any that
      // didn't will surface as this row's own error in Phase 2 instead.
    }
    for (const key of missingCategories.keys()) categoryMap.add(key);
  }

  // ── Phase 2: Parse rows ──
  const errors: { row: number; message: string }[] = [];
  const courseDocs: any[] = [];
  // Parallel to courseDocs — insertMany's writeErrors report an index into
  // that array, not the original spreadsheet row, since rows that became
  // updates or failed validation above are never added to it.
  const courseDocRowNums: number[] = [];
  const updateOps: { filter: any; update: any; rowNum: number }[] = [];
  const seenSlugsThisBatch = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    const firstCell = String(Object.values(row as Record<string, any>)[0] ?? '').trim().toLowerCase();
    if (firstCell === 'course title (english)' || firstCell === 'course title') continue;

    try {
      const titleEn = String(getField(row, 'Course Title (English)', 'Course Title', 'Title') ?? '').trim();
      const categoryRaw = String(getField(row, 'Category') ?? '').trim().toLowerCase();
      const levelRaw = String(getField(row, 'Level') ?? 'beginner').trim().toLowerCase();
      const schoolName = String(getField(row, 'Organization Name', 'Organization', 'School') ?? '').trim();
      const classTitle = String(getField(row, 'Class Title', 'Class') ?? '').trim();
      const teacherEmail = String(getField(row, 'Teacher Email', 'Teacher') ?? '').trim().toLowerCase();
      const durationRaw = String(getField(row, 'Duration (weeks)', 'Duration') ?? '8').trim();
      const priceRaw = String(getField(row, 'Price ($)', 'Price', 'Fee') ?? '0').trim();
      const capacityRaw = String(getField(row, 'Capacity') ?? '50').trim();
      const thumbnail = String(getField(row, 'Thumbnail URL', 'Thumbnail') ?? '').trim();

      if (!titleEn) throw new Error('Course Title (English) is required');

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
      if (!schoolId) throw new Error('Organization is required');

      // Resolve category — auto-created above (Phase 1.5) from this same
      // row's value when it didn't already exist, so this only ever throws
      // for a row whose organization couldn't be resolved (never silently
      // falls back to an unrelated existing category like the old "quran"
      // default used to — that's how mislabeled rows went unnoticed).
      if (!categoryRaw) throw new Error('Category is required');
      if (!categoryMap.has(`${schoolId.toString()}:${categoryRaw}`)) {
        throw new Error(`Category "${categoryRaw}" could not be resolved for this organization`);
      }
      const category = categoryRaw;

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

      // Slug — the same subject re-taught in a different class (very common
      // in these spreadsheets: "Quran Studies" once per grade/section) must
      // not collide on the globally-unique slug index, so the class title
      // disambiguates it. A row whose (title, class) already resolves to an
      // existing course is treated as an update to that course (teacher,
      // fee, etc. re-synced) instead of a doomed duplicate insert — this is
      // what makes re-uploading the same file after fixing one column, like
      // a wrong teacher email, actually apply the fix instead of failing
      // every row with a duplicate-key error.
      const baseSlug = slugify(titleEn);
      const slug = classTitle ? `${baseSlug}-${slugify(classTitle)}` : baseSlug;

      const fields = {
        category, level, duration, fee, maxStudents,
        teacher: teacherId,
        thumbnail: thumbnail || undefined,
      };

      const existing = slugMap.get(slug);
      if (existing) {
        if (String(existing.school) !== String(schoolId)) {
          throw new Error(`A course with slug "${slug}" already exists in a different organization`);
        }
        updateOps.push({ filter: { _id: existing.id }, update: { $set: fields }, rowNum });
      } else if (seenSlugsThisBatch.has(slug)) {
        throw new Error(`Duplicate course "${titleEn}"${classTitle ? ` for class "${classTitle}"` : ''} — already appears earlier in this file`);
      } else {
        seenSlugsThisBatch.add(slug);
        courseDocRowNums.push(rowNum);
        courseDocs.push({
          title: { en: titleEn, so: '', ar: '' },
          slug,
          description: { en: '', so: '', ar: '' },
          ...fields,
          school: schoolId,
          class: classId || undefined,
          status: 'draft',
        });
      }
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  // ── Phase 3: BulkWrite ──
  // No transaction — this deployment's MongoDB is a standalone instance
  // (no replica set), which doesn't support transactions at all;
  // session.withTransaction() throws immediately there, and every prior
  // "successful" import under that code path inserted zero documents.
  let inserted = 0;
  if (courseDocs.length > 0) {
    try {
      const result = await Course.insertMany(courseDocs, { ordered: false });
      inserted = result.length;
    } catch (txErr: any) {
      if (txErr.insertedDocs) inserted = txErr.insertedDocs.length;
      if (txErr.writeErrors) {
        txErr.writeErrors.forEach((we: any) => {
          errors.push({ row: courseDocRowNums[we.index] ?? 0, message: we.err?.errmsg || we.errmsg || 'Insert error' });
        });
      } else if (inserted === 0) {
        errors.push({ row: 0, message: txErr.message || 'Import failed.' });
      }
    }
  }

  let updated = 0;
  if (updateOps.length > 0) {
    try {
      const result = await Course.bulkWrite(
        updateOps.map((op) => ({ updateOne: { filter: op.filter, update: op.update } })),
        { ordered: false }
      );
      updated = result.modifiedCount || 0;
    } catch (txErr: any) {
      errors.push({ row: 0, message: txErr.message || 'Failed to update existing courses.' });
    }
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created: inserted,
    updated,
    failed: errors.length,
    errors,
  }, `Imported ${inserted} new and updated ${updated} existing course(s) of ${rows.length} rows`);
};
