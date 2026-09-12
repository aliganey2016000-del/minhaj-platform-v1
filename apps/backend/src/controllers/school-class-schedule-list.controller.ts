import { Request, Response } from 'express';
import ClassSchedule from '../models/class-schedule.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

export const getSchoolSchedules = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = String(resolveOrgIdForCreate(req, req.query.school as string | undefined) || '');
  if (!schoolId) throw new BadRequestError('School is required');

  const school = await School.findById(schoolId).lean();
  if (!school) throw new NotFoundError('School not found');
  if (resolveInstitutionType(school as any) !== 'school') {
    throw new BadRequestError('This simplified schedule view is only available for schools');
  }

  const schedules = await ClassSchedule.find({ school: schoolId })
    .populate('school', 'name institutionType organizationType')
    .populate('class', 'title section')
    .populate('course', 'title courseCode teacher')
    .populate({
      path: 'teacher',
      select: 'teacherId user profile',
      populate: [
        { path: 'profile', select: 'firstName lastName' },
        { path: 'user', select: 'email' },
      ],
    })
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, schedules);
};
