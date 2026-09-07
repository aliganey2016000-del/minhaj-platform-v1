import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AcademicStructure, { AcademicSystem } from '../models/academic-structure.model';
import ClassModel from '../models/class.model';
import Student from '../models/student.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';
import { refreshStudentCoursesForCurrentClass } from '../services/enrollment.service';
import { resolveInstitutionType, defaultAcademicConfig, validateAcademicConfig } from '../utils/academic-config';

function getSchoolId(req: Request): string {
  const requested = req.method === 'GET' ? req.query.schoolId : req.body?.schoolId;
  const resolved = resolveOrgIdForCreate(req, requested as string | undefined);
  if (!resolved) throw new BadRequestError('An organization must be selected');
  return String(resolved);
}

async function getOrCreateStructure(schoolId: string) {
  const existing = await AcademicStructure.findOne({ school: schoolId });
  if (existing) return existing;

  const school = await School.findById(schoolId).select('_id institutionType organizationType').lean();
  if (!school) throw new NotFoundError('Organization');

  const defaults = defaultAcademicConfig(resolveInstitutionType(school));
  return AcademicStructure.create({ school: schoolId, ...defaults });
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
  const school = await School.findById(schoolId).select('_id institutionType organizationType').lean();
  if (!school) throw new NotFoundError('Organization');
  validateAcademicConfig(academicSystem, semestersPerAcademicYear, resolveInstitutionType(school));

  const set: Record<string, unknown> = {
    academicSystem,
    semestersPerAcademicYear: academicSystem === 'annual' ? 1 : semestersPerAcademicYear,
  };
  // usesFaculty is optional in the request — omit it to leave the org's
  // current setting untouched (e.g. a plain annual/semester toggle shouldn't
  // silently reset a college's opt-in Faculty layer).
  if (typeof req.body?.usesFaculty === 'boolean') set.usesFaculty = req.body.usesFaculty;

  const structure = await AcademicStructure.findOneAndUpdate(
    { school: schoolId },
    { $set: set },
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

  const operationKey = String(req.get('x-idempotency-key') || req.body?.operationKey || '').trim();
  if (operationKey && structure.lastSemesterAdvanceKey === operationKey) {
    throw new BadRequestError('This semester advancement request has already been processed');
  }

  // Protect against rapid duplicate submissions (double-clicks/retries) while
  // still allowing a legitimate later semester transition.
  const lockCutoff = new Date(Date.now() - 15_000);
  const locked = await AcademicStructure.findOneAndUpdate(
    {
      _id: structure._id,
      $or: [
        { lastSemesterAdvanceAt: null },
        { lastSemesterAdvanceAt: { $exists: false } },
        { lastSemesterAdvanceAt: { $lt: lockCutoff } },
      ],
    },
    { $set: { lastSemesterAdvanceAt: new Date(), ...(operationKey ? { lastSemesterAdvanceKey: operationKey } : {}) } },
    { new: true },
  );
  if (!locked) throw new BadRequestError('Semester advancement is already being processed; please wait before retrying');

  const ids = Array.isArray(req.body?.classIds) ? req.body.classIds.map(String).filter(Boolean) : [];
  const filter: Record<string, unknown> = { school: schoolId, status: 'active' };
  if (ids.length) {
    if (ids.some((id: string) => !mongoose.isValidObjectId(id))) throw new BadRequestError('One or more class IDs are invalid');
    filter._id = { $in: ids };
  }

  const classes = await ClassModel.find(filter).sort({ studyYear: 1, semesterNumber: 1, title: 1, section: 1 });
  if (!classes.length) throw new BadRequestError('No active classes found to advance');

  const semestersPerYear = locked.semestersPerAcademicYear;
  const results: Array<Record<string, unknown>> = [];
  let studentsSynced = 0;
  let coursesRefreshed = 0;

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

    // Only active students whose enrollment history is current for the class
    // participate. A stale active enrollment is deliberately left untouched.
    const students = await Student.find({
      school: schoolId,
      class: cls._id,
      status: 'active',
      $or: [
        { enrollmentHistory: { $exists: false } },
        { enrollmentHistory: { $size: 0 } },
        {
          enrollmentHistory: {
            $elemMatch: {
              status: 'active',
              class: cls._id,
              semesterNumber: currentSemester,
            },
          },
        },
      ],
    }).select('_id').lean();

    for (const student of students) {
      await refreshStudentCoursesForCurrentClass(student._id);
      studentsSynced += 1;
      coursesRefreshed += 1;
    }

    results.push({
      classId: cls._id,
      title: cls.title,
      section: cls.section,
      previousSemesterNumber: currentSemester,
      semesterNumber: nextSemester,
      previousStudyYear: currentStudyYear,
      studyYear: nextStudyYear,
      semesterInYear: cls.semesterInYear,
      academicYear: cls.academicYear,
      studentsSynced: students.length,
    });
  }

  return ApiResponse.success(res, {
    academicSystem: locked.academicSystem,
    semestersPerAcademicYear: semestersPerYear,
    advanced: results.length,
    studentsSynced,
    coursesRefreshed,
    results,
  }, `Advanced ${results.length} class(es) and synced ${studentsSynced} student enrollment(s)`);
};
