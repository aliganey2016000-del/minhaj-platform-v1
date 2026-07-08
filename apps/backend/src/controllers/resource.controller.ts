import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Resource from '../models/resource.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { NotFoundError } from '../utils/api-error';

// GET /my — Student's downloads from enrolled courses
export const getMyDownloads = async (req: Request, res: Response) => {
  const student = await Student.findOne({ user: req.user!.userId }).select('enrolledCourses').lean();
  if (!student) return ApiResponse.success(res, []);
  const courseIds = (student as any).enrolledCourses || [];
  const resources = await Resource.find({ course: { $in: courseIds }, status: 'active' })
    .populate('course', 'title.en slug')
    .sort({ createdAt: -1 })
    .lean();
  return ApiResponse.success(res, resources);
};

// POST /
export const create = async (req: Request, res: Response) => {
  const payload = { ...req.body, uploadedBy: new mongoose.Types.ObjectId(req.user!.userId) };
  const item = await Resource.create(payload);
  const populated = await Resource.findById(item._id).populate('course','title.en slug').lean();
  return ApiResponse.created(res, populated, 'Resource uploaded');
};

// GET / (admin)
export const getAll = async (req: Request, res: Response) => {
  const { courseId, category, page='1', limit='20' } = req.query;
  const filter: Record<string,unknown> = {};
  if (courseId) filter.course = courseId;
  if (category) filter.category = category;
  const pageNum = Math.max(1, parseInt(page as string,10)||1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string,10)||20));
  const [items, total] = await Promise.all([
    Resource.find(filter).populate('course','title.en slug').sort({createdAt:-1}).skip((pageNum-1)*limitNum).limit(limitNum).lean(),
    Resource.countDocuments(filter),
  ]);
  return ApiResponse.paginated(res, items, { page: pageNum, limit: limitNum, total });
};

// DELETE /:id
export const remove = async (req: Request, res: Response) => {
  const item = await Resource.findByIdAndDelete(req.params.id);
  if (!item) throw new NotFoundError('Resource');
  return ApiResponse.noContent(res, 'Deleted');
};

// POST /:id/download — track download
export const trackDownload = async (req: Request, res: Response) => {
  const item = await Resource.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } }, { new: true }).lean();
  if (!item) throw new NotFoundError('Resource');
  return ApiResponse.success(res, item);
};