import { Request, Response, NextFunction } from 'express';
import AcademicStructure from '../models/academic-structure.model';
import ClassModel from '../models/class.model';
import School from '../models/school.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

export async function validateAcademicClass(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const requestedSchool = req.method === 'POST' ? req.body?.school : undefined;
  let schoolId = resolveOrgIdForCreate(req, requestedSchool as string | undefined);

  if (req.method === 'PATCH' && req.params.id) {
    const existing = await ClassModel.findById(req.params.id).select('school');
    if (!existing) throw new NotFoundError('Class');
    schoolId = String(existing.school);
  }
  if (!schoolId) throw new BadRequestError('An organization must be selected');

  const school = await School.findById(schoolId).select('organizationType').lean();
  if (!school) throw new NotFoundError('Organization');
  const structure = await AcademicStructure.findOne({ school: schoolId });
  const university = school.organizationType === 'university';

  if (!university) {
    req.body.semesterNumber = null;
    req.body.semesterInYear = null;
    req.body.studyYear = null;
    return next();
  }

  const academicSystem = structure?.academicSystem || 'semester';
  if (academicSystem === 'semester') {
    const perYear = structure?.semestersPerAcademicYear === 3 ? 3 : 2;
    const semester = Number(req.body?.semesterNumber);
    if (!Number.isInteger(semester) || semester < 1 || semester > 100) {
      throw new BadRequestError('A valid semester number is required for semester-based universities');
    }
    req.body.studyYear = Math.ceil(semester / perYear);
    req.body.semesterInYear = ((semester - 1) % perYear) + 1;
  } else {
    const studyYear = Number(req.body?.studyYear);
    if (!Number.isInteger(studyYear) || studyYear < 1 || studyYear > 30) {
      throw new BadRequestError('A valid study year is required for annual university progression');
    }
    req.body.studyYear = studyYear;
    req.body.semesterNumber = null;
    req.body.semesterInYear = null;
  }

  next();
}
