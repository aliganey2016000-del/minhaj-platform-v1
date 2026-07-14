/**
 * School Controller
 *
 * Handles school-related HTTP requests:
 * CRUD operations for school management.
 * Only admins can manage schools.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import School from '../models/school.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';

// ---------------------------------------------------------------------------
// GET /schools — List all with pagination, search, and filters
//
// org_admin is scoped to ONLY their own organization — a school doesn't
// have an "organizationId" field pointing elsewhere, it IS the tenant, so
// the scope is applied directly against `_id` rather than via tenant-scope.ts.
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const {
    status,
    page = '1',
    limit = '20',
    search,
  } = req.query;

  const filter: Record<string, unknown> = {};
  if (status && ['active', 'inactive'].includes(status as string)) {
    filter.status = status;
  }
  if (req.user?.role === 'org_admin') {
    filter._id = req.user.organizationId || null; // null → matches nothing if somehow unset
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [schools, total] = await Promise.all([
    School.find(filter)
      .populate('createdBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    School.countDocuments(filter),
  ]);

  let result = schools;
  if (search) {
    const s = (search as string).toLowerCase();
    result = schools.filter((item: any) => {
      const name = (item.name || '').toLowerCase();
      const email = (item.email || '').toLowerCase();
      const principal = (item.principalName || '').toLowerCase();
      const address = (item.address || '').toLowerCase();
      return name.includes(s) || email.includes(s) || principal.includes(s) || address.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, {
    page: pageNum,
    limit: limitNum,
    total: search ? result.length : total,
  });
};

// ---------------------------------------------------------------------------
// GET /schools/:id — Get single school
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role === 'org_admin' && req.params.id !== req.user.organizationId) {
    throw new ForbiddenError("You do not have permission to view another organization's details.");
  }

  const school = await School.findById(req.params.id)
    .populate('createdBy', 'email')
    .lean();

  if (!school) {
    throw new NotFoundError('School not found');
  }

  return ApiResponse.success(res, school);
};

// ---------------------------------------------------------------------------
// POST /schools — Create a new school
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const payload = {
    ...req.body,
    createdBy: new mongoose.Types.ObjectId(req.user!.userId),
  };

  const school = await School.create(payload);

  // ── Auto-assign Org_Admin user for this school's principal email ──
  // Isolated in its own try/catch: the school itself is already created at
  // this point, so a failure here must never turn into a 500 that leaves the
  // admin thinking the whole registration failed while the org actually
  // exists without a login. We log it clearly and surface a warning instead.
  const schoolEmail = req.body.email as string | undefined;
  let orgAdminWarning: string | null = null;

  if (schoolEmail) {
    try {
      const existingUser = await User.findOne({ email: schoolEmail.toLowerCase() });
      if (existingUser) {
        // Update existing user's role and organizationId
        existingUser.role = 'org_admin';
        existingUser.organizationId = school._id;
        existingUser.isActive = true;
        existingUser.isVerified = true;
        await existingUser.save({ validateBeforeSave: false });
      } else {
        // Create new org_admin user — password is the raw phone number;
        // the User model's pre-save hook bcrypt-hashes it exactly once.
        // Do NOT hash it here too, or comparePassword() will never match.
        const orgAdmin = await User.create({
          email: schoolEmail.toLowerCase(),
          password: (req.body.phone as string) || 'ChangeMe@123',
          role: 'org_admin',
          organizationId: school._id,
          isVerified: true,
          isActive: true,
          preferredLanguage: 'en',
        });
        await Profile.create({
          user: orgAdmin._id,
          firstName: req.body.principalName || 'Principal',
          lastName: '',
          gender: 'male',
        });
      }
    } catch (err: any) {
      console.error(`[school.create] Failed to sync org_admin user for "${schoolEmail}":`, err);
      orgAdminWarning = `Organization was created, but the admin login account could not be provisioned automatically (${err.message}). Please check for an existing account with this email or contact support.`;
    }
  }

  const populated = await School.findById(school._id)
    .populate('createdBy', 'email')
    .lean();

  return ApiResponse.created(
    res,
    populated,
    orgAdminWarning || 'School registered successfully'
  );
};

// ---------------------------------------------------------------------------
// PATCH /schools/:id — Update a school
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const updates = { ...req.body };

  if (req.user?.role === 'org_admin') {
    if (req.params.id !== req.user.organizationId) {
      throw new ForbiddenError("You do not have permission to update another organization.");
    }
    // Activation/suspension is super-admin only, via PATCH /:id/status —
    // strip it here so an org_admin can't reactivate/suspend themselves
    // through the general-purpose update endpoint.
    delete updates.status;
    delete updates.createdBy;
  }

  const school = await School.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  )
    .populate('createdBy', 'email')
    .lean();

  if (!school) {
    throw new NotFoundError('School not found');
  }

  return ApiResponse.success(res, school, 'School updated successfully');
};

// ---------------------------------------------------------------------------
// PATCH /schools/:id/status — Toggle school status
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;

  if (!status || !['active', 'inactive'].includes(status)) {
    throw new BadRequestError('Status must be "active" or "inactive"');
  }

  const school = await School.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  )
    .populate('createdBy', 'email')
    .lean();

  if (!school) {
    throw new NotFoundError('School not found');
  }

  return ApiResponse.success(res, school, `School ${status === 'active' ? 'activated' : 'deactivated'}`);
};

// ---------------------------------------------------------------------------
// DELETE /schools/:id — Remove a school
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const school = await School.findByIdAndDelete(req.params.id);

  if (!school) {
    throw new NotFoundError('School not found');
  }

  return ApiResponse.success(res, null, 'School deleted successfully');
};