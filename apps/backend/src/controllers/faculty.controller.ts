import { Request, Response } from 'express';
import Faculty from '../models/faculty.model';
import Department from '../models/department.model';
import AcademicStructure from '../models/academic-structure.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate, resolveViewableOrgId } from '../utils/tenant-scope';
import School from '../models/school.model';
import { resolveInstitutionType, defaultAcademicConfig, isHigherEdInstitutionType } from '../utils/academic-config';

// Faculty is a higher-ed-only concept: School and Training Center must NEVER
// be able to create one, even if their AcademicStructure.usesFaculty field
// was somehow set true (the structure endpoint itself now rejects that, but
// this stays a hard AND-gate here too, defense in depth against direct DB
// edits or legacy data). See the matching comment in
// department.controller.ts's usesFaculty(): for University/College, an
// explicit AcademicStructure.usesFaculty always wins, falling back to the
// institution type's default (university=true, college=false) only when no
// structure document exists yet. Must NOT treat every higher-ed org as
// faculty-using unconditionally — a fresh college defaults to false until it
// explicitly opts in (organization-registration.e2e.ts covers this).
async function assertUsesFaculty(tenantId: string): Promise<void> {
  const school = await School.findById(tenantId).select('institutionType organizationType').lean();
  const institutionType = school ? resolveInstitutionType(school) : null;
  if (!school || !isHigherEdInstitutionType(institutionType!)) {
    throw new BadRequestError('Faculties are not enabled for this organization. Enable "Uses Faculty" in Academic Structure settings first.');
  }
  const structure = await AcademicStructure.findOne({ school: tenantId }).select('usesFaculty').lean();
  const usesFaculty = structure ? !!structure.usesFaculty : defaultAcademicConfig(institutionType!).usesFaculty;
  if (!usesFaculty) {
    throw new BadRequestError('Faculties are not enabled for this organization. Enable "Uses Faculty" in Academic Structure settings first.');
  }
}

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const tenantId = resolveViewableOrgId(req, req.query.school);
  if (!tenantId) return ApiResponse.success(res, []);
  const faculties = await Faculty.find({ tenantId }).sort({ name: 1 }).limit(200).lean();
  return ApiResponse.success(res, faculties);
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const tenantId = resolveOrgIdForCreate(req, req.body.tenantId);
  if (!tenantId) throw new BadRequestError('Tenant ID is required');
  await assertUsesFaculty(String(tenantId));
  const name = String(req.body.name || '').trim();
  if (!name) throw new BadRequestError('Faculty name is required');
  const exists = await Faculty.findOne({ tenantId, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') });
  if (exists) throw new ConflictError('A faculty with this name already exists in this organization');
  const faculty = await Faculty.create({
    tenantId,
    name,
    code: req.body.code ? String(req.body.code).trim() : undefined,
    deanName: req.body.deanName ? String(req.body.deanName).trim() : undefined,
    phone: req.body.phone ? String(req.body.phone).trim() : undefined,
    email: req.body.email ? String(req.body.email).trim().toLowerCase() : undefined,
    establishedYear: req.body.establishedYear ? Number(req.body.establishedYear) : undefined,
  });
  return ApiResponse.created(res, faculty, 'Faculty created successfully');
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const faculty = await Faculty.findById(req.params.id);
  if (!faculty) throw new NotFoundError('Faculty');
  if (req.user?.role === 'org_admin') assertOwnsOrg(req, { school: faculty.tenantId }, 'school');
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new BadRequestError('Faculty name cannot be empty');
    const conflict = await Faculty.findOne({ tenantId: faculty.tenantId, _id: { $ne: faculty._id }, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') });
    if (conflict) throw new ConflictError('A faculty with this name already exists in this organization');
    faculty.name = name;
  }
  if (req.body.code !== undefined) faculty.code = String(req.body.code).trim();
  if (req.body.deanName !== undefined) faculty.deanName = String(req.body.deanName).trim();
  if (req.body.phone !== undefined) faculty.phone = String(req.body.phone).trim();
  if (req.body.email !== undefined) faculty.email = String(req.body.email).trim().toLowerCase();
  if (req.body.establishedYear !== undefined) faculty.establishedYear = req.body.establishedYear ? Number(req.body.establishedYear) : undefined;
  await faculty.save();
  return ApiResponse.success(res, faculty, 'Faculty updated successfully');
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const faculty = await Faculty.findById(req.params.id);
  if (!faculty) throw new NotFoundError('Faculty');
  if (req.user?.role === 'org_admin') assertOwnsOrg(req, { school: faculty.tenantId }, 'school');
  const linkedDepartment = await Department.exists({ facultyId: faculty._id });
  if (linkedDepartment) throw new BadRequestError('Cannot delete faculty while departments are linked to it. Reassign departments first.');
  await Faculty.findByIdAndDelete(faculty._id);
  return ApiResponse.noContent(res, 'Faculty deleted successfully');
};
