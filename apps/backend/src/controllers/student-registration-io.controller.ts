import crypto from 'crypto';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import Student from '../models/student.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import Parent from '../models/parent.model';
import School from '../models/school.model';
import ClassModel from '../models/class.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ConflictError } from '../utils/api-error';
import { applyOrgFilter, resolveOrgIdForCreate } from '../utils/tenant-scope';
import { syncStudentCourseEnrollment, reassignStudentClassCourses } from '../services/enrollment.service';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import { assertSafeSpreadsheetUpload } from '../utils/spreadsheet-upload';

/**
 * One canonical, human-editable student registration contract.
 *
 * Template: exactly these 12 columns.
 * Export: Student ID + these 12 columns + Organization. Student ID and
 * Organization are round-trip metadata: the importer accepts them, but they
 * are never required for a new registration.
 */
export const STUDENT_REGISTRATION_HEADERS = [
  'First Name',
  'Last Name',
  'Gender',
  'Email',
  'Class Name',
  'Section',
  'Enrollment Date',
  'Medical Notes',
  'Guardian Name',
  'Guardian Email',
  'Guardian Phone',
  'Relationship',
] as const;

const EXPORT_HEADERS = ['Student ID', ...STUDENT_REGISTRATION_HEADERS, 'Organization'];
const RELATIONSHIPS = new Set(['father', 'mother', 'guardian', 'other']);
const GENDERS = new Set(['male', 'female']);
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RowAction = 'new' | 'update' | 'duplicate' | 'class_not_found' | 'invalid';

type ClassCandidate = {
  classId: mongoose.Types.ObjectId;
  title: string;
  section: string;
  academicYear: string;
  batch: string;
  grade?: string;
  department?: string;
  shiftMode?: string;
};

type ParsedRegistration = {
  row: number;
  action: RowAction;
  message?: string;
  schoolId?: string;
  existingStudentId?: mongoose.Types.ObjectId;
  studentId?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  email?: string;
  className?: string;
  section?: string;
  classCandidate?: ClassCandidate;
  enrollmentDate?: Date;
  hasEnrollmentDate?: boolean;
  medicalNotes?: string;
  hasMedicalNotes?: boolean;
  guardianName?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  relationship?: string;
};

