/**
 * ClassSchedule Controller
 *
 * CRUD for class schedules + time-locked status check endpoint
 * that determines whether a teacher can currently take attendance
 * for a given course.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassSchedule from '../models/class-schedule.model';
import { getCourseScheduleStatus } from '../models/class-schedule.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter } from '../utils/tenant-scope';

// ---------------------------------------------------------------------------
// GET /class-schedules — List schedules (filterable by school, teacher, course)
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const filter = applyOrgFilter(req, {}, 'school');
  const { course, teacher, class: classId } = req.query;

  if (course) (filter as any).course = course;
  if (teacher) (filter as any).teacher = teacher;
  if (classId) (filter as any).class = classId;

  const schedules = await ClassSchedule.find(filter)
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate('course', 'title')
    .populate('teacher')
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, schedules);
};

// ---------------------------------------------------------------------------
// GET /class-schedules/:id
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  const schedule = await ClassSchedule.findById(req.params.id)
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate('course', 'title')
    .populate('teacher')
    .lean();

  if (!schedule) throw new NotFoundError('Schedule not found');

  return ApiResponse.success(res, schedule);
};

// ---------------------------------------------------------------------------
// POST /class-schedules — Create a new schedule
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const payload = {
    ...req.body,
    createdBy: new mongoose.Types.ObjectId(req.user!.userId),
  };

  const schedule = await ClassSchedule.create(payload);

  return ApiResponse.created(res, schedule, 'Schedule created');
};

// ---------------------------------------------------------------------------
// PUT /class-schedules/:id — Update a schedule
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const schedule = await ClassSchedule.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).lean();

  if (!schedule) throw new NotFoundError('Schedule not found');

  return ApiResponse.success(res, schedule, 'Schedule updated');
};

// ---------------------------------------------------------------------------
// DELETE /class-schedules/:id
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const schedule = await ClassSchedule.findByIdAndDelete(req.params.id);
  if (!schedule) throw new NotFoundError('Schedule not found');
  return ApiResponse.success(res, null, 'Schedule deleted');
};

// ---------------------------------------------------------------------------
// GET /class-schedules/status/:courseId — Time-locked status check
// ---------------------------------------------------------------------------

export const checkScheduleStatus = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  if (!courseId) throw new BadRequestError('courseId is required');

  const status = await getCourseScheduleStatus(courseId);

  return ApiResponse.success(res, status);
};

// ---------------------------------------------------------------------------
// GET /class-schedules/my — Student's own schedule
// ---------------------------------------------------------------------------

export const getMySchedules = async (req: Request, res: Response): Promise<Response> => {
  const Student = mongoose.model('Student');
  const student = await Student.findOne({ user: req.user!.userId }).lean();
  if (!student) throw new NotFoundError('Student record');

  const schedules = await ClassSchedule.find({
    class: (student as any).class,
    isActive: true,
  })
    .populate('course', 'title')
    .populate('teacher')
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, schedules);
};