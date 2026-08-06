/**
 * Trash Controller — list, restore, and permanently purge soft-deleted
 * records. See utils/trash.ts for how items land here and how restore
 * reverses each entity type's original delete.
 */
import { Request, Response } from 'express';
import Trash from '../models/trash.model';
import ApiResponse from '../utils/api-response';
import { NotFoundError, ForbiddenError } from '../utils/api-error';
import { applyOrgFilter } from '../utils/tenant-scope';
import { restoreFromTrash } from '../utils/trash';

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
  return ApiResponse.success(res, result, `${result.entityType} restored successfully`);
};

// ---------------------------------------------------------------------------
// DELETE /trash/:id — permanently purge one item (irreversible)
// ---------------------------------------------------------------------------

export const purge = async (req: Request, res: Response): Promise<Response> => {
  const trash = await Trash.findById(req.params.id);
  if (!trash) throw new NotFoundError('Trash item');

  if (trash.entityType === 'School' && req.user?.role !== 'admin') {
    throw new ForbiddenError('Only a super admin can permanently delete an organization.');
  }
  if (req.user?.role === 'org_admin') {
    const trashSchoolId = trash.school ? trash.school.toString() : null;
    if (trashSchoolId && trashSchoolId !== req.user.organizationId) {
      throw new ForbiddenError("You do not have permission to delete another organization's data.");
    }
  }

  await Trash.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Permanently deleted');
};

// ---------------------------------------------------------------------------
// DELETE /trash — empty everything the caller can see (irreversible)
// ---------------------------------------------------------------------------

export const empty = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');
  if (req.user?.role === 'org_admin') filter.entityType = { $ne: 'School' };

  const result = await Trash.deleteMany(filter);
  return ApiResponse.success(res, { deleted: result.deletedCount }, `Permanently deleted ${result.deletedCount} item(s)`);
};
