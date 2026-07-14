/**
 * Parent Controller
 * Full CRUD for parents. Admin only.
 */

import { Request, Response } from 'express';
import Parent from '../models/parent.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import Student from '../models/student.model';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

// ---------------------------------------------------------------------------
// GET /parents — List all with optional filters
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { status, search, page = '1', limit = '10' } = req.query;

  const filter: any = {};
  if (status && ['active', 'inactive'].includes(status as string)) {
    filter.status = status;
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 10));

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  const [parents, total] = await Promise.all([
    Parent.find(scopedFilter)
      .populate('user', 'email isVerified isActive')
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
    .populate('user', 'email isVerified isActive preferredLanguage')
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
    .populate('user', 'email isVerified isActive')
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

  const { firstName, lastName, gender, occupation, relationship, address, status } = req.body;

  if (firstName || lastName || gender) {
    const profileUpdate: any = {};
    if (firstName) profileUpdate.firstName = firstName;
    if (lastName) profileUpdate.lastName = lastName;
    if (gender) profileUpdate.gender = gender;
    await Profile.findByIdAndUpdate(parent.profile, profileUpdate);
  }

  if (occupation !== undefined) parent.occupation = occupation;
  if (relationship !== undefined) parent.relationship = relationship;
  if (address !== undefined) parent.address = address;
  if (status !== undefined) parent.status = status;

  await parent.save();

  const updated = await Parent.findById(parent._id)
    .populate('user', 'email isVerified isActive')
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