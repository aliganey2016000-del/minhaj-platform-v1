import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AcademicStructure, { AcademicSystem } from '../models/academic-structure.model';
import ClassModel from '../models/class.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

function getSchoolId(req: Request): string {
  const requested = req.method === 'GET' ? req.query.schoolId : req.body?.schoolId;
  const resolved = resolveOrgIdForCreate(req, requested as string | undefined);
  if (!resolved) throw new BadRequestError('An organization must be selected');
  return String(resolved);
}

async function getOrCreateStructure(schoolId: string) {
  const school = await School.findById(schoolId).select('_id organizationType').lean();
  if (!school) throw new NotFoundError('Organization');
  const existing = await AcademicStructure.findOne({ school: schoolId });
  if (existing) return existing;

  const universityDefaults = school.organizationType === 'university';
  return AcademicStructure.create({
    school: schoolId,
    academicSystem: universityDefaults ? 'semester' : 'annual',
    semestersPerAcademicYear: universityDefaults ? 2 : 1,
  });
}

export const getStructure = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = getSchoolId(req);
  const structure = await getOrCreateStructure(schoolId);
  return ApiResponse.success(res, structure);
};

export const updateStructure = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = getSchoolId(req);
  if (req.user?.role === 'org_admin') assertOwnsOrg(req, { school: schoolId }, 'school');

  const academicSystem = String(req.body?.academicSystem || '').trim() as AcademicSystem;
  const semestersPerAcademicYear = Number(req.body?.semestersPerAcademicYear);
  if (!['annual', 'semester'].includes(academicSystem)) throw new BadRequestError('Academic system must be annual or semester');
  if (academicSystem === 'semester' && ![2, 3].includes(semestersPerAcademicYear)) {
    throw new BadRequestError('Semester-based institutions must use 2 or 3 semesters per academic year');
  }

  const structure = await AcademicStructure.findOneAndUpdate(
    { school: schoolId },
    { $set: { academicSystem, semestersPerAcademicYear: academicSystem === 'annual' ? 1 : semestersPerAcademicYear } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return ApiResponse.success(res, structure, 'Academic structure updated successfully');
};

function incrementAcademicYear(value: string): string {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{4})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    const start = new Date().getFullYear();
    return `${start}-${start + 1}`;
  }
  const start = Number(match[1]) + 1;
  return `${start}-${start + 1}`;
}

export const advanceSemester = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = getSchoolId(req);
  if (req.user?.role === 'org_admin') assertOwnsOrg(req, { school: schoolId }, 'school');
  const structure = await getOrCreateStructure(schoolId);
  if (structure.academicSystem !== 'semester') {
    throw new BadRequestError('This organization uses annual progression. Change Academic System to Semester first.');
  }

  const ids = Array.isArray(req.body?.classIds) ? req.body.classIds.map(String).filter(Boolean) : [];
  const filter: Record<string, unknown> = { school: schoolId, status: 'active' };
  if (ids.length) {
    if (ids.some((id: string) => !mongoose.isValidObjectId(id))) throw new BadRequestError('One or more class IDs are invalid');
    filter._id = { $in: ids };
  }

  const classes = await ClassModel.find(filter).sort({ studyYear: 1, semesterNumber: 1, title: 1, section: 1 });
  if (!classes.length) throw new BadRequestError('No active classes found to advance');

  const semestersPerYear = structure.semestersPerAcademicYear;
  const results: Array<Record<string, unknown>> = [];
  for (const cls of classes) {
    const currentSemester = cls.semesterNumber && cls.semesterNumber > 0 ? cls.semesterNumber : 1;
    const nextSemester = currentSemester + 1;
    const currentStudyYear = cls.studyYear && cls.studyYear > 0 ? cls.studyYear : Math.ceil(currentSemester / semestersPerYear);
    const nextStudyYear = Math.ceil(nextSemester / semestersPerYear);
    const crossedAcademicYear = nextStudyYear > currentStudyYear;

    cls.semesterNumber = nextSemester;
    cls.studyYear = nextStudyYear;
    cls.semesterInYear = ((nextSemester - 1) % semestersPerYear) + 1;
    if (crossedAcademicYear) cls.academicYear = incrementAcademicYear(cls.academicYear || '');
    await cls.save();

    results.push({
      classId: cls._id,
      title: cls.title,
      section: cls.section,
      previousSemesterNumber: currentSemester,
      semesterNumber: nextSemester,
      previousStudyYear: currentStudyYear,
      studyYear: nextStudyYear,
      academicYear: cls.academicYear,
    });
  }

  return ApiResponse.success(res, {
    academicSystem: structure.academicSystem,
    semestersPerAcademicYear: semestersPerYear,
    advanced: results.length,
    results,
  }, `Advanced ${results.length} class(es) to the next semester`);
};
