import { Request, Response } from 'express';
import Program from '../models/program.model';
import Department from '../models/department.model';
import ClassModel from '../models/class.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

const PROGRAM_LIMIT = 200;

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = {};
  if (req.user?.role === 'org_admin') {
    if (!req.user.organizationId) return ApiResponse.success(res, []);
    filter.school = req.user.organizationId;
  } else if (req.query.school) {
    filter.school = req.query.school as string;
  }
  if (req.query.department) filter.department = req.query.department as string;

  const programs = await Program.find(filter)
    .populate('department', 'name code')
    .sort({ name: 1 })
    .limit(PROGRAM_LIMIT)
    .lean();

  return ApiResponse.success(res, programs);
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { name, code, department, description } = req.body;
  if (!name || !String(name).trim()) throw new BadRequestError('Program name is required');

  const schoolId = resolveOrgIdForCreate(req, req.body.school);
  if (!schoolId) throw new BadRequestError('Organization is required');

  let resolvedDepartment = department || undefined;
  if (resolvedDepartment) {
    const dept = await Department.findOne({ _id: resolvedDepartment, tenantId: schoolId });
    if (!dept) throw new BadRequestError('Selected department does not belong to this organization');
  }

  const existing = await Program.findOne({ school: schoolId, name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (existing) throw new ConflictError('A program with this name already exists in this organization');

  const program = await Program.create({
    name: String(name).trim(),
    code: code ? String(code).trim() : undefined,
    school: schoolId,
    department: resolvedDepartment,
    description: description ? String(description).trim() : undefined,
  });

  return ApiResponse.created(res, await program.populate('department', 'name code'), 'Program created successfully');
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const program = await Program.findById(req.params.id);
  if (!program) throw new NotFoundError('Program');
  if (req.user?.role === 'org_admin') assertOwnsOrg(req, { school: program.school }, 'school');

  const { name, code, department, description } = req.body;
  if (name !== undefined && !String(name).trim()) throw new BadRequestError('Program name cannot be empty');

  if (department !== undefined) {
    if (department) {
      const dept = await Department.findOne({ _id: department, tenantId: program.school });
      if (!dept) throw new BadRequestError('Selected department does not belong to this organization');
      program.department = department;
    } else {
      program.department = undefined;
    }
  }

  if (name) {
    const conflicting = await Program.findOne({ school: program.school, _id: { $ne: program._id }, name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (conflicting) throw new ConflictError('A program with this name already exists in this organization');
    program.name = String(name).trim();
  }
  if (code !== undefined) program.code = String(code).trim();
  if (description !== undefined) program.description = String(description).trim();
  await program.save();
  return ApiResponse.success(res, await program.populate('department', 'name code'), 'Program updated successfully');
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const program = await Program.findById(req.params.id);
  if (!program) throw new NotFoundError('Program');
  if (req.user?.role === 'org_admin') assertOwnsOrg(req, { school: program.school }, 'school');
  const linkedClass = await ClassModel.exists({ program: program._id });
  if (linkedClass) throw new BadRequestError('Cannot delete program while classes/cohorts are still linked to it. Reassign or remove them first.');
  await Program.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Program deleted successfully');
};
