import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import Course from '../models/course.model';
import School, { resolveInstitutionType } from '../models/school.model';
import { BadRequestError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import { bulkImport } from './course-spreadsheet.controller';

const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');

const PRIMARY_SUBJECTS = [
  ['Islamic Studies', 'ISLA'],
  ['Somali', 'SOM'],
  ['Arabic', 'ARAB'],
  ['Mathematics', 'MATH'],
  ['Science', 'SCI'],
  ['Social Studies', 'SOC'],
] as const;

const UPPER_PRIMARY_EXTRA_SUBJECTS = [
  ['English', 'ENG'],
  ['ICT', 'ICT'],
] as const;

const SECONDARY_SUBJECTS = [
  ['Islamic Studies', 'ISLA'],
  ['Somali', 'SOM'],
  ['Arabic', 'ARAB'],
  ['English', 'ENG'],
  ['Mathematics', 'MATH'],
  ['Physics', 'PHY'],
  ['Chemistry', 'CHEM'],
  ['Biology', 'BIO'],
  ['Geography', 'GEO'],
  ['History', 'HIST'],
  ['ICT', 'ICT'],
  ['Business', 'BUS'],
] as const;

function slugify(value: string): string {
  const base = value
    .normalize('NFKD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return base || `course-${Date.now().toString(36)}`;
}

function schoolCourseRows(): Array<[string, string, string, string, string]> {
  const rows: Array<[string, string, string, string, string]> = [];
  for (let grade = 1; grade <= 12; grade += 1) {
    const subjects = grade <= 4
      ? PRIMARY_SUBJECTS
      : grade <= 8
        ? [...PRIMARY_SUBJECTS.slice(0, 3), ...UPPER_PRIMARY_EXTRA_SUBJECTS.slice(0, 1), ...PRIMARY_SUBJECTS.slice(3), ...UPPER_PRIMARY_EXTRA_SUBJECTS.slice(1)]
        : SECONDARY_SUBJECTS;
    for (const [name, code] of subjects) {
      rows.push([name, `${code}-${grade}`, `Grade ${grade} — A`, '', '']);
    }
  }
  return rows;
}

/**
 * Generate only missing default school courses.
 *
 * The normal spreadsheet importer intentionally updates matching courses. That
 * behavior is correct for explicit administrator uploads, but unsafe for the
 * one-click generator because its blank teacher/description cells could erase
 * curated values. Filter existing codes/slugs first, then delegate only truly
 * new rows to the established importer so its validation and response contract
 * remain unchanged.
 */
export const generateMissingCourses = async (req: Request, res: Response): Promise<Response> => {
  const requested = (req.query.school || req.query.schoolId || req.body?.school || req.body?.schoolId) as string | undefined;
  const schoolId = resolveOrgIdForCreate(req, requested) as string | undefined;
  if (!schoolId) throw new BadRequestError('Organization is required to generate courses.');

  const organization = await School.findById(schoolId).select('institutionType organizationType').lean();
  if (!organization) throw new BadRequestError('Organization not found.');
  if (resolveInstitutionType(organization as any) !== 'school') {
    throw new BadRequestError('Automatic Grade 1–12 course generation is available for schools only.');
  }

  const existing = await Course.find({ school: schoolId }).select('courseCode slug').lean();
  const existingCodes = new Set(existing.map((course: any) => String(course.courseCode || '').trim().toLowerCase()).filter(Boolean));
  const existingSlugs = new Set(existing.map((course: any) => String(course.slug || '').trim()).filter(Boolean));

  const allRows = schoolCourseRows();
  const missingRows = allRows.filter(([title, code, placement]) => {
    const slug = `${slugify(title)}-${slugify(placement)}`;
    return !existingCodes.has(code.toLowerCase()) && !existingSlugs.has(slug);
  });
  const skipped = allRows.length - missingRows.length;

  if (!missingRows.length) {
    return ApiResponse.success(res, {
      totalRows: allRows.length,
      created: 0,
      updated: 0,
      skipped,
      teachersCreated: 0,
      failed: 0,
      errors: [],
    }, `No new courses were needed; preserved ${skipped} existing course(s).`);
  }

  const headers = ['Course / Subject Name', 'Course Code', 'Class / Section', 'Teacher / Instructor', 'Description'];
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...missingRows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Course Template');
  (req as any).file = { buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };

  return bulkImport(req, res);
};
