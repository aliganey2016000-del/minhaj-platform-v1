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
import { moveToTrash, moveManyToTrash } from '../utils/trash';
import { syncStudentCourseEnrollment, reassignStudentClassCourses } from '../services/enrollment.service';

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
// Shared "which students match the current list filters" scoping — used by
// both getAll (paginated list) and bulkRemove's selectAll path (must resolve
// the exact same set the list screen shows, so "select all" never diverges
// from what's on screen). Only the Mongo-level filter is shared; matching
// against populated user/profile fields (search-by-name/email) still needs
// a second in-memory pass at each call site, since those aren't stored on
// the Student document itself.
// ---------------------------------------------------------------------------

const STUDENT_DEPARTMENTS = ['Primary', 'Middle School', 'Secondary'];
const STUDENT_SHIFTS = ['Morning', 'Afternoon', 'Evening', 'Virtual'];
const STUDENT_STATUSES = ['active', 'inactive', 'graduated', 'suspended'];
const STUDENT_APPROVALS = ['approved', 'pending', 'rejected'];

// Comma-separated query param -> trimmed, non-empty values (multi-select
// column filters send several values this way, e.g. "Morning,Evening").
function parseMultiValue(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

async function buildStudentScopedFilter(
  req: Request,
  params: { status?: string; approvalStatus?: string; search?: string; school?: string; department?: string; shiftMode?: string; classId?: string }
): Promise<Record<string, unknown>> {
  const { status, approvalStatus, search, school, department, shiftMode, classId } = params;
  const filter: Record<string, unknown> = {};
  // Two independent OR-groups (approval + search) can both be active at
  // once — each needs its own $or, ANDed together, rather than flattened
  // into one shared $or (which previously meant "approved OR studentId
  // matches search", silently widening results instead of narrowing them
  // whenever both were set at the same time).
  const andClauses: Record<string, unknown>[] = [];

  const statusValues = parseMultiValue(status).filter((v) => STUDENT_STATUSES.includes(v));
  if (statusValues.length > 0) filter.status = { $in: statusValues };

  const departmentValues = parseMultiValue(department).filter((v) => STUDENT_DEPARTMENTS.includes(v));
  if (departmentValues.length > 0) filter.department = { $in: departmentValues };

  const shiftValues = parseMultiValue(shiftMode).filter((v) => STUDENT_SHIFTS.includes(v));
  if (shiftValues.length > 0) filter.shiftMode = { $in: shiftValues };

  const classValues = parseMultiValue(classId);
  if (classValues.length > 0) filter.class = { $in: classValues.map((id) => new mongoose.Types.ObjectId(id)) };

  const approvalValues = parseMultiValue(approvalStatus).filter((v) => STUDENT_APPROVALS.includes(v));
  if (approvalValues.length > 0) {
    const orClauses: Record<string, unknown>[] = [];
    for (const v of approvalValues) {
      if (v === 'approved') {
        // Match explicitly approved OR legacy students (null/undefined) who were created before this field existed
        orClauses.push({ approvalStatus: 'approved' }, { approvalStatus: { $in: [null, undefined] } });
      } else {
        orClauses.push({ approvalStatus: v });
      }
    }
    andClauses.push({ $or: orClauses });
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
    andClauses.push({ $or: [{ studentId: searchRegex }] });
  }

  if (andClauses.length > 0) filter.$and = andClauses;

  // org_admin can never widen the filter to another org via ?school=; their
  // own organization always wins (applied below, after the client's value).
  if (school && req.user?.role !== 'org_admin') {
    filter.school = school;
  }

  return applyOrgFilter(req, filter, 'school');
}

// ---------------------------------------------------------------------------
// List Students (Admin & Teacher only)
// ---------------------------------------------------------------------------

// Only fields stored directly on the Student document are sortable —
// populated/joined fields (profile name, school name, class title) would
// need an aggregation pipeline to sort by, which this endpoint doesn't do.
const STUDENT_SORT_FIELDS = new Set(['studentId', 'enrollmentDate', 'department', 'shiftMode', 'status', 'approvalStatus', 'createdAt']);

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string | undefined;
  const approvalStatus = req.query.approvalStatus as string | undefined;
  const search = req.query.search as string | undefined;
  const school = req.query.school as string | undefined;
  const department = req.query.department as string | undefined;
  const shiftMode = req.query.shiftMode as string | undefined;
  const classId = req.query.classId as string | undefined;

  const sortByRaw = req.query.sortBy as string | undefined;
  const sortField = sortByRaw && STUDENT_SORT_FIELDS.has(sortByRaw) ? sortByRaw : 'createdAt';
  const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir };

  const scopedFilter = await buildStudentScopedFilter(req, { status, approvalStatus, search, school, department, shiftMode, classId });

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
        .sort(sort)
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
        .sort(sort)
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
// GET /students/stats — Aggregate counts for the Manage Students dashboard
// (status, gender, per-class, per-department, per-organization) — scoped by
// the same tenant rules as getAll, via applyOrgFilter.
// ---------------------------------------------------------------------------

interface StudentStatsResult {
  total: number;
  byStatus: { active: number; inactive: number; graduated: number; suspended: number };
  byGender: { gender: string; count: number }[];
  byClass: { classId: string | null; label: string; count: number }[];
  byDepartment: { department: string; count: number }[];
  byOrganization: { schoolId: string | null; name: string; count: number }[];
  byShift: { shift: string; count: number }[];
  enrollmentTrend: { month: string; count: number }[];
}

