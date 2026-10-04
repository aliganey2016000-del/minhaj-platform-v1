import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { escapeRegex } from '../utils/escape-regex';
import Teacher from '../models/teacher.model';

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

/**
 * Which content the caller may see and change. Every school only ever
 * reaches its own items; the platform admin reaches everything (optionally
 * narrowed with ?school=), including platform-wide items with no school.
 */
async function contentScope(req: Request): Promise<Record<string, unknown>> {
  if (req.user?.role === 'admin') {
    const school = (req.query as any)?.school;
    if (school === 'none') return { school: null };
    return school && mongoose.isValidObjectId(school) ? { school: new mongoose.Types.ObjectId(String(school)) } : {};
  }
  let orgId = req.user?.organizationId;
  if (!orgId && req.user?.role === 'teacher') {
    // Tokens issued before teachers carried their school in the token.
    const teacher = await Teacher.findOne({ user: req.user.userId }).select('school').lean();
    orgId = (teacher as any)?.school?.toString();
  }
  if (!orgId || !mongoose.isValidObjectId(orgId)) throw new ForbiddenError('Your account is not assigned to an organization.');
  return { school: new mongoose.Types.ObjectId(orgId) };
}

/** Fields a client may never set directly on a content item. */
const PROTECTED_FIELDS = ['_id', 'school', 'createdBy', 'uploadedBy', 'createdAt', 'updatedAt'];

function editablePayload(req: Request): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...(req.body || {}) };
  for (const key of PROTECTED_FIELDS) delete payload[key];
  return payload;
}

// GET /
export const getAll = (modelName: ModelName) => async (req: Request, res: Response): Promise<Response> => {
  const Model = getModel(modelName);
  const { status, page = '1', limit = '20', search, ...rest } = req.query as any;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  // Additional filters from query
  for (const key of Object.keys(rest)) {
    if (key !== 'page' && key !== 'limit' && key !== 'search' && key !== 'school') {
      filter[key] = rest[key];
    }
  }
  Object.assign(filter, (await contentScope(req)));

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
  // A school's content always belongs to that school; the platform admin may
  // publish for a chosen school or platform-wide (no school).
  let school: mongoose.Types.ObjectId | null;
  if (req.user?.role === 'admin') {
    const requested = req.body?.school;
    school = requested && mongoose.isValidObjectId(requested) ? new mongoose.Types.ObjectId(String(requested)) : null;
  } else {
    school = (await contentScope(req)).school as mongoose.Types.ObjectId;
  }
  const payload = { ...editablePayload(req), school, [userIdField]: new mongoose.Types.ObjectId(req.user!.userId) };
  const item = await Model.create(payload);
  const populated = await Model.findById(item._id).populate(userIdField === 'uploadedBy' ? 'uploadedBy' : 'createdBy', 'email').lean();
  return ApiResponse.created(res, populated, `${modelName} created successfully`);
};

// PATCH /:id
export const update = (modelName: ModelName) => async (req: Request, res: Response): Promise<Response> => {
  const Model = getModel(modelName);
  const item = await Model.findOneAndUpdate({ $and: [{ _id: req.params.id }, (await contentScope(req))] }, editablePayload(req), { new: true, runValidators: true }).lean();
  if (!item) throw new NotFoundError(modelName);
  return ApiResponse.success(res, item, `${modelName} updated`);
};

// PATCH /:id/status
export const updateStatus = (modelName: ModelName) => async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status) throw new BadRequestError('Status is required');
  const Model = getModel(modelName);
  const item = await Model.findOneAndUpdate({ $and: [{ _id: req.params.id }, (await contentScope(req))] }, { status }, { new: true, runValidators: true }).lean();
  if (!item) throw new NotFoundError(modelName);
  return ApiResponse.success(res, item, `Status updated to ${status}`);
};

// PATCH /:id/toggle-pin (announcements only)
export const togglePin = async (req: Request, res: Response): Promise<Response> => {
  const item = await getModel('Announcement').findOne({ $and: [{ _id: req.params.id }, (await contentScope(req))] });
  if (!item) throw new NotFoundError('Announcement');
  (item as any).isPinned = !(item as any).isPinned;
  await (item as any).save();
  return ApiResponse.success(res, item, (item as any).isPinned ? 'Pinned' : 'Unpinned');
};

// DELETE /:id
export const remove = (modelName: ModelName) => async (req: Request, res: Response): Promise<Response> => {
  const Model = getModel(modelName);
  const item = await Model.findOneAndDelete({ $and: [{ _id: req.params.id }, (await contentScope(req))] });
  if (!item) throw new NotFoundError(modelName);
  return ApiResponse.noContent(res, `${modelName} deleted`);
};