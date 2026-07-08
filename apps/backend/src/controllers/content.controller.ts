import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

type ModelName = 'Announcement' | 'News' | 'Event' | 'Gallery';

function getModel(name: ModelName) {
  return mongoose.model(name);
}

// GET /
export const getAll = (modelName: ModelName) => async (req: Request, res: Response): Promise<Response> => {
  const Model = getModel(modelName);
  const { status, page = '1', limit = '20', search, ...rest } = req.query as any;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  // Additional filters from query
  for (const key of Object.keys(rest)) {
    if (key !== 'page' && key !== 'limit' && key !== 'search') {
      filter[key] = rest[key];
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

  const [items, total] = await Promise.all([
    Model.find(filter)
      .populate('createdBy', 'email')
      .populate('uploadedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Model.countDocuments(filter),
  ]);

  let result = items;
  if (search) {
    const s = (search as string).toLowerCase();
    result = items.filter((item: any) => {
      const title = (item.title || '').toLowerCase();
      const content = (item.content || item.description || '').toLowerCase();
      const album = (item.album || '').toLowerCase();
      const location = (item.location || '').toLowerCase();
      return title.includes(s) || content.includes(s) || album.includes(s) || location.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};

// POST /
export const create = (modelName: ModelName) => async (req: Request, res: Response): Promise<Response> => {
  const Model = getModel(modelName);
  const userIdField = modelName === 'Gallery' ? 'uploadedBy' : 'createdBy';
  const payload = { ...req.body, [userIdField]: new mongoose.Types.ObjectId(req.user!.userId) };
  const item = await Model.create(payload);
  const populated = await Model.findById(item._id).populate(userIdField === 'uploadedBy' ? 'uploadedBy' : 'createdBy', 'email').lean();
  return ApiResponse.created(res, populated, `${modelName} created successfully`);
};

// PATCH /:id
export const update = (modelName: ModelName) => async (req: Request, res: Response): Promise<Response> => {
  const Model = getModel(modelName);
  const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
  if (!item) throw new NotFoundError(modelName);
  return ApiResponse.success(res, item, `${modelName} updated`);
};

// PATCH /:id/status
export const updateStatus = (modelName: ModelName) => async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status) throw new BadRequestError('Status is required');
  const Model = getModel(modelName);
  const item = await Model.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
  if (!item) throw new NotFoundError(modelName);
  return ApiResponse.success(res, item, `Status updated to ${status}`);
};

// PATCH /:id/toggle-pin (announcements only)
export const togglePin = async (req: Request, res: Response): Promise<Response> => {
  const item = await getModel('Announcement').findById(req.params.id);
  if (!item) throw new NotFoundError('Announcement');
  (item as any).isPinned = !(item as any).isPinned;
  await (item as any).save();
  return ApiResponse.success(res, item, (item as any).isPinned ? 'Pinned' : 'Unpinned');
};

// DELETE /:id
export const remove = (modelName: ModelName) => async (req: Request, res: Response): Promise<Response> => {
  const Model = getModel(modelName);
  const item = await Model.findByIdAndDelete(req.params.id);
  if (!item) throw new NotFoundError(modelName);
  return ApiResponse.noContent(res, `${modelName} deleted`);
};