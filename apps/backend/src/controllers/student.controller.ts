/**
 * Student Controller
 * Handles student-related HTTP requests:
 * CRUD operations, profile access, parent tracking,
 * attendance, results, and payment lookups.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Student from '../models/student.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import Progress from '../models/progress.model';
import CourseContent from '../models/course-content.model';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

// ---------------------------------------------------------------------------
// List Students (Admin & Teacher only)
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string | undefined;
  const approvalStatus = req.query.approvalStatus as string | undefined;
  const search = req.query.search as string | undefined;

  const filter: Record<string, unknown> = {};

  if (status && ['active', 'inactive', 'graduated', 'suspended'].includes(status)) {
    filter.status = status;
  }

  if (approvalStatus === 'approved') {
    // Match explicitly approved OR legacy students (null/undefined) who were created before this field existed
    filter.$or = [
      { approvalStatus: 'approved' },
      { approvalStatus: { $in: [null, undefined] } },
    ];
  } else if (approvalStatus === 'pending') {
    filter.approvalStatus = 'pending';
  } else if (approvalStatus === 'rejected') {
    filter.approvalStatus = 'rejected';
  }

  if (req.user?.role === 'teacher') {
    // In production, filter by teacher's assigned courses
  }

  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    (filter.$or as any[]) = (filter.$or as any[]) || [];
    (filter.$or as any[]).push({ studentId: searchRegex });
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  let allStudents: any[];
  let total: number;

  if (search) {
    const [students, count] = await Promise.all([
      Student.find(scopedFilter)
        .populate('user', 'email role isActive isVerified preferredLanguage')
        .populate('profile', 'firstName lastName avatar gender')
        .populate('parent', 'user profile')
        .populate('school', 'name')
        .populate('class', 'title section')
        .populate('enrolledCourses', 'title slug')
        .sort({ createdAt: -1 })
        .lean(),
      Student.countDocuments(scopedFilter),
    ]);

    const s = search.toLowerCase();
    const filtered = students.filter((st: any) => {
      const fullName = `${st.profile?.firstName || ''} ${st.profile?.lastName || ''}`.toLowerCase();
      const email = (st.user?.email || '').toLowerCase();
      const sid = (st.studentId || '').toLowerCase();
      return fullName.includes(s) || email.includes(s) || sid.includes(s);
    });

    total = filtered.length;
    allStudents = filtered.slice((page - 1) * limit, page * limit);
  } else {
    const [students, count] = await Promise.all([
      Student.find(scopedFilter)
        .populate('user', 'email role isActive isVerified preferredLanguage')
        .populate('profile', 'firstName lastName avatar gender')
        .populate('parent', 'user profile')
        .populate('school', 'name')
        .populate('class', 'title section')
        .populate('enrolledCourses', 'title slug')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Student.countDocuments(scopedFilter),
    ]);
    allStudents = students;
    total = count;
  }

  return ApiResponse.paginated(res, allStudents, { page, limit, total });
};

// ---------------------------------------------------------------------------
// Get Single Student
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id)
    .populate('user', 'email role isActive isVerified preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender dateOfBirth address emergencyContact')
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate('parent', 'user profile children')
    .populate('enrolledCourses', 'title slug category level status')
    .lean();

  if (!student) throw new NotFoundError('Student');

  assertOwnsOrg(req, student, 'school');

  const userId = req.user?.userId;
  const role = req.user?.role;

  if (role === 'student' && (student as any).user?._id?.toString() !== userId) {
    throw new ForbiddenError('You can only view your own profile');
  }

  if (role === 'parent') {
    const parentId = (student as any).parent?._id?.toString();
    if (!parentId) throw new ForbiddenError('You can only view your linked children');
  }

  return ApiResponse.success(res, student);
};

// ---------------------------------------------------------------------------
// Create Student (Admin only)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { email, password, firstName, lastName, gender, phone, enrollmentDate, school, classId, grade, medicalNotes, parentId, preferredLanguage } = req.body;

  const user = await User.create({
    email: email.toLowerCase(), password, role: 'student',
    phone: phone || undefined, preferredLanguage: preferredLanguage || 'en', isVerified: true,
  });

  const profile = await Profile.create({ user: user._id, firstName, lastName, gender });

  const student = await Student.create({
    user: user._id, profile: profile._id, parent: parentId || undefined,
    school: resolveOrgIdForCreate(req, school) || undefined, class: classId || undefined,
    enrollmentDate: enrollmentDate || new Date(), grade: grade || undefined, medicalNotes: medicalNotes || undefined,
  });

  const populated = await Student.findById(student._id)
    .populate('user', 'email role isActive preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender')
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate('parent', 'user profile').lean();

  return ApiResponse.created(res, populated, 'Student created successfully');
};

// ---------------------------------------------------------------------------
// Update Student (Admin only)
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new NotFoundError('Student');

  assertOwnsOrg(req, student, 'school');

  const { firstName, lastName, gender, school, classId, grade, medicalNotes, parent, enrollmentDate, status, attendancePercentage, gpa, totalFeesPaid, totalFeesDue } = req.body;

  if (firstName || lastName || gender) {
    const profileUpdate: any = {};
    if (firstName) profileUpdate.firstName = firstName;
    if (lastName) profileUpdate.lastName = lastName;
    if (gender) profileUpdate.gender = gender;
    await Profile.findByIdAndUpdate(student.profile, profileUpdate);
  }

  // org_admin can never move a student to a different organization.
  if (school !== undefined && req.user?.role !== 'org_admin') student.school = school || undefined;
  if (classId !== undefined) student.class = classId || undefined;
  if (grade !== undefined) student.grade = grade;
  if (medicalNotes !== undefined) student.medicalNotes = medicalNotes;
  if (parent !== undefined) student.parent = parent || undefined;
  if (enrollmentDate !== undefined) student.enrollmentDate = new Date(enrollmentDate);
  if (status !== undefined) student.status = status;
  if (attendancePercentage !== undefined) student.attendancePercentage = attendancePercentage;
  if (gpa !== undefined) student.gpa = gpa;
  if (totalFeesPaid !== undefined) student.totalFeesPaid = totalFeesPaid;
  if (totalFeesDue !== undefined) student.totalFeesDue = totalFeesDue;

  await student.save();

  const updated = await Student.findById(student._id)
    .populate('user', 'email role isActive isVerified preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender')
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate('parent', 'user profile')
    .populate('enrolledCourses', 'title slug');

  return ApiResponse.success(res, updated, 'Student updated successfully');
};

// ---------------------------------------------------------------------------
// Quick Status Toggle
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['active', 'inactive', 'graduated', 'suspended'].includes(status)) {
    throw new BadRequestError('Valid status required: active, inactive, graduated, or suspended');
  }

  const existing = await Student.findById(req.params.id);
  if (!existing) throw new NotFoundError('Student');
  assertOwnsOrg(req, existing, 'school');

  const student = await Student.findByIdAndUpdate(req.params.id, { status }, { new: true })
    .populate('profile', 'firstName lastName');

  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, student, `Student status updated to ${status}`);
};

// ---------------------------------------------------------------------------
// Delete Student (soft delete)
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new NotFoundError('Student');
  assertOwnsOrg(req, student, 'school');

  await User.findByIdAndUpdate(student.user, { isActive: false });
  student.status = 'inactive';
  await student.save();

  return ApiResponse.noContent(res, 'Student deleted (deactivated) successfully');
};

// ---------------------------------------------------------------------------
// Student Dashboard Summary (self-service)
// ---------------------------------------------------------------------------

export const getMyDashboard = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  await student.populate('enrolledCourses', 'title slug category level status thumbnail');

  return ApiResponse.success(res, {
    studentId: (student as any).studentId || 'N/A',
    status: (student as any).status || 'active',
    enrolledCourses: (student as any).enrolledCourses || [],
    coursesCount: (student as any).enrolledCourses?.length || 0,
    attendancePercentage: (student as any).attendancePercentage || 0,
    gpa: (student as any).gpa || 0,
    totalFeesPaid: (student as any).totalFeesPaid || 0,
    totalFeesDue: (student as any).totalFeesDue || 0,
  });
};

// ---------------------------------------------------------------------------
// Student's Enrolled Courses
// ---------------------------------------------------------------------------

export const getCourses = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id)
    .populate({ path: 'enrolledCourses', select: 'title slug description category level status teacher thumbnail', populate: { path: 'teacher', select: 'user profile' } })
    .lean();

  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, (student as any).enrolledCourses || []);
};

// ---------------------------------------------------------------------------
// Get My Courses (self)
// ---------------------------------------------------------------------------

export const getMyCourses = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const populated = await Student.findById(student._id)
    .populate({
      path: 'enrolledCourses',
      select: 'title slug description category level status teacher thumbnail duration fee maxStudents enrolledStudents',
      populate: { path: 'teacher', select: 'user profile', populate: { path: 'profile', select: 'firstName lastName' } },
    })
    .lean();

  const enrolled = (populated as any)?.enrolledCourses || [];

  // Fetch progress records for all enrolled courses
  const courseIds = enrolled.map((c: any) => c._id);
  const [progressRecords, contentRecords] = await Promise.all([
    Progress.find({ student: student._id, course: { $in: courseIds } }).lean(),
    CourseContent.find({ course: { $in: courseIds } }).select('course totalLessons totalQuizzes totalAssignments totalDuration').lean(),
  ]);

  const progressMap: Record<string, any> = {};
  for (const p of progressRecords) {
    progressMap[(p as any).course.toString()] = p;
  }

  const contentMap: Record<string, any> = {};
  for (const c of contentRecords) {
    contentMap[(c as any).course.toString()] = c;
  }

  // Merge progress and content stats into each course
  const coursesWithProgress = enrolled.map((course: any) => {
    const cid = course._id.toString();
    const prog = progressMap[cid];
    const content = contentMap[cid];
    const totalLessons = content?.totalLessons || 0;
    const totalQuizzes = content?.totalQuizzes || 0;
    const totalAssignments = content?.totalAssignments || 0;
    const totalItems = totalLessons + totalQuizzes + totalAssignments;
    const completedItems = (prog?.completedLessons || 0) + (prog?.completedQuizzes || 0) + (prog?.completedAssignments || 0);
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return {
      ...course,
      progress: {
        percent: progressPercent,
        completedLessons: prog?.completedLessons || 0,
        completedQuizzes: prog?.completedQuizzes || 0,
        completedAssignments: prog?.completedAssignments || 0,
        totalLessons,
        totalQuizzes,
        totalAssignments,
        totalItems,
        completedItems,
        status: prog?.status || 'in_progress',
        lastAccessed: prog?.lastAccessed || null,
      },
    };
  });

  return ApiResponse.success(res, coursesWithProgress);
};

// ---------------------------------------------------------------------------
// Attendance Summary
// ---------------------------------------------------------------------------

export const getAttendance = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id).select('attendancePercentage').lean();
  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, { attendancePercentage: (student as any).attendancePercentage || 0 });
};

// ---------------------------------------------------------------------------
// Results Summary
// ---------------------------------------------------------------------------

export const getResults = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id).select('gpa').lean();
  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, { gpa: (student as any).gpa || 0 });
};

// ---------------------------------------------------------------------------
// Payments Summary
// ---------------------------------------------------------------------------

export const getPayments = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id).select('totalFeesPaid totalFeesDue').lean();
  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, { totalFeesPaid: (student as any).totalFeesPaid || 0, totalFeesDue: (student as any).totalFeesDue || 0 });
};

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export const getCertificates = async (_req: Request, res: Response): Promise<Response> => {
  return ApiResponse.success(res, { certificates: [] });
};

// ---------------------------------------------------------------------------
// Bulk Import / Export (placeholders)
// ---------------------------------------------------------------------------

export const bulkImport = async (_req: Request, _res: Response): Promise<Response> => {
  throw new BadRequestError('Bulk import not yet implemented');
};

export const exportStudents = async (_req: Request, _res: Response): Promise<Response> => {
  throw new BadRequestError('Export not yet implemented');
};

// ---------------------------------------------------------------------------
// Approve / Reject Student (Admin)
// ---------------------------------------------------------------------------

export const approve = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Student.findById(req.params.id);
  if (!existing) throw new NotFoundError('Student');
  assertOwnsOrg(req, existing, 'school'); // no-op if unclaimed, blocks if already another org's

  // org_admin can only approve students INTO their own organization.
  const school = resolveOrgIdForCreate(req, req.body.school);
  const { classId } = req.body;
  if (!school) throw new BadRequestError('School is required for approval');
  if (!classId) throw new BadRequestError('Class is required for approval');

  const student = await Student.findByIdAndUpdate(
    req.params.id,
    { approvalStatus: 'approved', school, class: classId },
    { new: true }
  )
    .populate('user', 'email role isActive preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender')
    .populate('school', 'name')
    .populate('class', 'title section');

  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, student, 'Student approved successfully');
};

export const reject = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Student.findById(req.params.id);
  if (!existing) throw new NotFoundError('Student');
  assertOwnsOrg(req, existing, 'school');

  const student = await Student.findByIdAndUpdate(
    req.params.id,
    { approvalStatus: 'rejected' },
    { new: true }
  )
    .populate('user', 'email')
    .populate('profile', 'firstName lastName');

  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, student, 'Student rejected');
};

// ---------------------------------------------------------------------------
// Record Progress — POST /api/v1/students/my/progress
// ---------------------------------------------------------------------------
export const recordProgress = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, itemType } = req.body as { courseId: string; itemType: 'lesson' | 'quiz' | 'assignment' };

  if (!courseId) throw new BadRequestError('Course ID is required.');
  if (!['lesson','quiz','assignment'].includes(itemType)) throw new BadRequestError('itemType must be lesson, quiz, or assignment.');

  const student = await ensureStudentRecord(req.user!.userId);
  if (!student) throw new NotFoundError('Student record not found.');

  let progress = await Progress.findOne({ student: student._id, course: courseId });
  if (!progress) {
    const content = await CourseContent.findOne({ course: courseId });
    const total = content ? (content.totalLessons||0)+(content.totalQuizzes||0)+(content.totalAssignments||0) : 0;
    progress = await Progress.create({ student: student._id, course: courseId,
      completedLessons: itemType==='lesson'?1:0, completedQuizzes: itemType==='quiz'?1:0,
      completedAssignments: itemType==='assignment'?1:0, totalItems: total, lastAccessed: new Date(), status: 'in_progress' });
  } else {
    if (itemType==='lesson') progress.completedLessons += 1;
    else if (itemType==='quiz') progress.completedQuizzes += 1;
    else progress.completedAssignments += 1;
    const done = progress.completedLessons + progress.completedQuizzes + progress.completedAssignments;
    if (done >= progress.totalItems && progress.totalItems > 0) progress.status = 'completed';
    progress.lastAccessed = new Date();
    await progress.save();
  }
  return ApiResponse.success(res, { progress }, 'Progress recorded.');
};
