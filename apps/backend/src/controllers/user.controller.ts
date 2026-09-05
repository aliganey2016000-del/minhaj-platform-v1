/**
 * User Management Controller
 * Handles CRUD for User documents (base authentication collection).
 * Super admin can manage all users across all organizations.
 * Org admin is scoped to users within their own organization only.
 */

import { Request, Response } from 'express';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import Student from '../models/student.model';
import Teacher from '../models/teacher.model';
import Parent from '../models/parent.model';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';
import { escapeRegex } from '../utils/escape-regex';
import { normalizeStaffPermissions, STAFF_PERMISSION_CATALOG } from '../utils/staff-permissions';
import * as XLSX from 'xlsx';
import School from '../models/school.model';

export const getPermissionCatalog = async (_req: Request, res: Response): Promise<Response> => {
  return ApiResponse.success(res, STAFF_PERMISSION_CATALOG);
};

export const updatePermissions = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findById(req.params.id);
  if (!user) throw new NotFoundError('User');
  if (user.role !== 'staff') throw new BadRequestError('Permissions can only be assigned to Staff users');

  if (req.user?.role === 'org_admin' && user.organizationId?.toString() !== req.user.organizationId?.toString()) {
    throw new ForbiddenError('You can only manage users in your own organization');
  }

  user.permissions = normalizeStaffPermissions(req.body.permissions) as any;
  await user.save();
  return ApiResponse.success(res, { userId: user._id, permissions: user.permissions }, 'Staff permissions updated successfully');
};

