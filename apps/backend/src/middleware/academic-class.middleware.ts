import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import AcademicStructure from '../models/academic-structure.model';
import ClassModel from '../models/class.model';
import School from '../models/school.model';
import Department from '../models/department.model';
import Program from '../models/program.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import { resolveInstitutionType, isHigherEdInstitutionType } from '../utils/academic-config';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Validates and normalizes a Class/Cohort/Batch write (POST or PATCH) against
// the owning organization's institution type — the authoritative,
// server-side counterpart to classes-manage.tsx's conditional form. Frontend
// hiding a field is not enough: this middleware enforces which fields are
// actually required per institution type, nulls out fields that don't apply
// (so a school's gradeLevel can never leak onto a training center row and
// vice versa), and rejects Department/Program references that belong to a
// different organization.
// ---------------------------------------------------------------------------

export async function validateAcademicClass(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const requestedSchool = req.method === 'POST' ? req.body?.school : undefined;
  let schoolId = resolveOrgIdForCreate(req, requestedSchool as string | undefined);

  if (req.method === 'PATCH' && req.params.id) {
    const existing = await ClassModel.findById(req.params.id).select('school');
    if (!existing) throw new NotFoundError('Class');
    schoolId = String(existing.school);
  }
  if (!schoolId) throw new BadRequestError('An organization must be selected');

  const school = await School.findById(schoolId).select('institutionType organizationType').lean();
  if (!school) throw new NotFoundError('Organization');
  const structure = await AcademicStructure.findOne({ school: schoolId });
  const institutionType = resolveInstitutionType(school);
  const higherEd = isHigherEdInstitutionType(institutionType);
  const isSchool = institutionType === 'school';
  const isTrainingCenter = institutionType === 'training_center';

  if (!String(req.body?.academicYear || '').trim()) {
    throw new BadRequestError('Academic Year is required');
  }

  if (req.body?.capacity !== undefined && req.body?.capacity !== null && req.body?.capacity !== '') {
    const capacity = Number(req.body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000) {
      throw new BadRequestError('Capacity must be a whole number between 1 and 5000');
    }
  }

  // A class can introduce a new department without requiring the admin to
  // leave this form. Resolve by name case-insensitively first; otherwise add
  // it to this organization and use its id. This keeps the department list
  // clean when a matching department already exists.
  const departmentName = String(req.body?.departmentName || '').trim();
  if (departmentName) {
    if (higherEd && structure?.usesFaculty) {
      throw new BadRequestError('Create the department from Institution Structure so it can be assigned to a faculty');
    }
    const tenantId = new mongoose.Types.ObjectId(String(schoolId));
    const department = await Department.findOneAndUpdate(
      { tenantId, name: new RegExp(`^${escapeRegex(departmentName)}$`, 'i') },
      { $setOnInsert: { tenantId, name: departmentName } },
      { upsert: true, new: true, lean: true },
    );
    if (!department) throw new BadRequestError(`Could not resolve department "${departmentName}"`);
    req.body.department = String(department._id);
  }
  delete req.body.departmentName;

  // ── Cross-tenant reference checks — a Department/Program id supplied by
  // the client must actually belong to this same organization. ──
  if (req.body?.department) {
    const dept = await Department.findOne({ _id: req.body.department, tenantId: schoolId }).select('_id').lean();
    if (!dept) throw new BadRequestError('Selected department does not belong to this organization');
  }
  if (req.body?.program) {
    const program = await Program.findOne({ _id: req.body.program, school: schoolId }).select('_id department').lean();
    if (!program) throw new BadRequestError('Selected program does not belong to this organization');
    if (req.body?.department && program.department && String(program.department) !== String(req.body.department)) {
      throw new BadRequestError('Selected program does not belong to the selected department');
    }
  }

  if (isSchool) {
    if (!req.body?.department) throw new BadRequestError('Department is required for schools');
    if (!String(req.body?.batch || '').trim()) throw new BadRequestError('Batch Number is required for schools');
    const gradeLevel = Number(req.body?.gradeLevel);
    if (!Number.isInteger(gradeLevel) || gradeLevel < 0 || gradeLevel > 30) {
      throw new BadRequestError('A valid Grade Level (0-30) is required for schools');
    }
    req.body.program = null;
    req.body.semesterNumber = null;
    req.body.semesterInYear = null;
    req.body.studyYear = null;
    return next();
  }

  if (isTrainingCenter) {
    if (!String(req.body?.batch || '').trim()) throw new BadRequestError('Batch / Cohort is required for training centers');
    req.body.gradeLevel = null;
    req.body.isGraduatingGrade = false;
    req.body.isEntryGrade = false;
    req.body.semesterNumber = null;
    req.body.semesterInYear = null;
    req.body.studyYear = null;
    return next();
  }

  // higherEd (university/college)
  if (!req.body?.department) throw new BadRequestError('Department is required');
  if (!req.body?.program) throw new BadRequestError('Program is required for college and university classes');
  req.body.gradeLevel = null;
  req.body.isGraduatingGrade = false;
  req.body.isEntryGrade = false;

  const academicSystem = structure?.academicSystem || 'semester';
  if (academicSystem === 'semester') {
    const perYear = structure?.semestersPerAcademicYear === 3 ? 3 : 2;
    const semester = Number(req.body?.semesterNumber);
    if (!Number.isInteger(semester) || semester < 1 || semester > 100) {
      throw new BadRequestError('A valid semester number is required for semester-based institutions');
    }
    req.body.studyYear = Math.ceil(semester / perYear);
    req.body.semesterInYear = ((semester - 1) % perYear) + 1;
  } else {
    const studyYear = Number(req.body?.studyYear);
    if (!Number.isInteger(studyYear) || studyYear < 1 || studyYear > 30) {
      throw new BadRequestError('A valid study year is required for annual progression');
    }
    req.body.studyYear = studyYear;
    req.body.semesterNumber = null;
    req.body.semesterInYear = null;
  }

  next();
}
