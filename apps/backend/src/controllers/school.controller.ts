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
import Student from '../models/student.model';
import Teacher from '../models/teacher.model';
import Parent from '../models/parent.model';
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
  const { adminPassword, ...schoolFields } = req.body;

  if (!adminPassword || String(adminPassword).length < 8) {
    throw new BadRequestError('Admin password is required and must be at least 8 characters');
  }

  const payload = {
    ...schoolFields,
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
        // Create new org_admin user — password is the admin password set
        // during registration; the User model's pre-save hook bcrypt-hashes
        // it exactly once. Do NOT hash it here too, or comparePassword()
        // will never match.
        const orgAdmin = await User.create({
          email: schoolEmail.toLowerCase(),
          password: adminPassword,
          role: 'org_admin',
          organizationId: school._id,
          isVerified: true,
          isActive: true,
          preferredLanguage: 'en',
        });
        await Profile.create({
          user: orgAdmin._id,
          firstName: req.body.principalName || 'Principal',
          lastName: 'Admin',
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

  const baseDomain = process.env.BASE_DOMAIN || 'sahaledu.com';
  const portalUrl = `https://${school.slug}.${baseDomain}`;

  return ApiResponse.created(
    res,
    {
      school: populated,
      portalUrl,
      slug: school.slug,
    },
    orgAdminWarning || 'School registered successfully'
  );
};

// ---------------------------------------------------------------------------
// PATCH /schools/:id — Update a school
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const updates = { ...req.body };
  const adminPassword = updates.adminPassword as string | undefined;
  delete updates.adminPassword;

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

  // ── Reset the org admin's login password, if the caller provided a new
  // one. Left blank on the edit form = leave the existing password alone.
  // Self-heals orgs whose org_admin login account never got provisioned
  // (e.g. a past registration where the auto-create step silently failed) —
  // find by org binding first, fall back to email, and create one from
  // scratch as a last resort so "Reset Password" always leaves a working
  // login behind rather than a silent no-op. ──
  if (adminPassword) {
    if (String(adminPassword).length < 8) {
      throw new BadRequestError('Admin password must be at least 8 characters');
    }

    const loginEmail = ((updates.email as string | undefined) || '').toLowerCase().trim();

    const byOrg = await User.findOne({ organizationId: req.params.id, role: 'org_admin' }).select('+password +failedLoginAttempts +lockedUntil');
    const byEmail = !byOrg && loginEmail
      ? await User.findOne({ email: loginEmail }).select('+password +failedLoginAttempts +lockedUntil')
      : null;

    // A match found only by email (no org_admin already bound to this org)
    // must already BE an org_admin — otherwise it's someone else's account
    // (a parent, student, teacher...) that happens to share this email, and
    // silently repurposing their role/org would hijack it out from under them.
    if (byEmail && byEmail.role !== 'org_admin') {
      throw new BadRequestError(
        `"${loginEmail}" already belongs to an existing ${byEmail.role} account. Choose a different login email for this organization's admin, or change that account's role first.`
      );
    }

    const orgAdminUser = byOrg || byEmail;

    if (orgAdminUser) {
      orgAdminUser.password = adminPassword; // pre-save hook hashes it
      orgAdminUser.role = 'org_admin';
      orgAdminUser.organizationId = new mongoose.Types.ObjectId(req.params.id);
      // The account may have been linked by organizationId while its stored
      // email drifted from what's shown on the org record (legacy data) —
      // keep them in sync so login with the displayed "Login Email" works.
      if (loginEmail && orgAdminUser.email !== loginEmail) {
        const emailTaken = await User.exists({ email: loginEmail, _id: { $ne: orgAdminUser._id } });
        if (emailTaken) {
          throw new BadRequestError(`Another account already uses "${loginEmail}" as its login email.`);
        }
        orgAdminUser.email = loginEmail;
      }
      orgAdminUser.isActive = true;
      orgAdminUser.isVerified = true;
      orgAdminUser.failedLoginAttempts = 0;
      orgAdminUser.lockedUntil = undefined;
      await orgAdminUser.save();
    } else if (loginEmail) {
      const created = await User.create({
        email: loginEmail,
        password: adminPassword,
        role: 'org_admin',
        organizationId: req.params.id,
        isVerified: true,
        isActive: true,
        preferredLanguage: 'en',
      });
      await Profile.create({
        user: created._id,
        firstName: (updates.principalName as string) || 'Org',
        lastName: 'Admin',
        gender: 'male',
      });
    }
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
  // This is a hard delete with no undo — refuse it while the organization
  // still has real people in it, so it can't wipe out an org's data by
  // mistake. Deactivate the org (PATCH /:id/status) instead if the goal is
  // to disable it without destroying anything.
  const [studentCount, teacherCount, parentCount] = await Promise.all([
    Student.countDocuments({ school: req.params.id }),
    Teacher.countDocuments({ school: req.params.id }),
    Parent.countDocuments({ school: req.params.id }),
  ]);
  const total = studentCount + teacherCount + parentCount;
  if (total > 0) {
    throw new BadRequestError(
      `Cannot delete: this organization still has ${studentCount} student(s), ${teacherCount} teacher(s), and ${parentCount} parent(s) linked. Reassign or remove them first, or deactivate the organization instead of deleting it.`
    );
  }

  const school = await School.findByIdAndDelete(req.params.id);

  if (!school) {
    throw new NotFoundError('School not found');
  }

  return ApiResponse.success(res, null, 'School deleted successfully');
};