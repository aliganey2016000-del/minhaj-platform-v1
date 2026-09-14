import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassSchedule from '../models/class-schedule.model';
import ApiResponse from '../utils/api-response';
import { NotFoundError } from '../utils/api-error';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

/**
 * Student-facing weekly timetable. Keep this endpoint deliberately narrow:
 * the caller can only resolve the Student record attached to their own user,
 * then only active schedules for that current class are returned.
 */
export const getMySchedules = async (req: Request, res: Response): Promise<Response> => {
  const Student = mongoose.model('Student');
  const student: any = await Student.findOne({ user: req.user!.userId }).select('class school').lean();
  if (!student) throw new NotFoundError('Student record');

  const schedules = await ClassSchedule.find({
    school: student.school,
    class: student.class,
    isActive: true,
  })
    .populate('course', 'title isLive')
    .populate({ path: 'teacher', populate: { path: 'profile', select: 'firstName lastName' } })
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, schedules);
};

/**
 * Teacher-facing timetable. Populating shiftMode here is important: the
 * teacher portal must display the class's configured shift instead of
 * guessing Morning/Afternoon/Evening from the clock time.
 */
export const getMyScheduleAsTeacher = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new NotFoundError('Teacher record');

  const schedules = await ClassSchedule.find({
    school: teacher.school,
    teacher: teacher._id,
    isActive: true,
  })
    .populate('school', 'name')
    .populate({
      path: 'class',
      select: 'title section department shiftMode room',
      populate: { path: 'department', select: 'name' },
    })
    .populate('course', 'title')
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, schedules);
};
