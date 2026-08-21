import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Course from '../models/course.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { ForbiddenError, NotFoundError } from '../utils/api-error';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

/** Return the roster for one course, strictly scoped to the authenticated teacher. */
export const getRoster = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');

  const course = await Course.findOne({ _id: req.params.courseId, teacher: teacher._id })
    .select('_id')
    .lean();
  if (!course) throw new NotFoundError('Course');

  const students = await Student.find({ enrolledCourses: course._id, status: 'active' })
    .select('_id studentId profile class')
    .populate('profile', 'firstName lastName avatar')
    .populate('class', 'title section')
    .sort({ 'profile.firstName': 1, 'profile.lastName': 1 })
    .lean();

  return ApiResponse.success(res, students);
};
