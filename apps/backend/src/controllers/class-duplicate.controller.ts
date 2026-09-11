import { Request, Response } from 'express';
import ClassModel from '../models/class.model';
import ApiResponse from '../utils/api-response';
import { NotFoundError } from '../utils/api-error';
import { assertOwnsOrg } from '../utils/tenant-scope';

/**
 * POST /classes/:id/duplicate
 *
 * Duplicates an existing class from its source record rather than rebuilding
 * the payload in the browser. This preserves the source organization's
 * institution-specific fields and avoids relying on a possibly stale
 * frontend institution-type value.
 */
export const duplicate = async (req: Request, res: Response): Promise<Response> => {
  const existing = await ClassModel.findById(req.params.id);
  if (!existing) throw new NotFoundError('Class');
  assertOwnsOrg(req, existing, 'school');

  const source = existing.toObject() as Record<string, any>;
  delete source._id;
  delete source.__v;
  delete source.createdAt;
  delete source.updatedAt;
  delete source.promotedAt;
  delete source.promotedTo;

  const baseTitle = String(source.title || 'Class');
  const baseSection = String(source.section || '').trim();
  const copyTitle = `${baseTitle.slice(0, 192)} (Copy)`;
  const copySection = baseSection ? `${baseSection.slice(0, 5)} Copy` : 'Copy';

  const duplicate = await ClassModel.create({
    ...source,
    title: copyTitle,
    section: copySection,
    status: 'active',
    promotedAt: null,
    promotedTo: null,
  });

  const populated = await ClassModel.findById(duplicate._id)
    .populate('school', 'name')
    .populate('course', 'title.en slug category')
    .populate('teacher', 'teacherId')
    .populate('department', 'name code')
    .populate('program', 'name code')
    .lean();

  return ApiResponse.created(res, populated, 'Class duplicated successfully');
};
