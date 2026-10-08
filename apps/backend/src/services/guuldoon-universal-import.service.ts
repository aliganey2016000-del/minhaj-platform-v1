import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';
import Course from '../models/course.model';
import GuuldoonSubject from '../models/guuldoon-subject.model';
import GuuldoonChapter from '../models/guuldoon-chapter.model';
import GuuldoonExam from '../models/guuldoon-past-exam.model';
import GuuldoonResource from '../models/guuldoon-resource.model';
import GuuldoonQuestion from '../models/guuldoon-question.model';
import GuuldoonGlossary from '../models/guuldoon-glossary.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertSafeSpreadsheetUpload } from '../utils/spreadsheet-upload';

export const GUULDOON_IMPORT_SHEETS = ['Subjects', 'Chapters', 'Exams', 'Resources', 'Questions', 'Glossary', 'Lists'] as const;

type ImportSheet = Exclude<(typeof GUULDOON_IMPORT_SHEETS)[number], 'Lists'>;
type Row = Record<string, any> & { __row: number };
type Severity = 'error' | 'warning';

export interface ImportIssue {
  sheet: string;
  row: number;
  id?: string;
  field?: string;
  message: string;
  severity: Severity;
}

export interface ParsedGuuldoonImport {
  course: any;
  rows: Record<ImportSheet, Row[]>;
  issues: ImportIssue[];
  summary: Record<string, { total: number; valid: number; errors: number; warnings: number }>;
  preview: Record<string, unknown>;
  invalidRowKeys: Set<string>;
  lists: {
    questionType: Set<string>;
    resourceType: Set<string>;
    language: Set<string>;
    direction: Set<string>;
    answerStatus: Set<string>;
    status: Set<string>;
    bookRelation: Set<string>;
  };
  zip?: FigureArchive;
}

interface FigureArchive {
  files: Map<string, { name: string; data: Buffer; extension: string }>;
}

const SHEETS: ImportSheet[] = ['Subjects', 'Chapters', 'Exams', 'Resources', 'Questions', 'Glossary'];
const SERVER_QUESTION_TYPES = new Set(['mcq', 'structured', 'fill', 'match']);
const SERVER_RESOURCE_TYPES = new Set(['video', 'audio', 'pdf', 'book', 'image', 'note', 'link']);
const SERVER_LANGUAGES = new Set(['so', 'en', 'ar']);
const SERVER_DIRECTIONS = new Set(['ltr', 'rtl', 'auto']);
const SERVER_ANSWER_STATUS = new Set(['verified', 'pending']);
const SERVER_STATUS = new Set(['draft', 'published']);
const SERVER_BOOK_RELATIONS = new Set(['direct', 'indirect', 'similar', 'derived']);
const FIGURE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const MAX_ZIP_ENTRIES = 2000;
const MAX_ZIP_UNCOMPRESSED = 100 * 1024 * 1024;
const MAX_FIGURE_BYTES = 10 * 1024 * 1024;

const REQUIRED_HEADERS: Record<ImportSheet, string[]> = {
  Subjects: ['subject_id', 'grade', 'name_en'],
  Chapters: ['chapter_id', 'subject_id', 'order', 'title_en'],
  Exams: ['exam_id', 'subject_id', 'year', 'duration_min', 'total_marks', 'answer_key_status'],
  Resources: ['resource_id', 'subject_id', 'type', 'title', 'language', 'direction'],
  Questions: ['question_id', 'exam_id', 'chapter_id', 'number', 'type', 'language', 'direction', 'text', 'marks', 'answer_status'],
  Glossary: ['glossary_id', 'subject_id', 'term_so', 'term_en', 'term_ar'],
};

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function lower(value: unknown): string {
  return str(value).toLowerCase();
}

function bool(value: unknown): boolean {
  return ['1', 'true', 'yes', 'y', 'published'].includes(lower(value));
}

function numberOrNull(value: unknown): number | null {
  if (value === '' || value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function splitList(value: unknown): string[] {
  return str(value).split(';').map(item => item.trim()).filter(Boolean);
}

function normalizedTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
}

function normalizedBookText(value: unknown): string {
  return str(value).toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function rowId(sheet: ImportSheet, row: Row): string {
  const field: Record<ImportSheet, string> = {
    Subjects: 'subject_id',
    Chapters: 'chapter_id',
    Exams: 'exam_id',
    Resources: 'resource_id',
    Questions: 'question_id',
    Glossary: 'glossary_id',
  };
  return str(row[field[sheet]]);
}

function issueKey(sheet: string, row: number): string {
  return `${sheet}:${row}`;
}

function sha256(buffer?: Buffer): string {
  return buffer?.length ? crypto.createHash('sha256').update(buffer).digest('hex') : '';
}

export function importFileHashes(excel: Express.Multer.File, figures?: Express.Multer.File): { excelHash: string; zipHash: string } {
  return { excelHash: sha256(excel.buffer), zipHash: sha256(figures?.buffer) };
}

export async function guuldoonImportDataFingerprint(courseId: string): Promise<string> {
  if (!mongoose.isValidObjectId(courseId)) throw new BadRequestError('Invalid Guuldoon course ID');
  const course = new mongoose.Types.ObjectId(courseId);
  const snapshot = async (model: any) => {
    const [count, latest] = await Promise.all([
      model.countDocuments({ course }),
      model.findOne({ course }).sort({ updatedAt: -1 }).select('updatedAt').lean(),
    ]);
    return { count, updatedAt: latest?.updatedAt ? new Date(latest.updatedAt).toISOString() : '' };
  };
  const snapshots = await Promise.all([
    snapshot(GuuldoonSubject),
    snapshot(GuuldoonChapter),
    snapshot(GuuldoonExam),
    snapshot(GuuldoonResource),
    snapshot(GuuldoonQuestion),
    snapshot(GuuldoonGlossary),
  ]);
  return crypto.createHash('sha256').update(JSON.stringify(snapshots)).digest('hex');
}

function assertWorkbookHeaders(sheetName: ImportSheet, rows: Row[], workbook: XLSX.WorkBook, add: (issue: ImportIssue) => void): void {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return;
  const headerRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  const headers = (headerRows[0] || []).map(value => lower(value));
  for (const header of REQUIRED_HEADERS[sheetName]) {
    if (!headers.includes(header)) {
      add({ sheet: sheetName, row: 1, field: header, message: `Required column "${header}" is missing`, severity: 'error' });
    }
  }
}

function readWorkbook(file: Express.Multer.File): { workbook: XLSX.WorkBook; rows: Record<ImportSheet, Row[]> } {
  assertSafeSpreadsheetUpload(file);
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestError('Guuldoon Universal Import requires an .xlsx workbook');
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.buffer, { type: 'buffer', raw: false, cellText: true });
  } catch {
    throw new BadRequestError('The Excel workbook could not be parsed');
  }
  const missing = GUULDOON_IMPORT_SHEETS.filter(name => !workbook.SheetNames.includes(name));
  if (missing.length) throw new BadRequestError(`Missing required sheet(s): ${missing.join(', ')}`);

  const rows = {} as Record<ImportSheet, Row[]>;
  for (const sheetName of SHEETS) {
    const parsed = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '', raw: false });
    rows[sheetName] = parsed
      .map((row, index): Row => ({ ...(row as Record<string, any>), __row: index + 2 }))
      .filter(row => lower(row.row_status) !== 'example');
  }
  return { workbook, rows };
}

