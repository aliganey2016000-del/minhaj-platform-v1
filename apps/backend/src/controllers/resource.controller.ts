import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Resource from '../models/resource.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { ForbiddenError, NotFoundError } from '../utils/api-error';
import Course from '../models/course.model';
import ensureStudentRecord from '../utils/ensure-student';
import { logActivityFromRequest } from '../utils/learning-activity-logger';

// GET /my — Student's downloads from enrolled courses
export const getMyDownloads = async (req: Request, res: Response) => {
  const student = await ensureStudentRecord(req.user!.userId);
  const courseIds = (student.enrolledCourses || []).map((id: any) => id);
  const resources = await Resource.find({ course: { $in: courseIds }, status: 'active' })
    .populate('course', 'title.en slug')
    .sort({ createdAt: -1 })
    .lean();
  return ApiResponse.success(res, resources);
};

/**
 * A resource belongs to the school of the course it is attached to. The
 * platform admin reaches every resource; anyone else only those of courses
 * in their own school.
 */
async function resourceScope(req: Request): Promise<Record<string, unknown>> {
  if (req.user?.role === 'admin') return {};
  const orgId = req.user?.organizationId;
  if (!orgId) throw new ForbiddenError('Your account is not assigned to an organization.');
  const courseIds = await Course.find({ school: orgId }).distinct('_id');
  return { course: { $in: courseIds } };
}

// POST /
export const create = async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin') {
    const course = req.body?.course && mongoose.isValidObjectId(req.body.course)
      ? await Course.findById(req.body.course).select('school').lean()
      : null;
    if (!course || String((course as any).school) !== req.user?.organizationId) {
      throw new ForbiddenError('You can only add resources to courses in your own organization');
    }
  }
  const { _id, uploadedBy, downloads, ...body } = req.body || {};
  void _id; void uploadedBy; void downloads;
  const payload = { ...body, uploadedBy: new mongoose.Types.ObjectId(req.user!.userId) };
  const item = await Resource.create(payload);
  const populated = await Resource.findById(item._id).populate('course','title.en slug').lean();
  return ApiResponse.created(res, populated, 'Resource uploaded');
};

// GET / (admin)
export const getAll = async (req: Request, res: Response) => {
  const { courseId, category, page='1', limit='20' } = req.query;
  const filter: Record<string,unknown> = {};
  if (courseId) filter.course = courseId;
  const scope = await resourceScope(req);
  if (category) filter.category = category;
  const pageNum = Math.max(1, parseInt(page as string,10)||1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string,10)||20));
  const [items, total] = await Promise.all([
    Resource.find({ $and: [filter, scope] }).populate('course','title.en slug').sort({createdAt:-1}).skip((pageNum-1)*limitNum).limit(limitNum).lean(),
    Resource.countDocuments({ $and: [filter, scope] }),
  ]);
  return ApiResponse.paginated(res, items, { page: pageNum, limit: limitNum, total });
};

// DELETE /:id
export const remove = async (req: Request, res: Response) => {
  const item = await Resource.findOneAndDelete({ $and: [{ _id: req.params.id }, await resourceScope(req)] });
  if (!item) throw new NotFoundError('Resource');
  return ApiResponse.noContent(res, 'Deleted');
};

// POST /:id/download — track download
export const trackDownload = async (req: Request, res: Response) => {
  const item: any = await Resource.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } }, { new: true }).lean();
  if (!item) throw new NotFoundError('Resource');

  if (req.user?.role === 'student') {
    const student = await Student.findOne({ user: req.user.userId }).select('_id school').lean();
    void logActivityFromRequest(req, {
      student: (student as any)?._id,
      school: (student as any)?.school,
      type: 'download',
      course: item.course,
      resourceName: item.title || item.name,
    });
  }

  return ApiResponse.success(res, item);
};