/**
 * Teacher Controller
 * Full CRUD for teachers. Admin only.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import Teacher from '../models/teacher.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

// ---------------------------------------------------------------------------
// GET /teachers — List all teachers with optional filters
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { status, search, page = '1', limit = '10', school } = req.query;

  const filter: any = {};

  if (status && ['active', 'inactive', 'on_leave'].includes(status as string)) {
    filter.status = status;
  }

  if (school && req.user?.role !== 'org_admin') {
    filter.school = school as string;
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  let query = Teacher.find(scopedFilter)
    .populate('user', 'email isVerified isActive')
    .populate('profile', 'firstName lastName gender')
    .populate('school', 'name')
    .populate('courses', 'title.en slug')
    .sort({ createdAt: -1 });

  const [teachers, total] = await Promise.all([
    query.skip(skip).limit(limitNum).lean(),
    Teacher.countDocuments(scopedFilter),
  ]);

  let filteredTeachers = teachers;
  if (search) {
    const s = (search as string).toLowerCase();
    filteredTeachers = teachers.filter((t: any) => {
      const fullName = `${t.profile?.firstName || ''} ${t.profile?.lastName || ''}`.toLowerCase();
      const email = (t.user?.email || '').toLowerCase();
      const tid = (t.teacherId || '').toLowerCase();
      return fullName.includes(s) || email.includes(s) || tid.includes(s);
    });
  }

  return ApiResponse.paginated(res, filteredTeachers, {
    page: pageNum, limit: limitNum,
    total: search ? filteredTeachers.length : total,
  });
};

// ---------------------------------------------------------------------------
// GET /teachers/:id — Get single teacher by ID
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await Teacher.findById(req.params.id)
    .populate('user', 'email isVerified isActive preferredLanguage')
    .populate('profile')
    .populate('school', 'name')
    .populate('courses', 'title.en slug category status');

  if (!teacher) throw new NotFoundError('Teacher');
  assertOwnsOrg(req, teacher, 'school');
  return ApiResponse.success(res, teacher);
};

// ---------------------------------------------------------------------------
// POST /teachers — Create a new teacher (with User + Profile)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { email, password, firstName, lastName, gender, phone, school, qualification, specialization, experience, bio, joiningDate } = req.body;
  if (!email || !password || !firstName || !lastName || !gender) {
    throw new BadRequestError('email, password, firstName, lastName, and gender are required');
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) throw new ConflictError('A user with this email already exists');

  const user = await User.create({
    email: email.toLowerCase(), password, role: 'teacher',
    organizationId: resolveOrgIdForCreate(req, school) || undefined,
    phone: phone || undefined, isVerified: true, preferredLanguage: 'en',
  });

  const profile = await Profile.create({ user: user._id, firstName, lastName, gender });

  const count = await Teacher.countDocuments();
  const teacherId = `TCH-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

  const teacher = await Teacher.create({
    user: user._id, profile: profile._id, teacherId,
    school: resolveOrgIdForCreate(req, school) || undefined,
    qualification: qualification || '', specialization: specialization || [],
    experience: experience || 0, bio: bio || '',
    joiningDate: joiningDate || new Date(), status: 'active',
  });

  const populated = await Teacher.findById(teacher._id)
    .populate('user', 'email isVerified isActive')
    .populate('profile', 'firstName lastName gender')
    .populate('school', 'name');

  return ApiResponse.created(res, populated, 'Teacher created successfully');
};

// ---------------------------------------------------------------------------
// PATCH /teachers/:id — Update teacher info
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) throw new NotFoundError('Teacher');
  assertOwnsOrg(req, teacher, 'school');

  const { firstName, lastName, gender, school, qualification, specialization, experience, bio, status, joiningDate } = req.body;

  if (firstName || lastName || gender) {
    const profileUpdate: any = {};
    if (firstName) profileUpdate.firstName = firstName;
    if (lastName) profileUpdate.lastName = lastName;
    if (gender) profileUpdate.gender = gender;
    await Profile.findByIdAndUpdate(teacher.profile, profileUpdate);
  }

  if (school !== undefined && req.user?.role !== 'org_admin') teacher.school = school || null;
  if (qualification !== undefined) teacher.qualification = qualification;
  if (specialization !== undefined) teacher.specialization = specialization;
  if (experience !== undefined) teacher.experience = experience;
  if (bio !== undefined) teacher.bio = bio;
  if (status !== undefined) teacher.status = status;
  if (joiningDate !== undefined) teacher.joiningDate = new Date(joiningDate);

  await teacher.save();

  const updated = await Teacher.findById(teacher._id)
    .populate('user', 'email isVerified isActive')
    .populate('profile')
    .populate('school', 'name')
    .populate('courses', 'title.en slug category status');

  return ApiResponse.success(res, updated, 'Teacher updated successfully');
};

// ---------------------------------------------------------------------------
// DELETE /teachers/:id — Delete teacher (also removes User + Profile)
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) throw new NotFoundError('Teacher');
  assertOwnsOrg(req, teacher, 'school');

  const Course = mongoose.model('Course');
  const activeCourses = await Course.countDocuments({
    teacher: teacher._id, status: { $in: ['published', 'draft'] },
  });

  if (activeCourses > 0) {
    throw new BadRequestError(`Cannot delete teacher. They are assigned to ${activeCourses} active course(s). Reassign or remove courses first.`);
  }

  await Promise.all([
    User.findByIdAndDelete(teacher.user),
    Profile.findByIdAndDelete(teacher.profile),
    Teacher.findByIdAndDelete(teacher._id),
  ]);

  return ApiResponse.noContent(res, 'Teacher deleted successfully');
};

// ---------------------------------------------------------------------------
// PATCH /teachers/:id/status — Quick status toggle
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['active', 'inactive', 'on_leave'].includes(status)) {
    throw new BadRequestError('Valid status required: active, inactive, or on_leave');
  }

  const existing = await Teacher.findById(req.params.id);
  if (!existing) throw new NotFoundError('Teacher');
  assertOwnsOrg(req, existing, 'school');

  const teacher = await Teacher.findByIdAndUpdate(req.params.id, { status }, { new: true })
    .populate('profile', 'firstName lastName')
    .populate('school', 'name');

  if (!teacher) throw new NotFoundError('Teacher');
  return ApiResponse.success(res, teacher, `Teacher status updated to ${status}`);
};

// ---------------------------------------------------------------------------
// PATCH /teachers/:id/course-permission — Toggle course content access
// ---------------------------------------------------------------------------

export const updateCoursePermission = async (req: Request, res: Response): Promise<Response> => {
  const { coursePermission } = req.body;
  if (!coursePermission || !['COURSE_BUILDER', 'STUDENT_VIEW'].includes(coursePermission)) {
    throw new BadRequestError('Valid coursePermission required: COURSE_BUILDER or STUDENT_VIEW');
  }

  const existing = await Teacher.findById(req.params.id);
  if (!existing) throw new NotFoundError('Teacher');
  assertOwnsOrg(req, existing, 'school');

  const teacher = await Teacher.findByIdAndUpdate(req.params.id, { coursePermission }, { new: true })
    .populate('profile', 'firstName lastName')
    .populate('school', 'name');

  if (!teacher) throw new NotFoundError('Teacher');
  return ApiResponse.success(res, teacher, `Course permission updated to ${coursePermission}`);
};

// ---------------------------------------------------------------------------
// GET /teachers/export — Export all teachers as formatted XLSX
// ---------------------------------------------------------------------------

export const exportTeachers = async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');

  const teachers = await Teacher.find(filter)
    .populate('user', 'email')
    .populate('profile', 'firstName lastName gender')
    .populate('school', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'First Name', 'Last Name', 'Gender', 'Email', 'Password',
    'Phone', 'Qualification', 'Specialization', 'Experience (years)',
    'Joining Date', 'Bio',
  ];
  const rows = teachers.map((t: any) => [
    t.profile?.firstName || '', t.profile?.lastName || '',
    t.profile?.gender || '', t.user?.email || '', '',
    (t.user as any)?.phone || '', t.qualification || '',
    Array.isArray(t.specialization) ? t.specialization.join(', ') : '',
    t.experience || 0,
    t.joiningDate ? new Date(t.joiningDate).toISOString().slice(0, 10) : '',
    t.bio || '',
  ]);

  const buffer = buildXlsxBuffer(headers, rows, 'Teachers');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=teachers-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// GET /teachers/template — Download empty structured template (XLSX)
// ---------------------------------------------------------------------------

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = [
    'First Name', 'Last Name', 'Gender', 'Email', 'Password',
    'Phone', 'Qualification', 'Specialization', 'Experience (years)',
    'Joining Date', 'Bio',
  ];
  const rows = [[
    'Ahmed', 'Hassan', 'male', 'ahmed.hassan@example.com', '',
    '+252612345678', 'Bachelor of Islamic Studies', 'Tajweed, Fiqh', '5',
    '2026-01-15', 'Experienced Quran teacher with 5 years of teaching.',
  ]];
  const buffer = buildXlsxBuffer(headers, rows, 'Teacher Template');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=teachers-template.xlsx');
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

function esc(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// POST /teachers/import — Transactional bulk import
// ---------------------------------------------------------------------------

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const ownOrgId = resolveOrgIdForCreate(req) as string | undefined;

  const errors: { row: number; message: string }[] = [];
  const teachersToInsert: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    // Skip header row if present
    const firstCell = String(Object.values(row as Record<string, any>)[0] ?? '').trim().toLowerCase();
    if (firstCell === 'first name' || firstCell === 'first') { continue; }

    try {
      const firstName = String(getField(row, 'First Name') ?? '').trim();
      const lastName = String(getField(row, 'Last Name') ?? '').trim();
      const gender = String(getField(row, 'Gender') ?? 'male').trim().toLowerCase();
      const email = String(getField(row, 'Email') ?? '').trim().toLowerCase();
      const password = String(getField(row, 'Password') ?? 'changeme123').trim();
      const phone = String(getField(row, 'Phone') ?? '').trim();
      const qualification = String(getField(row, 'Qualification') ?? '').trim();
      const specializationRaw = String(getField(row, 'Specialization') ?? '').trim();
      const experienceRaw = String(getField(row, 'Experience (years)', 'Experience') ?? '0').trim();
      const joiningDateRaw = String(getField(row, 'Joining Date') ?? '').trim();
      const bio = String(getField(row, 'Bio') ?? '').trim();

      if (!firstName || !lastName) throw new Error('First Name and Last Name are required');
      if (!email) throw new Error('Email is required');

      const specialization = specializationRaw
        ? specializationRaw.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean)
        : [];
      const experience = parseInt(experienceRaw, 10) || 0;

      // A malformed/unparseable date must never reach Teacher.create() as a
      // raw JS "Invalid Date" — Mongoose's Date cast rejects it outright.
      // Falls back to today rather than failing the whole row over a date
      // that's often just a formatting mismatch, not a real data problem.
      const parsedJoiningDate = joiningDateRaw ? new Date(joiningDateRaw) : new Date();
      const joiningDate = isNaN(parsedJoiningDate.getTime()) ? new Date() : parsedJoiningDate;

      const existingUser = await User.findOne({ email }).lean();
      if (existingUser) throw new Error(`Email "${email}" is already registered`);

      const finalPassword = password || 'changeme123';
      const hashedPassword = await bcrypt.hash(finalPassword, 10);

      // Resolve organization
      let schoolId: string | undefined = ownOrgId;
      if (!schoolId) {
        const schoolName = String(getField(row, 'School', 'Organization') ?? '').trim();
        if (!schoolName) throw new Error('School is required for super admin');
        const school = await School.findOne({ name: new RegExp(`^${esc(schoolName)}$`, 'i') }).lean();
        if (!school) throw new Error(`School "${schoolName}" not found`);
        schoolId = school._id.toString();
      }

      teachersToInsert.push({
        rowNum, firstName, lastName, gender: ['male', 'female'].includes(gender) ? gender : 'male',
        email, hashedPassword, phone, qualification, specialization, experience,
        joiningDate,
        bio, school: schoolId ? new mongoose.Types.ObjectId(schoolId) : undefined,
      });
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  // Each row runs in its own transaction (User+Profile+Teacher all-or-nothing
  // for that one teacher) instead of bundling the whole batch into a single
  // transaction — previously, one bad row (e.g. a duplicate email slipping
  // past the pre-check, or a validation error) rolled back every other row
  // in the same import silently: the failure was a plain Mongoose error, not
  // a BulkWriteError, so it has no `.writeErrors` and the old catch block
  // only handled that shape — nothing was ever pushed to `errors`, so the
  // admin saw "0 imported" with no explanation at all.
  // No transaction — this deployment's MongoDB is a standalone instance (no
  // replica set), which doesn't support transactions; session.withTransaction()
  // throws immediately there. Each row's User+Profile+Teacher is created as
  // plain sequential writes instead — not atomic per-row, but functional —
  // with the same per-row try/catch isolating one bad row from the rest.
  let inserted = 0;
  if (teachersToInsert.length > 0) {
    const baseTeacherCount = await Teacher.countDocuments();
    const currentYear = new Date().getFullYear();

    for (let idx = 0; idx < teachersToInsert.length; idx++) {
      const item = teachersToInsert[idx];
      const teacherId = `TCH-${currentYear}-${String(baseTeacherCount + idx + 1).padStart(4, '0')}`;

      try {
        const user = await User.create({
          email: item.email, password: item.hashedPassword, role: 'teacher',
          organizationId: item.school, phone: item.phone || undefined,
          isVerified: true, isActive: true, preferredLanguage: 'en',
        });

        const profile = await Profile.create({
          user: user._id, firstName: item.firstName, lastName: item.lastName, gender: item.gender,
        });

        await Teacher.create({
          user: user._id, profile: profile._id, teacherId,
          school: item.school, qualification: item.qualification,
          specialization: item.specialization, experience: item.experience,
          bio: item.bio, joiningDate: item.joiningDate, status: 'active',
        });

        inserted++;
      } catch (rowErr: any) {
        errors.push({ row: item.rowNum, message: rowErr.message || 'Insert failed' });
      }
    }
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created: inserted,
    failed: errors.length,
    errors,
  }, `Imported ${inserted} of ${rows.length} teachers`);
};
