import { Request, Response } from 'express';
import School, { resolveInstitutionType } from '../models/school.model';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import * as legacy from './class-schedule.controller';
import { getSchoolSchedules } from './school-class-schedule-list.controller';

/**
 * School org-admins use the simplified, unpaginated schedule list so a full
 * weekly timetable is never silently truncated at 100 rows. Super-admin and
 * non-school institutions keep the existing comprehensive filtering/paging
 * controller unchanged.
 */
export const getAllSchedules = async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role === 'org_admin') {
    const schoolId = String(resolveOrgIdForCreate(req, req.query.school as string | undefined) || '');
    if (schoolId) {
      const school = await School.findById(schoolId).lean();
      if (school && resolveInstitutionType(school as any) === 'school') {
        return getSchoolSchedules(req, res);
      }
    }
  }
  return legacy.getAll(req, res);
};
