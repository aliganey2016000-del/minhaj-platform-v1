import { Request, Response } from 'express';
import User from '../models/user.model';
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

  const profile = await EmployeeProfile.findOne({ user: user._id, organizationId: orgFilter(req, user.organizationId) }).lean();
  return ApiResponse.success(res, { user, employeeProfile: profile || null });
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

  const profile = existing
    ? await EmployeeProfile.findByIdAndUpdate(existing._id, payload, { new: true, runValidators: true }).lean()
    : await EmployeeProfile.create({ user: user._id, ...payload });

  return ApiResponse.success(res, profile, 'Employee profile saved successfully');
};
