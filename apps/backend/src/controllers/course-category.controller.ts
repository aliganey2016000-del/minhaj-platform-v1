/**
 * Course Category Controller
 * Per-organization CRUD for course categories, managed inline from the
 * Add/Edit Course form (see courses-manage.tsx).
 */
import { Request, Response } from 'express';
import CourseCategory from '../models/course-category.model';
import Course from '../models/course.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';
}

/** Appends -2, -3, ... until the slug is unique within the school, since two differently-named categories ("Fiqh!" / "Fiqh?") can otherwise collide. */
async function uniqueSlug(base: string, schoolId: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (
    await CourseCategory.exists({ school: schoolId, slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
  ) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

// GET /course-categories — org_admin auto-scoped; super admin narrows via ?school=
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = {};
  if (req.user?.role === 'org_admin') {
    if (!req.user.organizationId) return ApiResponse.success(res, []);
    filter.school = req.user.organizationId;
  } else if (req.query.school) {
    filter.school = req.query.school as string;
  }

  const categories = await CourseCategory.find(filter).sort({ name: 1 }).lean();
  return ApiResponse.success(res, categories);
};

// POST /course-categories
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { name } = req.body;
  if (!name || !String(name).trim()) throw new BadRequestError('Category name is required');

  const schoolId = resolveOrgIdForCreate(req, req.body.school) as string | undefined;
  if (!schoolId) throw new BadRequestError('Organization is required');

  const trimmedName = String(name).trim();
  const existing = await CourseCategory.findOne({ school: schoolId, name: new RegExp(`^${trimmedName}$`, 'i') });
  if (existing) throw new ConflictError('A category with this name already exists in this organization');

  const slug = await uniqueSlug(slugify(trimmedName), schoolId);
  const category = await CourseCategory.create({ name: trimmedName, slug, school: schoolId });

  return ApiResponse.created(res, category, 'Category created successfully');
};

// PUT /course-categories/:id — renames the display name only; slug (the
// value stored on Course.category) never changes, so existing courses
// stay linked to this category.
export const update = async (req: Request, res: Response): Promise<Response> => {
  const category = await CourseCategory.findById(req.params.id);
  if (!category) throw new NotFoundError('Category');

  if (req.user?.role === 'org_admin') {
    assertOwnsOrg(req, { school: category.school }, 'school');
  }

  const { name } = req.body;
  if (!name || !String(name).trim()) throw new BadRequestError('Category name cannot be empty');
  const trimmedName = String(name).trim();

  const conflicting = await CourseCategory.findOne({
    school: category.school,
    _id: { $ne: category._id },
    name: new RegExp(`^${trimmedName}$`, 'i'),
  });
  if (conflicting) throw new ConflictError('A category with this name already exists in this organization');

  category.name = trimmedName;
  await category.save();

  return ApiResponse.success(res, category, 'Category updated successfully');
};

// DELETE /course-categories/:id
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const category = await CourseCategory.findById(req.params.id);
  if (!category) throw new NotFoundError('Category');

  if (req.user?.role === 'org_admin') {
    assertOwnsOrg(req, { school: category.school }, 'school');
  }

  const assignedCourse = await Course.exists({ school: category.school, category: category.slug });
  if (assignedCourse) {
    throw new BadRequestError('Cannot delete category. Move assigned courses first.');
  }

  await CourseCategory.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Category deleted successfully');
};
