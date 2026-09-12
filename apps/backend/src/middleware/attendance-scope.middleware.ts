import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Course from '../models/course.model';
import ClassSchedule from '../models/class-schedule.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { assertTeacherOwnsCourse, resolveViewableOrgId } from '../utils/tenant-scope';

/**
 * Shared read/write guard for generic attendance endpoints.
 *
 * Platform admins may access any course. Every other role is restricted to
 * the organization embedded in its JWT; teachers are additionally restricted
 * to courses they teach. When a schedule id is supplied, it must belong to
 * the same course and organization. This closes the historical cross-tenant
 * gap where a caller who knew another tenant's course id could query or write
 * attendance through the generic endpoints.
 */
export async function attendanceCourseScope(req: Request, _res: Response, next: NextFunction) {
  try {
    const rawCourseId = req.body?.course ?? req.query?.courseId;
    if (!rawCourseId) return next();

    const courseId = String(rawCourseId);
    if (!mongoose.isValidObjectId(courseId)) throw new BadRequestError('A valid course is required.');

    const course: any = await Course.findById(courseId).select('_id school class teacher').lean();
    if (!course) throw new NotFoundError('Course');

    if (req.user?.role !== 'admin') {
      const orgId = resolveViewableOrgId(req);
      if (!orgId) throw new ForbiddenError('Your account is not assigned to an organization.');
      if (!course.school || String(course.school) !== String(orgId)) {
        throw new ForbiddenError("You do not have permission to access another organization's attendance.");
      }
      await assertTeacherOwnsCourse(req, courseId);
    }

    const rawScheduleId = req.body?.schedule ?? req.query?.schedule;
    if (rawScheduleId) {
      const scheduleId = String(rawScheduleId);
      if (!mongoose.isValidObjectId(scheduleId)) throw new BadRequestError('A valid schedule is required.');
      const schedule: any = await ClassSchedule.findById(scheduleId).select('_id school course class teacher').lean();
      if (!schedule) throw new NotFoundError('Schedule');
      if (String(schedule.course) !== courseId || String(schedule.school) !== String(course.school)) {
        throw new ForbiddenError('This schedule does not belong to the selected course and organization.');
      }
      (req as any).attendanceSchedule = schedule;
    }

    (req as any).attendanceCourse = course;
    return next();
  } catch (error) {
    return next(error);
  }
}
