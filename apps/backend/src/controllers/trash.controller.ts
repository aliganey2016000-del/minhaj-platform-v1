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

// ---------------------------------------------------------------------------
// GET /trash — list, tenant-scoped like everything else in the admin app.
// Organization-level (School) trash entries are super-admin-only end to
// end, so they're excluded from what an org_admin can even see here.
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { entityType, page = '1', limit = '20' } = req.query;

  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');
  if (entityType && typeof entityType === 'string') filter.entityType = entityType;
  if (req.user?.role === 'org_admin') {
    filter.entityType = filter.entityType ? filter.entityType : { $ne: 'School' };
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

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
