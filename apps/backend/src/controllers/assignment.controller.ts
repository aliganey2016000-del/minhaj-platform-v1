import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Assignment from '../models/assignment.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

// POST /
export const create = async (req: Request, res: Response) => {
  const payload = { ...req.body, createdBy: new mongoose.Types.ObjectId(req.user!.userId) };
  const item = await Assignment.create(payload);
  const populated = await Assignment.findById(item._id).populate('course', 'title.en slug').populate('createdBy','email').lean();
  return ApiResponse.created(res, populated, 'Assignment created');
};

// GET /my — Student sees assignments for their enrolled courses
export const getMyAssignments = async (req: Request, res: Response) => {
  const student = await Student.findOne({ user: req.user!.userId }).select('enrolledCourses').lean();
  if (!student) return ApiResponse.success(res, []);

  const courseIds = (student as any).enrolledCourses || [];
  const assignments = await Assignment.find({ course: { $in: courseIds }, status: 'active' })
    .populate('course', 'title.en slug category')
    .sort({ dueDate: 1 })
    .lean();

  const now = new Date();
  const withStatus = assignments.map((a: any) => ({
    ...a,
    isDue: new Date(a.dueDate) > now,
    isOverdue: new Date(a.dueDate) < now,
  }));

  return ApiResponse.success(res, withStatus);
};

// GET / — Admin/Teacher list
export const getAll = async (req: Request, res: Response) => {
  const { courseId, status, page = '1', limit = '20', search } = req.query;
  const filter: Record<string, unknown> = {};
  if (courseId) filter.course = courseId;
  if (status) filter.status = status;
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));
  const [items, total] = await Promise.all([
    Assignment.find(filter).populate('course', 'title.en slug').sort({ dueDate: 1 }).skip((pageNum-1)*limitNum).limit(limitNum).lean(),
    Assignment.countDocuments(filter),
  ]);
  let result = items;
  if (search) {
    const s = (search as string).toLowerCase();
    result = items.filter((a:any) => (a.title||'').toLowerCase().includes(s) || (a.description||'').toLowerCase().includes(s));
  }
  return ApiResponse.paginated(res, result, { page: pageNum, limit: limitNum, total: search?result.length:total });
};

// PATCH /:id
export const update = async (req: Request, res: Response) => {
  const item = await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('course','title.en slug').lean();
  if (!item) throw new NotFoundError('Assignment');
  return ApiResponse.success(res, item, 'Updated');
};

// PATCH /:id/status
export const updateStatus = async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status) throw new BadRequestError('Status required');
  const item = await Assignment.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
  if (!item) throw new NotFoundError('Assignment');
  return ApiResponse.success(res, item, `Status updated to ${status}`);
};

// DELETE /:id
export const remove = async (req: Request, res: Response) => {
  const item = await Assignment.findByIdAndDelete(req.params.id);
  if (!item) throw new NotFoundError('Assignment');
  return ApiResponse.noContent(res, 'Deleted');
};