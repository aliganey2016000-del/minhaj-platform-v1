import { Request, Response } from 'express';
import Course from '../models/course.model';
import Student from '../models/student.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { ForbiddenError, NotFoundError } from '../utils/api-error';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

/**
 * Return the roster for one course, strictly scoped to the authenticated teacher.
 *
 * Course-based organizations use the student's explicit enrolledCourses list.
 * Class-based organizations use the course's assigned Class and include every
 * active student currently belonging to that class, even when the student was
 * never individually enrolled in the course.
 */
export const getRoster = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');

  const course = await Course.findOne({ _id: req.params.courseId, teacher: teacher._id })
    .select('_id school class')
    .lean();
  if (!course) throw new NotFoundError('Course');

  const school = course.school
    ? await School.findById(course.school).select('attendanceType').lean()
    : null;

  const isClassBased = school?.attendanceType === 'class_based' && !!course.class;

  const rosterFilter = isClassBased
    ? { class: course.class, status: 'active' }
    : { enrolledCourses: course._id, status: 'active' };

  const students = await Student.find(rosterFilter)
    .select('_id studentId profile class status')
    .populate('profile', 'firstName lastName avatar')
    .populate('class', 'title section')
    .sort({ studentId: 1 })
    .lean();

  return ApiResponse.success(res, students);
};
