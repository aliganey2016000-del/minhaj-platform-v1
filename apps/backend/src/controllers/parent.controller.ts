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
import { moveToTrash, moveManyToTrash } from '../utils/trash';

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
      .populate('school', 'name')
      .populate({ path: 'children', select: 'studentId school', populate: { path: 'school', select: 'name' } })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Parent.countDocuments(scopedFilter),
  ]);

  // The parent's own `school` is the authoritative organization (set at
  // creation/import), but a handful of legacy records predate that field
  // being populated here at all — for those, fall back to the distinct set
  // of organizations among their linked children rather than showing blank.
  let result = parents.map((p: any) => {
    if (p.school?.name) return { ...p, organizationNames: [p.school.name] };
    const childOrgNames = [...new Set((p.children || []).map((c: any) => c.school?.name).filter(Boolean))];
    return { ...p, organizationNames: childOrgNames };
  });
  if (search) {
    const s = (search as string).toLowerCase();
    result = result.filter((p: any) => {
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
// GET /parents/stats — Aggregate counts (active/inactive/children) across
// EVERY matching parent, not just the current page. Scoped by organization
// only (like students' getStats) — deliberately ignores the list's
// search/status quick-filters, since these summary cards are meant to
// describe the whole selected organization, not whatever's currently typed
// into the search box.
// ---------------------------------------------------------------------------

export const getStats = async (req: Request, res: Response): Promise<Response> => {
  const school = req.query.school as string | undefined;
  const filter: Record<string, unknown> = {};
  if (school && req.user?.role !== 'org_admin') filter.school = school;
  const scopedFilter = applyOrgFilter(req, filter, 'school') as Record<string, unknown>;

  // applyOrgFilter puts an org_admin's organizationId in as the plain string
  // pulled off the JWT. Parent.countDocuments() auto-casts that through
  // Mongoose's query layer, but a raw .aggregate() $match does not — cast
  // explicitly for the aggregation pipeline only (same issue/fix as
  // students' computeStudentStats).
  const aggregateMatch: Record<string, unknown> = { ...scopedFilter };
  const schoolFilter = aggregateMatch.school as { $in?: unknown[] } | undefined;
  if (schoolFilter && Array.isArray(schoolFilter.$in)) {
    aggregateMatch.school = { $in: schoolFilter.$in.map((v) => (v ? new mongoose.Types.ObjectId(v as string) : null)) };
  }

  const [statusCounts, childrenAgg, total] = await Promise.all([
    Parent.aggregate([
      { $match: aggregateMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Parent.aggregate([
      { $match: aggregateMatch },
      { $project: { childCount: { $size: { $ifNull: ['$children', []] } } } },
      { $group: { _id: null, total: { $sum: '$childCount' } } },
    ]),
    Parent.countDocuments(scopedFilter),
  ]);

  const active = statusCounts.find((r: any) => r._id === 'active')?.count || 0;
  const inactive = statusCounts.find((r: any) => r._id === 'inactive')?.count || 0;
  const totalChildren = childrenAgg[0]?.total || 0;

  return ApiResponse.success(res, { total, active, inactive, totalChildren });
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

async function deleteParentToTrash(parentId: string, req: Request): Promise<void> {
  const parent = await Parent.findById(parentId);
  if (!parent) throw new NotFoundError('Parent');
  assertOwnsOrg(req, parent, 'school');

  const [userDoc, profileDoc] = await Promise.all([
    // +password: it's `select: false` on the schema, but the snapshot must
    // carry it or a restore fails Mongoose's `required` validation on User.
    User.findById(parent.user).select('+password'),
    Profile.findById(parent.profile),
  ]);
  const label = profileDoc ? `${profileDoc.firstName} ${profileDoc.lastName}`.trim() || 'Parent' : 'Parent';

  await moveToTrash({
    entityType: 'Parent',
    label,
    school: parent.school,
    snapshots: [
      ...(userDoc ? [{ modelName: 'User', data: userDoc.toObject() }] : []),
      ...(profileDoc ? [{ modelName: 'Profile', data: profileDoc.toObject() }] : []),
      { modelName: 'Parent', data: parent.toObject() },
    ],
    restoreMeta: { childrenIds: parent.children },
    req,
  });

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
}

export const remove = async (req: Request, res: Response): Promise<Response> => {
  await deleteParentToTrash(req.params.id, req);
  return ApiResponse.noContent(res, 'Parent deleted successfully');
};

// ---------------------------------------------------------------------------
// DELETE /parents/bulk — body: { ids: string[] } or { selectAll: true, filters }
// ---------------------------------------------------------------------------

export const bulkRemove = async (req: Request, res: Response): Promise<Response> => {
  let ids: string[];

  if (req.body?.selectAll === true) {
    const filters = (req.body?.filters || {}) as { status?: string; search?: string; school?: string };
    const filter: any = {};
    if (filters.status && ['active', 'inactive'].includes(filters.status)) filter.status = filters.status;
    if (filters.school && req.user?.role !== 'org_admin') filter.school = filters.school;
    const scopedFilter = applyOrgFilter(req, filter, 'school');

    const matches = await Parent.find(scopedFilter)
      .select('_id parentId')
      .populate('profile', 'firstName lastName')
      .populate('user', 'email')
      .lean();

    let candidates = matches as any[];
    if (filters.search) {
      const s = filters.search.toLowerCase();
      candidates = candidates.filter((p) => {
        const fullName = `${p.profile?.firstName || ''} ${p.profile?.lastName || ''}`.toLowerCase();
        const email = (p.user?.email || '').toLowerCase();
        const pid = (p.parentId || '').toLowerCase();
        return fullName.includes(s) || email.includes(s) || pid.includes(s);
      });
    }
    ids = candidates.map((p) => String(p._id));

    if (ids.length === 0) {
      return ApiResponse.success(res, { moved: 0, matched: 0 }, 'No matching parents to delete');
    }
  } else {
    ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
    if (ids.length === 0) throw new BadRequestError('At least one parent id is required');
  }

  // Resolve every matching parent in ONE query, then do a single Trash
  // insertMany + children-unlink updateMany + three deleteMany calls
  // instead of looping deleteParentToTrash per id — that per-id loop (each
  // needing several sequential round trips) was slow enough against the
  // remote Atlas cluster to blow past the browser/proxy request timeout on
  // anything more than a couple dozen parents.
  const parents = await Parent.find({ _id: { $in: ids } });
  const foundIds = new Set(parents.map((p) => String(p._id)));
  const notFoundIds = ids.filter((id) => !foundIds.has(id));

  const allowed: (typeof parents)[number][] = [];
  const forbiddenIds: string[] = [];
  for (const p of parents) {
    try {
      assertOwnsOrg(req, p, 'school');
      allowed.push(p);
    } catch {
      forbiddenIds.push(String(p._id));
    }
  }

  const results: { id: string; success: boolean; error?: string }[] = [
    ...notFoundIds.map((id) => ({ id, success: false, error: 'Not found' })),
    ...forbiddenIds.map((id) => ({ id, success: false, error: 'Not permitted' })),
  ];

  if (allowed.length > 0) {
    const userIds = allowed.map((p) => p.user).filter(Boolean);
    const profileIds = allowed.map((p) => p.profile).filter(Boolean);
    const [users, profiles] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select('+password'),
      Profile.find({ _id: { $in: profileIds } }),
    ]);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));

    const trashEntries = allowed.map((p) => {
      const userDoc = p.user ? userById.get(String(p.user)) : undefined;
      const profileDoc = p.profile ? profileById.get(String(p.profile)) : undefined;
      const label = profileDoc ? `${profileDoc.firstName} ${profileDoc.lastName}`.trim() || 'Parent' : 'Parent';
      return {
        entityType: 'Parent' as const,
        label,
        school: p.school,
        snapshots: [
          ...(userDoc ? [{ modelName: 'User', data: userDoc.toObject() }] : []),
          ...(profileDoc ? [{ modelName: 'Profile', data: profileDoc.toObject() }] : []),
          { modelName: 'Parent', data: p.toObject() },
        ],
        restoreMeta: { childrenIds: p.children },
      };
    });

    await moveManyToTrash(trashEntries, req);

    const childrenIds = allowed.flatMap((p) => p.children);
    await Promise.all([
      childrenIds.length > 0
        ? Student.updateMany({ _id: { $in: childrenIds } }, { $unset: { parent: '' } })
        : Promise.resolve(null),
      userIds.length > 0 ? User.deleteMany({ _id: { $in: userIds } }) : Promise.resolve(null),
      profileIds.length > 0 ? Profile.deleteMany({ _id: { $in: profileIds } }) : Promise.resolve(null),
      Parent.deleteMany({ _id: { $in: allowed.map((p) => p._id) } }),
    ]);

    results.push(...allowed.map((p) => ({ id: String(p._id), success: true })));
  }

  const moved = allowed.length;
  return ApiResponse.success(res, { results, moved }, `Moved ${moved} of ${ids.length} parent(s) to Trash`);
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
