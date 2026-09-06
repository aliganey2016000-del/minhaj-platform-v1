import { Request, Response } from 'express';
import Department from '../models/department.model';
import Faculty from '../models/faculty.model';
import AcademicStructure from '../models/academic-structure.model';
import ClassModel from '../models/class.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';
import School from '../models/school.model';

async function usesFaculty(tenantId: string): Promise<boolean> {
  const [structure, school] = await Promise.all([
    AcademicStructure.findOne({ school: tenantId }).select('usesFaculty').lean(),
    School.findById(tenantId).select('institutionType organizationType').lean(),
  ]);
  return !!structure?.usesFaculty || school?.institutionType === 'university' || school?.organizationType === 'university';
}

const DEPARTMENT_LIMIT = 200;

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = {};
  if (req.user?.role === 'org_admin') {
    if (!req.user.organizationId) return ApiResponse.success(res, []);
    filter.tenantId = req.user.organizationId;
  } else if (req.query.school) {
    filter.tenantId = req.query.school as string;
  }
  if (req.query.faculty) filter.facultyId = req.query.faculty as string;

  const departments = await Department.find(filter)
    .populate('facultyId', 'name code')
    .sort({ name: 1 })
    .limit(DEPARTMENT_LIMIT)
    .lean();

  return ApiResponse.success(res, departments);
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { name, code, facultyId, headOfDepartment, phone, email, establishedYear } = req.body;
  if (!name || !String(name).trim()) throw new BadRequestError('Department name is required');

  const tenantId = resolveOrgIdForCreate(req, req.body.tenantId);
  if (!tenantId) throw new BadRequestError('Tenant ID is required');

  let resolvedFacultyId = facultyId || undefined;
  if (await usesFaculty(String(tenantId))) {
    if (!resolvedFacultyId) throw new BadRequestError('Faculty is required for departments in this organization');
    const faculty = await Faculty.findOne({ _id: resolvedFacultyId, tenantId });
    if (!faculty) throw new BadRequestError('Selected faculty does not belong to this organization');
  } else {
    resolvedFacultyId = undefined;
  }

  const existing = await Department.findOne({ tenantId, name: new RegExp(`^${String(name).trim()}$`, 'i') });
  if (existing) throw new ConflictError('A department with this name already exists in this organization');

  const department = await Department.create({
    name: String(name).trim(),
    code: code ? String(code).trim() : undefined,
    headOfDepartment: headOfDepartment ? String(headOfDepartment).trim() : undefined,
    phone: phone ? String(phone).trim() : undefined,
    email: email ? String(email).trim() : undefined,
    establishedYear: establishedYear ? Number(establishedYear) : undefined,
    tenantId,
    facultyId: resolvedFacultyId,
  });

  return ApiResponse.created(res, await department.populate('facultyId', 'name code'), 'Department created successfully');
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const department = await Department.findById(req.params.id);
  if (!department) throw new NotFoundError('Department');

  if (req.user?.role === 'org_admin') assertOwnsOrg(req, { school: department.tenantId }, 'school');

  const { name, code, facultyId, headOfDepartment, phone, email, establishedYear } = req.body;
  if (name !== undefined && !String(name).trim()) throw new BadRequestError('Department name cannot be empty');

  if (await usesFaculty(String(department.tenantId))) {
    const nextFacultyId = facultyId !== undefined ? facultyId : department.facultyId;
    if (!nextFacultyId) throw new BadRequestError('Faculty is required for departments in this organization');
    const faculty = await Faculty.findOne({ _id: nextFacultyId, tenantId: department.tenantId });
    if (!faculty) throw new BadRequestError('Selected faculty does not belong to this organization');
    department.facultyId = nextFacultyId;
  } else {
    department.facultyId = undefined;
  }

  if (name) {
    const conflicting = await Department.findOne({ tenantId: department.tenantId, _id: { $ne: department._id }, name: new RegExp(`^${String(name).trim()}$`, 'i') });
    if (conflicting) throw new ConflictError('A department with this name already exists in this organization');
    department.name = String(name).trim();
  }
  if (code !== undefined) department.code = String(code).trim();
  if (headOfDepartment !== undefined) department.headOfDepartment = String(headOfDepartment).trim();
  if (phone !== undefined) department.phone = String(phone).trim();
  if (email !== undefined) department.email = String(email).trim();
  if (establishedYear !== undefined) department.establishedYear = establishedYear ? Number(establishedYear) : undefined;
  await department.save();
  return ApiResponse.success(res, await department.populate('facultyId', 'name code'), 'Department updated successfully');
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const department = await Department.findById(req.params.id);
  if (!department) throw new NotFoundError('Department');
  if (req.user?.role === 'org_admin') assertOwnsOrg(req, { school: department.tenantId }, 'school');
  const linkedClass = await ClassModel.exists({ department: department._id });
  if (linkedClass) throw new BadRequestError('Cannot delete department while classes are still linked to it. Reassign or remove classes first.');
  await Department.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Department deleted successfully');
};
