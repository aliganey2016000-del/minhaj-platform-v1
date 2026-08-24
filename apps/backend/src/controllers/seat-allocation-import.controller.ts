import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import Exam from '../models/exam.model';
import ExamRoom from '../models/exam-room.model';
import ClassModel from '../models/class.model';
import SeatAllocation from '../models/seat-allocation.model';
import Student from '../models/student.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnOrg, assertOwnsExamIfTeacher } from '../utils/tenant-scope';
import { assertSafeSpreadsheetUpload } from '../utils/spreadsheet-upload';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

const REQUIRED_COLUMNS = ['Organization', 'Department', 'Class', 'Shift', 'Student ID', 'Student Name', 'Academic Year', 'Exam Type', 'Room', 'Seat'];
const DEFAULT_BUILDING = 'Main Campus';
const FALLBACK_CAPACITY = 30;

interface PreviewRow {
  row: number;
  organization: string;
  department: string;
  className: string;
  shift: string;
  studentId: string;
  studentName: string;
  academicYear: string;
  examType: string;
  room: string;
  seat: string;
  status: 'valid' | 'warning' | 'error';
  message?: string;
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function key(value: unknown): string {
  return normalize(value).toLowerCase();
}

function readCell(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const target = key(name);
    const exact = keys.find((candidate) => key(candidate) === target);
    if (exact !== undefined) return row[exact];
    const prefix = keys.find((candidate) => key(candidate).startsWith(target));
    if (prefix !== undefined) return row[prefix];
  }
  return undefined;
}

function classLabel(classDoc: any): string {
  if (!classDoc) return '';
  return [classDoc.title, classDoc.section].filter(Boolean).join(' ').trim();
}

function examTypeLabel(milestone?: 'mid' | 'final' | null): string {
  return milestone === 'mid' ? 'Mid Exam' : milestone === 'final' ? 'Final' : '';
}

/**
 * Exam Seating has its own ExamRoom registry, while Manage Classes stores a
 * classroom room name. Importing seating should still work when an existing
 * classroom room has not yet been materialized into ExamRoom. Reconcile the
 * school's class-room names into ExamRoom before resolving imported rooms.
 * Existing ExamRoom records are reused and never overwritten.
 */
async function syncRoomsFromClasses(schoolId: any): Promise<void> {
  if (!schoolId) return;

  const classes = await ClassModel.find({
    school: schoolId,
    room: { $nin: ['', null] },
  }).select('school room').lean();

  const unique = new Map<string, string>();
  for (const cls of classes as any[]) {
    const name = normalize(cls.room);
    if (!name) continue;
    unique.set(name.toLowerCase(), name);
  }

  if (!unique.size) return;

  const existing = await ExamRoom.find({
    school: schoolId,
    name: { $in: Array.from(unique.values()) },
  }).select('name').lean();

  const existingNames = new Set(existing.map((room: any) => key(room.name)));
  const missing = Array.from(unique.values()).filter((name) => !existingNames.has(key(name)));

  if (!missing.length) return;

  await ExamRoom.bulkWrite(missing.map((name) => ({
    updateOne: {
      filter: { school: schoolId, name, building: DEFAULT_BUILDING },
      update: {
        $setOnInsert: {
          name,
          building: DEFAULT_BUILDING,
          capacity: FALLBACK_CAPACITY,
          capacityMode: 'auto',
          school: schoolId,
        },
      },
      upsert: true,
    },
  })));
}

async function loadExam(req: Request, examId: string): Promise<any> {
  const exam = await Exam.findById(examId).populate('course', 'title.en school teacher class').populate({ path: 'course.class', select: 'academicYear title section' });
  if (!exam) throw new NotFoundError('Exam');
  assertOwnOrg(req, exam, 'school');
  await assertOwnsExamIfTeacher(req, exam);
  return exam;
}

