import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import Department from '../models/department.model';
import Faculty from '../models/faculty.model';
import AcademicStructure from '../models/academic-structure.model';
import ClassModel from '../models/class.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate, resolveViewableOrgId } from '../utils/tenant-scope';
import School from '../models/school.model';
import { resolveInstitutionType, defaultAcademicConfig, isHigherEdInstitutionType } from '../utils/academic-config';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

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
const DEPARTMENT_SHEET_HEADERS = ['Department Name', 'Code', 'Faculty', 'Head of Department', 'Phone', 'Email', 'Established Year'];

function getImportField(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((candidate) => candidate.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanImportText(value: unknown, label: string, maxLength: number): string {
  const cleaned = String(value ?? '').trim();
  if (cleaned.length > maxLength) throw new Error(`${label} cannot exceed ${maxLength} characters`);
  return cleaned;
}

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

export const downloadTemplate = async (req: Request, res: Response): Promise<void> => {
  const tenantId = resolveViewableOrgId(req, req.query.school);
  if (!tenantId) throw new BadRequestError('Organization is required');
  const requiresFaculty = await usesFaculty(tenantId);
  const example = ['Primary', 'PRI-01', requiresFaculty ? 'Faculty of Education' : '', 'Amina Ahmed', '+252 61 0000000', 'primary@example.edu', new Date().getFullYear()];
  const buffer = buildXlsxBuffer(DEPARTMENT_SHEET_HEADERS, [example], 'Department Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=departments-template.xlsx');
  res.end(buffer);
};

export const exportDepartments = async (req: Request, res: Response): Promise<void> => {
  const tenantId = resolveViewableOrgId(req, req.query.school);
  if (!tenantId) throw new BadRequestError('Organization is required');
  const departments = await Department.find({ tenantId }).populate('facultyId', 'name').sort({ name: 1 }).lean();
  const rows = departments.map((department: any) => [
    department.name || '', department.code || '', department.facultyId?.name || '', department.headOfDepartment || '',
    department.phone || '', department.email || '', department.establishedYear || '',
  ]);
  const buffer = buildXlsxBuffer(DEPARTMENT_SHEET_HEADERS, rows, 'Departments');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=departments-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');
  const tenantId = resolveViewableOrgId(req, req.query.school);
  if (!tenantId) throw new BadRequestError('Organization is required');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new BadRequestError('The uploaded file has no sheets');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: '' });
  if (!rows.length) throw new BadRequestError('The uploaded file has no data rows');
  if (rows.length > 2000) throw new BadRequestError('A maximum of 2,000 departments can be imported at once');

  const requiresFaculty = await usesFaculty(tenantId);
  const faculties = requiresFaculty ? await Faculty.find({ tenantId }).select('_id name code').lean() : [];
  const facultyByNameOrCode = new Map<string, any>();
  faculties.forEach((faculty: any) => {
    facultyByNameOrCode.set(String(faculty.name).trim().toLowerCase(), faculty._id);
    if (faculty.code) facultyByNameOrCode.set(String(faculty.code).trim().toLowerCase(), faculty._id);
  });

  const errors: { row: number; message: string }[] = [];
  let created = 0; let updated = 0;
  for (let index = 0; index < rows.length; index += 1) {
    try {
      const row = rows[index];
      const name = cleanImportText(getImportField(row, 'Department Name', 'Department', 'Name'), 'Department name', 100);
      if (!name) throw new Error('Department Name is required');
      const code = cleanImportText(getImportField(row, 'Code', 'Department Code'), 'Code', 20);
      const facultyText = cleanImportText(getImportField(row, 'Faculty', 'Faculty Name', 'Faculty Code'), 'Faculty', 100);
      const headOfDepartment = cleanImportText(getImportField(row, 'Head of Department', 'HOD', 'Department Head'), 'Head of Department', 100);
      const phone = cleanImportText(getImportField(row, 'Phone', 'Phone Number'), 'Phone', 30);
      const email = cleanImportText(getImportField(row, 'Email', 'Email Address'), 'Email', 200).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email address is invalid');
      const yearText = String(getImportField(row, 'Established Year', 'Established', 'Year') ?? '').trim();
      const establishedYear = yearText ? Number(yearText) : undefined;
      if (establishedYear !== undefined && (!Number.isInteger(establishedYear) || establishedYear < 1900 || establishedYear > new Date().getFullYear())) throw new Error(`Established Year must be between 1900 and ${new Date().getFullYear()}`);

      let facultyId: any = undefined;
      if (requiresFaculty) {
        if (!facultyText) throw new Error('Faculty is required for this institution');
        facultyId = facultyByNameOrCode.get(facultyText.toLowerCase());
        if (!facultyId) throw new Error(`Faculty "${facultyText}" was not found in this organization`);
      }

      const existing = await Department.findOne({ tenantId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
      if (existing) {
        existing.name = name; existing.code = code; existing.headOfDepartment = headOfDepartment;
        existing.phone = phone; existing.email = email; existing.establishedYear = establishedYear;
        existing.facultyId = facultyId;
        await existing.save(); updated += 1;
      } else {
        await Department.create({ name, code, headOfDepartment, phone, email, establishedYear, tenantId, facultyId });
        created += 1;
      }
    } catch (error: any) {
      errors.push({ row: index + 2, message: error?.message || 'Could not import this row' });
    }
  }

  return ApiResponse.success(res, { totalRows: rows.length, created, updated, failed: errors.length, errors }, 'Department import completed');
};