function readLists(workbook: XLSX.WorkBook) {
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets.Lists, { defval: '', raw: false });
  const values = (name: string, fallbackName?: string) => new Set(
    rows.map(row => lower(row[name] || (fallbackName ? row[fallbackName] : ''))).filter(Boolean),
  );
  const lists = {
    questionType: values('question_type', 'type'),
    resourceType: values('resource_type'),
    language: values('language'),
    direction: values('direction'),
    answerStatus: values('answer_status'),
    status: values('status'),
    bookRelation: values('book_relation'),
  };
  if (!lists.questionType.size || !lists.resourceType.size || !lists.language.size || !lists.direction.size || !lists.answerStatus.size) {
    throw new BadRequestError('Lists sheet must define question_type, resource_type, language, direction and answer_status');
  }
  return lists;
}

function validateFigureBuffer(name: string, data: Buffer): void {
  if (!data.length) throw new BadRequestError(`Figure "${name}" is empty`);
  if (data.length > MAX_FIGURE_BYTES) throw new BadRequestError(`Figure "${name}" exceeds 10 MB`);
  const ext = path.extname(name).toLowerCase();
  if (!FIGURE_EXTENSIONS.has(ext)) throw new BadRequestError(`Figure "${name}" has an unsupported file type`);
  if (ext === '.png' && !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new BadRequestError(`Figure "${name}" is not a valid PNG`);
  if ((ext === '.jpg' || ext === '.jpeg') && !(data[0] === 0xff && data[1] === 0xd8)) throw new BadRequestError(`Figure "${name}" is not a valid JPEG`);
  if (ext === '.webp' && !(data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP')) throw new BadRequestError(`Figure "${name}" is not a valid WebP image`);
  if (ext === '.svg') {
    const svg = data.toString('utf8');
    if (!/<svg[\s>]/i.test(svg) || /<script|<foreignObject|<!DOCTYPE|<!ENTITY|\son[a-z]+\s*=|javascript:/i.test(svg)) {
      throw new BadRequestError(`Figure "${name}" contains unsafe SVG content`);
    }
  }
}

function rawZipEntryNames(buffer: Buffer): string[] {
  const names: string[] = [];
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let offset = 0;
  while (offset < buffer.length) {
    const index = buffer.indexOf(signature, offset);
    if (index < 0) break;
    if (index + 46 > buffer.length) throw new BadRequestError('Figures ZIP central directory is malformed');
    const nameLength = buffer.readUInt16LE(index + 28);
    const extraLength = buffer.readUInt16LE(index + 30);
    const commentLength = buffer.readUInt16LE(index + 32);
    const nameStart = index + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) throw new BadRequestError('Figures ZIP filename is malformed');
    names.push(buffer.subarray(nameStart, nameEnd).toString('utf8'));
    offset = nameEnd + extraLength + commentLength;
  }
  return names;
}

function assertSafeRawZipPaths(buffer: Buffer): void {
  const names = rawZipEntryNames(buffer);
  if (!names.length) throw new BadRequestError('Figures ZIP contains no readable central directory entries');
  for (const raw of names) {
    const value = raw.replace(/\\/g, '/');
    const normalized = path.posix.normalize(value);
    if (
      value.startsWith('/')
      || value.startsWith('\\')
      || /^[a-zA-Z]:[/\\]/.test(raw)
      || value.split('/').includes('..')
      || normalized.startsWith('../')
      || normalized.includes('/../')
    ) {
      throw new BadRequestError(`Unsafe ZIP path detected: ${raw}`);
    }
  }
}

function inspectFigureZip(file?: Express.Multer.File): FigureArchive | undefined {
  if (!file) return undefined;
  if (!file.buffer?.length || !file.originalname.toLowerCase().endsWith('.zip')) throw new BadRequestError('Figures file must be a non-empty .zip archive');
  assertSafeRawZipPaths(file.buffer);
  let zip: AdmZip;
  try {
    zip = new AdmZip(file.buffer);
  } catch {
    throw new BadRequestError('The figures ZIP could not be opened');
  }
  const entries = zip.getEntries().filter(entry => !entry.isDirectory);
  if (entries.length > MAX_ZIP_ENTRIES) throw new BadRequestError(`Figures ZIP may contain at most ${MAX_ZIP_ENTRIES} files`);
  let total = 0;
  const files = new Map<string, { name: string; data: Buffer; extension: string }>();
  for (const entry of entries) {
    const original = entry.entryName.replace(/\\/g, '/');
    const normalized = path.posix.normalize(original);
    if (original.startsWith('/') || /^[a-zA-Z]:/.test(original) || normalized.startsWith('../') || normalized.includes('/../')) {
      throw new BadRequestError('Unsafe ZIP path detected');
    }
    total += Number(entry.header.size || 0);
    if (total > MAX_ZIP_UNCOMPRESSED) throw new BadRequestError('Figures ZIP exceeds the 100 MB uncompressed limit');
    const basename = path.posix.basename(normalized);
    const ext = path.extname(basename).toLowerCase();
    if (!FIGURE_EXTENSIONS.has(ext)) throw new BadRequestError(`Unsupported file in figures ZIP: ${basename}`);
    const key = basename.toLowerCase();
    if (files.has(key)) throw new BadRequestError(`Duplicate figure filename in ZIP: ${basename}`);
    const data = entry.getData();
    validateFigureBuffer(basename, data);
    files.set(key, { name: basename, data, extension: ext });
  }
  return { files };
}

async function existingIds(courseId: mongoose.Types.ObjectId) {
  const [subjects, chapters, exams, resources, questions, glossary, examRows, subjectRows, questionRows] = await Promise.all([
    GuuldoonSubject.distinct('externalId', { course: courseId }),
    GuuldoonChapter.distinct('externalId', { course: courseId }),
    GuuldoonExam.distinct('externalId', { course: courseId, externalId: { $ne: '' } }),
    GuuldoonResource.distinct('externalId', { course: courseId }),
    GuuldoonQuestion.distinct('externalId', { course: courseId, externalId: { $ne: '' } }),
    GuuldoonGlossary.distinct('externalId', { course: courseId }),
    GuuldoonExam.find({ course: courseId }).select('externalId year').lean(),
    GuuldoonSubject.find({ course: courseId }).select('externalId language').lean(),
    GuuldoonQuestion.find({ course: courseId }).select('externalId examExternalId number').lean(),
  ]);
  return {
    subjects: new Set(subjects.map(String)),
    chapters: new Set(chapters.map(String)),
    exams: new Set(exams.map(String)),
    resources: new Set(resources.map(String)),
    questions: new Set(questions.map(String)),
    glossary: new Set(glossary.map(String)),
    examRows,
    subjectRows,
    questionRows,
  };
}

export async function parseAndValidateGuuldoonImport(
  courseId: string,
  excel: Express.Multer.File,
  figures?: Express.Multer.File,
): Promise<ParsedGuuldoonImport> {
  if (!mongoose.isValidObjectId(courseId)) throw new BadRequestError('Invalid Guuldoon course ID');
  const course = await Course.findOne({ _id: courseId, scope: 'global', globalGrade: { $in: [8, 12] } }).lean();
  if (!course) throw new NotFoundError('Guuldoon global course');

  const { workbook, rows } = readWorkbook(excel);
  const lists = readLists(workbook);
  const zip = inspectFigureZip(figures);
  const issues: ImportIssue[] = [];
  const rowErrors = new Set<string>();
  const dependencyIssueSheets = new Set<string>();
  const add = (entry: ImportIssue) => {
    issues.push(entry);
    if (entry.severity === 'error' && entry.row >= 2) rowErrors.add(issueKey(entry.sheet, entry.row));
  };
  const blockRow = (sheet: ImportSheet, row: Row) => {
    rowErrors.add(issueKey(sheet, row.__row));
  };
  const dependencyIssue = (sheet: ImportSheet, message: string) => {
    if (dependencyIssueSheets.has(sheet)) return;
    dependencyIssueSheets.add(sheet);
    issues.push({ sheet, row: 1, field: 'dependency', message, severity: 'error' });
  };

  for (const sheet of SHEETS) assertWorkbookHeaders(sheet, rows[sheet], workbook, add);

  const requireValue = (sheet: ImportSheet, row: Row, field: string) => {
    if (!str(row[field])) add({ sheet, row: row.__row, id: rowId(sheet, row), field, message: `${field} is required`, severity: 'error' });
  };
  const enumValue = (sheet: ImportSheet, row: Row, field: string, allowed: Set<string>, supported: Set<string>) => {
    const value = lower(row[field]);
    if (!value) {
      add({ sheet, row: row.__row, id: rowId(sheet, row), field, message: `${field} is required`, severity: 'error' });
    } else if (!allowed.has(value)) {
      add({ sheet, row: row.__row, id: rowId(sheet, row), field, message: `Invalid ${field} "${value}". Value is not present in Lists`, severity: 'error' });
    } else if (!supported.has(value)) {
      add({ sheet, row: row.__row, id: rowId(sheet, row), field, message: `Unsupported ${field} "${value}"`, severity: 'error' });
    }
  };

  // Basic row validation.
  for (const row of rows.Subjects) {
    requireValue('Subjects', row, 'subject_id');
    requireValue('Subjects', row, 'name_en');
    const language = lower(row.language || 'so');
    if (!lists.language.has(language) || !SERVER_LANGUAGES.has(language)) {
      add({ sheet: 'Subjects', row: row.__row, id: rowId('Subjects', row), field: 'language', message: `Invalid subject language "${language}"`, severity: 'error' });
    }
    if (language === 'so' && !str(row.name_so)) {
      add({ sheet: 'Subjects', row: row.__row, id: rowId('Subjects', row), field: 'name_so', message: 'name_so is required when subject.language = so', severity: 'error' });
    }
    const grade = Number(row.grade);
    if (![8, 12].includes(grade)) add({ sheet: 'Subjects', row: row.__row, id: rowId('Subjects', row), field: 'grade', message: 'grade must be 8 or 12', severity: 'error' });
    if (grade !== Number((course as any).globalGrade)) add({ sheet: 'Subjects', row: row.__row, id: rowId('Subjects', row), field: 'grade', message: `Workbook grade ${grade} does not match selected Grade ${(course as any).globalGrade} course`, severity: 'error' });
    const status = lower(row.status || 'draft');
    if (!SERVER_STATUS.has(status)) add({ sheet: 'Subjects', row: row.__row, id: rowId('Subjects', row), field: 'status', message: 'status must be draft or published', severity: 'error' });
  }

  for (const row of rows.Chapters) {
    requireValue('Chapters', row, 'chapter_id');
    requireValue('Chapters', row, 'subject_id');
    requireValue('Chapters', row, 'title_en');
    const order = Number(row.order);
    if (!Number.isInteger(order) || order < 1) add({ sheet: 'Chapters', row: row.__row, id: rowId('Chapters', row), field: 'order', message: 'order must be a positive integer', severity: 'error' });
    const weight = numberOrNull(row.exam_weight);
    if (weight !== null && (weight < 0 || weight > 100)) add({ sheet: 'Chapters', row: row.__row, id: rowId('Chapters', row), field: 'exam_weight', message: 'exam_weight must be between 0 and 100', severity: 'error' });
  }

  for (const row of rows.Exams) {
    requireValue('Exams', row, 'exam_id');
    requireValue('Exams', row, 'subject_id');
    const year = Number(row.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) add({ sheet: 'Exams', row: row.__row, id: rowId('Exams', row), field: 'year', message: 'year must be between 1900 and 2100', severity: 'error' });
    if (!(Number(row.duration_min) > 0)) add({ sheet: 'Exams', row: row.__row, id: rowId('Exams', row), field: 'duration_min', message: 'duration_min must be greater than 0', severity: 'error' });
    if (!(Number(row.total_marks) > 0)) add({ sheet: 'Exams', row: row.__row, id: rowId('Exams', row), field: 'total_marks', message: 'total_marks must be greater than 0', severity: 'error' });
    enumValue('Exams', row, 'answer_key_status', lists.answerStatus, SERVER_ANSWER_STATUS);
  }

  for (const row of rows.Resources) {
    requireValue('Resources', row, 'resource_id');
    requireValue('Resources', row, 'subject_id');
    requireValue('Resources', row, 'title');
    enumValue('Resources', row, 'type', lists.resourceType, SERVER_RESOURCE_TYPES);
    enumValue('Resources', row, 'language', lists.language, SERVER_LANGUAGES);
    enumValue('Resources', row, 'direction', lists.direction, SERVER_DIRECTIONS);
  }

  const questionFirst = new Map<string, Row>();
  for (const row of rows.Questions) {
    requireValue('Questions', row, 'question_id');
    requireValue('Questions', row, 'exam_id');
    requireValue('Questions', row, 'chapter_id');
    requireValue('Questions', row, 'text');
    const id = str(row.question_id);
    if (id) {
      const first = questionFirst.get(id);
      if (first) {
        add({ sheet: 'Questions', row: first.__row, id, field: 'question_id', message: `Duplicate question_id "${id}". Another occurrence is row ${row.__row}`, severity: 'error' });
        add({ sheet: 'Questions', row: row.__row, id, field: 'question_id', message: `Duplicate question_id "${id}". First occurrence is row ${first.__row}`, severity: 'error' });
      } else questionFirst.set(id, row);
    }
    if (!Number.isFinite(Number(row.number)) || Number(row.number) < 1) add({ sheet: 'Questions', row: row.__row, id, field: 'number', message: 'number must be greater than 0', severity: 'error' });
    if (!Number.isFinite(Number(row.marks)) || Number(row.marks) < 0) add({ sheet: 'Questions', row: row.__row, id, field: 'marks', message: 'marks must be 0 or greater', severity: 'error' });
    enumValue('Questions', row, 'type', lists.questionType, SERVER_QUESTION_TYPES);
    enumValue('Questions', row, 'language', lists.language, SERVER_LANGUAGES);
    enumValue('Questions', row, 'direction', lists.direction, SERVER_DIRECTIONS);
    enumValue('Questions', row, 'answer_status', lists.answerStatus, SERVER_ANSWER_STATUS);

    const type = lower(row.type);
    const answerStatus = lower(row.answer_status);
    const answer = str(row.correct_answer);
    if (answerStatus === 'verified' && type === 'mcq') {
      if (!['A', 'B', 'C', 'D'].includes(answer.toUpperCase())) add({ sheet: 'Questions', row: row.__row, id, field: 'correct_answer', message: 'Verified MCQ correct_answer must be A, B, C or D', severity: 'error' });
      const optionIndex = ['A', 'B', 'C', 'D'].indexOf(answer.toUpperCase());
      const optionField = ['option_a', 'option_b', 'option_c', 'option_d'][optionIndex];
      if (optionIndex >= 0 && !str(row[optionField])) add({ sheet: 'Questions', row: row.__row, id, field: optionField, message: `${optionField} is required because it is the verified answer`, severity: 'error' });
    }
    if (answerStatus === 'verified' && type === 'fill' && !answer) add({ sheet: 'Questions', row: row.__row, id, field: 'correct_answer', message: 'Verified fill question requires correct_answer', severity: 'error' });
    if (!splitList(row.topic_tags).length) add({ sheet: 'Questions', row: row.__row, id, field: 'topic_tags', message: 'No topic_tags supplied; Pass Meter analytics will be less useful', severity: 'warning' });
    if (!str(row.explainer_text) && !str(row.explainer_audio)) add({ sheet: 'Questions', row: row.__row, id, field: 'explainer_text', message: 'No explanation text or audio supplied', severity: 'warning' });
    if (!str(row.similar_question_1) && !str(row.similar_question_2)) add({ sheet: 'Questions', row: row.__row, id, field: 'similar_question_1', message: 'No similar questions supplied', severity: 'warning' });
  }

  for (const row of rows.Glossary) {
    requireValue('Glossary', row, 'glossary_id');
    requireValue('Glossary', row, 'subject_id');
    requireValue('Glossary', row, 'term_so');
    requireValue('Glossary', row, 'term_en');
    requireValue('Glossary', row, 'term_ar');
  }

  // Stable ID duplicates inside each sheet.
  for (const sheet of ['Subjects', 'Chapters', 'Exams', 'Resources', 'Glossary'] as ImportSheet[]) {
    const seen = new Map<string, Row>();
    for (const row of rows[sheet]) {
      const id = rowId(sheet, row);
      if (!id) continue;
      const first = seen.get(id);
      if (first) {
        add({ sheet, row: first.__row, id, field: REQUIRED_HEADERS[sheet][0], message: `Duplicate ID "${id}" in workbook`, severity: 'error' });
        add({ sheet, row: row.__row, id, message: `Duplicate ID "${id}". First occurrence is row ${first.__row}`, severity: 'error' });
      } else seen.set(id, row);
    }
  }

  const existing = await existingIds(new mongoose.Types.ObjectId(courseId));
  const validIds = (sheet: ImportSheet) => new Set(rows[sheet].filter(row => !rowErrors.has(issueKey(sheet, row.__row))).map(row => rowId(sheet, row)).filter(Boolean));
  let validSubjects = validIds('Subjects');
  let validChapters = validIds('Chapters');
  let validExams = validIds('Exams');
  let validResources = validIds('Resources');
  let validQuestions = validIds('Questions');

  const hasRef = (id: string, local: Set<string>, db: Set<string>) => local.has(id) || db.has(id);
  for (const row of rows.Chapters) {
    if (rowErrors.has(issueKey('Chapters', row.__row))) continue;
    const ref = str(row.subject_id);
    if (!hasRef(ref, validSubjects, existing.subjects)) add({ sheet: 'Chapters', row: row.__row, id: rowId('Chapters', row), field: 'subject_id', message: `subject_id "${ref}" does not exist or its workbook row is invalid`, severity: 'error' });
  }
  validChapters = validIds('Chapters');

  for (const row of rows.Exams) {
    if (rowErrors.has(issueKey('Exams', row.__row))) continue;
    const ref = str(row.subject_id);
    if (!hasRef(ref, validSubjects, existing.subjects)) add({ sheet: 'Exams', row: row.__row, id: rowId('Exams', row), field: 'subject_id', message: `subject_id "${ref}" does not exist or its workbook row is invalid`, severity: 'error' });
    const conflict = existing.examRows.find((exam: any) => Number(exam.year) === Number(row.year) && str(exam.externalId) && str(exam.externalId) !== str(row.exam_id));
    if (conflict) add({ sheet: 'Exams', row: row.__row, id: rowId('Exams', row), field: 'year', message: `Year ${row.year} is already linked to exam_id "${conflict.externalId}"`, severity: 'error' });
  }
  validExams = validIds('Exams');

  for (const row of rows.Resources) {
    if (rowErrors.has(issueKey('Resources', row.__row))) continue;
    const subjectId = str(row.subject_id);
    const chapterId = str(row.chapter_id);
    if (!hasRef(subjectId, validSubjects, existing.subjects)) add({ sheet: 'Resources', row: row.__row, id: rowId('Resources', row), field: 'subject_id', message: `subject_id "${subjectId}" does not exist`, severity: 'error' });
    if (chapterId && !hasRef(chapterId, validChapters, existing.chapters)) add({ sheet: 'Resources', row: row.__row, id: rowId('Resources', row), field: 'chapter_id', message: `chapter_id "${chapterId}" does not exist`, severity: 'error' });
  }
  validResources = validIds('Resources');

  for (const row of rows.Glossary) {
    if (rowErrors.has(issueKey('Glossary', row.__row))) continue;
    const subjectId = str(row.subject_id);
    if (!hasRef(subjectId, validSubjects, existing.subjects)) add({ sheet: 'Glossary', row: row.__row, id: rowId('Glossary', row), field: 'subject_id', message: `subject_id "${subjectId}" does not exist`, severity: 'error' });
  }

  for (const row of rows.Questions) {
    if (rowErrors.has(issueKey('Questions', row.__row))) continue;
    const id = str(row.question_id);
    const examId = str(row.exam_id);
    const chapterId = str(row.chapter_id);
    const resourceId = str(row.resource_id);
    const parentId = str(row.parent_id);
    if (!hasRef(examId, validExams, existing.exams)) add({ sheet: 'Questions', row: row.__row, id, field: 'exam_id', message: `exam_id "${examId}" does not exist or its workbook row is invalid`, severity: 'error' });
    if (!hasRef(chapterId, validChapters, existing.chapters)) add({ sheet: 'Questions', row: row.__row, id, field: 'chapter_id', message: `chapter_id "${chapterId}" does not exist or its workbook row is invalid`, severity: 'error' });
    if (resourceId && !hasRef(resourceId, validResources, existing.resources)) add({ sheet: 'Questions', row: row.__row, id, field: 'resource_id', message: `resource_id "${resourceId}" does not exist or its workbook row is invalid`, severity: 'error' });
    if (parentId) {
      if (parentId === id) add({ sheet: 'Questions', row: row.__row, id, field: 'parent_id', message: 'parent_id cannot reference the same question', severity: 'error' });
      else if (!hasRef(parentId, validQuestions, existing.questions)) add({ sheet: 'Questions', row: row.__row, id, field: 'parent_id', message: `parent_id "${parentId}" does not exist or its workbook row is invalid`, severity: 'error' });
    }
    for (const field of ['similar_question_1', 'similar_question_2']) {
      const similar = str(row[field]);
      if (similar && !hasRef(similar, validQuestions, existing.questions)) add({ sheet: 'Questions', row: row.__row, id, field, message: `${field} "${similar}" does not exist`, severity: 'error' });
    }
    const figureFiles = splitList(row.figure_files);
    if (figureFiles.length && !zip) add({ sheet: 'Questions', row: row.__row, id, field: 'figure_files', message: 'figure_files are listed but no figures ZIP was uploaded', severity: 'error' });
    for (const filename of figureFiles) {
      if (zip && !zip.files.has(path.basename(filename).toLowerCase())) add({ sheet: 'Questions', row: row.__row, id, field: 'figure_files', message: `Figure file "${filename}" was not found in ZIP`, severity: 'error' });
    }
  }

  // A parent/similar question that became invalid because of its own dependencies
  // must not remain a valid target for another row.
  validQuestions = validIds('Questions');
  for (const row of rows.Questions) {
    if (rowErrors.has(issueKey('Questions', row.__row))) continue;
    const id = str(row.question_id);
    const parentId = str(row.parent_id);
    if (parentId && !hasRef(parentId, validQuestions, existing.questions)) {
      add({ sheet: 'Questions', row: row.__row, id, field: 'parent_id', message: `parent_id "${parentId}" points to an invalid question row`, severity: 'error' });
    }
    for (const field of ['similar_question_1', 'similar_question_2']) {
      const similar = str(row[field]);
      if (similar && !hasRef(similar, validQuestions, existing.questions)) {
        add({ sheet: 'Questions', row: row.__row, id, field, message: `${field} "${similar}" points to an invalid question row`, severity: 'error' });
      }
    }
  }

  // Circular parent relationships among otherwise valid workbook questions.
  validQuestions = validIds('Questions');
  const parentMap = new Map<string, string>();
  const rowByQuestion = new Map<string, Row>();
  for (const row of rows.Questions) {
    const id = str(row.question_id);
    if (!id || !validQuestions.has(id)) continue;
    rowByQuestion.set(id, row);
    const parent = str(row.parent_id);
    if (parent && validQuestions.has(parent)) parentMap.set(id, parent);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleMembers = new Set<string>();
  const walk = (id: string, trail: string[]) => {
    if (visiting.has(id)) {
      const start = trail.indexOf(id);
      for (const member of trail.slice(Math.max(0, start))) cycleMembers.add(member);
      cycleMembers.add(id);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const parent = parentMap.get(id);
    if (parent) walk(parent, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of parentMap.keys()) walk(id, []);
  for (const id of cycleMembers) {
    const row = rowByQuestion.get(id);
    if (row) add({ sheet: 'Questions', row: row.__row, id, field: 'parent_id', message: 'Circular parent_id relationship detected', severity: 'error' });
  }

  // Chapter weights: only enforce total when all valid workbook chapters provide one.
  const validChapterRows = rows.Chapters.filter(row => !rowErrors.has(issueKey('Chapters', row.__row)));
  if (validChapterRows.length && validChapterRows.every(row => numberOrNull(row.exam_weight) !== null)) {
    const total = validChapterRows.reduce((sum, row) => sum + Number(row.exam_weight || 0), 0);
    if (Math.abs(total - 100) > 0.5) {
      add({ sheet: 'Chapters', row: 1, field: 'exam_weight', message: `Chapter exam weights total ${total.toFixed(1)}%; expected approximately 100%`, severity: 'error' });
    }
  }

  const summary = {} as ParsedGuuldoonImport['summary'];
  for (const sheet of SHEETS) {
    const sheetIssues = issues.filter(item => item.sheet === sheet);
    const invalidRows = new Set(sheetIssues.filter(item => item.severity === 'error' && item.row >= 2).map(item => item.row));
    summary[sheet] = {
      total: rows[sheet].length,
      valid: rows[sheet].filter(row => !invalidRows.has(row.__row)).length,
      errors: sheetIssues.filter(item => item.severity === 'error').length,
      warnings: sheetIssues.filter(item => item.severity === 'warning').length,
    };
  }

  const validQuestionRows = rows.Questions.filter(row => !rowErrors.has(issueKey('Questions', row.__row)));
  const preview = {
    subject: rows.Subjects.find(row => !rowErrors.has(issueKey('Subjects', row.__row))) ? {
      id: rowId('Subjects', rows.Subjects.find(row => !rowErrors.has(issueKey('Subjects', row.__row)))!),
      name: str(rows.Subjects.find(row => !rowErrors.has(issueKey('Subjects', row.__row)))!.name_en),
      grade: Number((course as any).globalGrade),
    } : null,
    chapters: summary.Chapters.valid,
    exams: rows.Exams.filter(row => !rowErrors.has(issueKey('Exams', row.__row))).map(row => Number(row.year)).filter(Boolean).sort(),
    resources: summary.Resources.valid,
    questions: summary.Questions.valid,
    verifiedAnswers: validQuestionRows.filter(row => lower(row.answer_status) === 'verified').length,
    pendingAnswers: validQuestionRows.filter(row => lower(row.answer_status) === 'pending').length,
    glossary: summary.Glossary.valid,
    figuresMatched: zip ? new Set(validQuestionRows.flatMap(row => splitList(row.figure_files).map(name => path.basename(name).toLowerCase())).filter(name => zip.files.has(name))).size : 0,
    figuresReferenced: new Set(validQuestionRows.flatMap(row => splitList(row.figure_files).map(name => path.basename(name).toLowerCase()))).size,
  };

  return { course, rows, issues, summary, preview, lists, zip };
}

function isValidRow(parsed: ParsedGuuldoonImport, sheet: ImportSheet, row: Row): boolean {
  return !parsed.issues.some(issue => issue.sheet === sheet && issue.row === row.__row && issue.severity === 'error');
}

async function persistFigures(courseId: string, parsed: ParsedGuuldoonImport): Promise<Map<string, string>> {
  const used = new Set(
    parsed.rows.Questions
      .filter(row => isValidRow(parsed, 'Questions', row))
      .flatMap(row => splitList(row.figure_files).map(name => path.basename(name).toLowerCase())),
  );
  const urls = new Map<string, string>();
  if (!used.size || !parsed.zip) return urls;
  const directory = path.join(process.cwd(), 'uploads', 'guuldoon', courseId);
  await fs.promises.mkdir(directory, { recursive: true });
  for (const key of used) {
    const entry = parsed.zip.files.get(key);
    if (!entry) continue;
    validateFigureBuffer(entry.name, entry.data);
    const filename = `${crypto.createHash('sha256').update(entry.data).digest('hex').slice(0, 32)}${entry.extension}`;
    const destination = path.join(directory, filename);
    if (!fs.existsSync(destination)) await fs.promises.writeFile(destination, entry.data);
    urls.set(key, `/uploads/guuldoon/${courseId}/${filename}`);
  }
  return urls;
}

function importedAnswer(row: Row): unknown {
  const type = lower(row.type);
  const raw = str(row.correct_answer);
  if (type === 'mcq') {
    const index = ['A', 'B', 'C', 'D'].indexOf(raw.toUpperCase());
    return index >= 0 ? index : raw;
  }
  return raw || undefined;
}

export async function commitGuuldoonImport(
  courseId: string,
  parsed: ParsedGuuldoonImport,
): Promise<{ created: Record<ImportSheet, number>; updated: Record<ImportSheet, number>; skipped: number; importErrors: ImportIssue[]; imagesUploaded: number }> {
  const courseObjectId = new mongoose.Types.ObjectId(courseId);
  const created = Object.fromEntries(SHEETS.map(sheet => [sheet, 0])) as Record<ImportSheet, number>;
  const updated = Object.fromEntries(SHEETS.map(sheet => [sheet, 0])) as Record<ImportSheet, number>;
  const importErrors: ImportIssue[] = [];
  let skipped = parsed.issues.filter(issue => issue.severity === 'error' && issue.row >= 2).reduce((set, issue) => set.add(issueKey(issue.sheet, issue.row)), new Set<string>()).size;

  const safeWrite = async (sheet: ImportSheet, row: Row, fn: () => Promise<'created' | 'updated'>) => {
    if (!isValidRow(parsed, sheet, row)) return;
    try {
      const result = await fn();
      if (result === 'created') created[sheet] += 1;
      else updated[sheet] += 1;
    } catch (error: any) {
      skipped += 1;
      importErrors.push({ sheet, row: row.__row, id: rowId(sheet, row), message: error?.message || 'Database write failed', severity: 'error' });
    }
  };

  for (const row of parsed.rows.Subjects) await safeWrite('Subjects', row, async () => {
    const id = str(row.subject_id);
    const existing = await GuuldoonSubject.exists({ course: courseObjectId, externalId: id });
    await GuuldoonSubject.updateOne(
      { course: courseObjectId, externalId: id },
      { $set: {
        grade: Number(row.grade),
        nameSo: str(row.name_so),
        nameEn: str(row.name_en),
        nameAr: str(row.name_ar),
        descriptionSo: str(row.description_so),
        descriptionEn: str(row.description_en),
        status: SERVER_STATUS.has(lower(row.status)) ? lower(row.status) : 'draft',
      } },
      { upsert: true },
    );
    return existing ? 'updated' : 'created';
  });

  const subjects = await GuuldoonSubject.find({ course: courseObjectId }).select('_id externalId').lean();
  const subjectMap = new Map(subjects.map(item => [item.externalId, item._id]));

  for (const row of parsed.rows.Chapters) await safeWrite('Chapters', row, async () => {
    const id = str(row.chapter_id);
    const subject = subjectMap.get(str(row.subject_id));
    if (!subject) throw new Error(`subject_id "${row.subject_id}" was not imported`);
    const existing = await GuuldoonChapter.exists({ course: courseObjectId, externalId: id });
    await GuuldoonChapter.updateOne(
      { course: courseObjectId, externalId: id },
      { $set: {
        subject,
        subjectExternalId: str(row.subject_id),
        order: Number(row.order),
        titleSo: str(row.title_so),
        titleEn: str(row.title_en),
        titleAr: str(row.title_ar),
        examWeight: numberOrNull(row.exam_weight),
        status: SERVER_STATUS.has(lower(row.status)) ? lower(row.status) : 'draft',
      } },
      { upsert: true },
    );
    return existing ? 'updated' : 'created';
  });

  for (const row of parsed.rows.Exams) await safeWrite('Exams', row, async () => {
    const id = str(row.exam_id);
    const year = Number(row.year);
    let existing = await GuuldoonExam.findOne({ course: courseObjectId, externalId: id });
    if (!existing) existing = await GuuldoonExam.findOne({ course: courseObjectId, year, $or: [{ externalId: '' }, { externalId: { $exists: false } }] });
    const wasExisting = !!existing;
    const filter = existing ? { _id: existing._id } : { course: courseObjectId, externalId: id };
    await GuuldoonExam.updateOne(filter, { $set: {
      course: courseObjectId,
      externalId: id,
      subjectExternalId: str(row.subject_id),
      year,
      durationMin: Number(row.duration_min),
      totalMarks: Number(row.total_marks),
      source: str(row.source),
      notes: str(row.notes),
      answerKeyStatus: lower(row.answer_key_status) === 'verified' ? 'verified' : 'pending',
      published: bool(row.published),
    } }, { upsert: !existing });
    return wasExisting ? 'updated' : 'created';
  });

  for (const row of parsed.rows.Resources) await safeWrite('Resources', row, async () => {
    const id = str(row.resource_id);
    const existing = await GuuldoonResource.exists({ course: courseObjectId, externalId: id });
    await GuuldoonResource.updateOne(
      { course: courseObjectId, externalId: id },
      { $set: {
        subjectExternalId: str(row.subject_id),
        chapterExternalId: str(row.chapter_id),
        type: lower(row.type),
        title: str(row.title),
        url: str(row.url),
        fileName: str(row.file_name),
        pageFrom: numberOrNull(row.page_from),
        pageTo: numberOrNull(row.page_to),
        language: lower(row.language),
        direction: lower(row.direction),
        offlineAvailable: bool(row.offline_available),
        contentText: str(row.content_text),
      } },
      { upsert: true },
    );
    return existing ? 'updated' : 'created';
  });

  const examRows = await GuuldoonExam.find({ course: courseObjectId }).select('_id externalId').lean();
  const examMap = new Map(examRows.filter(item => item.externalId).map(item => [String(item.externalId), item._id]));
  const figureUrls = await persistFigures(courseId, parsed);

  // First pass creates/updates question bodies so parent/similar references can resolve in any order.
  for (const row of parsed.rows.Questions) await safeWrite('Questions', row, async () => {
    const id = str(row.question_id);
    const examId = examMap.get(str(row.exam_id));
    if (!examId) throw new Error(`exam_id "${row.exam_id}" was not imported`);
    let existing = await GuuldoonQuestion.findOne({ course: courseObjectId, externalId: id }).select('_id externalId');
    if (!existing) {
      const byNumber = await GuuldoonQuestion.findOne({ exam: examId, number: Number(row.number) }).select('_id externalId');
      if (byNumber && byNumber.externalId && String(byNumber.externalId) !== id) throw new Error(`Question number ${row.number} is already linked to question_id "${byNumber.externalId}"`);
      existing = byNumber;
    }
    const wasExisting = !!existing;
    const options = [row.option_a, row.option_b, row.option_c, row.option_d].map(str).filter(value => value !== '');
    const type = lower(row.type);
    const answerStatus = lower(row.answer_status) === 'verified' ? 'verified' : 'pending';
    const markingMode = answerStatus === 'verified' && ['mcq', 'fill'].includes(type) ? 'auto' : 'manual';
    const figures = splitList(row.figure_files).map(name => figureUrls.get(path.basename(name).toLowerCase()) || '').filter(Boolean);
    const filter = existing ? { _id: existing._id } : { course: courseObjectId, externalId: id };
    await GuuldoonQuestion.updateOne(filter, { $set: {
      course: courseObjectId,
      exam: examId,
      externalId: id,
      examExternalId: str(row.exam_id),
      parentExternalId: str(row.parent_id),
      number: Number(row.number),
      type,
      language: lower(row.language),
      direction: lower(row.direction),
      textSo: str(row.text),
      textEn: str(row.text_en),
      options: options.length ? options : undefined,
      marks: Number(row.marks),
      figureUrl: figures[0] || '',
      figureFiles: figures,
      chapterId: str(row.chapter_id),
      topicTags: [...new Set(splitList(row.topic_tags).map(normalizedTag).filter(Boolean))],
      resourceExternalId: str(row.resource_id),
      answer: importedAnswer(row),
      answerStatus,
      markingMode,
      explainerAudioUrl: str(row.explainer_audio),
      explainerText: str(row.explainer_text),
      notes: str(row.notes),
      bookRef: {
        bookId: str(row.resource_id),
        pageFrom: numberOrNull(row.book_page_from),
        pageTo: numberOrNull(row.book_page_to),
      },
    } }, { upsert: !existing });
    return wasExisting ? 'updated' : 'created';
  });

  const questionRows = await GuuldoonQuestion.find({ course: courseObjectId, externalId: { $ne: '' } }).select('_id externalId').lean();
  const questionMap = new Map(questionRows.map(item => [String(item.externalId), item._id]));
  for (const row of parsed.rows.Questions) {
    if (!isValidRow(parsed, 'Questions', row)) continue;
    const id = str(row.question_id);
    const questionId = questionMap.get(id);
    if (!questionId) continue;
    const parentId = questionMap.get(str(row.parent_id));
    const similarIds = [str(row.similar_question_1), str(row.similar_question_2)].map(value => questionMap.get(value)).filter(Boolean);
    await GuuldoonQuestion.updateOne({ _id: questionId }, { $set: { parent: parentId || null, similarIds } });
  }

  for (const row of parsed.rows.Glossary) await safeWrite('Glossary', row, async () => {
    const id = str(row.glossary_id);
    const existing = await GuuldoonGlossary.exists({ course: courseObjectId, externalId: id });
    await GuuldoonGlossary.updateOne(
      { course: courseObjectId, externalId: id },
      { $set: {
        subjectExternalId: str(row.subject_id),
        termSo: str(row.term_so),
        termEn: str(row.term_en),
        termAr: str(row.term_ar),
      } },
      { upsert: true },
    );
    return existing ? 'updated' : 'created';
  });

  return { created, updated, skipped, importErrors, imagesUploaded: figureUrls.size };
}

export async function buildGuuldoonUniversalTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sahal Education Platform';
  workbook.title = 'Guuldoon Universal Import Template';

  const definitions: Array<{ name: ImportSheet; headers: string[]; example: any[] }> = [
    { name: 'Subjects', headers: ['row_status','subject_id','grade','name_so','name_en','name_ar','description_so','description_en','status'], example: ['example','PHY12',12,'Fiisigis','Physics','الفيزياء','Diyaarinta imtixaanka','Certificate exam preparation','draft'] },
    { name: 'Chapters', headers: ['row_status','chapter_id','subject_id','order','title_so','title_en','title_ar','exam_weight','status'], example: ['example','PHY12_CH01','PHY12',1,'Koronto','Electricity','الكهرباء',20,'published'] },
    { name: 'Exams', headers: ['row_status','exam_id','subject_id','year','duration_min','total_marks','source','answer_key_status','published','notes'], example: ['example','PHY12_EX2021','PHY12',2021,120,100,'National exam','verified',true,'Official key checked'] },
    { name: 'Resources', headers: ['row_status','resource_id','subject_id','chapter_id','type','title','url','file_name','page_from','page_to','language','direction','offline_available','content_text'], example: ['example','PHY12_RES001','PHY12','PHY12_CH01','note','Ohm Law note','','',10,12,'so','ltr',true,'$V = IR$'] },
    { name: 'Questions', headers: ['row_status','question_id','exam_id','chapter_id','parent_id','number','type','language','direction','text','text_en','marks','option_a','option_b','option_c','option_d','correct_answer','answer_status','topic_tags','figure_files','resource_id','explainer_text','explainer_audio','book_page_from','book_page_to','similar_question_1','similar_question_2','notes'], example: ['example','PHY12_2021_Q01','PHY12_EX2021','PHY12_CH01','',1,'mcq','so','ltr','Haddii $R = 5\\Omega$ iyo $I = 2A$, hel $V$.','If $R = 5\\Omega$ and $I = 2A$, find $V$.',2,'2V','5V','10V','20V','C','verified','ohms-law;resistance','circuit_01.png','PHY12_RES001','Isticmaal $V = IR$.','',10,12,'','',''] },
    { name: 'Glossary', headers: ['row_status','glossary_id','subject_id','term_so','term_en','term_ar'], example: ['example','PHY12_G001','PHY12','Iska-caabin','Resistance','المقاومة'] },
  ];

  for (const def of definitions) {
    const sheet = workbook.addWorksheet(def.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(def.headers);
    sheet.addRow(def.example);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(2).font = { italic: true };
    sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    sheet.columns.forEach((column, index) => {
      column.width = Math.min(42, Math.max(14, def.headers[index].length + 4));
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: def.headers.length } };
  }

  const lists = workbook.addWorksheet('Lists');
  lists.addRow(['question_type','resource_type','language','direction','answer_status','status']);
  const listRows = [
    ['mcq','video','so','ltr','verified','draft'],
    ['structured','audio','en','rtl','pending','published'],
    ['fill','pdf','ar','auto','',''],
    ['match','book','','','',''],
    ['','image','','','',''],
    ['','note','','','',''],
    ['','link','','','',''],
  ];
  listRows.forEach(row => lists.addRow(row));
  lists.getRow(1).font = { bold: true };
  lists.columns.forEach(column => { column.width = 22; });

  const applyListValidation = (sheetName: ImportSheet, header: string, formula: string) => {
    const sheet = workbook.getWorksheet(sheetName)!;
    const headerRow = sheet.getRow(1).values as any[];
    const columnIndex = headerRow.findIndex(value => value === header);
    if (columnIndex < 1) return;
    for (let row = 2; row <= 5001; row += 1) {
      sheet.getCell(row, columnIndex).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: 'Invalid value',
        error: 'Choose a value from the Lists sheet.',
      };
    }
  };

  applyListValidation('Questions', 'type', 'Lists!$A$2:$A$5');
  applyListValidation('Questions', 'language', 'Lists!$C$2:$C$4');
  applyListValidation('Questions', 'direction', 'Lists!$D$2:$D$4');
  applyListValidation('Questions', 'answer_status', 'Lists!$E$2:$E$3');
  applyListValidation('Resources', 'type', 'Lists!$B$2:$B$8');
  applyListValidation('Resources', 'language', 'Lists!$C$2:$C$4');
  applyListValidation('Resources', 'direction', 'Lists!$D$2:$D$4');
  applyListValidation('Exams', 'answer_key_status', 'Lists!$E$2:$E$3');
  applyListValidation('Subjects', 'status', 'Lists!$F$2:$F$3');
  applyListValidation('Chapters', 'status', 'Lists!$F$2:$F$3');

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildImportIssuesWorkbook(issues: ImportIssue[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import Issues');
  sheet.addRow(['Severity', 'Sheet', 'Row', 'ID', 'Field', 'Error']);
  sheet.getRow(1).font = { bold: true };
  for (const issue of issues) sheet.addRow([issue.severity, issue.sheet, issue.row, issue.id || '', issue.field || '', issue.message]);
  sheet.columns = [
    { width: 12 }, { width: 16 }, { width: 10 }, { width: 28 }, { width: 24 }, { width: 70 },
  ];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