async function parseImport(req: Request, examId: string, commit: boolean) {
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');
  assertSafeSpreadsheetUpload(req.file);

  const exam = await loadExam(req, examId);
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');
  if (rows.length > 5000) throw new BadRequestError('A seating import may contain at most 5,000 rows');

  const headers = Object.keys(rows[0] || {});
  const missing = REQUIRED_COLUMNS.filter((required) => !headers.some((header) => key(header) === key(required)));
  if (missing.length) throw new BadRequestError(`Missing required columns: ${missing.join(', ')}`);

  // Make existing classroom room names available to the Exam Seating import
  // even if the Exam Rooms page has never been opened for this school.
  await syncRoomsFromClasses(exam.school);

  const rooms = await ExamRoom.find(exam.school ? { school: exam.school } : {}).lean();
  const roomByKey = new Map<string, any>();
  for (const room of rooms) roomByKey.set(key(room.name), room);

  const school = exam.school ? await School.findById(exam.school).select('name').lean() : null;
  const examSchoolName = normalize((school as any)?.name);
  const selectedAcademicYear = normalize((exam.course as any)?.class?.academicYear);
  const selectedExamType = examTypeLabel(exam.milestone);

  const studentIds = rows.map((row) => normalize(readCell(row, 'Student ID', 'StudentID', 'ID')).toUpperCase()).filter(Boolean);
  const students = await Student.find({
    studentId: { $in: studentIds },
    ...(exam.school ? { school: exam.school } : {}),
  })
    .populate('profile', 'firstName lastName')
    .populate({ path: 'class', select: 'title section shiftMode department academicYear', populate: { path: 'department', select: 'name' } })
    .populate('school', 'name')
    .lean();

  const studentById = new Map<string, any>();
  for (const student of students as any[]) studentById.set(key(student.studentId).toUpperCase(), student);

  const preview: PreviewRow[] = [];
  const validRows: Array<{ student: any; room: any; deskNumber: string }> = [];
  const seenStudents = new Set<string>();
  const seenSeats = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const result: PreviewRow = {
      row: index + 2,
      organization: normalize(readCell(row, 'Organization', 'School')),
      department: normalize(readCell(row, 'Department')),
      className: normalize(readCell(row, 'Class', 'Class Name')),
      shift: normalize(readCell(row, 'Shift', 'Shift Mode')),
      studentId: normalize(readCell(row, 'Student ID', 'StudentID', 'ID')).toUpperCase(),
      studentName: normalize(readCell(row, 'Student Name', 'Name')),
      academicYear: normalize(readCell(row, 'Academic Year')),
      examType: normalize(readCell(row, 'Exam Type')),
      room: normalize(readCell(row, 'Room', 'Room Name')),
      seat: normalize(readCell(row, 'Seat', 'Desk', 'Desk Number')),
      status: 'valid',
    };

    try {
      if (!result.organization) throw new Error('Organization is required');
      if (!result.department) throw new Error('Department is required');
      if (!result.className) throw new Error('Class is required');
      if (!result.shift) throw new Error('Shift is required');
      if (!result.studentId) throw new Error('Student ID is required');
      if (!result.studentName) throw new Error('Student Name is required');
      if (!result.academicYear) throw new Error('Academic Year is required');
      if (!result.examType) throw new Error('Exam Type is required');
      if (!result.room) throw new Error('Room is required');
      if (!result.seat) throw new Error('Seat is required');

      if (!selectedAcademicYear) throw new Error('The selected examination has no Academic Year configured');
      if (!selectedExamType) throw new Error('The selected examination has no Exam Type configured');
      if (key(result.academicYear) !== key(selectedAcademicYear)) throw new Error(`Academic Year must match this examination (${selectedAcademicYear})`);
      if (key(result.examType) !== key(selectedExamType)) throw new Error(`Exam Type must match this examination (${selectedExamType})`);

      if (examSchoolName && key(result.organization) !== key(examSchoolName)) {
        throw new Error(`Organization does not match this exam (${examSchoolName})`);
      }

      const studentKey = key(result.studentId).toUpperCase();
      if (seenStudents.has(studentKey)) throw new Error('Duplicate Student ID in import');
      seenStudents.add(studentKey);

      const student = studentById.get(studentKey);
      if (!student) throw new Error(`Student ${result.studentId} was not found in this organization`);
      if (student.status && student.status !== 'active') throw new Error(`Student ${result.studentId} is not active`);

      const room = roomByKey.get(key(result.room));
      if (!room) throw new Error(`Room "${result.room}" was not found in this organization`);

      const seatKey = `${room._id.toString()}::${key(result.seat)}`;
      if (seenSeats.has(seatKey)) throw new Error(`Duplicate seat "${result.seat}" in ${room.name}`);
      seenSeats.add(seatKey);

      const profile = student.profile || {};
      const actualName = normalize([profile.firstName, profile.lastName].filter(Boolean).join(' '));
      const actualClass = classLabel(student.class);
      const actualDepartment = normalize(student.class?.department?.name || student.department || '');
      const actualShift = normalize(student.class?.shiftMode || student.shiftMode || '');
      const actualAcademicYear = normalize(student.class?.academicYear || '');
      const warnings: string[] = [];

      if (actualName && key(actualName) !== key(result.studentName)) warnings.push(`name on file is "${actualName}"`);
      if (actualClass && key(actualClass) !== key(result.className) && key(student.class?.title) !== key(result.className)) warnings.push(`class on file is "${actualClass}"`);
      if (actualDepartment && key(actualDepartment) !== key(result.department)) warnings.push(`department on file is "${actualDepartment}"`);
      if (actualShift && key(actualShift) !== key(result.shift)) warnings.push(`shift on file is "${actualShift}"`);
      if (actualAcademicYear && key(actualAcademicYear) !== key(result.academicYear)) warnings.push(`student academic year is "${actualAcademicYear}"`);

      if (warnings.length) {
        result.status = 'warning';
        result.message = `Student record differs: ${warnings.join('; ')}`;
      }

      validRows.push({ student, room, deskNumber: result.seat });
    } catch (error: any) {
      result.status = 'error';
      result.message = error?.message || 'Invalid row';
    }

    preview.push(result);
  }

  const errors = preview.filter((row) => row.status === 'error').length;
  const warnings = preview.filter((row) => row.status === 'warning').length;
  const valid = preview.length - errors;

  if (commit && errors > 0) throw new BadRequestError(`Import blocked: ${errors} row(s) need correction before seating can be imported`);
  if (commit && valid === 0) throw new BadRequestError('Import blocked: no valid seating rows were found');

  return { exam, preview, validRows, valid, errors, warnings };
}

