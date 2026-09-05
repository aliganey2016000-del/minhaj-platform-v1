import { Request, Response } from 'express';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import EmployeeProfile from '../models/employee-profile.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';

function assertStaff(user: any, req: Request) {
  if (user.role !== 'staff') throw new BadRequestError('Employee profile is only available for Staff users');
  if (req.user?.role === 'org_admin' && user.organizationId?.toString() !== req.user.organizationId?.toString()) {
    throw new ForbiddenError('You can only manage Staff in your own organization');
  }
}

function orgFilter(req: Request, organizationId: any) {
  if (req.user?.role === 'org_admin') return req.user.organizationId;
  return organizationId;
}

export const get = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findById(req.params.id).populate('department', 'name').lean();
  if (!user) throw new NotFoundError('User');
  assertStaff(user, req);

  const [profile, employeeProfile] = await Promise.all([
    Profile.findOne({ user: user._id }).lean(),
    EmployeeProfile.findOne({ user: user._id, organizationId: orgFilter(req, user.organizationId) }).lean(),
  ]);
  return ApiResponse.success(res, { user, profile: profile || null, employeeProfile: employeeProfile || null });
};

export const upsert = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findById(req.params.id);
  if (!user) throw new NotFoundError('User');
  assertStaff(user, req);
  const organizationId = orgFilter(req, user.organizationId);
  if (!organizationId) throw new BadRequestError('Staff member must belong to an organization');

  const existing = await EmployeeProfile.findOne({ user: user._id, organizationId });
  const employeeId = String(req.body.employeeId || existing?.employeeId || '').trim();
  if (!employeeId) throw new BadRequestError('Employee ID is required');

  const duplicate = await EmployeeProfile.findOne({ organizationId, employeeId, user: { $ne: user._id } });
  if (duplicate) throw new BadRequestError('Employee ID is already used in this organization');

  const profilePayload = {
    firstName: String(req.body.firstName || '').trim(),
    lastName: String(req.body.lastName || '').trim(),
    gender: req.body.gender || 'male',
    dateOfBirth: req.body.dateOfBirth || null,
    address: req.body.address || {},
    emergencyContact: req.body.emergencyContact || {},
  };
  if (!profilePayload.firstName || !profilePayload.lastName) {
    throw new BadRequestError('First name and last name are required');
  }
  const currentProfile = await Profile.findOne({ user: user._id });
  if (currentProfile) {
    await Profile.findByIdAndUpdate(currentProfile._id, profilePayload, { new: true, runValidators: true });
  } else {
    await Profile.create({ user: user._id, ...profilePayload });
  }

  if (req.body.email !== undefined) user.email = String(req.body.email).trim().toLowerCase();
  if (req.body.phone !== undefined) user.phone = String(req.body.phone || '').trim() || undefined;
  if (req.body.title !== undefined) user.title = String(req.body.title || '').trim();
  if (req.body.department !== undefined) user.department = req.body.department || undefined;
  await user.save();

  const payload = {
    organizationId,
    employeeId,
    dateOfBirth: req.body.dateOfBirth || null,
    identityNumber: String(req.body.identityNumber || '').trim(),
    address: req.body.address || {},
    emergencyContact: req.body.emergencyContact || {},
    qualification: String(req.body.qualification || '').trim(),
    specialization: String(req.body.specialization || '').trim(),
    joiningDate: req.body.joiningDate || null,
    employmentType: req.body.employmentType || 'full_time',
    employmentStatus: req.body.employmentStatus || 'active',
    notes: String(req.body.notes || '').trim(),
  };

  const employeeProfile = existing
    ? await EmployeeProfile.findByIdAndUpdate(existing._id, payload, { new: true, runValidators: true }).lean()
    : await EmployeeProfile.create({ user: user._id, ...payload });

  return ApiResponse.success(res, employeeProfile, 'Staff profile saved successfully');
};