// ---------------------------------------------------------------------------
// List Users (admin / org_admin)
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
  const role = req.query.role as string | undefined;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const school = req.query.school as string | undefined;

  const filter: Record<string, unknown> = {};

  // Build organization filter manually for full control over null handling.
  // Super admin: sees ALL users across all orgs + users with no org (null).
  //   When ?school= is provided, filters to just that org.
  // Org admin: sees ONLY users in their own organization (including org_admins
  //   and teachers within their org).
  if (req.user?.role === 'org_admin') {
    // Org admin is strictly scoped to their own organization
    filter.organizationId = req.user.organizationId;
  } else if (school === 'all') {
    // Super admin requesting "All Organizations" — no org filter at all
    // (leave filter.organizationId undefined = match all)
  } else if (school) {
    // Super admin filtered to a specific organization
    filter.organizationId = school;
  }
  // If no school param and super admin: no org filter (sees all users)

  if (role) filter.role = role;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  if (search) {
    filter.$or = [
      { email: { $regex: escapeRegex(search as string), $options: 'i' } },
    ];
  }

  // When search is active, we need to find all matching users first (post-filter
  // on profile names), then paginate. Otherwise paginate at the DB level.
  if (search) {
    // Fetch ALL users matching role/status/org filters (no pagination yet)
    const allUsers = await User.find(filter)
      .populate('organizationId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // Resolve profiles for name-based filtering
    const profileIds = allUsers.map((u: any) => u._id);
    const profiles = await Profile.find({ user: { $in: profileIds } })
      .select('user firstName lastName gender')
      .lean();
    const profileMap = new Map(profiles.map((p: any) => [p.user.toString(), p]));

    // Apply name + email search filter
    let filtered = allUsers.filter((u: any) => {
      const prof = profileMap.get(u._id.toString());
      const fullName = prof ? `${prof.firstName} ${prof.lastName}`.toLowerCase() : '';
      return (
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        fullName.includes(search.toLowerCase())
      );
    });

    // Attach profiles
    filtered = filtered.map((u: any) => {
      const prof = profileMap.get(u._id.toString());
      return { ...u, profile: prof || null };
    });

    // Paginate the in-memory results
    const totalFiltered = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return ApiResponse.paginated(res, paginated, { page, limit, total: totalFiltered });
  }

  // No search — paginate directly at the database level
  const [users, total] = await Promise.all([
    User.find(filter)
      .populate('organizationId', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  // Attach profiles to paginated results
  const profileIds = users.map((u: any) => u._id);
  const profiles = await Profile.find({ user: { $in: profileIds } })
    .select('user firstName lastName gender')
    .lean();
  const profileMap = new Map(profiles.map((p: any) => [p.user.toString(), p]));

  const results = users.map((u: any) => {
    const prof = profileMap.get(u._id.toString());
    return { ...u, profile: prof || null };
  });

  return ApiResponse.paginated(res, results, { page, limit, total });
};

// ---------------------------------------------------------------------------
// Get Single User
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findById(req.params.id)
    .populate('organizationId', 'name')
    .lean();

  if (!user) throw new NotFoundError('User');

  const profile = await Profile.findOne({ user: user._id }).select('firstName lastName gender').lean();

  return ApiResponse.success(res, { ...user, profile: profile || null });
};

// ---------------------------------------------------------------------------
// Create User (admin / org_admin)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { email, password, firstName, lastName, gender, role, organizationId } = req.body;

  // Validate required fields
  if (!email || !password || !firstName || !lastName || !gender || !role) {
    throw new BadRequestError('Email, password, first name, last name, gender, and role are required');
  }

  if (role === 'staff' && req.user?.role === 'admin' && !organizationId) {
    throw new BadRequestError('Organization is required when creating Staff');
  }

  // Check if email already exists
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ConflictError('A user with this email already exists');

  // Role restrictions for org_admin
  if (req.user?.role === 'org_admin') {
    if (role === 'admin' || role === 'org_admin') {
      throw new ForbiddenError('You cannot create users with admin or org_admin roles');
    }
    // org_admin always creates users in their own org
    if (organizationId && organizationId !== req.user.organizationId?.toString()) {
      throw new ForbiddenError('You can only create users in your own organization');
    }
  }

  const resolvedOrgId = req.user?.role === 'org_admin'
    ? req.user.organizationId
    : (organizationId || null);

  const user = await User.create({
    email: email.toLowerCase(),
    password,
    role,
    organizationId: resolvedOrgId || undefined,
    isVerified: true, // Admin-created users are pre-verified
  });

  const profile = await Profile.create({ user: user._id, firstName, lastName, gender });

  // This page is the generic "any role" entry point, but Student/Teacher/
  // Parent each have their own domain collection that the rest of the app
  // (Manage Students, class enrollment, fee tracking, etc.) actually reads
  // from — a bare User+Profile with no matching record would be invisible
  // everywhere except this page. Create it here so the two stay in sync.
  if (role === 'student') {
    await Student.create({
      user: user._id, profile: profile._id,
      school: resolvedOrgId || undefined,
      enrollmentDate: new Date(),
    });
  } else if (role === 'teacher') {
    const count = await Teacher.countDocuments();
    await Teacher.create({
      user: user._id, profile: profile._id,
      teacherId: `TCH-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
      school: resolvedOrgId || undefined,
    });
  } else if (role === 'parent') {
    const count = await Parent.countDocuments();
    await Parent.create({
      user: user._id, profile: profile._id,
      parentId: `PRN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
      school: resolvedOrgId || undefined,
      children: [],
    });
  }

  const populated = await User.findById(user._id)
    .populate('organizationId', 'name')
    .lean();

  return ApiResponse.created(res, { ...populated, profile }, 'User created successfully');
};

// ---------------------------------------------------------------------------
// Update User (admin / org_admin)
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findById(req.params.id);
  if (!user) throw new NotFoundError('User');

  // Org admin can only update users in their own org
  if (req.user?.role === 'org_admin') {
    if (user.organizationId?.toString() !== req.user.organizationId?.toString()) {
      throw new ForbiddenError('You can only manage users in your own organization');
    }
    // Org admin cannot change role or organizationId
    if (req.body.role && req.body.role !== user.role) {
      throw new ForbiddenError('You cannot change user roles');
    }
    if (req.body.organizationId && req.body.organizationId !== user.organizationId?.toString()) {
      throw new ForbiddenError('You cannot change a user\'s organization');
    }
  }

  const allowedUpdates = ['email', 'role', 'organizationId', 'isActive', 'isVerified', 'phone'];
  const updates: Record<string, unknown> = {};

  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  if (updates.email) {
    const dup = await User.findOne({ email: (updates.email as string).toLowerCase(), _id: { $ne: user._id } });
    if (dup) throw new ConflictError('Another user with this email already exists');
    updates.email = (updates.email as string).toLowerCase();
  }

  const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    .populate('organizationId', 'name')
    .lean();

  if (!updated) throw new NotFoundError('User');

  if (req.body.password) {
    user.password = req.body.password;
    await user.save();
  }

  // Name/gender live on the separate Profile document — some legacy users
  // (e.g. ones created before this page collected a gender) have none at
  // all, so create it on first edit rather than silently dropping the name.
  const { firstName, lastName, gender } = req.body;
  if (firstName !== undefined || lastName !== undefined || gender !== undefined) {
    const profileUpdate: Record<string, unknown> = {};
    if (firstName !== undefined) profileUpdate.firstName = firstName;
    if (lastName !== undefined) profileUpdate.lastName = lastName;
    if (gender !== undefined) profileUpdate.gender = gender;

    const existingProfile = await Profile.findOne({ user: updated._id });
    if (existingProfile) {
      Object.assign(existingProfile, profileUpdate);
      await existingProfile.save();
    } else if (firstName && lastName && gender) {
      await Profile.create({ user: updated._id, firstName, lastName, gender });
    }
  }

  const profile = await Profile.findOne({ user: updated._id }).select('firstName lastName gender').lean();

  return ApiResponse.success(res, { ...updated, profile }, 'User updated successfully');
};

