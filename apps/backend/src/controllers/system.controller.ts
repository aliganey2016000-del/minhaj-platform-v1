import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Setting from '../models/setting.model';
import ActivityLog from '../models/activity-log.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { castObjectIdFilter } from '../utils/cast-object-id-filter';
import { escapeRegex } from '../utils/escape-regex';

// ── Settings ──
export const getSettings = async (_req: Request, res: Response) => {
  const settings = await Setting.find().lean();
  return ApiResponse.success(res, settings);
};

export const updateSettings = async (req: Request, res: Response) => {
  const { settings } = req.body; // [{ key, value, description }]
  if (!Array.isArray(settings)) throw new BadRequestError('settings array required');
  for (const s of settings) {
    await Setting.findOneAndUpdate({ key: s.key }, { value: s.value, description: s.description || '', updatedBy: new mongoose.Types.ObjectId(req.user!.userId) }, { upsert: true, new: true });
  }
  const all = await Setting.find().lean();
  return ApiResponse.success(res, all, 'Settings updated');
};

// ── Activity Logs ──
function activityLogTenantScope(req: Request): Record<string, unknown> {
  if (req.user?.role === 'admin') return {};
  if (req.user?.role !== 'org_admin') {
    throw new ForbiddenError('Activity Logs are available only to administrators.');
  }
  if (!req.user.organizationId) {
    throw new ForbiddenError('Your account is not assigned to an organization.');
  }
  // Never read tenant ownership from query/body/headers. The authenticated
  // token context is the only source of scope for organization administrators.
  return { organizationId: req.user.organizationId };
}

export const getLogs = async (req: Request, res: Response) => {
  const { action, user, page = '1', limit = '30', search } = req.query;
  const tenantScope = activityLogTenantScope(req);
  const filter: Record<string, unknown> = { ...tenantScope };
  if (action) filter.action = action;
  if (user) filter.user = user;
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 30));

  let result: any[];
  let total: number;

  if (search) {
    // Previously: paginate first (skip/limit), THEN filter that one page by
    // search in memory — a matching log entry outside the current page
    // never showed up, and `total` reported only how many of that one page
    // matched. Matched and paginated at the database level instead, same as
    // students/teachers/classes/parents/invoices/payments/schools/
    // certificates/exams/results/assignments (see student.controller.ts
    // getAll).
    const regex = new RegExp(escapeRegex(search as string), 'i');
    const aggregateMatch = castObjectIdFilter(filter, ['user', 'organizationId']);
    const [facetResult] = await ActivityLog.aggregate([
      { $match: aggregateMatch },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDoc' } },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
      { $match: { $or: [{ resource: regex }, { details: regex }, { 'userDoc.email': regex }] } },
      { $sort: { createdAt: -1 } },
      { $facet: {
          data: [{ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }, { $project: { _id: 1 } }],
          totalCount: [{ $count: 'count' }],
        } },
    ]);

    const orderedIds: string[] = (facetResult?.data || []).map((row: any) => String(row._id));
    total = facetResult?.totalCount?.[0]?.count || 0;
    const pageDocs = orderedIds.length
      ? await ActivityLog.find({ _id: { $in: orderedIds } }).populate('user', 'email role').lean()
      : [];
    const docById = new Map((pageDocs as any[]).map((doc) => [String(doc._id), doc]));
    result = orderedIds.map((id) => docById.get(id)).filter(Boolean);
  } else {
    const [logs, count] = await Promise.all([
      ActivityLog.find(filter).populate('user', 'email role').sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      ActivityLog.countDocuments(filter),
    ]);
    result = logs;
    total = count;
  }

  return ApiResponse.paginated(res, result, { page: pageNum, limit: limitNum, total });
};

export const clearLogs = async (req: Request, res: Response) => {
  const tenantScope = activityLogTenantScope(req);
  const result = await ActivityLog.deleteMany(tenantScope);
  const message = req.user?.role === 'admin' ? 'All logs cleared' : 'Organization activity logs cleared';
  return ApiResponse.success(res, { deletedCount: result.deletedCount || 0 }, message);
};