export const previewImport = async (req: Request, res: Response): Promise<Response> => {
  const result = await parseImport(req, req.params.id, false);
  return ApiResponse.success(res, {
    totalRows: result.preview.length,
    valid: result.valid,
    warnings: result.warnings,
    errors: result.errors,
    rows: result.preview,
  });
};

export const importSeating = async (req: Request, res: Response): Promise<Response> => {
  const result = await parseImport(req, req.params.id, true);

  await SeatAllocation.deleteMany({ exam: result.exam._id });
  await SeatAllocation.insertMany(result.validRows.map((row) => ({
    exam: result.exam._id,
    student: row.student._id,
    room: row.room._id,
    deskNumber: row.deskNumber,
    school: result.exam.school || null,
  })));

  const allocations = await SeatAllocation.find({ exam: result.exam._id })
    .populate('room', 'name building capacity')
    .populate({ path: 'student', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'class', select: 'title section academicYear shiftMode' }, { path: 'school', select: 'name' }], select: 'studentId profile school class department shiftMode' })
    .sort({ room: 1, deskNumber: 1 })
    .lean();

  return ApiResponse.success(res, {
    totalRows: result.preview.length,
    imported: allocations.length,
    warnings: result.warnings,
    rows: allocations,
  }, `Imported ${allocations.length} seating assignments`);
};

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const sample = [[
    'Tiba Education Center',
    'Secondary',
    'Grade 8A',
    'Morning',
    'STU-2026-0001',
    'Ahmed Ali',
    '2026-2027',
    'Mid Exam',
    'Room 5',
    'R5-01',
  ]];
  const buffer = buildXlsxBuffer(REQUIRED_COLUMNS, sample, 'Seating Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=exam-seating-template.xlsx');
  res.end(buffer);
};
