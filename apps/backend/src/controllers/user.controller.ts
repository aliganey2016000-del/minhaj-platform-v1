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
      { email: { $regex: search, $options: 'i' } },
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

  const allowedUpdates = ['email', 'role', 'organizationId', 'isActive', 'isVerified'];
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