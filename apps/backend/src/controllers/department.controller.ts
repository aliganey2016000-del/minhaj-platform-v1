import { Request, Response } from 'express';
import Department from '../models/department.model';
import ClassModel from '../models/class.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

const DEPARTMENT_LIMIT = 200;

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = {};
  if (req.user?.role === 'org_admin') {
    if (!req.user.organizationId) return ApiResponse.success(res, []);
    filter.tenantId = req.user.organizationId;
  }

  const departments = await Department.find(filter)
    .sort({ name: 1 })
    .limit(DEPARTMENT_LIMIT)
    .lean();

  return ApiResponse.success(res, departments);
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { name, code } = req.body;
  if (!name || !String(name).trim()) throw new BadRequestError('Department name is required');

  const tenantId = resolveOrgIdForCreate(req, req.body.tenantId);
  if (!tenantId) throw new BadRequestError('Tenant ID is required');

  const existing = await Department.findOne({ tenantId, name: new RegExp(`^${String(name).trim()}$`, 'i') });
  if (existing) throw new ConflictError('A department with this name already exists in this organization');

  const department = await Department.create({
    name: String(name).trim(),
    code: code ? String(code).trim() : undefined,
    tenantId,
  });

  return ApiResponse.created(res, department, 'Department created successfully');
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const department = await Department.findById(req.params.id);
  if (!department) throw new NotFoundError('Department');

  if (req.user?.role === 'org_admin') {
    assertOwnsOrg(req, { school: department.tenantId }, 'school');
  }

  const { name, code } = req.body;
  if (name !== undefined && !String(name).trim()) throw new BadRequestError('Department name cannot be empty');

  if (name) {
    const conflicting = await Department.findOne({
      tenantId: department.tenantId,
      _id: { $ne: department._id },
      name: new RegExp(`^${String(name).trim()}$`, 'i'),
    });
    if (conflicting) throw new ConflictError('A department with this name already exists in this organization');
    department.name = String(name).trim();
  }

  if (code !== undefined) department.code = String(code).trim();
  await department.save();

  return ApiResponse.success(res, department, 'Department updated successfully');
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const department = await Department.findById(req.params.id);
  if (!department) throw new NotFoundError('Department');

  if (req.user?.role === 'org_admin') {
    assertOwnsOrg(req, { school: department.tenantId }, 'school');
  }

  const linkedClass = await ClassModel.exists({ department: department._id });
  if (linkedClass) {
    throw new BadRequestError('Cannot delete department while classes are still linked to it. Reassign or remove classes first.');
  }

  await Department.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Department deleted successfully');
};
