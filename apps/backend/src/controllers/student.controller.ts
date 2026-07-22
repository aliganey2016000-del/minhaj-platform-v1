/**
 * Student Controller
 * Handles student-related HTTP requests:
 * CRUD operations, profile access, parent tracking,
 * attendance, results, and payment lookups.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import Student from '../models/student.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import Parent from '../models/parent.model';
import School from '../models/school.model';
import ClassModel from '../models/class.model';
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
// Upsert-and-link a guardian (parent) for a student, correlated by phone
// number within the same tenant (school) — this is the dedup key: a family
// with several children must resolve to ONE Parent document, not one per
// enrollment. Mutates `student.parent` in place; the caller is responsible
// for persisting the student afterward.
//
// Throws BadRequestError on any failure that should block the operation
// (missing phone, missing email/password needed to provision a brand-new
// guardian login). Callers running this inside a transaction (create,
// bulkImport) let it propagate so the whole student+parent operation rolls
// back together. `update()` — not itself transactional — catches it and
// downgrades to a warning string instead, since editing an already-linked
// guardian's own credentials is a secondary concern there.
// ---------------------------------------------------------------------------

interface GuardianFields {
  guardianFullName?: string;
  guardianEmail?: string;
  guardianPassword?: string;
  guardianPhone?: string;
  guardianRelationship?: string;
}

async function syncGuardian(
  student: any,
  schoolId: unknown,
  fields: GuardianFields,
  session?: mongoose.ClientSession | null
): Promise<void> {
  const fullName = fields.guardianFullName?.trim();
  if (!fullName) return;

  const phone = fields.guardianPhone?.trim();
  if (!phone) {
    throw new BadRequestError('A guardian phone number is required to create or link a parent record.');
  }

  const email = fields.guardianEmail?.trim().toLowerCase();
  const relationshipMap: Record<string, string> = { Father: 'father', Mother: 'mother', Guardian: 'guardian', Other: 'other' };
  const relationship = relationshipMap[fields.guardianRelationship || 'Father'] || 'father';
  const [firstName, ...rest] = fullName.split(' ');
  const lastName = rest.join(' ') || firstName;

  const alreadyLinked = Boolean(student.parent);
  let parent = alreadyLinked ? await Parent.findById(student.parent).session(session ?? null) : null;

  // ── Condition A: a parent already exists for this tenant + phone —
  // reuse it, never create a duplicate Parent document. ──
  if (!parent) {
    parent = await Parent.findOne({ school: schoolId || null, phone }).session(session ?? null);
  }

  // ── Condition B: no match — provision a new guardian login + Parent. ──
  if (!parent) {
    if (!email) {
      throw new BadRequestError('A guardian email is required to create a new parent account.');
    }

    let guardianUserId: mongoose.Types.ObjectId;
    const existingUser = await User.findOne({ email }).session(session ?? null);
    if (existingUser) {
      guardianUserId = existingUser._id;
    } else {
      if (!fields.guardianPassword || fields.guardianPassword.length < 8) {
        throw new BadRequestError(`A password (min 8 characters) is required to create a new parent login for "${email}".`);
      }
      const createdUser = await User.create([{
        email, password: fields.guardianPassword, role: 'parent', organizationId: schoolId || undefined,
        phone, isVerified: true, isActive: true, preferredLanguage: 'en',
      }], { session: session ?? undefined });
      guardianUserId = createdUser[0]._id;
    }

    // The same guardian User might already have a Parent record (the
    // `user` field is unique on Parent) — reuse it rather than violate
    // that constraint.
    parent = await Parent.findOne({ user: guardianUserId }).session(session ?? null);
    if (!parent) {
      const createdProfile = await Profile.create([{ user: guardianUserId, firstName, lastName, gender: 'male' }], { session: session ?? undefined });
      const count = await Parent.countDocuments().session(session ?? null);
      const createdParent = await Parent.create([{
        user: guardianUserId, profile: createdProfile[0]._id,
        parentId: `PRN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
        school: schoolId || undefined, phone, relationship, children: [],
      }], { session: session ?? undefined });
      parent = createdParent[0];
    }
  }

  await Profile.findOneAndUpdate({ user: parent.user }, { firstName, lastName }, { session: session ?? undefined });
  parent.relationship = relationship as any;
  (parent as any).phone = phone;

  // Editing an already-linked guardian's own login (email/phone/password)
  // is best-effort and non-fatal — it must not block linking the student.
  if (alreadyLinked && (fields.guardianPhone || fields.guardianPassword || email)) {
    const guardianUser = await User.findById(parent.user).select('+password +failedLoginAttempts +lockedUntil').session(session ?? null);
    if (guardianUser) {
      guardianUser.phone = phone;
      if (fields.guardianPassword && fields.guardianPassword.length >= 8) {
        guardianUser.password = fields.guardianPassword; // pre-save hook hashes it
        guardianUser.failedLoginAttempts = 0;
        guardianUser.lockedUntil = undefined;
      }
      if (email && guardianUser.email !== email) {
        const taken = await User.exists({ email, _id: { $ne: guardianUser._id } });
        if (!taken) guardianUser.email = email;
      }
      await guardianUser.save({ session: session ?? undefined });
    }
  }

  if (!parent.children.some((c: any) => c.toString() === student._id.toString())) {
    parent.children.push(student._id);
  }
  await parent.save({ session: session ?? undefined });

  student.parent = parent._id;
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

  // No multi-document transaction — this deployment's MongoDB runs as a
  // standalone instance (no replica set), which doesn't support transactions
  // at all: session.withTransaction() throws immediately there
  // ("Transaction numbers are only allowed on a replica set member or
  // mongos"), and this call previously had no catch, so every "Add Student"
  // submission was failing with an uncaught 500. Writes run as plain
  // sequential operations instead — not atomic, but functional. If
  // syncGuardian fails it still throws (see its own doc comment), which
  // aborts here before the student row is returned to the client.
  const user = await User.create({
    email: email.toLowerCase(), password, role: 'student', organizationId: resolvedSchool,
    phone: phone || undefined, preferredLanguage: preferredLanguage || 'en', isVerified: true,
  });

  const profile = await Profile.create({ user: user._id, firstName, lastName, gender });

  // Cascade Department + Shift/Learning Mode from the selected Class —
  // stamped onto the student record so the directory table and any
  // tenant-scoped reporting never need to join back to Class for them.
  let department: string | undefined;
  let shiftMode: string | undefined;
  if (classId) {
    const classDoc = await ClassModel.findById(classId).populate('department', 'name');
    if (!classDoc) throw new NotFoundError('Class not found');
    assertOwnsOrg(req, classDoc, 'school');
    const dept = (classDoc as any).department;
    department = typeof dept === 'string' ? dept : dept?.name || undefined;
    shiftMode = classDoc.shiftMode;
  }

  const student = await Student.create({
    user: user._id, profile: profile._id, parent: parentId || undefined,
    school: resolvedSchool, class: classId || undefined, department, shiftMode,
    enrollmentDate: enrollmentDate || new Date(), grade: grade || undefined, medicalNotes: medicalNotes || undefined,
  });

  if (!parentId) {
    await syncGuardian(student, resolvedSchool, { guardianFullName, guardianEmail, guardianPassword, guardianPhone, guardianRelationship });
    if (student.isModified('parent')) await student.save();
  }

  const studentId = student._id;

  const populated = await Student.findById(studentId)
    .populate('user', 'email role isActive preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender')
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate(PARENT_POPULATE).lean();

  return ApiResponse.created(res, populated, 'Student created successfully');
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
  if (classId !== undefined) {
    student.class = classId || undefined;
    // Re-cascade Department + Shift/Learning Mode from the newly selected
    // Class — kept in sync whenever a student is moved to a different class.
    if (classId) {
      const classDoc = await ClassModel.findById(classId).populate('department', 'name');
      if (!classDoc) throw new NotFoundError('Class not found');
      assertOwnsOrg(req, classDoc, 'school');
      const dept = (classDoc as any).department;
      (student as any).department = typeof dept === 'string' ? dept : dept?.name || undefined;
      (student as any).shiftMode = classDoc.shiftMode;
    } else {
      student.department = undefined;
      student.shiftMode = undefined;
    }
  }
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

  // ── Guardian info (create/link/update the linked parent). Not run inside
  // a transaction here, so a failure is downgraded to a warning rather than
  // blocking the rest of the student update. ──
  if (guardianFullName !== undefined) {
    try {
      await syncGuardian(student, student.school, { guardianFullName, guardianEmail, guardianPassword, guardianPhone, guardianRelationship });
    } catch (err: any) {
      warning = `Student was saved, but the guardian info could not be synced (${err.message}).`;
    }
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
// GET /students/export — Export all students as formatted XLSX
// ---------------------------------------------------------------------------

export const exportStudents = async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');

  const students = await Student.find(filter)
    .populate('user', 'email')
    .populate('profile', 'firstName lastName gender')
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate(PARENT_POPULATE)
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'First Name', 'Last Name', 'Gender', 'Email', 'Password',
    'Grade / Class', 'Enrollment Date', 'Medical Notes',
    'Guardian Name', 'Guardian Email', 'Guardian Phone', 'Relationship',
  ];
  const rows = students.map((st: any) => {
    const guardianName = st.parent?.profile
      ? `${st.parent.profile.firstName || ''} ${st.parent.profile.lastName || ''}`.trim()
      : '';

    return [
      st.profile?.firstName || '',
      st.profile?.lastName || '',
      st.profile?.gender || '',
      st.user?.email || '',
      '',
      st.class ? `${st.class.title} ${st.class.section || ''}`.trim() : (st.grade || ''),
      st.enrollmentDate ? new Date(st.enrollmentDate).toISOString().slice(0, 10) : '',
      st.medicalNotes || '',
      guardianName,
      st.parent?.user?.email || '',
      st.parent?.user?.phone || '',
      st.parent?.relationship || '',
    ];
  });

  const buffer = buildXlsxBuffer(headers, rows, 'Students');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=students-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// GET /students/template — Download empty structured template (XLSX)
// ---------------------------------------------------------------------------

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = [
    'First Name', 'Last Name', 'Gender', 'Email', 'Password',
    'Grade / Class', 'Enrollment Date', 'Medical Notes',
    'Guardian Name', 'Guardian Email', 'Guardian Phone', 'Relationship',
  ];
  const rows = [[
    'Ahmed', 'Ali', 'male', 'ahmed.ali@example.com', '',
    'Quran Beginners A', '2026-01-15', '',
    'Mohamed Ali', 'parent@example.com', '+252612345678', 'Father',
  ]];
  const buffer = buildXlsxBuffer(headers, rows, 'Student Template');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=students-template.xlsx');
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// Helper: resolve fields from a spreadsheet row
// ---------------------------------------------------------------------------

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function esc(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Column titles from the student import template — used to detect a
// re-pasted header row wherever it appears in a bulk import batch, not just
// row 1 (sheet_to_json already strips the real header; this catches a
// duplicate one buried in pasted data).
const IMPORT_HEADER_TITLES = new Set([
  'first name', 'last name', 'gender', 'email', 'password',
  'grade / class', 'grade/class', 'grade', 'enrollment date', 'medical notes',
  'guardian name', 'guardian email', 'guardian phone', 'relationship',
  'school', 'organization',
]);

function looksLikeHeaderRow(cellValues: string[]): boolean {
  const matches = cellValues.filter((v) => IMPORT_HEADER_TITLES.has(v.toLowerCase())).length;
  return matches >= 2;
}

// ---------------------------------------------------------------------------
// POST /students/import — Transactional bulk import
// ---------------------------------------------------------------------------

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const ownOrgId = (resolveOrgIdForCreate(req) as string | undefined) || undefined;
  const errors: { row: number; message: string }[] = [];

  // ── Phase 1: Pre-fetch all Classes under the target tenant into an
  // in-memory map (keyed by lowercased title), so every row lookup is O(1).
  let classMap: Map<string, { classId: mongoose.Types.ObjectId; department?: string; shiftMode?: string }> = new Map();
  if (ownOrgId) {
    const allClasses = await ClassModel.find({ school: ownOrgId }).populate('department', 'name').lean();
    for (const cls of allClasses) {
      const dept = (cls as any).department;
      const deptName = typeof dept === 'string' ? dept : dept?.name || undefined;
      classMap.set((cls as any).title.toLowerCase(), {
        classId: cls._id,
        department: deptName,
        shiftMode: cls.shiftMode,
      });
    }
  }

  // ── Phase 2: Collect all unique guardian phones and batch-lookup
  // existing parents — then build an in-memory phone→parent map.
  const uniquePhones = new Set<string>();
  const parsedRows: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    // Skip fully blank rows — trailing newlines or a stray blank line from
    // the paste-import textarea must not be treated as a malformed record.
    const cellValues = Object.values(row as Record<string, any>).map((v) => String(v ?? '').trim());
    if (cellValues.every((v) => v === '')) continue;

    // Skip a re-pasted header row wherever it appears in the batch — not
    // just at row 1. Several concatenated copy-paste blocks (each starting
    // with its own header line) is common when admins build up a large
    // import by pasting multiple chunks from Excel, and a header row that
    // reaches the validation/cast stage below (e.g. "Enrollment Date" cast
    // as a Date) crashes with a confusing Mongoose error instead of being
    // silently dropped. A row counts as a header if at least two of its
    // cells verbatim-match a known column title.
    if (looksLikeHeaderRow(cellValues)) continue;

    try {
      const firstName = String(getField(row, 'First Name') ?? '').trim();
      const lastName = String(getField(row, 'Last Name') ?? '').trim();
      const gender = String(getField(row, 'Gender') ?? 'male').trim().toLowerCase();
      const email = String(getField(row, 'Email') ?? '').trim().toLowerCase();
      const password = String(getField(row, 'Password') ?? '').trim();
      const gradeClass = String(getField(row, 'Grade / Class', 'Grade/Class', 'Grade') ?? '').trim();
      const enrollmentDateRaw = String(getField(row, 'Enrollment Date') ?? '').trim();
      const medicalNotes = String(getField(row, 'Medical Notes') ?? '').trim();
      const guardianName = String(getField(row, 'Guardian Name') ?? '').trim();
      const guardianEmail = String(getField(row, 'Guardian Email') ?? '').trim().toLowerCase();
      const guardianPhone = String(getField(row, 'Guardian Phone') ?? '').trim();
      const relationship = String(getField(row, 'Relationship') ?? 'Father').trim();

      // A malformed/unparseable date must never reach Student.bulkWrite as a
      // raw JS "Invalid Date" — Mongoose's Date cast rejects it, and since
      // the batch is written with `ordered: true`, that one bad value
      // aborts every row in the transaction. Fall back to today instead.
      const parsedEnrollmentDate = enrollmentDateRaw ? new Date(enrollmentDateRaw) : new Date();
      const enrollmentDate = isNaN(parsedEnrollmentDate.getTime()) ? new Date() : parsedEnrollmentDate;

      if (!firstName || !lastName) throw new Error('First Name and Last Name are required');
      if (!email) throw new Error('Email is required');

      // Resolve organization (org_admin always gets ownOrgId; super admin
      // resolves per row but we also pre-fetch classes per school dynamically).
      let schoolId = ownOrgId;
      if (!schoolId) {
        const schoolName = String(getField(row, 'School', 'Organization') ?? '').trim();
        if (!schoolName) throw new Error('School is required for super admin');
        const school = await School.findOne({ name: new RegExp(`^${esc(schoolName)}$`, 'i') }).lean();
        if (!school) throw new Error(`School "${schoolName}" not found`);
        schoolId = school._id.toString();
      }

      // In-memory class lookup
      let classId: mongoose.Types.ObjectId | undefined;
      let department: string | undefined;
      let shiftMode: string | undefined;
      if (gradeClass && schoolId) {
        const clsEntry = classMap.get(gradeClass.toLowerCase());
        if (clsEntry) {
          classId = clsEntry.classId;
          department = clsEntry.department;
          shiftMode = clsEntry.shiftMode;
        }
      }

      const finalPassword = password || 'changeme123';
      const hashedPassword = await bcrypt.hash(finalPassword, 10);

      parsedRows.push({
        rowNum, firstName, lastName, gender: ['male', 'female'].includes(gender) ? gender : 'male',
        email, hashedPassword,
        school: schoolId ? new mongoose.Types.ObjectId(schoolId) : undefined,
        classId, department, shiftMode,
        enrollmentDate,
        medicalNotes: medicalNotes || undefined,
        guardianName,
        guardianEmail,
        guardianPassword: guardianEmail ? 'guardian123' : undefined,
        guardianPhone: guardianPhone || undefined,
        relationship: ['Father', 'Mother', 'Guardian', 'Other'].includes(relationship) ? relationship : 'Father',
      });

      if (guardianPhone) uniquePhones.add(guardianPhone);
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  // Batch-lookup existing parents by phone within the same tenant
  const parentPhoneMap = new Map<string, any>();
  if (uniquePhones.size > 0) {
    const schoolIds = parsedRows
      .map((item) => item.school?.toString())
      .filter((id): id is string => Boolean(id));
    const schoolFilter = schoolIds.length > 0 ? { school: { $in: schoolIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {};
    const existingParents = await Parent.find({
      ...schoolFilter,
      phone: { $in: Array.from(uniquePhones) },
    }).lean();
    for (const p of existingParents) {
      const parentSchoolKey = (p as any).school ? (p as any).school.toString() : 'global';
      parentPhoneMap.set(`${parentSchoolKey}:${(p as any).phone}`, p);
    }
  }

  // Assign a real Student ID to every row up front — bulkWrite's raw
  // insertOne/updateOne documents bypass the schema's studentId-generating
  // `pre('validate')` hook entirely (that hook only runs for .save()/.create()),
  // so without this every bulk-imported student would be written with
  // studentId missing, and the unique index on that field would reject the
  // second such row in any batch with a confusing E11000 instead of a clear
  // per-row error.
  const studentIdBaseCount = await Student.countDocuments();
  const currentYear = new Date().getFullYear();
  parsedRows.forEach((item, idx) => {
    item.studentId = `STU-${currentYear}-${String(studentIdBaseCount + idx + 1).padStart(4, '0')}`;
  });

  // ── Phase 3: BulkWrite operations
  // No transaction — this deployment's MongoDB is a standalone instance (no
  // replica set), which doesn't support transactions; session.withTransaction()
  // throws immediately there, and previously reported "0 imported" with no
  // explanation whenever it did (the thrown error isn't a BulkWriteError, so
  // it has no .writeErrors and nothing got surfaced). Each bulkWrite below
  // now runs as a plain (non-transactional) operation.
  let inserted = 0;
  if (parsedRows.length > 0) {
    try {
      {
        const userBulkOps: any[] = [];
        const profileBulkOps: any[] = [];
        const studentBulkOps: any[] = [];
        const parentUpdates: any[] = []; // for linking parent→child afterward
        const newParentsByPhone = new Map<string, { _id: mongoose.Types.ObjectId }>(); // dedup within batch

        for (const item of parsedRows) {
          const userId = new mongoose.Types.ObjectId();
          const profileId = new mongoose.Types.ObjectId();
          const studentId = new mongoose.Types.ObjectId();

          // User insertOne
          userBulkOps.push({
            insertOne: {
              document: {
                _id: userId, email: item.email, password: item.hashedPassword,
                role: 'student', organizationId: item.school, isVerified: true,
                isActive: true, preferredLanguage: 'en',
              },
            },
          });

          // Profile insertOne
          profileBulkOps.push({
            insertOne: {
              document: {
                _id: profileId, user: userId, firstName: item.firstName,
                lastName: item.lastName, gender: item.gender,
              },
            },
          });

          // Student upsert — matched by the studentId generated above
          // instead of a raw insertOne. If that studentId ever collides
          // with an existing record (e.g. a partially-committed earlier
          // run), this updates that record's fields instead of throwing
          // an E11000 and rolling back the entire batch.
          studentBulkOps.push({
            updateOne: {
              filter: { studentId: item.studentId },
              update: {
                $setOnInsert: { _id: studentId, studentId: item.studentId },
                $set: {
                  user: userId, profile: profileId,
                  school: item.school, class: item.classId,
                  department: item.department, shiftMode: item.shiftMode,
                  enrollmentDate: item.enrollmentDate, medicalNotes: item.medicalNotes,
                  approvalStatus: 'approved', status: 'active',
                },
              },
              upsert: true,
            },
          });

          // Handle guardian linking
          if (item.guardianName && item.guardianPhone) {
            const schoolKey = item.school?.toString() || 'global';
            const existing = parentPhoneMap.get(`${schoolKey}:${item.guardianPhone}`) || newParentsByPhone.get(`${schoolKey}:${item.guardianPhone}`);
            if (existing) {
              // Link to existing parent — push child into children array
              parentUpdates.push({
                updateOne: {
                  filter: { _id: existing._id },
                  update: { $addToSet: { children: studentId } },
                },
              });
              // Point student.parent to the existing parent
              studentBulkOps[studentBulkOps.length - 1].updateOne.update.$set.parent = existing._id;
            } else {
              // Create new parent
              const guardianUserId = new mongoose.Types.ObjectId();
              const guardianProfileId = new mongoose.Types.ObjectId();
              const guardianParentId = new mongoose.Types.ObjectId();

              const [gFirst, ...gRest] = item.guardianName.split(' ');
              const gLast = gRest.join(' ') || gFirst;

              userBulkOps.push({
                insertOne: {
                  document: {
                    _id: guardianUserId, email: item.guardianEmail || `${item.email.replace('@', '+parent@')}`,
                    password: await bcrypt.hash(item.guardianPassword || 'guardian123', 10),
                    role: 'parent', organizationId: item.school, phone: item.guardianPhone,
                    isVerified: true, isActive: true, preferredLanguage: 'en',
                  },
                },
              });

              profileBulkOps.push({
                insertOne: {
                  document: { _id: guardianProfileId, user: guardianUserId, firstName: gFirst, lastName: gLast, gender: 'male' },
                },
              });

              const relMap: Record<string, string> = { Father: 'father', Mother: 'mother', Guardian: 'guardian', Other: 'other' };
              parentUpdates.push({
                insertOne: {
                  document: {
                    _id: guardianParentId, user: guardianUserId, profile: guardianProfileId,
                    school: item.school, phone: item.guardianPhone,
                    relationship: relMap[item.relationship] || 'father',
                    children: [studentId], status: 'active',
                  },
                },
              });

              studentBulkOps[studentBulkOps.length - 1].updateOne.update.$set.parent = guardianParentId;
              newParentsByPhone.set(`${schoolKey}:${item.guardianPhone}`, { _id: guardianParentId });
            }
          }
        }

        // Execute all bulk writes
        if (userBulkOps.length > 0) await User.bulkWrite(userBulkOps, { ordered: true });
        if (profileBulkOps.length > 0) await Profile.bulkWrite(profileBulkOps, { ordered: true });
        if (studentBulkOps.length > 0) {
          // These are `updateOne` upserts now, not `insertOne`s — a brand
          // new student surfaces under `upsertedCount`; `insertedCount`
          // would always read 0 for this op type.
          const result = await Student.bulkWrite(studentBulkOps, { ordered: true });
          inserted = result.upsertedCount + result.modifiedCount;
        }
        if (parentUpdates.length > 0) await Parent.bulkWrite(parentUpdates, { ordered: false });
      }
    } catch (txErr: any) {
      if (txErr.writeErrors) {
        txErr.writeErrors.forEach((we: any) => {
          errors.push({ row: we.index + 2, message: we.errmsg || 'Insert error' });
        });
      } else {
        errors.push({ row: 0, message: txErr.message || 'Import failed.' });
      }
    }
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created: inserted,
    failed: errors.length,
    errors,
  }, `Imported ${inserted} of ${rows.length} students`);
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
