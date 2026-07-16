/**
 * ClassSchedule Controller
 *
 * CRUD for class schedules + time-locked status check endpoint
 * that determines whether a teacher can currently take attendance
 * for a given course.
 *
 * GET /class-schedules supports:
 *   ?school=<id>   — filter by organization (super admin); org_admin auto-scoped
 *   ?day=<0-6>     — filter by day of week (0=Sunday…6=Saturday)
 *   ?search=<term> — search by course title, teacher name, or class title
 *   ?page=&limit=  — pagination
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassSchedule from '../models/class-schedule.model';
import { getCourseScheduleStatus } from '../models/class-schedule.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter } from '../utils/tenant-scope';

// ---------------------------------------------------------------------------
// GET /class-schedules — List schedules (paginated, filterable)
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');

  const { course, teacher, class: classId, day, search } = req.query;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

  if (course) filter.course = course;
  if (teacher) filter.teacher = teacher;
  if (classId) filter.class = classId;
  if (day !== undefined && day !== '') {
    const dayNum = parseInt(day as string, 10);
    if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
      filter.dayOfWeek = dayNum;
    }
  }

  // For search we need to build an $or across populated fields — but populate
  // happens after find(), so we do search post-query for simplicity.
  const hasSearch = typeof search === 'string' && search.trim().length > 0;

  const [schedules, total] = await Promise.all([
    ClassSchedule.find(filter)
      .populate('school', 'name')
      .populate('class', 'title section')
      .populate('course', 'title')
      .populate('teacher', 'user profile')
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean(),
    ClassSchedule.countDocuments(filter),
  ]);

  // Post-populate search + pagination
  let filtered = schedules;
  if (hasSearch) {
    const s = (search as string).toLowerCase();
    filtered = schedules.filter((sch: any) => {
      const courseTitle = (sch.course?.title?.en || sch.course?.title || '').toLowerCase();
      const teacherName = [
        sch.teacher?.profile?.firstName,
        sch.teacher?.profile?.lastName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const className = (sch.class?.title || '').toLowerCase();
      const schoolName = (sch.school?.name || '').toLowerCase();
      return (
        courseTitle.includes(s) ||
        teacherName.includes(s) ||
        className.includes(s) ||
        schoolName.includes(s)
      );
    });
  }

  const totalFiltered = filtered.length;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  return ApiResponse.paginated(res, paginated, { page, limit, total: totalFiltered });
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