import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Setting from '../models/setting.model';
import ActivityLog from '../models/activity-log.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { castObjectIdFilter } from '../utils/cast-object-id-filter';
import { escapeRegex } from '../utils/escape-regex';

// ── Settings ──
// Settings are platform-wide, not per organization: only the platform admin
// may read or change them. An organization admin sees an empty list so the
// page still loads, but can neither read nor write another tenant's — or the
// platform's — configuration.
export const getSettings = async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin') return ApiResponse.success(res, []);
  const settings = await Setting.find().lean();
  return ApiResponse.success(res, settings);
};

export const updateSettings = async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin') throw new ForbiddenError('Only the platform administrator can change platform settings.');
  const { settings } = req.body; // [{ key, value, description }]
  if (!Array.isArray(settings)) throw new BadRequestError('settings array required');
  for (const s of settings) {
    await Setting.findOneAndUpdate({ key: s.key }, { value: s.value, description: s.description || '', updatedBy: new mongoose.Types.ObjectId(req.user!.userId) }, { upsert: true, new: true });
  }
  const all = await Setting.find().lean();
  return ApiResponse.success(res, all, 'Settings updated');
};

// ── Activity Logs ──
export const getLogs = async (req: Request, res: Response) => {
  const { action, user, page = '1', limit = '30', search } = req.query;
  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;
  if (user) filter.user = user;
  // An organization admin sees only its own organization's activity. Entries
  // written before the school field existed carry none, so they stay
  // visible to the platform admin alone.
  if (req.user?.role !== 'admin') {
    if (!req.user?.organizationId) throw new ForbiddenError('Your account is not assigned to an organization.');
    filter.school = req.user.organizationId;
  }
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
    const aggregateMatch = castObjectIdFilter(filter, ['user', 'school']);
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
  if (req.user?.role === 'admin') {
    await ActivityLog.deleteMany({});
    return ApiResponse.success(res, null, 'All logs cleared');
  }
  // An organization admin may only clear its own organization's entries.
  if (!req.user?.organizationId) throw new ForbiddenError('Your account is not assigned to an organization.');
  await ActivityLog.deleteMany({ school: req.user.organizationId });
  return ApiResponse.success(res, null, 'Organization logs cleared');
};