// Shared by getStats (Manage Students summary) and the analytics report
// page's Excel export, so the two can never quietly report different numbers.
async function computeStudentStats(req: Request): Promise<StudentStatsResult> {
  const scopedFilter = applyOrgFilter(req, {}, 'school') as Record<string, unknown>;

  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const teacherCourseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    scopedFilter.enrolledCourses = { $in: teacherCourseIds };
  }

  // applyOrgFilter puts an org_admin's organizationId in as the plain string
  // pulled off the JWT. Student.find()/countDocuments() auto-cast that
  // through Mongoose's query layer, but a raw .aggregate() $match does NOT —
  // an uncast string never equals the stored ObjectId, so every breakdown
  // below would silently match zero students for an org_admin while `total`
  // (countDocuments) still reported the real count. Cast explicitly for the
  // aggregation pipelines only.
  const aggregateMatch: Record<string, unknown> = { ...scopedFilter };
  const schoolFilter = aggregateMatch.school as { $in?: unknown[] } | undefined;
  if (schoolFilter && Array.isArray(schoolFilter.$in)) {
    aggregateMatch.school = { $in: schoolFilter.$in.map((v) => (v ? new mongoose.Types.ObjectId(v as string) : null)) };
  }

  // Enrollment trend covers the trailing 12 months (inclusive of the
  // current one) so the report's line chart has a fixed, predictable
  // x-axis regardless of how sparse a given month's enrollments are.
  const trendStart = new Date();
  trendStart.setMonth(trendStart.getMonth() - 11);
  trendStart.setDate(1);
  trendStart.setHours(0, 0, 0, 0);

  const [
    statusCounts,
    genderCounts,
    classCounts,
    departmentCounts,
    organizationCounts,
    shiftCounts,
    enrollmentTrendRows,
    total,
  ] = await Promise.all([
    Student.aggregate([
      { $match: aggregateMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Student.aggregate([
      { $match: aggregateMatch },
      { $lookup: { from: 'profiles', localField: 'profile', foreignField: '_id', as: 'profile' } },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$profile.gender', count: { $sum: 1 } } },
    ]),
    Student.aggregate([
      { $match: aggregateMatch },
      { $lookup: { from: 'classes', localField: 'class', foreignField: '_id', as: 'class' } },
      { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$class._id', title: { $first: '$class.title' }, section: { $first: '$class.section' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Student.aggregate([
      { $match: aggregateMatch },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Student.aggregate([
      { $match: aggregateMatch },
      { $lookup: { from: 'schools', localField: 'school', foreignField: '_id', as: 'school' } },
      { $unwind: { path: '$school', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$school._id', name: { $first: '$school.name' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Student.aggregate([
      { $match: aggregateMatch },
      { $group: { _id: '$shiftMode', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Student.aggregate([
      { $match: { ...aggregateMatch, enrollmentDate: { $gte: trendStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$enrollmentDate' } }, count: { $sum: 1 } } },
    ]),
    Student.countDocuments(scopedFilter),
  ]);

  const asStatusMap = (rows: any[]): StudentStatsResult['byStatus'] => {
    const map = { active: 0, inactive: 0, graduated: 0, suspended: 0 };
    rows.forEach((r) => { if (r._id && r._id in map) map[r._id as keyof typeof map] = r.count; });
    return map;
  };

  // Fill every trailing month with 0 so the chart never has gaps for months
  // with no enrollments — the aggregation above only returns months that
  // actually have at least one matching student.
  const trendByMonth = new Map<string, number>(enrollmentTrendRows.map((r: any) => [r._id as string, r.count as number]));
  const enrollmentTrend: { month: string; count: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(trendStart);
    d.setMonth(d.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    enrollmentTrend.push({ month: key, count: trendByMonth.get(key) || 0 });
  }

  return {
    total,
    byStatus: asStatusMap(statusCounts),
    byGender: genderCounts.map((r: any) => ({ gender: r._id || 'unspecified', count: r.count })),
    byClass: classCounts.map((r: any) => ({
      classId: r._id ? r._id.toString() : null,
      label: r._id ? `${r.title || ''} ${r.section || ''}`.trim() : 'Unassigned',
      count: r.count,
    })),
    byDepartment: departmentCounts.map((r: any) => ({ department: r._id || 'Unspecified', count: r.count })),
    byOrganization: organizationCounts.map((r: any) => ({
      schoolId: r._id ? r._id.toString() : null,
      name: r.name || 'Unassigned',
      count: r.count,
    })),
    byShift: shiftCounts.map((r: any) => ({ shift: r._id || 'Unspecified', count: r.count })),
    enrollmentTrend,
  };
}

export const getStats = async (req: Request, res: Response): Promise<Response> => {
  const stats = await computeStudentStats(req);
  return ApiResponse.success(res, stats);
};

// ---------------------------------------------------------------------------
// GET /students/report/export — Excel export of the analytics report (the
// aggregated breakdowns), distinct from GET /students/export which exports
// the raw per-student roster.
// ---------------------------------------------------------------------------

export const exportReport = async (req: Request, res: Response): Promise<void> => {
  const stats = await computeStudentStats(req);

  const headers = ['Category', 'Label', 'Count'];
  const rows: (string | number)[][] = [
    ['Total', 'Total Students', stats.total],
    ...Object.entries(stats.byStatus).map(([status, count]) => ['Status', status[0].toUpperCase() + status.slice(1), count]),
    ...stats.byGender.map((r) => ['Gender', r.gender, r.count]),
    ...stats.byDepartment.map((r) => ['Department', r.department, r.count]),
    ...stats.byClass.map((r) => ['Class', r.label, r.count]),
    ...stats.byOrganization.map((r) => ['Organization', r.name, r.count]),
    ...stats.byShift.map((r) => ['Shift', r.shift, r.count]),
    ...stats.enrollmentTrend.map((r) => ['Enrollment Trend', r.month, r.count]),
  ];

  const buffer = buildXlsxBuffer(headers, rows, 'Student Report');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=student-analytics-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
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
    studentId, email, password, firstName, lastName, gender, phone, enrollmentDate, school, classId, grade, medicalNotes, parentId, preferredLanguage,
    guardianFullName, guardianEmail, guardianPassword, guardianPhone, guardianRelationship,
  } = req.body;

  const resolvedSchool = resolveOrgIdForCreate(req, school) || undefined;

  // Optional — leave blank to let the model's pre-validate hook auto-generate
  // one (STU-YYYY-NNNN). If supplied, it only has to be unique within this
  // organization (see the compound index on Student), not platform-wide.
  let customStudentId: string | undefined;
  if (studentId && String(studentId).trim()) {
    customStudentId = String(studentId).trim().toUpperCase();
    const duplicate = await Student.findOne({ school: resolvedSchool, studentId: customStudentId }).lean();
    if (duplicate) throw new ConflictError(`Student ID "${customStudentId}" is already used in this organization.`);
  }

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
    studentId: customStudentId,
  });

  if (!parentId) {
    await syncGuardian(student, resolvedSchool, { guardianFullName, guardianEmail, guardianPassword, guardianPhone, guardianRelationship });
    if (student.isModified('parent')) await student.save();
  }

  // Grant access to the class's existing courses immediately — without this,
  // a new student's enrolledCourses stays empty and they see zero courses
  // and get ForbiddenError'd out of quizzes/assignments for their own class.
  if (classId) await syncStudentCourseEnrollment(student._id as mongoose.Types.ObjectId, classId);

  const newStudentDocId = student._id;

  const populated = await Student.findById(newStudentDocId)
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
    studentId, firstName, lastName, gender, school, classId, grade, medicalNotes, parent, enrollmentDate, status, attendancePercentage, gpa,
    email, password, guardianFullName, guardianEmail, guardianPassword, guardianPhone, guardianRelationship,
  } = req.body;
  // totalFeesPaid/totalFeesDue are intentionally NOT accepted here — they're
  // a cache derived only from the student's Invoices (billing.service.ts
  // recalcStudentBalance), never writable directly. See totalFees/discount
  // below for the legacy/display-only fields that ARE still editable.

  // Admin-editable — a school may want to align this with its own paper
  // records. Still only has to be unique within the student's organization.
  if (studentId !== undefined) {
    const trimmed = String(studentId).trim().toUpperCase();
    if (!trimmed) throw new BadRequestError('Student ID cannot be empty');
    if (trimmed !== student.studentId) {
      const duplicate = await Student.findOne({ school: student.school, studentId: trimmed, _id: { $ne: student._id } }).lean();
      if (duplicate) throw new ConflictError(`Student ID "${trimmed}" is already used in this organization.`);
      student.studentId = trimmed;
    }
  }

  if (firstName || lastName || gender) {
    const profileUpdate: any = {};
    if (firstName) profileUpdate.firstName = firstName;
    if (lastName) profileUpdate.lastName = lastName;
    if (gender) profileUpdate.gender = gender;
    await Profile.findByIdAndUpdate(student.profile, profileUpdate);
  }

  // Cross-organization student transfer is NOT supported by this ordinary
  // edit endpoint, for ANY role — including the global `admin`, who would
  // otherwise be able to move a student's `school` here with nothing else
  // kept in sync: User.organizationId (set once at account creation,
  // src/controllers/student.controller.ts ~line 547, never resynced),
  // Parent linkage, and any other tenant-linked field all stay pointed at
  // the old org. A student's own login DOES re-resolve their JWT's
  // organizationId fresh from Student.school every time (see
  // auth.controller.ts resolveEffectiveOrganization), so that one field
  // isn't itself a live session leak — but the rest genuinely would drift,
  // and enumerating/patching every such field here would be exactly the
  // kind of piecemeal fix that's easy to get wrong. If this becomes a real
  // requirement, it needs a dedicated, reviewed transfer workflow that
  // moves school + class + every tenant-linked field + enrollment
  // together in one coordinated step — not a side effect of this endpoint.
  // Only blocks an actual TRANSFER (student already has a real school, and
  // this would change it to a different one). Assigning a school for the
  // first time to a student who doesn't have one yet — the same
  // "unclaimed, not another tenant's data" case tenant-scope.ts's own
  // assertOwnsOrg already treats specially — is unaffected; that's what
  // approve() already does for a self-registered student, and this keeps
  // an equivalent first-time assignment usable via the ordinary edit form.
  if (school !== undefined) {
    if (student.school && String(school || '') !== String(student.school)) {
      throw new BadRequestError(
        "Changing a student's organization is not supported here. This requires a dedicated cross-organization transfer workflow, which does not exist yet."
      );
    }
    // org_admin still never assigns this field at all (even a first-time
    // assignment) — unchanged from the original behavior; only a global
    // admin performing a genuine first-time assignment (or a same-value
    // no-op) reaches here.
    if (req.user?.role !== 'org_admin') student.school = school || undefined;
  }

  const previousClassId = student.class ? student.class.toString() : undefined;
  let classChanged = false;
  if (classId !== undefined) {
    classChanged = String(classId || '') !== String(previousClassId || '');
    student.class = classId || undefined;
    // Re-cascade Department + Shift/Learning Mode from the newly selected
    // Class — kept in sync whenever a student is moved to a different class.
    if (classId) {
      const classDoc = await ClassModel.findById(classId).populate('department', 'name');
      if (!classDoc) throw new NotFoundError('Class not found');
      // Validates the CALLER may access the target class's org (org_admin
      // gets ForbiddenError otherwise) — same guard used everywhere else a
      // class is assigned (create(), approve()). This alone is NOT enough:
      // it's a no-op for the global `admin` role (unscoped by design), so
      // it can't be trusted to also prove the class belongs to THIS
      // student's own organization.
      assertOwnsOrg(req, classDoc, 'school');
      // Belt-and-suspenders: student.school can no longer change in this
      // same request (rejected above), so this should be unreachable in
      // practice — kept as an explicit, role-independent invariant check
      // rather than relying solely on the guard above never having a gap.
      if (String(classDoc.school) !== String(student.school || '')) {
        throw new BadRequestError('Target class does not belong to this student\'s organization.');
      }
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

  // Only after the class field itself has actually saved — keeps a
  // mid-update validation failure elsewhere from leaving course links
  // reassigned while the class change itself didn't take effect.
  if (classChanged) {
    await reassignStudentClassCourses(student._id as mongoose.Types.ObjectId, previousClassId, classId || undefined);
  }

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
// Delete Student — moves the Student + their User + Profile into Trash
// (same app-wide pattern as Parent/Teacher/Class/Course/School), then
// removes them from the live collections. Restorable from the Trash page.
// Unlinks from the parent's `children` list on delete; restore re-links it.
// ---------------------------------------------------------------------------

async function deleteStudentToTrash(studentId: string, req: Request): Promise<void> {
  const student = await Student.findById(studentId);
  if (!student) throw new NotFoundError('Student');
  assertOwnsOrg(req, student, 'school');

  const [userDoc, profileDoc] = await Promise.all([
    // +password: `select: false` on the schema, but the snapshot must carry
    // it or a restore fails Mongoose's `required` validation on User.
    student.user ? User.findById(student.user).select('+password') : null,
    student.profile ? Profile.findById(student.profile) : null,
  ]);
  const label = profileDoc ? `${profileDoc.firstName} ${profileDoc.lastName}`.trim() || student.studentId : student.studentId;

  await moveToTrash({
    entityType: 'Student',
    label,
    school: student.school,
    snapshots: [
      ...(userDoc ? [{ modelName: 'User', data: userDoc.toObject() }] : []),
      ...(profileDoc ? [{ modelName: 'Profile', data: profileDoc.toObject() }] : []),
      { modelName: 'Student', data: student.toObject() },
    ],
    restoreMeta: { parentId: student.parent || null },
    req,
  });

  if (student.parent) {
    await Parent.updateMany({ _id: student.parent }, { $pull: { children: student._id } });
  }

  await Promise.all([
    student.user ? User.findByIdAndDelete(student.user) : null,
    student.profile ? Profile.findByIdAndDelete(student.profile) : null,
    Student.findByIdAndDelete(student._id),
  ]);
}

export const remove = async (req: Request, res: Response): Promise<Response> => {
  await deleteStudentToTrash(req.params.id, req);
  return ApiResponse.noContent(res, 'Student moved to Trash');
};

// ---------------------------------------------------------------------------
// DELETE /students/bulk — body: { ids: string[] } or { selectAll: true, filters }
// Resolves every matching student in ONE query, then does a single Trash
// insertMany + parent-unlink updateMany + three deleteMany calls, instead of
// looping deleteStudentToTrash per id. A few-hundred-row batch through the
// per-id loop (several sequential round trips each) was slow enough against
// the remote Atlas cluster to blow past the browser/proxy request timeout;
// this collapses it to a handful of queries regardless of batch size.
// ---------------------------------------------------------------------------

export const bulkRemove = async (req: Request, res: Response): Promise<Response> => {
  let ids: string[];

  if (req.body?.selectAll === true) {
    // "Select all matching filters" — resolve the same set the list screen
    // shows, server-side, instead of requiring the client to enumerate ids.
    const filters = (req.body?.filters || {}) as { status?: string; approvalStatus?: string; search?: string; school?: string };
    const scopedFilter = await buildStudentScopedFilter(req, filters);

    if (filters.search) {
      const candidates = await Student.find(scopedFilter)
        .select('_id studentId')
        .populate('profile', 'firstName lastName')
        .populate('user', 'email')
        .lean();
      const s = filters.search.toLowerCase();
      ids = (candidates as any[]).filter((st) => {
        const fullName = `${st.profile?.firstName || ''} ${st.profile?.lastName || ''}`.toLowerCase();
        const email = (st.user?.email || '').toLowerCase();
        const sid = (st.studentId || '').toLowerCase();
        return fullName.includes(s) || email.includes(s) || sid.includes(s);
      }).map((st) => String(st._id));
    } else {
      const matches = await Student.find(scopedFilter).select('_id').lean();
      ids = matches.map((m) => String(m._id));
    }

    if (ids.length === 0) {
      return ApiResponse.success(res, { moved: 0, matched: 0 }, 'No matching students to delete');
    }
  } else {
    ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
    if (ids.length === 0) throw new BadRequestError('At least one student id is required');
  }

  const students = await Student.find({ _id: { $in: ids } });
  const foundIds = new Set(students.map((s) => String(s._id)));
  const notFoundIds = ids.filter((id) => !foundIds.has(id));

  const allowed: (typeof students)[number][] = [];
  const forbiddenIds: string[] = [];
  for (const s of students) {
    try {
      assertOwnsOrg(req, s, 'school');
      allowed.push(s);
    } catch {
      forbiddenIds.push(String(s._id));
    }
  }

  const results: { id: string; success: boolean; error?: string }[] = [
    ...notFoundIds.map((id) => ({ id, success: false, error: 'Not found' })),
    ...forbiddenIds.map((id) => ({ id, success: false, error: 'Not permitted' })),
  ];

  if (allowed.length > 0) {
    const userIds = allowed.map((s) => s.user).filter(Boolean);
    const profileIds = allowed.map((s) => s.profile).filter(Boolean);
    const [users, profiles] = await Promise.all([
      // +password: `select: false` on the schema, but the snapshot must
      // carry it or a restore fails Mongoose's `required` validation on User.
      User.find({ _id: { $in: userIds } }).select('+password'),
      Profile.find({ _id: { $in: profileIds } }),
    ]);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));

    const trashEntries = allowed.map((s) => {
      const userDoc = s.user ? userById.get(String(s.user)) : undefined;
      const profileDoc = s.profile ? profileById.get(String(s.profile)) : undefined;
      const label = profileDoc ? `${profileDoc.firstName} ${profileDoc.lastName}`.trim() || s.studentId : s.studentId;
      return {
        entityType: 'Student' as const,
        label,
        school: s.school,
        snapshots: [
          ...(userDoc ? [{ modelName: 'User', data: userDoc.toObject() }] : []),
          ...(profileDoc ? [{ modelName: 'Profile', data: profileDoc.toObject() }] : []),
          { modelName: 'Student', data: s.toObject() },
        ],
        restoreMeta: { parentId: s.parent || null },
      };
    });

    await moveManyToTrash(trashEntries, req);

    const parentIds = allowed.map((s) => s.parent).filter(Boolean);
    const allowedStudentIds = allowed.map((s) => s._id);
    await Promise.all([
      parentIds.length > 0
        ? Parent.updateMany({ _id: { $in: parentIds } }, { $pull: { children: { $in: allowedStudentIds } } })
        : Promise.resolve(null),
      userIds.length > 0 ? User.deleteMany({ _id: { $in: userIds } }) : Promise.resolve(null),
      profileIds.length > 0 ? Profile.deleteMany({ _id: { $in: profileIds } }) : Promise.resolve(null),
      Student.deleteMany({ _id: { $in: allowedStudentIds } }),
    ]);

    results.push(...allowed.map((s) => ({ id: String(s._id), success: true })));
  }

  const moved = allowed.length;
  return ApiResponse.success(res, { results, moved }, `Moved ${moved} of ${ids.length} student(s) to Trash`);
};

// ---------------------------------------------------------------------------
// Student Dashboard Summary (self-service)
// ---------------------------------------------------------------------------

export const getMyDashboard = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  await student.populate('enrolledCourses', 'title slug category level status thumbnail');
  await student.populate('school', 'name logo');
  await student.populate('profile', 'firstName lastName avatar gender');
  await student.populate('class', 'title section');

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
    class: (student as any).class || null,
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
    CourseContent.find({ course: { $in: courseIds } }).select('course totalLessons totalQuizzes totalAssignments totalExams totalDuration').lean(),
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
    const totalExams = content?.totalExams || 0;
    const totalItems = totalLessons + totalQuizzes + totalAssignments + totalExams;
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
        totalExams,
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

  // Column-for-column with the Add/Edit Student form and the import
  // template — "Class Name" + "Section" are the two halves of the same
  // "Class *" dropdown there (a Class is only unique by title+section), and
  // "Grade" is the separate free-text field, not a stand-in for Class.
  const headers = [
    'Student ID', 'First Name', 'Last Name', 'Gender', 'Email', 'Password',
    'Organization', 'Class Name', 'Section', 'Grade', 'Enrollment Date', 'Medical Notes',
    'Guardian Name', 'Guardian Email', 'Guardian Password', 'Guardian Phone', 'Relationship',
  ];
  const rows = students.map((st: any) => {
    const guardianName = st.parent?.profile
      ? `${st.parent.profile.firstName || ''} ${st.parent.profile.lastName || ''}`.trim()
      : '';

    return [
      st.studentId || '',
      st.profile?.firstName || '',
      st.profile?.lastName || '',
      st.profile?.gender || '',
      st.user?.email || '',
      '',
      st.school?.name || '',
      st.class?.title || '',
      st.class?.section || '',
      st.grade || '',
      st.enrollmentDate ? new Date(st.enrollmentDate).toISOString().slice(0, 10) : '',
      st.medicalNotes || '',
      guardianName,
      st.parent?.user?.email || '',
      '',
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
//
// "Organization" is only actually required for a true super admin (role
// 'admin') — an org_admin's own tenant always wins regardless of what's in
// this column (see resolveOrgIdForCreate), so org_admins can leave it blank.
// ---------------------------------------------------------------------------

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  // Column-for-column with the Add/Edit Student form, so a completed
  // template needs no follow-up manual editing per student: "Class Name" +
  // "Section" together identify the exact Class (the same "Class *"
  // dropdown there is only unique by title+section — matching a row on
  // title alone could silently land it in the wrong section), and "Grade"
  // is the separate free-text field, not a stand-in for Class.
  const headers = [
    'Student ID', 'First Name', 'Last Name', 'Gender', 'Email', 'Password',
    'Organization', 'Class Name', 'Section', 'Grade', 'Enrollment Date', 'Medical Notes',
    'Guardian Name', 'Guardian Email', 'Guardian Password', 'Guardian Phone', 'Relationship',
  ];
  // Student ID, Guardian Password and Grade are optional — Student ID left
  // blank auto-generates (STU-YYYY-NNNN); Guardian Password left blank
  // defaults to "guardian123"; Class Name + Section are required (a row
  // without a matching Class is rejected, same as the form).
  const rows = [[
    '', 'Ahmed', 'Ali', 'male', 'ahmed.ali@example.com', '',
    'Madrasa Al-Noor', 'Grade 3', 'A', '', '2026-01-15', '',
    'Mohamed Ali', 'parent@example.com', '', '+252612345678', 'Father',
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
  'student id', 'first name', 'last name', 'gender', 'email', 'password',
  'class name', 'section', 'grade / class', 'grade/class', 'grade', 'enrollment date', 'medical notes',
  'guardian name', 'guardian email', 'guardian password', 'guardian phone', 'relationship',
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

  // ── Phase 1: Class lookups — keyed by "title::section" (a Class is only
  // unique by that pair; matching on title alone could silently land a
  // student in the wrong section when a grade has more than one). Fetched
  // once per organization and cached, since a super-admin file can span
  // several different schools across its rows.
  const classMapByOrg = new Map<string, Map<string, { classId: mongoose.Types.ObjectId; department?: string; shiftMode?: string }>>();
  async function getClassMap(orgId: string) {
    let map = classMapByOrg.get(orgId);
    if (!map) {
      map = new Map();
      const allClasses = await ClassModel.find({ school: orgId }).populate('department', 'name').lean();
      for (const cls of allClasses) {
        const dept = (cls as any).department;
        const deptName = typeof dept === 'string' ? dept : dept?.name || undefined;
        map.set(`${(cls as any).title.toLowerCase()}::${(cls.section || '').toLowerCase()}`, {
          classId: cls._id,
          department: deptName,
          shiftMode: cls.shiftMode,
        });
      }
      classMapByOrg.set(orgId, map);
    }
    return map;
  }

  // ── Phase 2: Collect all unique guardian phones and batch-lookup
  // existing parents — then build an in-memory phone→parent map.
  const uniquePhones = new Set<string>();
  const seenEmails = new Set<string>();
  // Custom Student IDs seen so far in this batch, keyed by school — a row's
  // ID only has to avoid collisions with other students in the SAME
  // organization, matching the compound unique index on Student.
  const seenStudentIdsBySchool = new Map<string, Set<string>>();
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
      const studentIdRaw = String(getField(row, 'Student ID', 'StudentID', 'Student Id') ?? '').trim().toUpperCase();
      const firstName = String(getField(row, 'First Name') ?? '').trim();
      const lastName = String(getField(row, 'Last Name') ?? '').trim();
      const gender = String(getField(row, 'Gender') ?? 'male').trim().toLowerCase();
      const email = String(getField(row, 'Email') ?? '').trim().toLowerCase();
      const password = String(getField(row, 'Password') ?? '').trim();
      const className = String(getField(row, 'Class Name', 'Class') ?? '').trim();
      const section = String(getField(row, 'Section') ?? '').trim();
      const gradeRaw = String(getField(row, 'Grade') ?? '').trim();
      const enrollmentDateRaw = String(getField(row, 'Enrollment Date') ?? '').trim();
      const medicalNotes = String(getField(row, 'Medical Notes') ?? '').trim();
      const guardianName = String(getField(row, 'Guardian Name') ?? '').trim();
      const guardianEmail = String(getField(row, 'Guardian Email') ?? '').trim().toLowerCase();
      const guardianPasswordRaw = String(getField(row, 'Guardian Password') ?? '').trim();
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
      if (password && password.length < 8) throw new Error('Password must be at least 8 characters');
      if (guardianPasswordRaw && guardianPasswordRaw.length < 8) throw new Error('Guardian Password must be at least 8 characters');
      if (!className) throw new Error('Class Name is required');
      if (!section) throw new Error('Section is required');

      // Reject a duplicate email BEFORE it reaches the bulkWrite stage —
      // without this check, a single already-registered email (extremely
      // common when re-testing the same import file) reached
      // User.bulkWrite's ordered:true batch and aborted every other row
      // in the same import, reporting "0 imported" for an otherwise
      // entirely valid 300-row file. Checked against both the database and
      // this batch's own earlier rows (a duplicate pasted twice would
      // otherwise still collide inside the same bulkWrite call).
      if (seenEmails.has(email)) throw new Error(`Email "${email}" is duplicated elsewhere in this import`);
      const existingUser = await User.findOne({ email }).lean();
      if (existingUser) throw new Error(`Email "${email}" is already registered`);
      seenEmails.add(email);

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

      // Custom Student ID — optional. If given, it only needs to be unique
      // within this row's own organization (batch-level + DB checks).
      if (studentIdRaw) {
        const schoolKey = schoolId || 'global';
        const seenSet = seenStudentIdsBySchool.get(schoolKey) || new Set<string>();
        if (seenSet.has(studentIdRaw)) throw new Error(`Student ID "${studentIdRaw}" is duplicated elsewhere in this import`);
        const dupInDb = await Student.findOne({ school: schoolId, studentId: studentIdRaw }).lean();
        if (dupInDb) throw new Error(`Student ID "${studentIdRaw}" is already used in this organization`);
        seenSet.add(studentIdRaw);
        seenStudentIdsBySchool.set(schoolKey, seenSet);
      }

      // Class lookup — required, same as the "Class *" dropdown on the Add
      // Student form. A row that names a class which doesn't exist yet is
      // rejected outright rather than silently creating the student without
      // one (the old behavior here is exactly what forced admins to open
      // every imported student afterward and assign a class by hand).
      const clsMap = await getClassMap(schoolId);
      const clsEntry = clsMap.get(`${className.toLowerCase()}::${section.toLowerCase()}`);
      if (!clsEntry) throw new Error(`Class "${className} — Section ${section}" not found in this organization`);
      const classId = clsEntry.classId;
      const department = clsEntry.department;
      const shiftMode = clsEntry.shiftMode;

      const finalPassword = password || 'changeme123';
      const hashedPassword = await bcrypt.hash(finalPassword, 10);

      parsedRows.push({
        rowNum, studentId: studentIdRaw || undefined, firstName, lastName, gender: ['male', 'female'].includes(gender) ? gender : 'male',
        email, hashedPassword,
        school: schoolId ? new mongoose.Types.ObjectId(schoolId) : undefined,
        classId, department, shiftMode, grade: gradeRaw || undefined,
        enrollmentDate,
        medicalNotes: medicalNotes || undefined,
        guardianName,
        guardianEmail,
        guardianPassword: guardianEmail ? (guardianPasswordRaw || 'guardian123') : undefined,
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

  // Assign a real Student ID to every row that didn't bring its own —
  // bulkWrite's raw insertOne/updateOne documents bypass the schema's
  // studentId-generating `pre('validate')` hook entirely (that hook only
  // runs for .save()/.create()), so without this every such row would be
  // written with studentId missing, and the unique index would reject the
  // second such row in any batch with a confusing E11000 instead of a clear
  // per-row error. Counted per-school (like the model hook) so each
  // organization gets its own independent sequence, and checked against
  // `seenStudentIdsBySchool` so a generated ID never collides with one a
  // row in this same batch explicitly requested.
  const currentYear = new Date().getFullYear();
  const schoolCounterCache = new Map<string, number>();
  for (const item of parsedRows) {
    if (item.studentId) continue;
    const schoolKey = item.school ? item.school.toString() : 'global';
    if (!schoolCounterCache.has(schoolKey)) {
      const count = await Student.countDocuments(item.school ? { school: item.school } : {});
      schoolCounterCache.set(schoolKey, count);
    }
    const seenSet = seenStudentIdsBySchool.get(schoolKey) || new Set<string>();
    let seq = schoolCounterCache.get(schoolKey)! + 1;
    let candidate = `STU-${currentYear}-${String(seq).padStart(4, '0')}`;
    while (seenSet.has(candidate)) {
      seq += 1;
      candidate = `STU-${currentYear}-${String(seq).padStart(4, '0')}`;
    }
    schoolCounterCache.set(schoolKey, seq);
    seenSet.add(candidate);
    seenStudentIdsBySchool.set(schoolKey, seenSet);
    item.studentId = candidate;
  }

  // ── Phase 3: Create each row, per-row isolated, with limited concurrency ──
  // This used to be three separate bulkWrite calls (Users, then Profiles,
  // then Students) with no transaction wrapping them. That's fragile in a
  // way that isn't obvious until it actually happens: User.bulkWrite could
  // fully succeed while Profile.bulkWrite failed right after (a single bad
  // document, ordered:true stopping the batch, etc.), and since nothing
  // rolls back without a transaction, this left real, confirmed-in-prod
  // orphaned User/login records with no matching Profile or Student at
  // all — accounts that exist and can (in principle) log in, but have no
  // student data and permanently block re-importing that same email.
  //
  // Making every row fully sequential fixed that, but made large imports
  // slow enough to hit the reverse proxy's request timeout (each row was
  // ~4 sequential network round trips: User, Profile, Student, and often a
  // guardian). Two changes bring the wall-clock time back down without
  // reopening the orphaning risk:
  //   1. Per row, User/Profile/Student are created concurrently (their IDs
  //      are pre-generated, so none of the three needs to wait on another's
  //      result — Mongoose doesn't enforce the `user`/`profile` references
  //      as foreign keys at write time).
  //   2. Rows themselves run with limited concurrency (a small batch at a
  //      time) instead of one at a time.
  // Guardian-by-phone dedup is memoized as an in-flight Promise (not a
  // resolved value) — if two rows in the same concurrent batch share a
  // guardian phone, the second one awaits the first's still-running
  // creation instead of racing to create a duplicate Parent.
  const newParentsByPhone = new Map<string, Promise<{ _id: mongoose.Types.ObjectId }>>();
  let inserted = 0;

  async function linkGuardian(item: any, studentId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId | undefined> {
    if (!item.guardianName || !item.guardianPhone) return undefined;

    const schoolKey = item.school?.toString() || 'global';
    const phoneKey = `${schoolKey}:${item.guardianPhone}`;
    const existingFromDb = parentPhoneMap.get(phoneKey);

    if (existingFromDb) {
      await Parent.updateOne({ _id: existingFromDb._id }, { $addToSet: { children: studentId } });
      return existingFromDb._id;
    }

    if (!newParentsByPhone.has(phoneKey)) {
      // Synchronous has()+set() before any await — the only way a second
      // concurrent row for the same phone could still race in is if it ran
      // this check between this line and the set() below, which can't
      // happen in JS's single-threaded event loop (nothing yields control
      // until the first `await` inside the IIFE).
      newParentsByPhone.set(phoneKey, (async () => {
        const [gFirst, ...gRest] = item.guardianName.split(' ');
        const gLast = gRest.join(' ') || gFirst;
        const relMap: Record<string, string> = { Father: 'father', Mother: 'mother', Guardian: 'guardian', Other: 'other' };

        const guardianUser = await User.create({
          email: item.guardianEmail || `${item.email.replace('@', '+parent@')}`,
          password: await bcrypt.hash(item.guardianPassword || 'guardian123', 10),
          role: 'parent', organizationId: item.school, phone: item.guardianPhone,
          isVerified: true, isActive: true,
        });
        const guardianProfile = await Profile.create({
          user: guardianUser._id, firstName: gFirst, lastName: gLast, gender: 'male',
        });
        const parent = await Parent.create({
          user: guardianUser._id, profile: guardianProfile._id,
          school: item.school, phone: item.guardianPhone,
          relationship: relMap[item.relationship] || 'father',
          children: [studentId], status: 'active',
        });
        return { _id: parent._id };
      })());
    } else {
      // A different row already created this parent — just add this child.
      const parentRef = await newParentsByPhone.get(phoneKey)!;
      await Parent.updateOne({ _id: parentRef._id }, { $addToSet: { children: studentId } });
      return parentRef._id;
    }

    const parentRef = await newParentsByPhone.get(phoneKey)!;
    return parentRef._id;
  }

  async function importRow(item: any): Promise<void> {
    const userId = new mongoose.Types.ObjectId();
    const profileId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();

    try {
      await Promise.all([
        User.create({
          _id: userId, email: item.email, password: item.hashedPassword, role: 'student',
          organizationId: item.school, isVerified: true, isActive: true, preferredLanguage: 'en',
        }),
        Profile.create({
          _id: profileId, user: userId, firstName: item.firstName, lastName: item.lastName, gender: item.gender,
        }),
        Student.create({
          _id: studentId, studentId: item.studentId, user: userId, profile: profileId,
          school: item.school, class: item.classId, grade: item.grade,
          department: item.department, shiftMode: item.shiftMode,
          enrollmentDate: item.enrollmentDate, medicalNotes: item.medicalNotes,
          approvalStatus: 'approved', status: 'active',
        }),
      ]);

      const parentId = await linkGuardian(item, studentId);
      if (parentId) await Student.updateOne({ _id: studentId }, { parent: parentId });

      inserted++;
    } catch (rowErr: any) {
      // Undo whatever this row managed to create, so a mid-row failure
      // never leaves an orphaned User/Profile/Student behind.
      await Student.deleteOne({ _id: studentId }).catch(() => {});
      await Profile.deleteOne({ _id: profileId }).catch(() => {});
      await User.deleteOne({ _id: userId }).catch(() => {});
      const message = rowErr.code === 11000
        ? `Student ID "${item.studentId}" conflicts with an existing record in this organization`
        : (rowErr.message || 'Insert failed');
      errors.push({ row: item.rowNum, message });
    }
  }

  const CONCURRENCY = 10;
  for (let i = 0; i < parsedRows.length; i += CONCURRENCY) {
    await Promise.all(parsedRows.slice(i, i + CONCURRENCY).map(importRow));
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

  // A pending/self-registered student had no real class until this moment —
  // grant access to that class's existing courses now, same as create().
  await syncStudentCourseEnrollment(student._id as mongoose.Types.ObjectId, classId);

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
  const { courseId, itemType, itemId } = req.body as { courseId: string; itemType: 'lesson' | 'quiz' | 'assignment'; itemId?: string };

  if (!courseId) throw new BadRequestError('Course ID is required.');
  if (!['lesson','quiz','assignment'].includes(itemType)) throw new BadRequestError('itemType must be lesson, quiz, or assignment.');

  const student = await ensureStudentRecord(req.user!.userId);
  if (!student) throw new NotFoundError('Student record not found.');

  let progress = await Progress.findOne({ student: student._id, course: courseId });
  if (!progress) {
    const content = await CourseContent.findOne({ course: courseId });
    const total = content ? (content.totalLessons||0)+(content.totalQuizzes||0)+(content.totalAssignments||0)+(content.totalExams||0) : 0;
    progress = await Progress.create({ student: student._id, course: courseId,
      completedLessons: itemType==='lesson'?1:0, completedQuizzes: itemType==='quiz'?1:0,
      completedAssignments: itemType==='assignment'?1:0, completedItemIds: itemId ? [itemId] : [],
      totalItems: total, lastAccessed: new Date(), status: 'in_progress' });
  } else {
    // completedItemIds is the only thing here that's genuinely idempotent
    // (a set, not a counter) — the counters above have never de-duped a
    // repeat call for the same item, so they're left exactly as they were
    // to avoid shifting existing progressPercent behavior elsewhere.
    if (itemType==='lesson') progress.completedLessons += 1;
    else if (itemType==='quiz') progress.completedQuizzes += 1;
    else progress.completedAssignments += 1;
    if (itemId && !progress.completedItemIds.includes(itemId)) progress.completedItemIds.push(itemId);
    const done = progress.completedLessons + progress.completedQuizzes + progress.completedAssignments;
    if (done >= progress.totalItems && progress.totalItems > 0) progress.status = 'completed';
    progress.lastAccessed = new Date();
    await progress.save();
  }
  return ApiResponse.success(res, { progress }, 'Progress recorded.');
};
