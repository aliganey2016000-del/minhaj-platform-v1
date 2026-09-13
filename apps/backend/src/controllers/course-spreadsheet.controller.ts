/**
 * Course spreadsheet controller
 *
 * Keeps Manage Courses template/import/export aligned with the Add/Edit
 * Course form. Spreadsheet columns are institution-aware: school-type
 * organizations omit Duration/Fee/Capacity exactly like the form does.
 */
import { Request, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import Course from '../models/course.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ClassModel from '../models/class.model';
import Teacher from '../models/teacher.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import { BadRequestError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TeacherGender = 'male' | 'female';

function slugify(value: string): string {
  const base = value
    .normalize('NFKD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return base || `course-${Date.now().toString(36)}`;
}

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function normalizeLookup(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isHeaderRow(row: Record<string, any>): boolean {
  const first = normalizeLookup(Object.values(row)[0]);
  return first === 'course / subject name' || first === 'course subject name' || first === 'course title (english)' || first === 'course title';
}

function titleCase(value: string): string {
  return value
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function parseTeacherReference(raw: string): { lookupKeys: string[]; email?: string; displayName?: string; gender?: TeacherGender } {
  const trimmed = raw.trim();
  const pipeParts = trimmed.split('|').map((part) => part.trim()).filter(Boolean);
  const identity = pipeParts[0] || trimmed;
  const genderPart = pipeParts.slice(1).map((part) => part.toLowerCase()).find((part) => part === 'male' || part === 'female') as TeacherGender | undefined;

  const namedEmail = identity.match(/^(.+?)\s*<([^>]+)>$/);
  const displayName = namedEmail?.[1]?.trim() || undefined;
  const possibleEmail = (namedEmail?.[2] || identity).trim().toLowerCase();
  const email = EMAIL_REGEX.test(possibleEmail) ? possibleEmail : undefined;

  const lookupKeys = new Set<string>();
  lookupKeys.add(normalizeLookup(trimmed));
  lookupKeys.add(normalizeLookup(identity));
  if (displayName) lookupKeys.add(normalizeLookup(displayName));
  if (email) lookupKeys.add(normalizeLookup(email));

  return { lookupKeys: Array.from(lookupKeys).filter(Boolean), email, displayName, gender: genderPart };
}

function deriveTeacherName(displayName: string | undefined, email: string): { firstName: string; lastName: string } {
  const source = (displayName || titleCase(email.split('@')[0] || 'New Teacher')).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const firstName = (parts.shift() || 'New').slice(0, 50);
  const lastName = (parts.join(' ') || 'Teacher').slice(0, 50);
  return { firstName, lastName };
}

async function resolveOrCreateTeacher(
  teacherValue: string,
  schoolId: string,
  teacherMap: Map<string, any>
): Promise<{ teacherId: any; created: boolean }> {
  const parsed = parseTeacherReference(teacherValue);

  for (const key of parsed.lookupKeys) {
    const existingId = teacherMap.get(key);
    if (existingId) return { teacherId: existingId, created: false };
  }

  if (!parsed.email) {
    throw new Error(
      `Teacher / Instructor "${teacherValue}" was not found. ` +
      'To auto-create a new teacher, use: Full Name <email@example.com> | male or female.'
    );
  }
  if (!parsed.gender) {
    throw new Error(
      `Teacher "${parsed.email}" does not exist yet. ` +
      'For a new teacher, add gender in the same cell, e.g. Ahmed Ali <ahmed@example.com> | male.'
    );
  }

  const existingUser = await User.findOne({ email: parsed.email }).lean();
  if (existingUser) {
    const existingTeacher = await Teacher.findOne({ user: existingUser._id, school: schoolId })
      .select('_id teacherId user profile')
      .populate('user', 'email')
      .populate('profile', 'firstName lastName')
      .lean();
    if (existingTeacher) {
      const fullName = normalizeLookup(`${(existingTeacher as any).profile?.firstName || ''} ${(existingTeacher as any).profile?.lastName || ''}`);
      teacherMap.set(normalizeLookup(parsed.email), existingTeacher._id);
      if ((existingTeacher as any).teacherId) teacherMap.set(normalizeLookup((existingTeacher as any).teacherId), existingTeacher._id);
      if (fullName) teacherMap.set(fullName, existingTeacher._id);
      return { teacherId: existingTeacher._id, created: false };
    }
    throw new Error(`Email "${parsed.email}" is already registered but is not a teacher in this organization`);
  }

  const { firstName, lastName } = deriveTeacherName(parsed.displayName, parsed.email);
  const temporaryPassword = crypto.randomBytes(24).toString('base64url');
  const currentYear = new Date().getFullYear();
  const teacherCount = await Teacher.countDocuments();
  const proposedTeacherId = `TCH-${currentYear}-${String(teacherCount + 1).padStart(4, '0')}`;

  let createdUser: any = null;
  let createdProfile: any = null;
  try {
    createdUser = await User.create({
      email: parsed.email,
      password: temporaryPassword,
      role: 'teacher',
      organizationId: schoolId,
      isVerified: true,
      isActive: true,
      preferredLanguage: 'en',
      onboardingCompleted: false,
    });

    createdProfile = await Profile.create({
      user: createdUser._id,
      firstName,
      lastName,
      gender: parsed.gender,
    });

    const createdTeacher = await Teacher.create({
      user: createdUser._id,
      profile: createdProfile._id,
      teacherId: proposedTeacherId,
      school: schoolId,
      status: 'active',
      joiningDate: new Date(),
    });

    const keys = new Set<string>(parsed.lookupKeys);
    keys.add(normalizeLookup(parsed.email));
    keys.add(normalizeLookup(createdTeacher.teacherId));
    keys.add(normalizeLookup(`${firstName} ${lastName}`));
    for (const key of keys) if (key) teacherMap.set(key, createdTeacher._id);

    return { teacherId: createdTeacher._id, created: true };
  } catch (error) {
    if (createdProfile?._id) await Profile.deleteOne({ _id: createdProfile._id }).catch(() => undefined);
    if (createdUser?._id) await User.deleteOne({ _id: createdUser._id }).catch(() => undefined);
    throw error;
  }
}

async function resolveSpreadsheetContext(req: Request) {
  const requested = (req.query.school || req.query.schoolId || req.body?.school || req.body?.schoolId) as string | undefined;
  const schoolId = resolveOrgIdForCreate(req, requested) as string | undefined;
  if (!schoolId) {
    throw new BadRequestError('Organization is required for course template, import, and export.');
  }

  const organization = await School.findById(schoolId)
    .select('name institutionType organizationType')
    .lean();
  if (!organization) throw new BadRequestError('Organization not found.');

  const institutionType = resolveInstitutionType(organization as any);
  const placementHeader = institutionType === 'school'
    ? 'Class / Section'
    : institutionType === 'training_center'
      ? 'Batch / Cohort'
      : 'Class / Cohort';
  const includeCommercialFields = institutionType !== 'school';
  const headers = [
    'Course / Subject Name',
    'Course Code',
    placementHeader,
    'Teacher / Instructor',
    'Description',
    ...(includeCommercialFields ? ['Duration', 'Fee', 'Capacity'] : []),
  ];

  return { schoolId, organization, institutionType, placementHeader, includeCommercialFields, headers };
}

export const getTemplateHeaders = async (req: Request, res: Response): Promise<Response> => {
  const context = await resolveSpreadsheetContext(req);
  return ApiResponse.success(res, {
    headers: context.headers,
    placementHeader: context.placementHeader,
    institutionType: context.institutionType,
  });
};

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

// The single source of truth for both Download Template and attachment-free
// Generate & Import. This matches courses-template-Grade1-12.xlsx exactly.
function schoolCourseRows(): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [];
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

export const downloadTemplate = async (req: Request, res: Response): Promise<void> => {
  const context = await resolveSpreadsheetContext(req);
  const placementSample = context.institutionType === 'school'
    ? 'Grade 10 — A'
    : context.institutionType === 'training_center'
      ? 'Batch 12'
      : 'Year 1 — A';

  const row: Array<string | number> = [
    'Mathematics',
    'MATH-101',
    placementSample,
    'Ahmed Ali <ahmed.ali@example.com> | male',
    'Core mathematics course',
  ];
  if (context.includeCommercialFields) row.push(8, 0, 50);

  const rows = context.institutionType === 'school' ? schoolCourseRows() : [row];
  const buffer = buildXlsxBuffer(context.headers, rows, 'Course Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=courses-template.xlsx');
  res.end(buffer);
};

// GET /courses/generate-template — Create a school-specific workbook. Each
// existing class is prefilled so admins only need to complete the course data.
export const generateTemplate = async (req: Request, res: Response): Promise<void> => {
  const context = await resolveSpreadsheetContext(req);
  if (context.institutionType === 'school') {
    const buffer = buildXlsxBuffer(context.headers, schoolCourseRows(), 'Course Template');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=courses-generated-template.xlsx');
    res.end(buffer);
    return;
  }
  const classes = await ClassModel.find({ school: context.schoolId, status: { $ne: 'completed' } })
    .select('title name section academicYear')
    .sort({ academicYear: -1, title: 1, section: 1 })
    .lean();

  const rows = (classes as any[]).map((cls) => {
    const title = String(cls.title || cls.name || '').trim();
    const placement = `${title}${cls.section ? ` — ${cls.section}` : ''}`.trim();
    const row: Array<string | number> = ['', '', placement, '', ''];
    if (context.includeCommercialFields) row.push('', '', '');
    return row;
  });

  // A school without classes still receives a usable empty row and the
  // institution-appropriate headers.
  if (!rows.length) {
    const row: Array<string | number> = ['', '', '', '', ''];
    if (context.includeCommercialFields) row.push('', '', '');
    rows.push(row);
  }

  const buffer = buildXlsxBuffer(context.headers, rows, 'Course Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=courses-generated-template.xlsx');
  res.end(buffer);
};

export const exportCourses = async (req: Request, res: Response): Promise<void> => {
  const context = await resolveSpreadsheetContext(req);
  const courses = await Course.find({ school: context.schoolId })
    .populate('class', 'title section')
    .populate({ path: 'teacher', select: 'teacherId user', populate: { path: 'user', select: 'email' } })
    .sort({ createdAt: -1 })
    .lean();

  const rows = courses.map((course: any) => {
    const placement = course.class
      ? `${course.class.title || ''}${course.class.section ? ` — ${course.class.section}` : ''}`.trim()
      : '';
    const row: Array<string | number> = [
      course.title?.en || '',
      course.courseCode || '',
      placement,
      course.teacher?.user?.email || course.teacher?.teacherId || '',
      course.description?.en || '',
    ];
    if (context.includeCommercialFields) {
      row.push(course.duration ?? 8, course.fee ?? 0, course.maxStudents ?? 50);
    }
    return row;
  });

  const buffer = buildXlsxBuffer(context.headers, rows, 'Courses');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=courses-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel file is required (field name "file")');
  const context = await resolveSpreadsheetContext(req);

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (!rows.length) throw new BadRequestError('The uploaded file has no data rows');

  const [classes, teachers, existingScoped, existingSlugs] = await Promise.all([
    ClassModel.find({ school: context.schoolId }).select('title name section').lean(),
    Teacher.find({ school: context.schoolId })
      .select('teacherId user profile')
      .populate('user', 'email')
      .populate('profile', 'firstName lastName')
      .lean(),
    Course.find({ school: context.schoolId }).select('_id slug courseCode school').lean(),
    Course.find({}).select('_id slug school').lean(),
  ]);

  const classMap = new Map<string, any>();
  const titleCounts = new Map<string, number>();
  for (const cls of classes as any[]) {
    const title = String(cls.title || cls.name || '').trim();
    if (!title) continue;
    const titleKey = normalizeLookup(title);
    titleCounts.set(titleKey, (titleCounts.get(titleKey) || 0) + 1);
    if (cls.section) {
      classMap.set(normalizeLookup(`${title} — ${cls.section}`), cls._id);
      classMap.set(normalizeLookup(`${title} ${cls.section}`), cls._id);
      classMap.set(normalizeLookup(`${title} - ${cls.section}`), cls._id);
    }
  }
  for (const cls of classes as any[]) {
    const title = String(cls.title || cls.name || '').trim();
    if (title && titleCounts.get(normalizeLookup(title)) === 1) classMap.set(normalizeLookup(title), cls._id);
  }

  const teacherMap = new Map<string, any>();
  for (const teacher of teachers as any[]) {
    const email = normalizeLookup(teacher.user?.email);
    const teacherId = normalizeLookup(teacher.teacherId);
    const fullName = normalizeLookup(`${teacher.profile?.firstName || ''} ${teacher.profile?.lastName || ''}`);
    if (email) teacherMap.set(email, teacher._id);
    if (teacherId) teacherMap.set(teacherId, teacher._id);
    if (fullName) teacherMap.set(fullName, teacher._id);
  }

  const codeMap = new Map<string, any>();
  for (const course of existingScoped as any[]) {
    const code = normalizeLookup(course.courseCode);
    if (code) codeMap.set(code, course);
  }
  const slugMap = new Map<string, any>();
  for (const course of existingSlugs as any[]) slugMap.set(String(course.slug), course);

  const errors: { row: number; message: string }[] = [];
  const insertDocs: any[] = [];
  const insertRowNumbers: number[] = [];
  const updateOps: any[] = [];
  const seenSlugs = new Set<string>();
  const seenExistingIds = new Set<string>();
  let teachersCreated = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    if (isHeaderRow(row)) continue;

    try {
      const title = String(getField(row, 'Course / Subject Name', 'Course Subject Name', 'Course Title (English)', 'Course Title', 'Course Name', 'Title') ?? '').trim();
      const courseCode = String(getField(row, 'Course Code', 'Code') ?? '').trim();
      const placement = String(getField(row, context.placementHeader, 'Class / Section', 'Batch / Cohort', 'Class / Cohort', 'Class Title', 'Class', 'Cohort', 'Batch') ?? '').trim();
      const teacherValue = String(getField(row, 'Teacher / Instructor', 'Teacher Email', 'Instructor Email', 'Teacher', 'Instructor') ?? '').trim();
      const description = String(getField(row, 'Description') ?? '').trim();

      if (!title) throw new Error('Course / Subject Name is required');

      let classId: any = null;
      if (placement) {
        classId = classMap.get(normalizeLookup(placement));
        if (!classId) throw new Error(`${context.placementHeader} "${placement}" was not found`);
      }

      let duration = 8;
      let fee = 0;
      let maxStudents = 50;
      if (context.includeCommercialFields) {
        const durationRaw = Number(getField(row, 'Duration', 'Duration (weeks)') ?? 8);
        const feeRaw = Number(getField(row, 'Fee', 'Price', 'Price ($)') ?? 0);
        const capacityRaw = Number(getField(row, 'Capacity', 'Max Students') ?? 50);
        if (!Number.isFinite(durationRaw) || durationRaw < 1) throw new Error('Duration must be at least 1');
        if (!Number.isFinite(feeRaw) || feeRaw < 0) throw new Error('Fee cannot be negative');
        if (!Number.isFinite(capacityRaw) || capacityRaw < 1) throw new Error('Capacity must be at least 1');
        duration = durationRaw;
        fee = feeRaw;
        maxStudents = capacityRaw;
      }

      const baseSlug = slugify(title);
      const slug = placement ? `${baseSlug}-${slugify(placement)}` : baseSlug;
      const existingByCode = courseCode ? codeMap.get(normalizeLookup(courseCode)) : undefined;
      const slugOwner = slugMap.get(slug);
      const existing = existingByCode || (slugOwner && String(slugOwner.school) === String(context.schoolId) ? slugOwner : undefined);

      if (existing) {
        const existingId = String(existing._id);
        if (seenExistingIds.has(existingId)) throw new Error('This course appears more than once in the import file');
        if (slugOwner && String(slugOwner._id) !== existingId) {
          throw new Error(`Another course already uses the generated course URL "${slug}"`);
        }
      } else {
        if (slugOwner && String(slugOwner.school) !== String(context.schoolId)) {
          throw new Error(`A course with generated URL "${slug}" already exists in another organization`);
        }
        if (seenSlugs.has(slug)) throw new Error('This course appears more than once in the import file');
      }

      // Teacher is optional. Blank means Unassigned and remains editable later.
      // Existing teacher values can be email, Teacher ID, or full name.
      // Missing teachers are auto-created when the cell supplies enough
      // information: Full Name <email@example.com> | male/female.
      let teacherId: any = null;
      if (teacherValue) {
        const teacherResolution = await resolveOrCreateTeacher(teacherValue, context.schoolId, teacherMap);
        teacherId = teacherResolution.teacherId;
        if (teacherResolution.created) teachersCreated += 1;
      }

      const commonFields: any = {
        title: { en: title, so: '', ar: '' },
        courseCode,
        description: { en: description, so: '', ar: '' },
        teacher: teacherId,
        school: context.schoolId,
        class: classId,
      };
      if (context.includeCommercialFields) {
        commonFields.duration = duration;
        commonFields.fee = fee;
        commonFields.maxStudents = maxStudents;
      }

      if (existing) {
        const existingId = String(existing._id);
        seenExistingIds.add(existingId);
        commonFields.slug = slug;
        updateOps.push({
          updateOne: {
            filter: { _id: existing._id, school: context.schoolId },
            update: { $set: commonFields },
          },
        });
        continue;
      }

      seenSlugs.add(slug);
      insertRowNumbers.push(rowNumber);
      insertDocs.push({
        ...commonFields,
        slug,
        category: '',
        level: 'beginner',
        duration: context.includeCommercialFields ? duration : 8,
        fee: context.includeCommercialFields ? fee : 0,
        maxStudents: context.includeCommercialFields ? maxStudents : 50,
        status: 'draft',
      });
    } catch (error: any) {
      errors.push({ row: rowNumber, message: error?.message || 'Invalid course row' });
    }
  }

  let created = 0;
  if (insertDocs.length) {
    try {
      const inserted = await Course.insertMany(insertDocs, { ordered: false });
      created = inserted.length;
    } catch (error: any) {
      created = error?.insertedDocs?.length || 0;
      if (Array.isArray(error?.writeErrors)) {
        for (const writeError of error.writeErrors) {
          errors.push({
            row: insertRowNumbers[writeError.index] || 0,
            message: writeError.err?.errmsg || writeError.errmsg || 'Could not create course',
          });
        }
      } else if (!created) {
        errors.push({ row: 0, message: error?.message || 'Could not create imported courses' });
      }
    }
  }

  let updated = 0;
  if (updateOps.length) {
    try {
      const result = await Course.bulkWrite(updateOps, { ordered: false });
      updated = result.modifiedCount || result.matchedCount || 0;
    } catch (error: any) {
      errors.push({ row: 0, message: error?.message || 'Could not update existing courses' });
    }
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created,
    updated,
    teachersCreated,
    failed: errors.length,
    errors,
  }, `Imported ${created} new and updated ${updated} existing course(s); auto-created ${teachersCreated} teacher(s)`);
};

// POST /courses/generate — Import the exact same 104 school course rows that
// Download Template returns. Reuse the normal importer so validation, class
// matching, upserts, and the Created/Updated/Failed report stay identical.
export const generateCourses = async (req: Request, res: Response): Promise<Response> => {
  const context = await resolveSpreadsheetContext(req);
  if (context.institutionType !== 'school') {
    throw new BadRequestError('Automatic Grade 1–12 course generation is available for schools only.');
  }

  const buffer = buildXlsxBuffer(context.headers, schoolCourseRows(), 'Course Template');
  (req as any).file = { buffer };
  return bulkImport(req, res);
};
