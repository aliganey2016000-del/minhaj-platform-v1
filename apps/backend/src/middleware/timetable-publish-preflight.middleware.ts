import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import Course from '../models/course.model';
import TimetableDraft from '../models/timetable-draft.model';

export async function preflightTimetablePublish(req: Request, _res: Response, next: NextFunction) {
  const schoolId = String(resolveOrgIdForCreate(req, req.body?.school ? String(req.body.school) : undefined) || '');
  if (!schoolId || !mongoose.isValidObjectId(schoolId)) throw new BadRequestError('School is required');

  const draftId = String(req.params.id || '');
  if (!mongoose.isValidObjectId(draftId)) throw new BadRequestError('Timetable draft id is invalid');

  const draft: any = await TimetableDraft.findOne({ _id: draftId, school: schoolId, status: 'draft' })
    .select('entries.course entries.isActive')
    .lean();
  if (!draft) throw new NotFoundError('Timetable draft');

  const courseIds = [...new Set(
    (Array.isArray(draft.entries) ? draft.entries : [])
      .filter((entry: any) => entry?.isActive !== false)
      .map((entry: any) => String(entry?.course || ''))
      .filter((id: string) => mongoose.isValidObjectId(id)),
  )];

  if (courseIds.length === 0) return next();

  const publishedCourses = await Course.find({
    _id: { $in: courseIds },
    school: schoolId,
    status: 'published',
  }).select('_id').lean();

  if (publishedCourses.length !== courseIds.length) {
    throw new BadRequestError('Publish blocked: all active timetable courses must be published. Review draft or archived courses before publishing.');
  }

  return next();
}
