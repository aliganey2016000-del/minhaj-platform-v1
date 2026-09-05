import { Request, Response } from 'express';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import EmployeeProfile from '../models/employee-profile.model';
import ApiResponse from '../utils/api-response';
import { escapeRegex } from '../utils/escape-regex';

export const list = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();

  const filter: Record<string, any> = { role: 'staff' };
  if (req.user?.role === 'org_admin') filter.organizationId = req.user.organizationId;
  if (req.user?.role === 'admin' && req.query.school && req.query.school !== 'all') filter.organizationId = req.query.school;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  const users = await User.find(filter)
    .populate('department', 'name')
    .populate('organizationId', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const ids = users.map((user: any) => user._id);
  const [profiles, employeeProfiles] = await Promise.all([
    Profile.find({ user: { $in: ids } }).lean(),
    EmployeeProfile.find({ user: { $in: ids } }).lean(),
  ]);
  const profileMap = new Map(profiles.map((profile: any) => [profile.user.toString(), profile]));
  const employeeMap = new Map(employeeProfiles.map((profile: any) => [profile.user.toString(), profile]));

  const normalizedSearch = search.toLowerCase();
  const filtered = search
    ? users.filter((user: any) => {
        const profile = profileMap.get(user._id.toString());
        const employee = employeeMap.get(user._id.toString());
        const haystack = [
          user.email,
          user.phone,
          user.title,
          user.department?.name,
          profile?.firstName,
          profile?.lastName,
          employee?.employeeId,
          employee?.identityNumber,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : users;

  const total = filtered.length;
  const data = filtered.slice((page - 1) * limit, page * limit).map((user: any) => ({
    ...user,
    profile: profileMap.get(user._id.toString()) || null,
    employeeProfile: employeeMap.get(user._id.toString()) || null,
  }));

  return ApiResponse.paginated(res, data, { page, limit, total });
};
