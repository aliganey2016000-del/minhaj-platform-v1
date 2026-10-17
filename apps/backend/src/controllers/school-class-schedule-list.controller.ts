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

  const loadSchedules = () => ClassSchedule.find({ school: schoolId })
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

  let schedules = await loadSchedules();

  // The course owns its teacher. Lessons saved before a course's teacher was
  // changed still carry the old one; bring them in line (once) so the timetable
  // and the conflict checks agree with Course Management.
  const stale = (schedules as any[]).filter((item) => {
    const courseTeacher = item.course?.teacher ? String(item.course.teacher) : '';
    return courseTeacher && String(item.teacher?._id || item.teacher || '') !== courseTeacher;
  });
  if (stale.length) {
    await ClassSchedule.bulkWrite(stale.map((item: any) => ({
      updateOne: { filter: { _id: item._id }, update: { $set: { teacher: item.course.teacher } } },
    })));
    schedules = await loadSchedules();
  }

  return ApiResponse.success(res, schedules);
};