// ---------------------------------------------------------------------------
// Delete / Deactivate User (admin / org_admin)
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findById(req.params.id);
  if (!user) throw new NotFoundError('User');

  // Prevent self-deletion
  if (user._id.toString() === req.user?.userId) {
    throw new BadRequestError('You cannot delete your own account');
  }

  // Org admin can only delete users in their own org
  if (req.user?.role === 'org_admin') {
    if (user.organizationId?.toString() !== req.user.organizationId?.toString()) {
      throw new ForbiddenError('You can only manage users in your own organization');
    }
    // Org admin cannot delete admins or other org_admins
    if (user.role === 'admin' || user.role === 'org_admin') {
      throw new ForbiddenError('You cannot delete admin users');
    }
  }

  // Soft-delete: set isActive to false
  user.isActive = false;
  await user.save();

  return ApiResponse.noContent(res, 'User deactivated successfully');
};

function spreadsheetField(row: Record<string, unknown>, ...names: string[]): string {
  const key = Object.keys(row).find((candidate) => names.some((name) => candidate.trim().toLowerCase() === name.toLowerCase()));
  return key ? String(row[key] ?? '').trim() : '';
}

export const exportStaff = async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = { role: 'staff' };
  if (req.user?.role === 'org_admin') filter.organizationId = req.user.organizationId;
  else if (req.query.school) filter.organizationId = req.query.school;

  const users = await User.find(filter).populate('organizationId', 'name').sort({ createdAt: -1 }).lean();
  const profileIds = users.map((item: any) => item._id);
  const profiles = await Profile.find({ user: { $in: profileIds } }).select('user firstName lastName gender').lean();
  const profileMap = new Map(profiles.map((item: any) => [item.user.toString(), item]));
  const rows = users.map((item: any) => {
    const profile = profileMap.get(item._id.toString());
    return {
      'First Name': profile?.firstName || '', 'Last Name': profile?.lastName || '',
      Gender: profile?.gender || '', Email: item.email || '', Phone: item.phone || '',
      Organization: item.organizationId?.name || '', Status: item.isActive ? 'active' : 'inactive',
    };
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Staff');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=staff-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

export const downloadStaffTemplate = async (_req: Request, res: Response): Promise<void> => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([{
    'First Name': 'Ahmed', 'Last Name': 'Hassan', Gender: 'male', Email: 'ahmed@example.com',
    Password: 'ChangeMe123', Phone: '+252612345678', Organization: 'Organization name (required for Super Admin)',
  }]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Staff Template');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=staff-template.xlsx');
  res.end(buffer);
};

export const importStaff = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel file is required (field name "file")');
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new BadRequestError('The uploaded file has no sheets');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const errors: { row: number; message: string }[] = [];
  let created = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    try {
      const firstName = spreadsheetField(row, 'First Name', 'First');
      const lastName = spreadsheetField(row, 'Last Name', 'Last');
      const email = spreadsheetField(row, 'Email').toLowerCase();
      const password = spreadsheetField(row, 'Password') || 'ChangeMe123';
      const gender = spreadsheetField(row, 'Gender').toLowerCase() || 'male';
      if (!firstName || !lastName || !email) throw new Error('First Name, Last Name and Email are required');
      if (await User.exists({ email })) throw new Error(`Email "${email}" is already registered`);

      let organizationId = req.user?.role === 'org_admin' ? req.user.organizationId : undefined;
      if (!organizationId) {
        const organizationName = spreadsheetField(row, 'Organization', 'School');
        if (!organizationName) throw new Error('Organization is required for Super Admin');
        const organization = await School.findOne({ name: new RegExp(`^${organizationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('_id').lean();
        if (!organization) throw new Error(`Organization "${organizationName}" was not found`);
        organizationId = organization._id.toString();
      }

      const user = await User.create({ email, password, phone: spreadsheetField(row, 'Phone') || undefined, role: 'staff', organizationId, isVerified: true, isActive: true });
      await Profile.create({ user: user._id, firstName, lastName, gender: gender === 'female' ? 'female' : 'male' });
      created += 1;
    } catch (error: any) {
      errors.push({ row: rowNumber, message: error.message || 'Could not import row' });
    }
  }

  return ApiResponse.success(res, { totalRows: rows.length, created, failed: errors.length, errors }, 'Staff import completed');
};