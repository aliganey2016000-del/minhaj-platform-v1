import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Course from '../models/course.model';
import ClassSchedule from '../models/class-schedule.model';
import Student from '../models/student.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import {
  assertTeacherOwnsCourse,
  getOwnParentRecord,
  getOwnTeacherRecord,
  resolveViewableOrgId,
} from '../utils/tenant-scope';

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
      const schedule: any = await ClassSchedule.findById(scheduleId).select('_id school course class teacher dayOfWeek').lean();
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

/** Restrict student-level attendance summaries to legitimate relationships. */
export async function attendanceStudentScope(req: Request, _res: Response, next: NextFunction) {
  try {
    const studentId = String(req.params.studentId || req.query.studentId || '');
    if (!mongoose.isValidObjectId(studentId)) throw new BadRequestError('A valid student is required.');
    const student: any = await Student.findById(studentId).select('_id user parent school class enrolledCourses').lean();
    if (!student) throw new NotFoundError('Student');

    const role = req.user?.role;
    if (role === 'admin') {
      (req as any).attendanceStudent = student;
      return next();
    }

    const orgId = resolveViewableOrgId(req);
    if (!orgId || !student.school || String(student.school) !== String(orgId)) {
      throw new ForbiddenError("You do not have permission to access another organization's student attendance.");
    }

    if (role === 'student') {
      if (String(student.user) !== String(req.user?.userId)) throw new ForbiddenError('You can only view your own attendance.');
    } else if (role === 'parent') {
      const parent: any = await getOwnParentRecord(req);
      const isChild = parent?.children?.some((child: any) => String(child) === studentId);
      if (!isChild) throw new ForbiddenError("You can only view your own children's attendance.");
    } else if (role === 'teacher') {
      const teacher = await getOwnTeacherRecord(req);
      if (!teacher) throw new ForbiddenError('Teacher record not found.');
      const enrolled = Array.isArray(student.enrolledCourses) ? student.enrolledCourses : [];
      const teachesStudent = await Course.exists({
        teacher: teacher._id,
        school: orgId,
        $or: [
          ...(student.class ? [{ class: student.class }] : []),
          ...(enrolled.length ? [{ _id: { $in: enrolled } }] : []),
        ],
      });
      if (!teachesStudent) throw new ForbiddenError('You can only view attendance for students you teach.');
    } else if (role !== 'org_admin') {
      throw new ForbiddenError('You do not have permission to view this attendance summary.');
    }

    (req as any).attendanceStudent = student;
    return next();
  } catch (error) {
    return next(error);
  }
}
