/**
 * Trash Controller — list, restore, and permanently purge soft-deleted
 * records. See utils/trash.ts for how items land here and how restore
 * reverses each entity type's original delete.
 */
import { Request, Response } from 'express';
import Trash, { ITrash } from '../models/trash.model';
import ApiResponse from '../utils/api-response';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/api-error';
import { applyOrgFilter } from '../utils/tenant-scope';
import { restoreFromTrash, logTrashActivity } from '../utils/trash';

// Before batch metadata existed, the UI implemented "bulk delete" as many
// parallel single-delete requests. Those records have no batchId, so recover
// the old operation by grouping same-tenant/same-actor/same-type records in a
// short time bucket. The cutoff prevents future intentional single deletes
// from ever being inferred as a batch.
const LEGACY_BATCH_CUTOFF = new Date('2026-09-14T13:20:00.000Z');
const LEGACY_BATCH_WINDOW_MS = 10 * 60 * 1000;
const legacyBatchBucket = {
  $toString: {
    $subtract: [
      { $toLong: '$deletedAt' },
      { $mod: [{ $toLong: '$deletedAt' }, LEGACY_BATCH_WINDOW_MS] },
    ],
  },
};

// ---------------------------------------------------------------------------
// GET /trash — list, tenant-scoped like everything else in the admin app.
// Organization-level (School) trash entries are super-admin-only end to
// end, so they're excluded from what an org_admin can even see here.
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { entityType, page = '1', limit = '20', view } = req.query;

  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');
  if (entityType && typeof entityType === 'string') filter.entityType = entityType;
  if (req.user?.role === 'org_admin') {
    // School trash is platform-admin-only. A direct ?entityType=School query
    // must not override that exclusion. Keep valid non-School filters intact,
    // but make an explicit School request match nothing.
    if (filter.entityType === 'School') filter.entityType = { $in: [] };
    else if (!filter.entityType) filter.entityType = { $ne: 'School' };
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  if (view === 'bulk') {
    const pipeline: any[] = [
      { $match: filter },
      { $addFields: {
        _groupKey: {
          $cond: [
            { $ne: [{ $ifNull: ['$batchId', null] }, null] },
            { $concat: ['batch:', { $toString: '$batchId' }] },
            { $cond: [
              { $lt: ['$deletedAt', LEGACY_BATCH_CUTOFF] },
              { $concat: [
                'legacy:', '$entityType', ':', { $ifNull: [{ $toString: '$school' }, 'none'] }, ':',
                { $ifNull: [{ $toString: '$deletedBy' }, 'none'] }, ':', legacyBatchBucket,
              ] },
              { $concat: ['single:', { $toString: '$_id' }] },
            ] },
          ],
        },
      } },
      { $sort: { deletedAt: -1 } },
      { $group: {
        _id: '$_groupKey', ids: { $push: '$_id' }, count: { $sum: 1 },
        entityType: { $first: '$entityType' }, batchLabel: { $first: '$batchLabel' },
        school: { $first: '$school' }, deletedBy: { $first: '$deletedBy' },
        deletedAt: { $first: '$deletedAt' }, sampleLabels: { $push: '$label' },
        explicitBatch: { $max: { $cond: [{ $ne: [{ $ifNull: ['$batchId', null] }, null] }, 1, 0] } },
      } },
      { $match: { $or: [{ explicitBatch: 1 }, { count: { $gt: 1 } }] } },
      { $sort: { deletedAt: -1 } },
      { $facet: {
        items: [
          { $skip: (pageNum - 1) * limitNum }, { $limit: limitNum },
          { $lookup: { from: 'schools', localField: 'school', foreignField: '_id', as: 'schoolDoc' } },
          { $lookup: { from: 'users', localField: 'deletedBy', foreignField: '_id', as: 'deletedByDoc' } },
          { $project: {
            ids: 1, count: 1, entityType: 1, deletedAt: 1,
            label: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$batchLabel', ''] } }, 0] }, '$batchLabel', { $concat: [{ $toString: '$count' }, ' ', '$entityType', 's deleted together'] }] },
            sampleLabels: { $slice: ['$sampleLabels', 3] },
            school: { $let: { vars: { row: { $arrayElemAt: ['$schoolDoc', 0] } }, in: { _id: '$$row._id', name: '$$row.name' } } },
            deletedBy: { $let: { vars: { row: { $arrayElemAt: ['$deletedByDoc', 0] } }, in: { _id: '$$row._id', email: '$$row.email' } } },
          } },
        ],
        meta: [{ $count: 'total' }],
      } },
    ];
    const [result] = await Trash.aggregate(pipeline);
    const items = result?.items || [];
    const total = result?.meta?.[0]?.total || 0;
    return ApiResponse.paginated(res, items, { page: pageNum, limit: limitNum, total });
  }

  if (view === 'individual') {
    const legacyGroups = await Trash.aggregate([
      { $match: { ...filter, batchId: null, deletedAt: { $lt: LEGACY_BATCH_CUTOFF } } },
      { $group: {
        _id: {
          entityType: '$entityType', school: '$school', deletedBy: '$deletedBy',
          timeBucket: legacyBatchBucket,
        },
        ids: { $push: '$_id' }, count: { $sum: 1 },
      } },
      { $match: { count: { $gt: 1 } } },
      { $unwind: '$ids' },
      { $project: { _id: 0, id: '$ids' } },
    ]);
    const groupedLegacyIds = legacyGroups.map((row) => row.id);
    filter.$and = [
      { $or: [{ batchId: null }, { batchId: { $exists: false } }] },
      ...(groupedLegacyIds.length > 0 ? [{ _id: { $nin: groupedLegacyIds } }] : []),
    ];
  }

  const [items, total] = await Promise.all([
    Trash.find(filter)
      .populate('deletedBy', 'email')
      .populate('school', 'name')
      .sort({ deletedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Trash.countDocuments(filter),
  ]);

  return ApiResponse.paginated(res, items, { page: pageNum, limit: limitNum, total });
};

// ---------------------------------------------------------------------------
// POST /trash/:id/restore
// ---------------------------------------------------------------------------

export const restore = async (req: Request, res: Response): Promise<Response> => {
  const result = await restoreFromTrash(req.params.id, req);
  void logTrashActivity(req, 'restore', result.entityType, result.entityId || req.params.id, `Restored "${result.label}"`);
  return ApiResponse.success(res, result, `${result.entityType} restored successfully`);
};

// ---------------------------------------------------------------------------
// Shared authorization check for purging a single Trash item — an
// organization-type entry is super-admin-only, and an org_admin can never
// touch another org's trash. Used by both the single and bulk purge paths.
// ---------------------------------------------------------------------------

function assertCanPurge(req: Request, trash: ITrash): void {
  if (trash.entityType === 'School' && req.user?.role !== 'admin') {
    throw new ForbiddenError('Only a super admin can permanently delete an organization.');
  }
  if (req.user?.role === 'org_admin') {
    const trashSchoolId = trash.school ? trash.school.toString() : null;
    if (trashSchoolId && trashSchoolId !== req.user.organizationId) {
      throw new ForbiddenError("You do not have permission to delete another organization's data.");
    }
  }
}

// ---------------------------------------------------------------------------
// DELETE /trash/:id — permanently purge one item (irreversible)
// ---------------------------------------------------------------------------

export const purge = async (req: Request, res: Response): Promise<Response> => {
  const trash = await Trash.findById(req.params.id);
  if (!trash) throw new NotFoundError('Trash item');
  assertCanPurge(req, trash);

  await Trash.findByIdAndDelete(req.params.id);
  void logTrashActivity(req, 'purge', trash.entityType, req.params.id, `Permanently deleted "${trash.label}"`);
  return ApiResponse.noContent(res, 'Permanently deleted');
};

// ---------------------------------------------------------------------------
// POST /trash/bulk-restore — body: { ids: string[] }
// ---------------------------------------------------------------------------

export const bulkRestore = async (req: Request, res: Response): Promise<Response> => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
  if (ids.length === 0) throw new BadRequestError('At least one id is required');

  const results: { id: string; success: boolean; label?: string; error?: string }[] = [];
  for (const id of ids) {
    try {
      const result = await restoreFromTrash(id, req);
      void logTrashActivity(req, 'restore', result.entityType, result.entityId || id, `Restored "${result.label}" (bulk)`);
      results.push({ id, success: true, label: result.label });
    } catch (err: any) {
      results.push({ id, success: false, error: err.message || 'Failed to restore' });
    }
  }

  const restored = results.filter((r) => r.success).length;
  return ApiResponse.success(res, { results, restored }, `Restored ${restored} of ${ids.length} item(s)`);
};

// ---------------------------------------------------------------------------
// DELETE /trash/bulk — body: { ids: string[] }
// ---------------------------------------------------------------------------

export const bulkPurge = async (req: Request, res: Response): Promise<Response> => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
  if (ids.length === 0) throw new BadRequestError('At least one id is required');

  const results: { id: string; success: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      const trash = await Trash.findById(id);
      if (!trash) { results.push({ id, success: false, error: 'Not found' }); continue; }
      assertCanPurge(req, trash);
      await Trash.findByIdAndDelete(id);
      void logTrashActivity(req, 'purge', trash.entityType, id, `Permanently deleted "${trash.label}" (bulk)`);
      results.push({ id, success: true });
    } catch (err: any) {
      results.push({ id, success: false, error: err.message || 'Failed to delete' });
    }
  }

  const deleted = results.filter((r) => r.success).length;
  return ApiResponse.success(res, { results, deleted }, `Permanently deleted ${deleted} of ${ids.length} item(s)`);
};

// ---------------------------------------------------------------------------
// DELETE /trash — empty everything the caller can see (irreversible).
// Requires an explicit { confirm: true } in the body, on top of the
// frontend's own "type DELETE" modal — a defense-in-depth guard against a
// stray or scripted call to this uniquely destructive, org-wide endpoint.
// ---------------------------------------------------------------------------

export const empty = async (req: Request, res: Response): Promise<Response> => {
  if (req.body?.confirm !== true) {
    throw new BadRequestError('This action requires explicit confirmation ({ confirm: true }).');
  }

  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');
  if (req.user?.role === 'org_admin') filter.entityType = { $ne: 'School' };

  const result = await Trash.deleteMany(filter);
  void logTrashActivity(req, 'empty', 'Trash', '', `Emptied trash — permanently deleted ${result.deletedCount} item(s)`);
  return ApiResponse.success(res, { deleted: result.deletedCount }, `Permanently deleted ${result.deletedCount} item(s)`);
};