function getField(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((candidate) => candidate.trim().toLowerCase() === name.trim().toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function hasField(row: Record<string, unknown>, ...names: string[]): boolean {
  const keys = Object.keys(row).map((key) => key.trim().toLowerCase());
  return names.some((name) => keys.includes(name.trim().toLowerCase()));
}

function esc(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function slug(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40);
}

function temporaryPassword(): string {
  return `${crypto.randomBytes(10).toString('hex')}Aa1!`;
}

async function uniqueSystemEmail(prefix: string, kind: 'student' | 'guardian'): Promise<string> {
  const safePrefix = slug(prefix) || kind;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const token = crypto.randomBytes(4).toString('hex');
    const email = `${safePrefix}.${token}@${kind}s.sahal.local`;
    if (!await User.exists({ email })) return email;
  }
  throw new ConflictError(`Could not generate a unique ${kind} email. Please retry.`);
}

function normalizeGender(raw: unknown): string {
  const value = clean(raw).toLowerCase();
  return value || 'male';
}

function relationshipTitle(raw: unknown): string {
  const value = clean(raw).toLowerCase() || 'father';
  if (value === 'mother') return 'Mother';
  if (value === 'guardian') return 'Guardian';
  if (value === 'other') return 'Other';
  return 'Father';
}

function relationshipModel(raw: unknown): string {
  const value = clean(raw).toLowerCase() || 'father';
  return RELATIONSHIPS.has(value) ? value : 'father';
}

function parseSpreadsheetDate(raw: unknown): Date | undefined {
  if (raw === null || raw === undefined || clean(raw) === '') return undefined;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number') {
    const parts = XLSX.SSF.parse_date_code(raw);
    if (parts) {
      const date = new Date(parts.y, parts.m - 1, parts.d);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  const date = new Date(clean(raw));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isoDate(value: unknown): string {
  const date = value ? new Date(value as any) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function classKey(title: string, section: string): string {
  return `${title.trim().toLowerCase()}::${section.trim().toLowerCase()}`;
}

async function resolveSchoolId(req: Request, row: Record<string, unknown>): Promise<string> {
  const requested = clean(req.query.school || req.body?.school || req.body?.schoolId);
  const resolved = resolveOrgIdForCreate(req, requested || undefined);
  if (resolved) return String(resolved);

  // Backward compatibility and exported-file round trips for a platform admin.
  const fromRow = clean(getField(row, 'Organization', 'School', 'Organization ID', 'School ID'));
  if (!fromRow) throw new Error('Organization context is required. Select an organization before importing.');

  if (mongoose.isValidObjectId(fromRow)) {
    const byId = await School.findById(fromRow).select('_id').lean();
    if (byId) return String(byId._id);
  }
  const byName = await School.findOne({ name: new RegExp(`^${esc(fromRow)}$`, 'i') }).select('_id').lean();
  if (!byName) throw new Error(`Organization "${fromRow}" was not found`);
  return String(byName._id);
}

const classCache = new Map<string, Map<string, ClassCandidate[]>>();

async function getClassCandidates(schoolId: string): Promise<Map<string, ClassCandidate[]>> {
  const cached = classCache.get(schoolId);
  if (cached) return cached;

  const byKey = new Map<string, ClassCandidate[]>();
  const classes = await ClassModel.find({ school: schoolId, status: 'active' })
    .populate('department', 'name')
    .sort({ academicYear: -1, batch: -1, createdAt: -1 })
    .lean();

  for (const cls of classes as any[]) {
    const department = cls.department;
    const candidate: ClassCandidate = {
      classId: cls._id,
      title: clean(cls.title),
      section: clean(cls.section),
      academicYear: clean(cls.academicYear),
      batch: clean(cls.batch),
      grade: cls.gradeLevel !== null && cls.gradeLevel !== undefined ? String(cls.gradeLevel) : clean(cls.title) || undefined,
      department: typeof department === 'string' ? department : department?.name || undefined,
      shiftMode: cls.shiftMode || undefined,
    };
    const key = classKey(candidate.title, candidate.section);
    byKey.set(key, [...(byKey.get(key) || []), candidate]);
  }

  classCache.set(schoolId, byKey);
  return byKey;
}

async function resolveClass(
  schoolId: string,
  className: string,
  section: string,
  legacyAcademicYear: string,
  legacyBatch: string,
  preferredClassId?: string,
): Promise<ClassCandidate> {
  const byKey = await getClassCandidates(schoolId);
  let matches = byKey.get(classKey(className, section)) || [];
  if (matches.length === 0) throw new Error(`Active class "${className} — Section ${section}" was not found`);

  // Legacy sheets may contain Academic Year / Batch Number. They are not part
  // of the new template, but remain accepted to safely disambiguate older
  // cohort-aware files.
  if (legacyAcademicYear) {
    const filtered = matches.filter((candidate) => candidate.academicYear.toLowerCase() === legacyAcademicYear.toLowerCase());
    if (filtered.length === 0) {
      throw new Error(`No active class "${className} — Section ${section}" matches Academic Year "${legacyAcademicYear}"`);
    }
    matches = filtered;
  }
  if (legacyBatch) {
    const filtered = matches.filter((candidate) => candidate.batch.toLowerCase() === legacyBatch.toLowerCase());
    if (filtered.length === 0) {
      throw new Error(`No active class "${className} — Section ${section}" matches Batch Number "${legacyBatch}"`);
    }
    matches = filtered;
  }

  if (matches.length === 1) return matches[0];

  // Export -> Import round trips carry Student ID. For an existing student,
  // preserve the exact current class when multiple active cohorts share the
  // same display title + section.
  if (preferredClassId) {
    const current = matches.find((candidate) => String(candidate.classId) === String(preferredClassId));
    if (current) return current;
  }

  throw new Error(
    `Multiple active classes match "${className} — Section ${section}". ` +
    'Use Academic Year and Batch Number to disambiguate this cohort, or make Class Name + Section unique.'
  );
}

function readRows(req: Request): Record<string, unknown>[] {
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');
  assertSafeSpreadsheetUpload(req.file);
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: false });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');
  return rows;
}

async function parseRows(req: Request, rows: Record<string, unknown>[]): Promise<ParsedRegistration[]> {
  classCache.clear();
  const parsed: ParsedRegistration[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const rowNum = index + 2;
    const row = rows[index];
    try {
      const schoolId = await resolveSchoolId(req, row);
      const studentId = clean(getField(row, 'Student ID', 'StudentID', 'Student Id')).toUpperCase();
      const firstName = clean(getField(row, 'First Name', 'Firstname'));
      const lastName = clean(getField(row, 'Last Name', 'Lastname')) || firstName;
      const gender = normalizeGender(getField(row, 'Gender'));
      const email = clean(getField(row, 'Email', 'Student Email')).toLowerCase();
      const className = clean(getField(row, 'Class Name', 'Class', 'Grade / Class', 'Grade/Class'));
      const section = clean(getField(row, 'Section'));
      const guardianName = clean(getField(row, 'Guardian Name', 'Guardian Full Name'));
      const guardianEmail = clean(getField(row, 'Guardian Email')).toLowerCase();
      const guardianPhone = clean(getField(row, 'Guardian Phone', 'Parent Phone'));
      const relationshipRaw = clean(getField(row, 'Relationship')).toLowerCase();
      const relationship = relationshipTitle(relationshipRaw);
      const hasGuardianColumns = hasField(
        row,
        'Guardian Name', 'Guardian Full Name', 'Guardian Email', 'Guardian Phone', 'Parent Phone', 'Relationship',
      );
      const enrollmentRaw = getField(row, 'Enrollment Date');
      const enrollmentDate = parseSpreadsheetDate(enrollmentRaw);
      const medicalNotes = clean(getField(row, 'Medical Notes'));
      const legacyAcademicYear = clean(getField(row, 'Academic Year', 'AcademicYear'));
      const legacyBatch = clean(getField(row, 'Batch Number', 'Batch'));

      if (!firstName) throw new Error('First Name is required');
      if (!GENDERS.has(gender)) throw new Error('Gender must be male or female');
      if (email && !SIMPLE_EMAIL.test(email)) throw new Error('Student Email is invalid');
      if (!className) throw new Error('Class Name is required');
      if (!section) throw new Error('Section is required');
      if (guardianEmail && !SIMPLE_EMAIL.test(guardianEmail)) throw new Error('Guardian Email is invalid');
      if (relationshipRaw && !RELATIONSHIPS.has(relationshipRaw)) {
        throw new Error('Relationship must be Father, Mother, Guardian or Other');
      }
      if (clean(enrollmentRaw) && !enrollmentDate) throw new Error('Enrollment Date is invalid');

      // Resolve an existing student before resolving the class. This is what
      // makes an exported workbook round-trip safely when two active cohorts
      // happen to share the same Class Name + Section: Student ID preserves
      // the exact current class instead of guessing.
      let existingStudent: any = null;
      if (studentId) {
        existingStudent = await Student.findOne({ school: schoolId, studentId }).select('_id user studentId class').lean();
      }

      if (!existingStudent && email) {
        const existingUser = await User.findOne({ email }).select('_id role organizationId').lean();
        if (existingUser) {
          existingStudent = await Student.findOne({ school: schoolId, user: existingUser._id }).select('_id user studentId class').lean();
          if (!existingStudent) throw new Error(`Email "${email}" belongs to another account and cannot be used for this student`);
        }
      }

      if (existingStudent && email) {
        const conflictingUser = await User.findOne({ email, _id: { $ne: existingStudent.user } }).select('_id').lean();
        if (conflictingUser) throw new Error(`Email "${email}" is already used by another account`);
      }

      // New 12-column templates intentionally require a guardian name + phone.
      // Older SAHAL import sheets had no guardian columns at all, so those are
      // still accepted for backward compatibility. Existing legacy students
      // exported with blank guardian fields can also be imported back safely.
      if (hasGuardianColumns) {
        if (guardianName && !guardianPhone) throw new Error('Guardian Phone is required when Guardian Name is provided');
        if (guardianPhone && !guardianName) throw new Error('Guardian Name is required when Guardian Phone is provided');
        if (!existingStudent && !guardianName && !guardianPhone) {
          throw new Error('Guardian Name and Guardian Phone are required');
        }
      }

      let classCandidate: ClassCandidate;
      try {
        classCandidate = await resolveClass(
          schoolId,
          className,
          section,
          legacyAcademicYear,
          legacyBatch,
          existingStudent?.class ? String(existingStudent.class) : undefined,
        );
      } catch (error: any) {
        parsed.push({
          row: rowNum, action: 'class_not_found', message: error?.message || 'Class not found', schoolId,
          studentId: studentId || existingStudent?.studentId || undefined, firstName, lastName, gender, email: email || undefined,
          className, section, guardianName: guardianName || undefined, guardianEmail: guardianEmail || undefined,
          guardianPhone: guardianPhone || undefined, relationship,
        });
        continue;
      }

      const identity = existingStudent
        ? `existing:${existingStudent._id}`
        : studentId
          ? `student-id:${schoolId}:${studentId}`
          : email
            ? `email:${email}`
            : `new:${schoolId}:${firstName.toLowerCase()}:${lastName.toLowerCase()}:${classKey(className, section)}:${guardianPhone}`;

      if (seen.has(identity)) {
        parsed.push({
          row: rowNum, action: 'duplicate', message: 'This student appears more than once in the import file', schoolId,
          studentId: studentId || existingStudent?.studentId, firstName, lastName, gender, email: email || undefined,
          className, section, classCandidate, guardianName: guardianName || undefined,
          guardianEmail: guardianEmail || undefined, guardianPhone: guardianPhone || undefined, relationship,
        });
        continue;
      }
      seen.add(identity);

      parsed.push({
        row: rowNum,
        action: existingStudent ? 'update' : 'new',
        schoolId,
        existingStudentId: existingStudent?._id,
        studentId: studentId || existingStudent?.studentId || undefined,
        firstName,
        lastName,
        gender,
        email: email || undefined,
        className,
        section,
        classCandidate,
        enrollmentDate: enrollmentDate || new Date(),
        hasEnrollmentDate: hasField(row, 'Enrollment Date') && clean(enrollmentRaw) !== '',
        medicalNotes,
        hasMedicalNotes: hasField(row, 'Medical Notes'),
        guardianName: guardianName || undefined,
        guardianEmail: guardianEmail || undefined,
        guardianPhone: guardianPhone || undefined,
        relationship,
      });
    } catch (error: any) {
      parsed.push({ row: rowNum, action: 'invalid', message: error?.message || 'Invalid row' });
    }
  }

  return parsed;
}

function previewPayload(parsed: ParsedRegistration[]) {
  const count = (action: RowAction) => parsed.filter((row) => row.action === action).length;
  const newStudents = count('new');
  const updates = count('update');
  const duplicates = count('duplicate');
  const classNotFound = count('class_not_found');
  const invalid = count('invalid');
  return {
    totalRows: parsed.length,
    newStudents,
    updates,
    duplicates,
    classNotFound,
    invalid,
    ready: newStudents + updates,
    rows: parsed.map((row) => ({
      row: row.row,
      action: row.action,
      studentId: row.studentId || '',
      name: [row.firstName, row.lastName].filter(Boolean).join(' '),
      className: row.className || '',
      section: row.section || '',
      message: row.message || '',
    })),
  };
}

async function generateParentId(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `PRN-${year}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    if (!await Parent.exists({ parentId: candidate })) return candidate;
  }
  throw new ConflictError('Could not allocate a guardian ID. Please retry.');
}

async function linkGuardian(item: ParsedRegistration, student: any): Promise<void> {
  if (!item.guardianName || !item.guardianPhone) return;

  const schoolId = item.schoolId!;
  const guardianName = item.guardianName;
  const guardianPhone = item.guardianPhone;
  const [firstName, ...rest] = guardianName.split(/\s+/);
  const lastName = rest.join(' ') || firstName;

  let parent = await Parent.findOne({ school: schoolId, phone: guardianPhone });
  if (!parent && student.parent) parent = await Parent.findById(student.parent);

  if (!parent) {
    let guardianEmail = item.guardianEmail || await uniqueSystemEmail(`${guardianName}.${guardianPhone.slice(-4)}`, 'guardian');
    let guardianUser = await User.findOne({ email: guardianEmail });
    if (guardianUser && guardianUser.role !== 'parent') {
      if (item.guardianEmail) throw new ConflictError(`Guardian email "${guardianEmail}" is already used by a non-parent account`);
      guardianEmail = await uniqueSystemEmail(`${guardianName}.${guardianPhone.slice(-4)}`, 'guardian');
      guardianUser = null;
    }

    if (!guardianUser) {
      guardianUser = await User.create({
        email: guardianEmail,
        password: temporaryPassword(),
        role: 'parent',
        organizationId: schoolId,
        phone: guardianPhone,
        isVerified: true,
        isActive: true,
        preferredLanguage: 'en',
      });
    }

    const existingParentForUser = await Parent.findOne({ user: guardianUser._id });
    if (existingParentForUser) {
      if (String(existingParentForUser.school || '') !== schoolId) {
        throw new ConflictError('Guardian account is already linked to another organization');
      }
      parent = existingParentForUser;
    } else {
      const relationship = relationshipModel(item.relationship);
      const profile = await Profile.findOneAndUpdate(
        { user: guardianUser._id },
        { firstName, lastName, gender: relationship === 'mother' ? 'female' : 'male' },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      parent = await Parent.create({
        user: guardianUser._id,
        profile: profile._id,
        parentId: await generateParentId(),
        school: schoolId,
        phone: guardianPhone,
        relationship,
        children: [],
        status: 'active',
      });
    }
  }

  await Profile.findByIdAndUpdate(parent.profile, { firstName, lastName });
  parent.phone = guardianPhone;
  parent.relationship = relationshipModel(item.relationship);
  if (!parent.children.some((child: any) => String(child) === String(student._id))) parent.children.push(student._id);
  await parent.save();

  const guardianUser = await User.findById(parent.user);
  if (guardianUser) {
    if (item.guardianEmail && item.guardianEmail !== guardianUser.email) {
      const taken = await User.exists({ email: item.guardianEmail, _id: { $ne: guardianUser._id } });
      if (taken) throw new ConflictError(`Guardian email "${item.guardianEmail}" is already used by another account`);
      guardianUser.email = item.guardianEmail;
    }
    if (!guardianUser.phone || guardianUser.phone === guardianPhone) guardianUser.phone = guardianPhone;
    guardianUser.isActive = true;
    await guardianUser.save();
  }

  if (student.parent && String(student.parent) !== String(parent._id)) {
    await Parent.updateOne({ _id: student.parent }, { $pull: { children: student._id } });
  }
  student.parent = parent._id;
}

async function createStudent(item: ParsedRegistration): Promise<string> {
  const email = item.email || await uniqueSystemEmail(`${item.firstName}.${item.lastName}`, 'student');
  const taken = await User.exists({ email });
  if (taken) throw new ConflictError(`Email "${email}" is already registered`);

  const user = await User.create({
    email,
    password: temporaryPassword(),
    role: 'student',
    organizationId: item.schoolId,
    isVerified: true,
    isActive: true,
    preferredLanguage: 'en',
  });
  const profile = await Profile.create({
    user: user._id,
    firstName: item.firstName,
    lastName: item.lastName || item.firstName,
    gender: item.gender,
  });

  const cls = item.classCandidate!;
  const student = await Student.create({
    user: user._id,
    profile: profile._id,
    school: item.schoolId,
    class: cls.classId,
    studentId: item.studentId || undefined,
    department: cls.department,
    shiftMode: cls.shiftMode,
    grade: cls.grade,
    enrollmentDate: item.enrollmentDate || new Date(),
    medicalNotes: item.medicalNotes || undefined,
    approvalStatus: 'approved',
    status: 'active',
  });

  try {
    if (item.guardianName && item.guardianPhone) {
      await linkGuardian(item, student);
      await student.save();
    }
    await syncStudentCourseEnrollment(student._id as mongoose.Types.ObjectId, cls.classId);
    return student.studentId;
  } catch (error) {
    await Student.deleteOne({ _id: student._id }).catch(() => undefined);
    await Profile.deleteOne({ _id: profile._id }).catch(() => undefined);
    await User.deleteOne({ _id: user._id }).catch(() => undefined);
    throw error;
  }
}

async function updateStudent(item: ParsedRegistration): Promise<string> {
  const student = await Student.findById(item.existingStudentId);
  if (!student) throw new Error('Existing student could not be found');

  await Profile.findByIdAndUpdate(student.profile, {
    firstName: item.firstName,
    lastName: item.lastName || item.firstName,
    gender: item.gender,
  });

  if (item.email) {
    const user = await User.findById(student.user);
    if (user && user.email !== item.email) {
      const taken = await User.exists({ email: item.email, _id: { $ne: user._id } });
      if (taken) throw new ConflictError(`Email "${item.email}" is already used by another account`);
      user.email = item.email;
      await user.save();
    }
  }

  const previousClassId = student.class ? String(student.class) : undefined;
  const nextClassId = String(item.classCandidate!.classId);
  const classChanged = previousClassId !== nextClassId;
  student.class = item.classCandidate!.classId;
  student.department = item.classCandidate!.department;
  student.shiftMode = item.classCandidate!.shiftMode as any;
  student.grade = item.classCandidate!.grade;
  if (item.hasEnrollmentDate && item.enrollmentDate) student.enrollmentDate = item.enrollmentDate;
  if (item.hasMedicalNotes) student.medicalNotes = item.medicalNotes || undefined;

  if (item.guardianName && item.guardianPhone) await linkGuardian(item, student);
  await student.save();

  if (classChanged) {
    await reassignStudentClassCourses(student._id as mongoose.Types.ObjectId, previousClassId, nextClassId);
  } else {
    await syncStudentCourseEnrollment(student._id as mongoose.Types.ObjectId, nextClassId);
  }
  return student.studentId;
}

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const rows = [[
    'Ahmed', 'Ali', 'male', '', 'Grade 5', 'A', new Date().toISOString().slice(0, 10), '',
    'Mohamed Ali', '', '+252612345678', 'Father',
  ]];
  const buffer = buildXlsxBuffer([...STUDENT_REGISTRATION_HEADERS], rows, 'Student Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=students-template.xlsx');
  res.end(buffer);
};

export const previewImport = async (req: Request, res: Response): Promise<Response> => {
  const rows = readRows(req);
  const parsed = await parseRows(req, rows);
  return ApiResponse.success(res, previewPayload(parsed), 'Student import preview ready');
};

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  const rows = readRows(req);
  const parsed = await parseRows(req, rows);
  const errors: { row: number; action: RowAction; message: string }[] = [];
  let created = 0;
  let updated = 0;

  for (const item of parsed) {
    if (item.action === 'duplicate' || item.action === 'class_not_found' || item.action === 'invalid') {
      errors.push({ row: item.row, action: item.action, message: item.message || 'Row is not ready to import' });
      continue;
    }
    try {
      if (item.action === 'update') {
        await updateStudent(item);
        updated += 1;
      } else {
        await createStudent(item);
        created += 1;
      }
    } catch (error: any) {
      errors.push({ row: item.row, action: item.action, message: error?.message || 'Import failed' });
    }
  }

  const preview = previewPayload(parsed);
  return ApiResponse.success(res, {
    ...preview,
    created,
    updated,
    failed: errors.length,
    errors,
  }, `Imported ${created} new and updated ${updated} students`);
};

export const exportStudents = async (req: Request, res: Response): Promise<void> => {
  const requestedSchool = clean(req.query.school);
  const baseFilter: Record<string, unknown> = requestedSchool && req.user?.role === 'admin' ? { school: requestedSchool } : {};
  const filter = applyOrgFilter(req, baseFilter, 'school');

  const students = await Student.find(filter)
    .populate('user', 'email')
    .populate('profile', 'firstName lastName gender')
    .populate('school', 'name')
    .populate('class', 'title section')
    .populate({
      path: 'parent',
      select: 'user profile relationship phone',
      populate: [
        { path: 'user', select: 'email phone' },
        { path: 'profile', select: 'firstName lastName' },
      ],
    })
    .sort({ studentId: 1 })
    .lean();

  const rows = students.map((student: any) => {
    const guardianName = `${student.parent?.profile?.firstName || ''} ${student.parent?.profile?.lastName || ''}`.trim();
    return [
      student.studentId || '',
      student.profile?.firstName || '',
      student.profile?.lastName || '',
      student.profile?.gender || '',
      student.user?.email || '',
      student.class?.title || '',
      student.class?.section || '',
      isoDate(student.enrollmentDate),
      student.medicalNotes || '',
      guardianName,
      student.parent?.user?.email || '',
      student.parent?.user?.phone || student.parent?.phone || '',
      relationshipTitle(student.parent?.relationship),
      student.school?.name || '',
    ];
  });

  const buffer = buildXlsxBuffer(EXPORT_HEADERS, rows, 'Students');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=students-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};
