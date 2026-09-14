import { Request, Response } from 'express';
import Teacher from '../models/teacher.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { status, search, page = '1', limit = '10', school } = req.query;

  const filter: Record<string, any> = {};
  if (status && ['active', 'inactive', 'on_leave'].includes(status as string)) {
    filter.status = status;
  }
  if (school && req.user?.role !== 'org_admin') {
    filter.school = school as string;
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school') as Record<string, any>;
  const searchText = String(search || '').trim();

  if (searchText) {
    const terms = searchText.split(/\s+/).filter(Boolean).map((term) => new RegExp(escapeRegex(term), 'i'));
    const whole = new RegExp(escapeRegex(searchText), 'i');

    const [profiles, users] = await Promise.all([
      Profile.find({
        $and: terms.map((term) => ({
          $or: [{ firstName: term }, { lastName: term }],
        })),
      }).select('_id').lean(),
      User.find({ email: whole }).select('_id').lean(),
    ]);

    scopedFilter.$or = [
      { teacherId: whole },
      { profile: { $in: profiles.map((profile) => profile._id) } },
      { user: { $in: users.map((user) => user._id) } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [teachers, total] = await Promise.all([
    Teacher.find(scopedFilter)
      .populate('user', 'email phone isVerified isActive')
      .populate('profile', 'firstName lastName gender avatar')
      .populate('school', 'name')
      .populate('courses', 'title.en slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Teacher.countDocuments(scopedFilter),
  ]);

  return ApiResponse.paginated(res, teachers, {
    page: pageNum,
    limit: limitNum,
    total,
  });
};
