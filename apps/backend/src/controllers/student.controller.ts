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
import Parent from '../models/parent.model';
import Progress from '../models/progress.model';
import CourseContent from '../models/course-content.model';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import ensureStudentRecord from '../utils/ensure-student';
import Course from '../models/course.model';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate, assertCanAccessStudent, getOwnTeacherRecord } from '../utils/tenant-scope';

// Nested-populate the guardian's actual email/phone/name — a shallow
// `.populate(PARENT_POPULATE)` leaves those as raw ObjectIds, which
// left the Manage Students edit form unable to show the existing guardian.
const PARENT_POPULATE = {
  path: 'parent',
  select: 'user profile relationship children',
  populate: [
    { path: 'user', select: 'email phone' },
    { path: 'profile', select: 'firstName lastName' },
  ],
};

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
    // Assigned-only access — only students enrolled in one of this
    // teacher's own courses.
    const teacher = await getOwnTeacherRecord(req);
    const teacherCourseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    filter.enrolledCourses = { $in: teacherCourseIds };
  }

  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    (filter.$or as any[]) = (filter.$or as any[]) || [];
    (filter.$or as any[]).push({ studentId: searchRegex });
  }

  // org_admin can never widen the filter to another org via ?school=; their
  // own organization always wins (applied below, after the client's value).
  const school = req.query.school as string | undefined;
  if (school && req.user?.role !== 'org_admin') {
    filter.school = school;
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  let allStudents: any[];
  let total: number;

  if (search) {
    const [students, count] = await Promise.all([
      Student.find(scopedFilter)
        .populate('user', 'email role isActive isVerified preferredLanguage')
        .populate('profile', 'firstName lastName avatar gender')
        .populate(PARENT_POPULATE)
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
        .populate(PARENT_POPULATE)
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
    .populate(PARENT_POPULATE)
    .populate('enrolledCourses', 'title slug category level status')
    .lean();

  if (!student) throw new NotFoundError('Student');

  await assertCanAccessStudent(req, student);

  return ApiResponse.success(res, student);
};

// ---------------------------------------------------------------------------
// Link/sync a guardian (parent) for a student — creates the parent's User +
// Parent record on first use, or updates the already-linked one. Isolated
// from the caller's own error handling: a guardian-sync problem must never
// block the student create/update itself, so this returns a warning string
// instead of throwing.
// ---------------------------------------------------------------------------

interface GuardianFields {
  guardianFullName?: string;
  guardianEmail?: string;
  guardianPassword?: string;
  guardianPhone?: string;
  guardianRelationship?: string;
}

async function syncGuardian(student: any, schoolId: unknown, fields: GuardianFields): Promise<string | null> {
  const fullName = fields.guardianFullName?.trim();
  if (!fullName) return null;

  const email = fields.guardianEmail?.trim().toLowerCase();
  const relationshipMap: Record<string, string> = { Father: 'father', Mother: 'mother', Guardian: 'guardian', Other: 'other' };
  const relationship = relationshipMap[fields.guardianRelationship || 'Father'] || 'father';
  const [firstName, ...rest] = fullName.split(' ');
  const lastName = rest.join(' ') || firstName;

  try {
    let parent = student.parent ? await Parent.findById(student.parent) : null;

    if (!parent) {
      if (!email) return null; // nothing to link a new guardian to
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        parent = await Parent.findOne({ user: existingUser._id });
        if (!parent) {
          const profile = await Profile.create({ user: existingUser._id, firstName, lastName, gender: 'male' });
          const count = await Parent.countDocuments();
          parent = await Parent.create({
            user: existingUser._id, profile: profile._id,
            parentId: `PRN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
            school: schoolId || undefined, relationship, children: [],
          });
        }
      } else {
        if (!fields.guardianPassword || fields.guardianPassword.length < 8) {
          return `Guardian info was not saved: a password (min 8 characters) is required to create a new parent login for "${email}".`;
        }
        const newUser = await User.create({
          email, password: fields.guardianPassword, role: 'parent', organizationId: schoolId || undefined,
          phone: fields.guardianPhone || undefined, isVerified: true, isActive: true, preferredLanguage: 'en',
        });
        const profile = await Profile.create({ user: newUser._id, firstName, lastName, gender: 'male' });
        const count = await Parent.countDocuments();
        parent = await Parent.create({
          user: newUser._id, profile: profile._id,
          parentId: `PRN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
          school: schoolId || undefined, relationship, children: [],
        });
      }
    }

    if (!parent) return null;

    await Profile.findOneAndUpdate({ user: parent.user }, { firstName, lastName });
    parent.relationship = relationship as any;

    const needsUserUpdate = Boolean(fields.guardianPhone || fields.guardianPassword || email);
    if (needsUserUpdate) {
      const guardianUser = await User.findById(parent.user).select('+password +failedLoginAttempts +lockedUntil');
      if (guardianUser) {
        if (fields.guardianPhone) guardianUser.phone = fields.guardianPhone;

        if (fields.guardianPassword) {
          if (fields.guardianPassword.length < 8) {
            return 'Guardian info saved, but the password was not changed — it must be at least 8 characters.';
          }
          guardianUser.password = fields.guardianPassword; // pre-save hook hashes it
          guardianUser.failedLoginAttempts = 0;
          guardianUser.lockedUntil = undefined;
        }

        if (email && guardianUser.email !== email) {
          const taken = await User.exists({ email, _id: { $ne: guardianUser._id } });
          if (taken) return `Guardian info saved, but the email was not changed — "${email}" is already used by another account.`;
          guardianUser.email = email;
        }

        await guardianUser.save();
      }
    }

    if (!parent.children.some((c: any) => c.toString() === student._id.toString())) {
      parent.children.push(student._id);
    }
    await parent.save();

    student.parent = parent._id;
    return null;
  } catch (err: any) {
    console.error('[student.syncGuardian] Failed:', err);
    return `Student was saved, but the guardian info could not be synced (${err.message}).`;
  }
}

// ---------------------------------------------------------------------------
// Create Student (Admin only)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const {
    email, password, firstName, lastName, gender, phone, enrollmentDate, school, classId, grade, medicalNotes, parentId, preferredLanguage,
    guardianFullName, guardianEmail, guardianPassword, guardianPhone, guardianRelationship,
  } = req.body;

  const resolvedSchool = resolveOrgIdForCreate(req, school) || undefined;

  const user = await User.create({
    email: email.toLowerCase(), password, role: 'student', organizationId: resolvedSchool,
    phone: phone || undefined, preferredLanguage: preferredLanguage || 'en', isVerified: true,
  });

  const profile = await Profile.create({ user: user._id, firstName, lastName, gender });

  const student = await Student.create({
    user: user._id, profile: profile._id, parent: parentId || undefined,
    school: resolvedSchool, class: classId || undefined,
    enrollmentDate: enrollmentDate || new Date(), grade: grade || undefined, medicalNotes: medicalNotes || undefined,
  });

  let guardianWarning: string | null = null;
  if (!parentId) {
    guardianWarning = await syncGuardian(student, resolvedSchool, { guardianFullName, guardianEmail, guardianPassword, guardianPhone, guardianRelationship });
    if (student.isModified('parent')) await student.save();
  }

  const populated = await Student.findById(student._id)
    .populate('user', 'email role isActive preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender')
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate(PARENT_POPULATE).lean();

  return ApiResponse.created(res, populated, guardianWarning || 'Student created successfully');
};

// ---------------------------------------------------------------------------
// Update Student (Admin only)
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new NotFoundError('Student');

  assertOwnsOrg(req, student, 'school');

  const {
    firstName, lastName, gender, school, classId, grade, medicalNotes, parent, enrollmentDate, status, attendancePercentage, gpa, totalFeesPaid, totalFeesDue,
    email, password, guardianFullName, guardianEmail, guardianPassword, guardianPhone, guardianRelationship,
  } = req.body;

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

  // ── Student's own login (email / password reset) ──
  let warning: string | null = null;
  if (email || password) {
    const studentUser = await User.findById(student.user).select('+password +failedLoginAttempts +lockedUntil');
    if (studentUser) {
      if (email) {
        const normalized = String(email).toLowerCase().trim();
        if (normalized !== studentUser.email) {
          const taken = await User.exists({ email: normalized, _id: { $ne: studentUser._id } });
          if (taken) throw new ConflictError(`"${normalized}" is already used by another account.`);
          studentUser.email = normalized;
        }
      }
      if (password) {
        if (String(password).length < 8) throw new BadRequestError('Password must be at least 8 characters');
        studentUser.password = password; // pre-save hook hashes it
        studentUser.failedLoginAttempts = 0;
        studentUser.lockedUntil = undefined;
      }
      await studentUser.save();
    }
  }

  // ── Guardian info (create/link/update the linked parent) ──
  if (guardianFullName !== undefined) {
    warning = await syncGuardian(student, student.school, { guardianFullName, guardianEmail, guardianPassword, guardianPhone, guardianRelationship });
  }

  await student.save();

  const updated = await Student.findById(student._id)
    .populate('user', 'email role isActive isVerified preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender')
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate(PARENT_POPULATE)
    .populate('enrolledCourses', 'title slug');

  return ApiResponse.success(res, updated, warning || 'Student updated successfully');
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
  await student.populate('school', 'name logo');
  await student.populate('profile', 'firstName lastName avatar gender');

  return ApiResponse.success(res, {
    studentId: (student as any).studentId || 'N/A',
    status: (student as any).status || 'active',
    enrolledCourses: (student as any).enrolledCourses || [],
    coursesCount: (student as any).enrolledCourses?.length || 0,
    attendancePercentage: (student as any).attendancePercentage || 0,
    gpa: (student as any).gpa || 0,
    totalFeesPaid: (student as any).totalFeesPaid || 0,
    totalFeesDue: (student as any).totalFeesDue || 0,
    totalFees: (student as any).totalFees || 0,
    discount: (student as any).discount || 0,
    profile: (student as any).profile || null,
    school: (student as any).school || null,
  });
};

// ---------------------------------------------------------------------------
// Student's Enrolled Courses
// ---------------------------------------------------------------------------

export const getCourses = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id)
    .populate({ path: 'enrolledCourses', select: 'title slug description category level status teacher thumbnail meetingLink isLive accessMode', populate: { path: 'teacher', select: 'user profile' } })
    .lean();

  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);
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
      select: 'title slug description category level status teacher thumbnail duration fee maxStudents enrolledStudents meetingLink isLive accessMode',
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
  const student = await Student.findById(req.params.id).select('attendancePercentage school user enrolledCourses').lean();
  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);
  return ApiResponse.success(res, { attendancePercentage: (student as any).attendancePercentage || 0 });
};

// ---------------------------------------------------------------------------
// Results Summary
// ---------------------------------------------------------------------------

export const getResults = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id).select('gpa school user enrolledCourses').lean();
  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);
  return ApiResponse.success(res, { gpa: (student as any).gpa || 0 });
};

// ---------------------------------------------------------------------------
// Payments Summary
// ---------------------------------------------------------------------------

export const getPayments = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id).select('totalFeesPaid totalFeesDue school user enrolledCourses').lean();
  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);
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
