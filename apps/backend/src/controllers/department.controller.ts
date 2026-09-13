import { Request, Response } from 'express';
import Department from '../models/department.model';
import Faculty from '../models/faculty.model';
import AcademicStructure from '../models/academic-structure.model';
import ClassModel from '../models/class.model';
import Student from '../models/student.model';
import mongoose from 'mongoose';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate, resolveViewableOrgId } from '../utils/tenant-scope';
import School from '../models/school.model';
import { resolveInstitutionType, defaultAcademicConfig, isHigherEdInstitutionType } from '../utils/academic-config';

// Faculty is a higher-ed-only concept: School and Training Center must NEVER
// be able to use it, even if their AcademicStructure.usesFaculty field was
// somehow set true (the structure endpoint itself now rejects that, but this
// stays a hard AND-gate here too, defense in depth against direct DB edits
// or legacy data). For University/College, an explicit
// AcademicStructure.usesFaculty always wins (an org can opt in/out either
// way), falling back to the institution type's default (university=true,
// college=false — see defaultAcademicConfig) only when no structure document
// exists yet at all. NOTE: do NOT collapse the higher-ed branch to "any
// higher-ed type uses faculty unconditionally" — that would force Faculty on
// for every college regardless of its own explicit opt-out, which
// organization-registration.e2e.ts relies on staying false by default for a
// fresh college.
async function usesFaculty(tenantId: string): Promise<boolean> {
  const school = await School.findById(tenantId).select('institutionType organizationType').lean();
  if (!school || !isHigherEdInstitutionType(resolveInstitutionType(school))) return false;
  const structure = await AcademicStructure.findOne({ school: tenantId }).select('usesFaculty').lean();
  if (structure) return !!structure.usesFaculty;
  return defaultAcademicConfig(resolveInstitutionType(school)).usesFaculty;
}

const DEPARTMENT_LIMIT = 200;

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = {};
  const tenantId = resolveViewableOrgId(req, req.query.school);
  if (!tenantId) return ApiResponse.success(res, []);
  filter.tenantId = tenantId;
  if (req.query.faculty) filter.facultyId = req.query.faculty as string;

  const departments = await Department.find(filter)
    .populate('facultyId', 'name code')
    .sort({ name: 1 })
    .limit(DEPARTMENT_LIMIT)
    .lean();

  const studentCounts = await Student.aggregate([
    { $match: { school: new mongoose.Types.ObjectId(String(tenantId)), status: 'active' } },
    { $lookup: { from: ClassModel.collection.name, localField: 'class', foreignField: '_id', as: 'currentClass' } },
    { $unwind: '$currentClass' },
    { $match: { 'currentClass.department': { $ne: null } } },
    { $group: { _id: '$currentClass.department', numberOfStudents: { $sum: 1 } } },
  ]);
  const studentsByDepartment = new Map(studentCounts.map((entry: any) => [String(entry._id), entry.numberOfStudents]));

  return ApiResponse.success(res, departments.map((department: any) => ({
    ...department,
    numberOfStudents: studentsByDepartment.get(String(department._id)) || 0,
  })));
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
