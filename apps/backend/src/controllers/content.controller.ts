import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { escapeRegex } from '../utils/escape-regex';

// This handler is shared across four unrelated models via dynamic `rest`
// query filters, so the ObjectId-ref fields aren't known ahead of time —
// cast every value that looks like one, rather than naming fields (compare
// castObjectIdFilter, used where the fields ARE known).
function castAnyObjectIdStrings(filter: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filter)) {
    result[key] = typeof value === 'string' && mongoose.isValidObjectId(value)
      ? new mongoose.Types.ObjectId(value)
      : value;
  }
  return result;
}

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

  // Gallery items are attributed via `uploadedBy`; the other three via
  // `createdBy` — never both. Mongoose 8 defaults to strictPopulate, so
  // populating the field the other models don't have threw
  // StrictPopulateError on every single call to this shared handler.
  const attributionField = modelName === 'Gallery' ? 'uploadedBy' : 'createdBy';
  const populateContent = (q: ReturnType<typeof Model.find>) => q.populate(attributionField, 'email');

  let result: any[];
  let total: number;

  if (search) {
    // Previously: paginate first (skip/limit), THEN filter that one page by
    // search in memory — a matching item outside the current page never
    // showed up, and `total` reported only how many of that one page
    // matched. Matched and paginated at the database level instead, same as
    // students/teachers/classes/parents/invoices/payments/schools/
    // certificates (see student.controller.ts getAll). All four search
    // fields live directly on the document, so no $lookup is needed.
    const regex = new RegExp(escapeRegex(search as string), 'i');
    const [facetResult] = await Model.aggregate([
      { $match: castAnyObjectIdStrings(filter) },
      { $match: { $or: [{ title: regex }, { content: regex }, { description: regex }, { album: regex }, { location: regex }] } },
      { $sort: { createdAt: -1 } },
      { $facet: {
          data: [{ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }, { $project: { _id: 1 } }],
          totalCount: [{ $count: 'count' }],
        } },
    ]);

    const orderedIds: string[] = (facetResult?.data || []).map((row: any) => String(row._id));
    total = facetResult?.totalCount?.[0]?.count || 0;
    const pageDocs = orderedIds.length
      ? await populateContent(Model.find({ _id: { $in: orderedIds } })).lean()
      : [];
    const docById = new Map((pageDocs as any[]).map((doc: any) => [String(doc._id), doc]));
    result = orderedIds.map((id) => docById.get(id)).filter(Boolean);
  } else {
    const [items, count] = await Promise.all([
      populateContent(Model.find(filter))
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Model.countDocuments(filter),
    ]);
    result = items;
    total = count;
  }

  return ApiResponse.paginated(res, result, { page: pageNum, limit: limitNum, total });
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