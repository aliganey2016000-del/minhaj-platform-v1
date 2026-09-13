import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import Student from '../models/student.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import Parent from '../models/parent.model';
import School from '../models/school.model';
import ClassModel from '../models/class.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import { syncStudentCourseEnrollment } from '../services/enrollment.service';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

type ClassCandidate = {
  classId: mongoose.Types.ObjectId;
  title: string;
  section: string;
  academicYear: string;
  batch: string;
  department?: string;
  shiftMode?: string;
};

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function esc(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const IMPORT_HEADER_TITLES = new Set([
  'student id', 'first name', 'last name', 'gender', 'email', 'password',
  'class name', 'section', 'academic year', 'batch number', 'batch',
  'grade / class', 'grade/class', 'grade', 'enrollment date', 'medical notes',
  'guardian name', 'guardian email', 'guardian password', 'guardian phone', 'relationship',
  'school', 'organization',
]);

function looksLikeHeaderRow(cellValues: string[]): boolean {
  return cellValues.filter((value) => IMPORT_HEADER_TITLES.has(value.toLowerCase())).length >= 2;
}

function classKey(title: string, section: string): string {
  return `${title.trim().toLowerCase()}::${section.trim().toLowerCase()}`;
}

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = [
    'Student ID', 'First Name', 'Last Name', 'Gender', 'Email', 'Password',
    'Organization', 'Class Name', 'Section', 'Academic Year', 'Batch Number', 'Grade',
    'Enrollment Date', 'Medical Notes',
    'Guardian Name', 'Guardian Email', 'Guardian Password', 'Guardian Phone', 'Relationship',
  ];
  const rows = [[
    '', 'REPLACE_FIRST_NAME', 'REPLACE_LAST_NAME', 'male', 'replace-with-real-email@example.com', '',
    'REPLACE_WITH_YOUR_ORGANIZATION_NAME', 'REPLACE_WITH_EXISTING_CLASS_NAME', 'REPLACE_WITH_SECTION',
    '2026-2027', 'REPLACE_WITH_BATCH_IF_NEEDED', '', '2026-01-15', '',
    'REPLACE_GUARDIAN_NAME', 'replace-with-guardian-email@example.com', '', '+252600000000', 'Father',
  ]];
  const buffer = buildXlsxBuffer(headers, rows, 'Student Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=students-template.xlsx');
  res.end(buffer);
};

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const ownOrgId = (resolveOrgIdForCreate(req) as string | undefined) || undefined;
  const errors: { row: number; message: string }[] = [];

  // One key may legitimately have several active candidates after year-end
  // promotion (e.g. Grade 9 A repeat cohort 2026 and new intake 2027). Never
  // collapse them into a Map value and silently pick the last document.
  const classCandidatesByOrg = new Map<string, Map<string, ClassCandidate[]>>();
  async function getClassCandidates(orgId: string) {
    let byKey = classCandidatesByOrg.get(orgId);
    if (!byKey) {
      byKey = new Map();
      const classes = await ClassModel.find({ school: orgId, status: 'active' })
        .populate('department', 'name')
        .sort({ academicYear: -1, batch: -1, createdAt: 1 })
        .lean();
      for (const cls of classes as any[]) {
        const department = cls.department;
        const candidate: ClassCandidate = {
          classId: cls._id,
          title: String(cls.title || ''),
          section: String(cls.section || ''),
          academicYear: String(cls.academicYear || ''),
          batch: String(cls.batch || ''),
          department: typeof department === 'string' ? department : department?.name || undefined,
          shiftMode: cls.shiftMode,
        };
        const key = classKey(candidate.title, candidate.section);
        byKey.set(key, [...(byKey.get(key) || []), candidate]);
      }
      classCandidatesByOrg.set(orgId, byKey);
    }
    return byKey;
  }

  async function resolveClass(
    orgId: string,
    className: string,
    section: string,
    academicYear: string,
    batch: string,
  ): Promise<ClassCandidate> {
    const byKey = await getClassCandidates(orgId);
    const baseMatches = byKey.get(classKey(className, section)) || [];
    if (baseMatches.length === 0) {
      throw new Error(`Active class "${className} — Section ${section}" not found in this organization`);
    }

    let matches = baseMatches;
    if (academicYear) matches = matches.filter((item) => item.academicYear.toLowerCase() === academicYear.toLowerCase());
    if (batch) matches = matches.filter((item) => item.batch.toLowerCase() === batch.toLowerCase());

    if (matches.length === 1) return matches[0];
    if (matches.length === 0) {
      const qualifiers = [academicYear && `Academic Year ${academicYear}`, batch && `Batch ${batch}`].filter(Boolean).join(', ');
      throw new Error(`No active ${className} — Section ${section} class matches ${qualifiers || 'the supplied cohort details'}`);
    }

    const choices = matches
      .map((item) => `${item.academicYear || 'no year'} / Batch ${item.batch || 'none'}`)
      .join('; ');
    throw new Error(
      `Multiple active classes match "${className} — Section ${section}" (${choices}). Add Academic Year and Batch Number to select the correct cohort.`
    );
  }

  const uniquePhones = new Set<string>();
  const seenEmails = new Set<string>();
  const seenStudentIdsBySchool = new Map<string, Set<string>>();
  const parsedRows: any[] = [];

  for (let index = 0; index < rows.length; index++) {
    const rowNum = index + 2;
    const row = rows[index];
    const cellValues = Object.values(row).map((value) => String(value ?? '').trim());
    if (cellValues.every((value) => value === '')) continue;
    if (looksLikeHeaderRow(cellValues)) continue;

    try {
      const studentIdRaw = String(getField(row, 'Student ID', 'StudentID', 'Student Id') ?? '').trim().toUpperCase();
      const firstName = String(getField(row, 'First Name') ?? '').trim();
      const lastName = String(getField(row, 'Last Name') ?? '').trim();
      const gender = String(getField(row, 'Gender') ?? 'male').trim().toLowerCase();
      const email = String(getField(row, 'Email') ?? '').trim().toLowerCase();
      const password = String(getField(row, 'Password') ?? '').trim();
      const className = String(getField(row, 'Class Name', 'Class') ?? '').trim();
      const section = String(getField(row, 'Section') ?? '').trim();
      const academicYear = String(getField(row, 'Academic Year', 'AcademicYear') ?? '').trim();
      const batch = String(getField(row, 'Batch Number', 'Batch') ?? '').trim();
      const gradeRaw = String(getField(row, 'Grade') ?? '').trim();
      const enrollmentDateRaw = String(getField(row, 'Enrollment Date') ?? '').trim();
      const medicalNotes = String(getField(row, 'Medical Notes') ?? '').trim();
      const guardianName = String(getField(row, 'Guardian Name') ?? '').trim();
      const guardianEmail = String(getField(row, 'Guardian Email') ?? '').trim().toLowerCase();
      const guardianPasswordRaw = String(getField(row, 'Guardian Password') ?? '').trim();
      const guardianPhone = String(getField(row, 'Guardian Phone') ?? '').trim();
      const relationship = String(getField(row, 'Relationship') ?? 'Father').trim();

      const parsedEnrollmentDate = enrollmentDateRaw ? new Date(enrollmentDateRaw) : new Date();
      const enrollmentDate = Number.isNaN(parsedEnrollmentDate.getTime()) ? new Date() : parsedEnrollmentDate;

      if (!firstName || !lastName) throw new Error('First Name and Last Name are required');
      if (!email) throw new Error('Email is required');
      if (password && password.length < 8) throw new Error('Password must be at least 8 characters');
      if (guardianPasswordRaw && guardianPasswordRaw.length < 8) throw new Error('Guardian Password must be at least 8 characters');
      if (!className) throw new Error('Class Name is required');
      if (!section) throw new Error('Section is required');

      if (seenEmails.has(email)) throw new Error(`Email "${email}" is duplicated elsewhere in this import`);
      if (await User.exists({ email })) throw new Error(`Email "${email}" is already registered`);
      seenEmails.add(email);

      let schoolId = ownOrgId;
      if (!schoolId) {
        const schoolName = String(getField(row, 'School', 'Organization') ?? '').trim();
        if (!schoolName) throw new Error('School is required for super admin');
        const school = await School.findOne({ name: new RegExp(`^${esc(schoolName)}$`, 'i') }).lean();
        if (!school) throw new Error(`School "${schoolName}" not found`);
        schoolId = school._id.toString();
      }

      if (studentIdRaw) {
        const schoolKey = schoolId || 'global';
        const seen = seenStudentIdsBySchool.get(schoolKey) || new Set<string>();
        if (seen.has(studentIdRaw)) throw new Error(`Student ID "${studentIdRaw}" is duplicated elsewhere in this import`);
        if (await Student.exists({ school: schoolId, studentId: studentIdRaw })) {
          throw new Error(`Student ID "${studentIdRaw}" is already used in this organization`);
        }
        seen.add(studentIdRaw);
        seenStudentIdsBySchool.set(schoolKey, seen);
      }

      const cls = await resolveClass(schoolId, className, section, academicYear, batch);
      const finalPassword = password || 'changeme123';
      parsedRows.push({
        rowNum,
        studentId: studentIdRaw || undefined,
        firstName,
        lastName,
        gender: ['male', 'female'].includes(gender) ? gender : 'male',
        email,
        hashedPassword: await bcrypt.hash(finalPassword, 10),
        school: new mongoose.Types.ObjectId(schoolId),
        classId: cls.classId,
        department: cls.department,
        shiftMode: cls.shiftMode,
        grade: gradeRaw || undefined,
        enrollmentDate,
        medicalNotes: medicalNotes || undefined,
        guardianName,
        guardianEmail,
        guardianPassword: guardianEmail ? (guardianPasswordRaw || 'guardian123') : undefined,
        guardianPhone: guardianPhone || undefined,
        relationship: ['Father', 'Mother', 'Guardian', 'Other'].includes(relationship) ? relationship : 'Father',
      });
      if (guardianPhone) uniquePhones.add(guardianPhone);
    } catch (error: any) {
      errors.push({ row: rowNum, message: error?.message || 'Unknown error' });
    }
  }

  const parentPhoneMap = new Map<string, any>();
  if (uniquePhones.size > 0) {
    const schoolIds = parsedRows.map((item) => item.school?.toString()).filter(Boolean);
    const existingParents = await Parent.find({
      ...(schoolIds.length ? { school: { $in: schoolIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {}),
      phone: { $in: Array.from(uniquePhones) },
    }).lean();
    for (const parent of existingParents as any[]) {
      parentPhoneMap.set(`${parent.school ? parent.school.toString() : 'global'}:${parent.phone}`, parent);
    }
  }

  const currentYear = new Date().getFullYear();
  const schoolCounterCache = new Map<string, number>();
  for (const item of parsedRows) {
    if (item.studentId) continue;
    const schoolKey = item.school ? item.school.toString() : 'global';
    if (!schoolCounterCache.has(schoolKey)) {
      schoolCounterCache.set(schoolKey, await Student.countDocuments({ school: item.school }));
    }
    const seen = seenStudentIdsBySchool.get(schoolKey) || new Set<string>();
    let sequence = schoolCounterCache.get(schoolKey)! + 1;
    let candidate = `STU-${currentYear}-${String(sequence).padStart(4, '0')}`;
    while (seen.has(candidate) || await Student.exists({ school: item.school, studentId: candidate })) {
      sequence += 1;
      candidate = `STU-${currentYear}-${String(sequence).padStart(4, '0')}`;
    }
    schoolCounterCache.set(schoolKey, sequence);
    seen.add(candidate);
    seenStudentIdsBySchool.set(schoolKey, seen);
    item.studentId = candidate;
  }

  const newParentsByPhone = new Map<string, Promise<{ _id: mongoose.Types.ObjectId }>>();
  let inserted = 0;

  async function linkGuardian(item: any, studentId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId | undefined> {
    if (!item.guardianName || !item.guardianPhone) return undefined;
    const schoolKey = item.school?.toString() || 'global';
    const phoneKey = `${schoolKey}:${item.guardianPhone}`;
    const existing = parentPhoneMap.get(phoneKey);
    if (existing) {
      await Parent.updateOne({ _id: existing._id }, { $addToSet: { children: studentId } });
      return existing._id;
    }

    if (!newParentsByPhone.has(phoneKey)) {
      newParentsByPhone.set(phoneKey, (async () => {
        const [firstName, ...rest] = item.guardianName.split(' ');
        const lastName = rest.join(' ') || firstName;
        const relationshipMap: Record<string, string> = { Father: 'father', Mother: 'mother', Guardian: 'guardian', Other: 'other' };
        const guardianUser = await User.create({
          email: item.guardianEmail || `${item.email.replace('@', '+parent@')}`,
          password: await bcrypt.hash(item.guardianPassword || 'guardian123', 10),
          role: 'parent', organizationId: item.school, phone: item.guardianPhone,
          isVerified: true, isActive: true,
        });
        const guardianProfile = await Profile.create({ user: guardianUser._id, firstName, lastName, gender: 'male' });
        const parent = await Parent.create({
          user: guardianUser._id, profile: guardianProfile._id, school: item.school,
          phone: item.guardianPhone, relationship: relationshipMap[item.relationship] || 'father',
          children: [studentId], status: 'active',
        });
        return { _id: parent._id as mongoose.Types.ObjectId };
      })());
    } else {
      const parent = await newParentsByPhone.get(phoneKey)!;
      await Parent.updateOne({ _id: parent._id }, { $addToSet: { children: studentId } });
      return parent._id;
    }

    return (await newParentsByPhone.get(phoneKey)!)._id;
  }

  async function importRow(item: any): Promise<void> {
    const userId = new mongoose.Types.ObjectId();
    const profileId = new mongoose.Types.ObjectId();
    const studentObjectId = new mongoose.Types.ObjectId();
    try {
      await Promise.all([
        User.create({
          _id: userId, email: item.email, password: item.hashedPassword, role: 'student',
          organizationId: item.school, isVerified: true, isActive: true, preferredLanguage: 'en',
        }),
        Profile.create({
          _id: profileId, user: userId, firstName: item.firstName, lastName: item.lastName, gender: item.gender,
        }),
        Student.create({
          _id: studentObjectId, studentId: item.studentId, user: userId, profile: profileId,
          school: item.school, class: item.classId, grade: item.grade,
          department: item.department, shiftMode: item.shiftMode,
          enrollmentDate: item.enrollmentDate, medicalNotes: item.medicalNotes,
          approvalStatus: 'approved', status: 'active',
        }),
      ]);

      const parentId = await linkGuardian(item, studentObjectId);
      if (parentId) await Student.updateOne({ _id: studentObjectId }, { parent: parentId });
      await syncStudentCourseEnrollment(studentObjectId, item.classId);
      inserted += 1;
    } catch (error: any) {
      await Student.deleteOne({ _id: studentObjectId }).catch(() => {});
      await Profile.deleteOne({ _id: profileId }).catch(() => {});
      await User.deleteOne({ _id: userId }).catch(() => {});
      errors.push({
        row: item.rowNum,
        message: error?.code === 11000
          ? `Student ID "${item.studentId}" conflicts with an existing record in this organization`
          : (error?.message || 'Insert failed'),
      });
    }
  }

  const CONCURRENCY = 10;
  for (let index = 0; index < parsedRows.length; index += CONCURRENCY) {
    await Promise.all(parsedRows.slice(index, index + CONCURRENCY).map(importRow));
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created: inserted,
    failed: errors.length,
    errors,
  }, `Imported ${inserted} of ${rows.length} students`);
};
