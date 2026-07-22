/**
 * Parent Controller
 * Full CRUD for parents. Admin only.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import Parent from '../models/parent.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import Student from '../models/student.model';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

// ---------------------------------------------------------------------------
// GET /parents — List all with optional filters
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { status, search, page = '1', limit = '10', school } = req.query;

  const filter: any = {};
  if (status && ['active', 'inactive'].includes(status as string)) {
    filter.status = status;
  }

  // org_admin can never widen the filter to another org via ?school=; their
  // own organization always wins (applied below, after the client's value).
  if (school && req.user?.role !== 'org_admin') {
    filter.school = school as string;
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 10));

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  const [parents, total] = await Promise.all([
    Parent.find(scopedFilter)
      .populate('user', 'email phone isVerified isActive')
      .populate('profile', 'firstName lastName gender')
      .populate('children', 'studentId')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Parent.countDocuments(scopedFilter),
  ]);

  let result = parents;
  if (search) {
    const s = (search as string).toLowerCase();
    result = parents.filter((p: any) => {
      const fullName = `${p.profile?.firstName || ''} ${p.profile?.lastName || ''}`.toLowerCase();
      const email = (p.user?.email || '').toLowerCase();
      const pid = (p.parentId || '').toLowerCase();
      return fullName.includes(s) || email.includes(s) || pid.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, {
    page: pageNum,
    limit: limitNum,
    total: search ? result.length : total,
  });
};

// ---------------------------------------------------------------------------
// GET /parents/:id
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  const parent = await Parent.findById(req.params.id)
    .populate('user', 'email phone isVerified isActive preferredLanguage')
    .populate('profile')
    .populate('children', 'studentId');

  if (!parent) throw new NotFoundError('Parent');
  assertOwnsOrg(req, parent, 'school');

  return ApiResponse.success(res, parent);
};

// ---------------------------------------------------------------------------
// POST /parents — Create parent (User + Profile + Parent)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const {
    email, password, firstName, lastName, gender, phone,
    occupation, relationship, address,
  } = req.body;

  if (!email || !password || !firstName || !lastName || !gender) {
    throw new BadRequestError('email, password, firstName, lastName, and gender are required');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ConflictError('A user with this email already exists');

  const user = await User.create({
    email: email.toLowerCase(),
    password,
    role: 'parent',
    organizationId: resolveOrgIdForCreate(req, req.body.school) || undefined,
    phone: phone || undefined,
    isVerified: true,
    preferredLanguage: 'en',
  });

  const profile = await Profile.create({ user: user._id, firstName, lastName, gender });

  const count = await Parent.countDocuments();
  const parentId = `PRN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

  const parent = await Parent.create({
    user: user._id,
    profile: profile._id,
    parentId,
    school: resolveOrgIdForCreate(req, req.body.school) || undefined,
    occupation: occupation || '',
    relationship: relationship || 'father',
    address: address || '',
    children: [],
  });

  const populated = await Parent.findById(parent._id)
    .populate('user', 'email phone isVerified isActive')
    .populate('profile', 'firstName lastName gender')
    .populate('children', 'studentId');

  return ApiResponse.created(res, populated, 'Parent created successfully');
};

// ---------------------------------------------------------------------------
// PATCH /parents/:id — Update parent info
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const parent = await Parent.findById(req.params.id);
  if (!parent) throw new NotFoundError('Parent');
  assertOwnsOrg(req, parent, 'school');

  const { firstName, lastName, gender, email, password, phone, occupation, relationship, address, status } = req.body;

  if (firstName || lastName || gender) {
    const profileUpdate: any = {};
    if (firstName) profileUpdate.firstName = firstName;
    if (lastName) profileUpdate.lastName = lastName;
    if (gender) profileUpdate.gender = gender;
    await Profile.findByIdAndUpdate(parent.profile, profileUpdate);
  }

  if (email || password || phone !== undefined) {
    const user = await User.findById(parent.user);
    if (!user) throw new NotFoundError('Parent user account');

    if (email && email.toLowerCase() !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (existing) throw new ConflictError('A user with this email already exists');
      user.email = email.toLowerCase();
    }
    // Pre-save hook bcrypt-hashes the password exactly once — only touch it
    // when a new value was actually submitted (blank means "keep current").
    if (password) user.password = password;
    if (phone !== undefined) user.phone = phone || undefined;

    await user.save();
  }

  if (occupation !== undefined) parent.occupation = occupation;
  if (relationship !== undefined) parent.relationship = relationship;
  if (address !== undefined) parent.address = address;
  if (status !== undefined) parent.status = status;

  await parent.save();

  const updated = await Parent.findById(parent._id)
    .populate('user', 'email phone isVerified isActive')
    .populate('profile')
    .populate('children', 'studentId');

  return ApiResponse.success(res, updated, 'Parent updated successfully');
};

// ---------------------------------------------------------------------------
// DELETE /parents/:id — Delete parent
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const parent = await Parent.findById(req.params.id);
  if (!parent) throw new NotFoundError('Parent');
  assertOwnsOrg(req, parent, 'school');

  // Unlink children
  if (parent.children.length > 0) {
    await Student.updateMany(
      { _id: { $in: parent.children } },
      { $unset: { parent: '' } }
    );
  }

  await Promise.all([
    User.findByIdAndDelete(parent.user),
    Profile.findByIdAndDelete(parent.profile),
    Parent.findByIdAndDelete(parent._id),
  ]);

  return ApiResponse.noContent(res, 'Parent deleted successfully');
};

// ---------------------------------------------------------------------------
// PATCH /parents/:id/status — Quick status toggle
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['active', 'inactive'].includes(status)) {
    throw new BadRequestError('Valid status required: active or inactive');
  }

  const existing = await Parent.findById(req.params.id);
  if (!existing) throw new NotFoundError('Parent');
  assertOwnsOrg(req, existing, 'school');

  const parent = await Parent.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  ).populate('profile', 'firstName lastName');

  if (!parent) throw new NotFoundError('Parent');

  return ApiResponse.success(res, parent, `Parent status updated to ${status}`);
};

// ---------------------------------------------------------------------------
// GET /parents/me/children — Self-service: the logged-in parent's own children
// ---------------------------------------------------------------------------

export const getMyChildren = async (req: Request, res: Response): Promise<Response> => {
  const parent = await Parent.findOne({ user: req.user!.userId })
    .populate({
      path: 'children',
      populate: [
        { path: 'profile', select: 'firstName lastName' },
        { path: 'enrolledCourses', select: 'title slug' },
      ],
      select: 'studentId status attendancePercentage gpa totalFeesPaid totalFeesDue',
    })
    .lean();

  if (!parent) throw new NotFoundError('Parent record for this account');

  return ApiResponse.success(res, (parent as any).children || []);
};

// ---------------------------------------------------------------------------
// GET /parents/:id/children — Get parent's linked children
// ---------------------------------------------------------------------------

export const getChildren = async (req: Request, res: Response): Promise<Response> => {
  const parent = await Parent.findById(req.params.id)
    .populate({
      path: 'children',
      populate: [
        { path: 'profile', select: 'firstName lastName' },
        { path: 'enrolledCourses', select: 'title slug' },
      ],
      select: 'studentId status attendancePercentage gpa',
    })
    .lean();

  if (!parent) throw new NotFoundError('Parent');
  assertOwnsOrg(req, parent, 'school');

  return ApiResponse.success(res, (parent as any).children || []);
};

// ---------------------------------------------------------------------------
// POST /parents/:id/link-child — Link a student to parent
// ---------------------------------------------------------------------------

export const linkChild = async (req: Request, res: Response): Promise<Response> => {
  const { childId } = req.body;
  if (!childId) throw new BadRequestError('childId is required');

  const student = await Student.findById(childId);
  if (!student) throw new NotFoundError('Student');
  assertOwnsOrg(req, student, 'school');

  const parent = await Parent.findById(req.params.id);
  if (!parent) throw new NotFoundError('Parent');
  assertOwnsOrg(req, parent, 'school');

  // Add child if not already linked
  if (!parent.children.includes(childId)) {
    parent.children.push(childId);
    await parent.save();
  }

  // Link parent to student
  student.parent = parent._id;
  await student.save();

  const updated = await Parent.findById(parent._id)
    .populate('user', 'email')
    .populate('profile', 'firstName lastName')
    .populate('children', 'studentId');

  return ApiResponse.success(res, updated, 'Child linked successfully');
};

// ---------------------------------------------------------------------------
// POST /parents/:id/unlink-child — Unlink a student from parent
// ---------------------------------------------------------------------------

export const unlinkChild = async (req: Request, res: Response): Promise<Response> => {
  const { childId } = req.body;
  if (!childId) throw new BadRequestError('childId is required');

  const parent = await Parent.findById(req.params.id);
  if (!parent) throw new NotFoundError('Parent');
  assertOwnsOrg(req, parent, 'school');

  parent.children = parent.children.filter((c: any) => c.toString() !== childId);
  await parent.save();

  await Student.findByIdAndUpdate(childId, { $unset: { parent: '' } });

  const updated = await Parent.findById(parent._id)
    .populate('user', 'email')
    .populate('profile', 'firstName lastName')
    .populate('children', 'studentId');

  return ApiResponse.success(res, updated, 'Child unlinked successfully');
};

// ---------------------------------------------------------------------------
// GET /parents/export — Export all parents as formatted XLSX
// ---------------------------------------------------------------------------

export const exportParents = async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');

  const parents = await Parent.find(filter)
    .populate('user', 'email phone')
    .populate('profile', 'firstName lastName gender')
    .populate('children', 'studentId profile')
    .populate({ path: 'children', populate: { path: 'profile', select: 'firstName lastName' } })
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'First Name', 'Last Name', 'Gender', 'Email', 'Password',
    'Phone Number', 'Occupation', 'Address', 'Student Association',
  ];
  const rows = parents.map((p: any) => {
    const studentAssoc = (p.children || [])
      .map((c: any) => c.studentId || c._id)
      .join(', ');
    return [
      p.profile?.firstName || '', p.profile?.lastName || '',
      p.profile?.gender || '', p.user?.email || '', '',
      p.user?.phone || '', p.occupation || '', p.address || '',
      studentAssoc,
    ];
  });

  const buffer = buildXlsxBuffer(headers, rows, 'Parents');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=parents-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// GET /parents/template — Download empty structured template (XLSX)
// ---------------------------------------------------------------------------

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = [
    'First Name', 'Last Name', 'Gender', 'Email', 'Password',
    'Phone Number', 'Occupation', 'Address', 'Student Association',
  ];
  const rows = [[
    'Mohamed', 'Ali', 'male', 'mohamed.ali@example.com', '',
    '+252612345678', 'Engineer', 'Mogadishu, Somalia', 'STU-2026-0001',
  ]];
  const buffer = buildXlsxBuffer(headers, rows, 'Parent Template');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=parents-template.xlsx');
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
// POST /parents/import — Transactional bulk import
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
  const parentsToInsert: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    try {
      const firstName = String(getField(row, 'First Name') ?? '').trim();
      const lastName = String(getField(row, 'Last Name') ?? '').trim();
      const gender = String(getField(row, 'Gender') ?? 'male').trim().toLowerCase();
      const email = String(getField(row, 'Email') ?? '').trim().toLowerCase();
      const password = String(getField(row, 'Password') ?? 'changeme123').trim();
      const phone = String(getField(row, 'Phone Number', 'Phone') ?? '').trim();
      const occupation = String(getField(row, 'Occupation') ?? '').trim();
      const address = String(getField(row, 'Address') ?? '').trim();
      const studentAssocRaw = String(getField(row, 'Student Association', 'Student Email / ID', 'Student ID') ?? '').trim();

      if (!firstName || !lastName) throw new Error('First Name and Last Name are required');
      if (!email) throw new Error('Email is required');

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

      // Resolve student associations
      const studentIdsRaw = studentAssocRaw ? studentAssocRaw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean) : [];
      const childIds: mongoose.Types.ObjectId[] = [];
      for (const sid of studentIdsRaw) {
        const student = await Student.findOne({ studentId: sid }).lean();
        if (student) childIds.push(student._id);
        else errors.push({ row: rowNum, message: `Student "${sid}" not found — not linked` });
      }

      parentsToInsert.push({
        rowNum, firstName, lastName, gender: ['male', 'female'].includes(gender) ? gender : 'male',
        email, hashedPassword, phone, occupation, address,
        school: schoolId ? new mongoose.Types.ObjectId(schoolId) : undefined,
        childIds,
      });
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  // No transaction — this deployment's MongoDB is a standalone instance (no
  // replica set), which doesn't support transactions; session.withTransaction()
  // throws immediately there, and bundling the whole batch into one
  // transaction meant a single bad row previously rolled back (or, on this
  // DB, entirely prevented) every other row too. Each row now runs as plain
  // sequential writes with its own try/catch, so one failure doesn't affect
  // the rest of the batch.
  let inserted = 0;
  if (parentsToInsert.length > 0) {
    const baseCount = await Parent.countDocuments();
    for (let idx = 0; idx < parentsToInsert.length; idx++) {
      const item = parentsToInsert[idx];
      try {
        const parentId = `PRN-${new Date().getFullYear()}-${String(baseCount + inserted + 1).padStart(4, '0')}`;

        const user = await User.create({
          email: item.email, password: item.hashedPassword, role: 'parent',
          organizationId: item.school, phone: item.phone || undefined,
          isVerified: true, isActive: true, preferredLanguage: 'en',
        });

        const profile = await Profile.create({
          user: user._id, firstName: item.firstName, lastName: item.lastName, gender: item.gender,
        });

        const parent = await Parent.create({
          user: user._id, profile: profile._id, parentId,
          school: item.school, occupation: item.occupation,
          address: item.address, children: item.childIds, status: 'active',
        });

        // Link students back to parent
        if (item.childIds.length > 0) {
          await Student.updateMany(
            { _id: { $in: item.childIds } },
            { parent: parent._id },
          );
        }

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
  }, `Imported ${inserted} of ${rows.length} parents`);
};
