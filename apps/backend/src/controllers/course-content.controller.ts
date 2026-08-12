/**
 * Course Content Controller
 *
 * Handles curriculum building: chapters, lessons, quizzes, and assignments.
 * One content document per course (upsert pattern).
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
// `marked` ships ESM-only from v5+, which breaks a static `require()` once
// this file is compiled to CommonJS for production. A plain `import()` does
// NOT fix this on its own — under `module: "commonjs"`, TypeScript silently
// rewrites it into `Promise.resolve().then(() => require('marked'))`, and
// `require()` still can't load a pure-ESM package (throws ERR_REQUIRE_ESM).
// Wrapping the call in `new Function` hides it from TS's static downleveling,
// so it stays a genuine dynamic `import()` at runtime, which Node resolves
// correctly even from a CJS caller.
let markedModulePromise: Promise<typeof import('marked')> | null = null;
function getMarked(): Promise<typeof import('marked')> {
  if (!markedModulePromise) markedModulePromise = new Function('return import("marked")')() as Promise<typeof import('marked')>;
  return markedModulePromise;
}
import CourseContent, { computeContentTotals } from '../models/course-content.model';
import Course from '../models/course.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { assertOwnsOrg } from '../utils/tenant-scope';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import { assertSafeSpreadsheetUpload } from '../utils/spreadsheet-upload';
import { sanitizeQuestionForStudent } from '../utils/question-engine';
import { parseBlockRows, getField, looksLikeContentBlockHeaderRow } from '../utils/content-blocks-parser';
import { appendAiPromptSheets } from './content-blocks-import.controller';

/**
 * SHA-256 of a gate answer, salted per-question by lesson id + scope + index.
 * Lets the OFFLINE client grade a Stop & Check / checkpoint attempt locally
 * (hash the attempt, compare) without ever shipping the plaintext answer.
 * Must stay byte-identical to `hashGateAnswer` in
 * frontend/src/lib/offline-gate.ts.
 */
export function hashGateAnswer(
  lessonId: string,
  scope: 'block' | 'checkpoint',
  index: number | string,
  answer: unknown
): string {
  return crypto
    .createHash('sha256')
    .update(`${lessonId}:${scope}:${index}:${String(answer)}`)
    .digest('hex');
}

// Students must never receive the correct answer for a Stop & Check question
// before they submit one — strip it from any content read by a student. A
// salted hash of the answer is left in its place so downloaded-for-offline
// content can still be graded locally without a connection.

// Per-question stripping/shuffling (sanitizeQuestionForStudent) now lives in
// ../utils/question-engine, shared verbatim with exam papers — same answer-
// revealing fields, same shuffle behavior, for both question sources.
function stripQuizSecrets(content: any, isStudent: boolean) {
  if (!isStudent || !content?.chapters) return content;

  for (const chapter of content.chapters) {
    for (const item of chapter.items || []) {
      if (item.type !== 'quiz') continue;
      item.questions = (item.questions || []).map(sanitizeQuestionForStudent);
    }
  }

  return content;
}

// A block's Stop & Check questions, normalizing the legacy singular
// `question` field (still present on lessons saved before multi-question
// support) into the array shape every read/write path now uses.
function blockQuestions(block: any): any[] {
  return block.questions ?? (block.question ? [block.question] : []);
}

// `correctIndex` is the field the frontend/editor actually reads and writes
// (course-builder.types.ts ContentBlockQuestion, shared with the main quiz
// engine's QuizQuestion union) — grading and stripping must key off that
// name, not a legacy `correctOptionIndex` that nothing ever populates.
function stripOneGateQuestion(question: any, lessonId: string, scope: 'block' | 'checkpoint', compositeIndex: string) {
  const correctValue = question.type === 'mcq' ? question.correctIndex : question.correctAnswer;
  if (correctValue !== undefined) {
    question.answerHash = hashGateAnswer(lessonId, scope, compositeIndex, correctValue);
  }
  delete question.correctIndex;
  delete question.correctAnswer;
  delete question.explanation; // often paraphrases the correct answer — same spoiler risk
}

function stripGateAnswers(content: any, isStudent: boolean) {
  if (!isStudent || !content?.chapters) return content;
  for (const chapter of content.chapters) {
    for (const item of chapter.items || []) {
      if (item.type !== 'lesson') continue;
      const lessonId = item._id?.toString() || '';
      (item.contentBlocks || []).forEach((block: any, blockIndex: number) => {
        const questions = blockQuestions(block);
        questions.forEach((question, qIndex) => {
          stripOneGateQuestion(question, lessonId, 'block', `${blockIndex}.${qIndex}`);
        });
        // Normalize onto `questions` so a student payload never carries both
        // the legacy singular field and the array disagreeing with it.
        if (questions.length > 0) block.questions = questions;
        delete block.question;
      });
      (item.videoCheckpoints || []).forEach((checkpoint: any, cpIndex: number) => {
        if (checkpoint.question) {
          stripOneGateQuestion(checkpoint.question, lessonId, 'checkpoint', `${cpIndex}`);
        }
      });
    }
  }
  return content;
}

// ---------------------------------------------------------------------------
// GET /courses/:courseId/content — Get content for a course
// ---------------------------------------------------------------------------
export const getByCourse = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;

  // Verify course exists
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');

  let content = await CourseContent.findOne({ course: courseId }).lean();

  // Return empty structure if no content exists yet
  if (!content) {
    content = {
      course: courseId,
      chapters: [],
      totalDuration: 0,
      totalLessons: 0,
      totalQuizzes: 0,
      totalAssignments: 0,
      totalExams: 0,
      lastSaved: new Date(),
    } as any;
  }

  content = stripGateAnswers(content, req.user?.role === 'student');
  content = stripQuizSecrets(content, req.user?.role === 'student');

  return ApiResponse.success(res, content);
};

// ---------------------------------------------------------------------------
// PUT /courses/:courseId/content — Save/update full content (upsert)
// ---------------------------------------------------------------------------
export const saveContent = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { chapters } = req.body;

  // Verify course exists
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');

  // findOneAndUpdate is document-middleware-free — the model's pre('save')
  // hook that recomputes totalLessons/totalQuizzes/etc. never runs here, so
  // those totals are computed explicitly and included in the update instead
  // of silently drifting stale (see computeContentTotals in the model).
  const content = await CourseContent.findOneAndUpdate(
    { course: courseId },
    {
      course: courseId,
      chapters: chapters || [],
      ...computeContentTotals(chapters || []),
      lastSaved: new Date(),
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  ).lean();

  return ApiResponse.success(res, content, 'Course content saved successfully');
};

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/content/chapters/reorder — Reorder chapters
// ---------------------------------------------------------------------------
export const reorderChapters = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { chapterIds } = req.body; // array of chapter _id in new order

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');

  const content = await CourseContent.findOne({ course: courseId });
  if (!content) throw new NotFoundError('Course content');

  // Reorder chapters based on the provided ID array
  const idOrder = (chapterIds as string[]).map((id) => id.toString());
  content.chapters.sort((a: any, b: any) => {
    const aIdx = idOrder.indexOf(a._id.toString());
    const bIdx = idOrder.indexOf(b._id.toString());
    return aIdx - bIdx;
  });

  // Update order fields
  content.chapters.forEach((ch: any, idx: number) => {
    ch.order = idx;
  });

  await content.save();

  const updated = await CourseContent.findOne({ course: courseId }).lean();
  return ApiResponse.success(res, updated, 'Chapters reordered successfully');
};

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/content/chapters/:chapterId/items/reorder
// ---------------------------------------------------------------------------
export const reorderItems = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, chapterId } = req.params;
  const { itemIds } = req.body; // array of item _id in new order

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');

  const content = await CourseContent.findOne({ course: courseId });
  if (!content) throw new NotFoundError('Course content');

  const chapter = content.chapters.find(
    (ch: any) => ch._id.toString() === chapterId
  );
  if (!chapter) throw new NotFoundError('Chapter');

  const idOrder = (itemIds as string[]).map((id) => id.toString());
  chapter.items.sort((a: any, b: any) => {
    const aIdx = idOrder.indexOf(a._id.toString());
    const bIdx = idOrder.indexOf(b._id.toString());
    return aIdx - bIdx;
  });

  chapter.items.forEach((item: any, idx: number) => {
    item.order = idx;
  });

  await content.save();

  const updated = await CourseContent.findOne({ course: courseId }).lean();
  return ApiResponse.success(res, updated, 'Items reordered successfully');
};

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/content/chapters/:chapterId/collapse
// ---------------------------------------------------------------------------
export const toggleChapterCollapse = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, chapterId } = req.params;

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');

  const content = await CourseContent.findOne({ course: courseId });
  if (!content) throw new NotFoundError('Course content');

  const chapter = content.chapters.find(
    (ch: any) => ch._id.toString() === chapterId
  );
  if (!chapter) throw new NotFoundError('Chapter');

  chapter.collapsed = !chapter.collapsed;
  await content.save();

  const updated = await CourseContent.findOne({ course: courseId }).lean();
  return ApiResponse.success(res, updated);
};

// ---------------------------------------------------------------------------
// Bulk import — Chapters (Units) + Lessons from Excel/CSV
// One row per lesson; rows sharing a Chapter Title are grouped into one
// chapter (matched case-insensitively against chapters that already exist,
// otherwise created new) and appended in row order. Writes directly to the
// DB (unlike the drag-and-drop builder's own Save, which replaces the whole
// `chapters` array) — the frontend refetches content after a successful
// import so its local state picks up the result before any further autosave.
// ---------------------------------------------------------------------------

const IMPORT_HEADER_TITLES = new Set([
  'chapter title', 'lesson title', 'duration', 'duration (minutes)', 'content',
  'video url', 'featured image url',
]);

function looksLikeHeaderRow(cellValues: string[]): boolean {
  const matches = cellValues.filter((v) => IMPORT_HEADER_TITLES.has(v.toLowerCase())).length;
  return matches >= 2;
}

// ---------------------------------------------------------------------------
// GET /courses/:courseId/content/template — Download import template (XLSX)
// ---------------------------------------------------------------------------
export const downloadImportTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = [
    'Chapter Title', 'Lesson Title', 'Duration (minutes)',
    'Content (optional — plain text or Markdown)',
    'Video URL (optional)', 'Featured Image URL (optional)',
  ];
  const rows = [
    ['Unit 1: Greetings', "Lesson 1: What's your name?", '30', 'Say hello and make introductions.\n\n# Practice\nSay your name, then ask a partner theirs.', 'https://youtube.com/watch?v=...', ''],
    ['Unit 1: Greetings', 'Lesson 2: Nice to meet you', '30', '', '', ''],
    ['Unit 2: Family', 'Lesson 1: This is my family', '30', '', '', ''],
  ];
  const buffer = buildXlsxBuffer(headers, rows, 'Course Content Template');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=course-content-template.xlsx');
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// POST /courses/:courseId/content/import — Bulk import chapters + lessons
// ---------------------------------------------------------------------------
export const importContent = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');

  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');
  assertSafeSpreadsheetUpload(req.file);

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const errors: { row: number; message: string }[] = [];
  const groups = new Map<string, { title: string; lessons: { title: string; content: string; duration: number; videoUrl: string; featuredImage: string }[] }>();
  const { marked } = await getMarked();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row already stripped by sheet_to_json
    const row = rows[i];

    const cellValues = Object.values(row).map((v) => String(v ?? '').trim());
    if (cellValues.every((v) => v === '')) continue; // blank row
    if (looksLikeHeaderRow(cellValues)) continue; // a re-pasted header row further down the batch

    const chapterTitle = String(getField(row, 'Chapter Title') ?? '').trim();
    const lessonTitle = String(getField(row, 'Lesson Title') ?? '').trim();
    if (!chapterTitle || !lessonTitle) {
      errors.push({ row: rowNum, message: 'Chapter Title and Lesson Title are both required' });
      continue;
    }

    const durationRaw = getField(row, 'Duration (minutes)', 'Duration');
    const duration = Number(durationRaw) || 0;
    const contentRaw = String(getField(row, 'Content', 'Content (optional — plain text or Markdown)') ?? '').trim();
    const content = contentRaw ? (marked.parse(contentRaw, { async: false }) as string) : '';
    const videoUrl = String(getField(row, 'Video URL', 'Video URL (optional)') ?? '').trim();
    const featuredImage = String(getField(row, 'Featured Image URL', 'Featured Image URL (optional)') ?? '').trim();

    const key = chapterTitle.toLowerCase();
    if (!groups.has(key)) groups.set(key, { title: chapterTitle, lessons: [] });
    groups.get(key)!.lessons.push({ title: lessonTitle, content, duration, videoUrl, featuredImage });
  }

  if (groups.size === 0) {
    throw new BadRequestError('No valid rows found to import — every row was missing a Chapter Title or Lesson Title.');
  }

  let doc = await CourseContent.findOne({ course: courseId });
  if (!doc) {
    doc = new CourseContent({ course: courseId, chapters: [] });
  }

  let chaptersCreated = 0;
  let chaptersUpdated = 0;
  let lessonsCreated = 0;

  for (const group of groups.values()) {
    const existingChapter: any = doc.chapters.find((ch: any) => String(ch.title || '').trim().toLowerCase() === group.title.toLowerCase());
    const baseOrder = existingChapter ? existingChapter.items.length : 0;
    const lessonItems = group.lessons.map((lesson, idx) => ({
      _id: new mongoose.Types.ObjectId(),
      title: lesson.title,
      type: 'lesson',
      content: lesson.content,
      videoUrl: lesson.videoUrl,
      videoDuration: 0,
      featuredImage: lesson.featuredImage,
      attachments: [],
      order: baseOrder + idx,
      status: 'draft',
      duration: lesson.duration,
      deliveryMode: 'traditional',
    }));

    if (existingChapter) {
      // A live subdocument reference from `.find()` — pushing onto its own
      // `items` array mutates the actual document.
      existingChapter.items.push(...lessonItems);
      chaptersUpdated++;
    } else {
      // Build the chapter WITH its lessons already in place before pushing —
      // `doc.chapters.push(x)` casts/clones `x` into a new subdocument
      // instance, so a `chapter` variable holding the pre-push plain object
      // would silently mutate a reference nothing actually saves.
      doc.chapters.push({
        _id: new mongoose.Types.ObjectId(),
        title: group.title,
        description: '',
        order: doc.chapters.length,
        status: 'draft',
        collapsed: false,
        items: lessonItems,
      } as any);
      chaptersCreated++;
    }
    lessonsCreated += lessonItems.length;
  }

  doc.markModified('chapters');
  await doc.save();

  return ApiResponse.success(res, {
    totalRows: rows.length,
    chaptersCreated,
    chaptersUpdated,
    lessonsCreated,
    errors,
  }, 'Course content imported successfully');
};

// ---------------------------------------------------------------------------
// Bulk Interactive Gate Content Blocks import — across every lesson in the
// course at once, from one multi-sheet workbook. The course-wide sibling of
// content-blocks-import.controller's single-lesson importer: same row-
// grouping rules (via utils/content-blocks-parser), same AI-prompt sheets,
// but this one writes straight to the DB (like importContent above) instead
// of handing parsed blocks back to the Lesson Editor's local state — a file
// touching dozens of lessons can't reasonably be merged into one editor's
// in-memory state.
//
// Rows are matched to a lesson by their own "Chapter Title"/"Lesson Title"
// columns, NOT by the sheet's tab name — Excel sheet names are capped at 31
// characters and can't contain a colon, so a lesson title like "Unit 1:
// Living and Nonliving Things" can never be used as a reliable match key.
// One sheet per lesson is still the expected shape (and what the course-
// scoped template below generates), purely so the file is easy for an admin
// to navigate — the parser is happy to see a lesson's rows split across
// several sheets or combined into one, since matching runs on the columns.
//
// A (Chapter Title, Lesson Title) pair that doesn't match anything existing
// is auto-created (chapter, then lesson inside it) exactly like the plain
// /content/import chapters+lessons importer already does — so a single
// upload here can build the whole course structure AND its interactive
// content in one pass when nothing exists yet, not just fill in lessons
// that were created some other way first.
// ---------------------------------------------------------------------------

const BLOCKS_IMPORT_HEADERS = [
  'Chapter Title', 'Lesson Title', 'Block Title', 'Block Content (plain text or Markdown)',
  'Min Read Seconds (optional)', 'Question Type (mcq or true_false)', 'Question Text',
  'Option 1', 'Option 2', 'Option 3', 'Correct Answer (mcq: 1/2/3, true_false: TRUE/FALSE)',
  'Explanation (optional)',
];

const INVALID_SHEET_NAME_CHARS = /[:\\/?*[\]]/g;

/** Excel sheet names: max 31 chars, no `: \ / ? * [ ]`, never blank, never repeated within one workbook. */
function sanitizeSheetName(title: string, used: Set<string>): string {
  let base = (title || 'Lesson').replace(INVALID_SHEET_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (!base) base = 'Lesson';
  if (base.length > 31) base = base.slice(0, 31).trim();

  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffixText = ` (${suffix})`;
    candidate = base.slice(0, 31 - suffixText.length).trim() + suffixText;
    suffix++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// ---------------------------------------------------------------------------
// GET /courses/:courseId/content/blocks-import/template — course-scoped
// template: one sheet per existing lesson, Chapter/Lesson Title already
// filled in from the course's actual structure, plus the same AI-prompt
// sheets as the single-lesson template.
// ---------------------------------------------------------------------------
export const downloadBlocksImportTemplate = async (req: Request, res: Response): Promise<void> => {
  const { courseId } = req.params;
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');

  const doc = await CourseContent.findOne({ course: courseId });
  const lessons: { chapterTitle: string; lessonTitle: string }[] = [];
  for (const chapter of (doc?.chapters || []) as any[]) {
    for (const item of chapter.items || []) {
      if (item.type === 'lesson') lessons.push({ chapterTitle: chapter.title, lessonTitle: item.title });
    }
  }

  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();
  const colWidths = BLOCKS_IMPORT_HEADERS.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 18), 50) }));

  if (lessons.length === 0) {
    const exampleRow = [
      'Unit 1: Example Chapter', 'Lesson 1: Example Lesson',
      'REPLACE ME — Block 1 Title', 'REPLACE ME — paste or type this block\'s passage text here.',
      '30', 'mcq', 'REPLACE ME — a comprehension question about this block', 'Correct option', 'Wrong option', 'Wrong option', '1', '',
    ];
    const sheet = XLSX.utils.aoa_to_sheet([BLOCKS_IMPORT_HEADERS, exampleRow]);
    sheet['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName('Example — edit Chapter & Lesson Title', usedSheetNames));
  } else {
    for (const { chapterTitle, lessonTitle } of lessons) {
      const exampleRow = [
        chapterTitle, lessonTitle,
        'REPLACE ME — Block 1 Title', 'REPLACE ME — paste or type this block\'s passage text here.',
        '30', 'mcq', 'REPLACE ME — a comprehension question about this block', 'Correct option', 'Wrong option', 'Wrong option', '1', '',
      ];
      const sheet = XLSX.utils.aoa_to_sheet([BLOCKS_IMPORT_HEADERS, exampleRow]);
      sheet['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(lessonTitle, usedSheetNames));
    }
  }

  appendAiPromptSheets(workbook);
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=content-blocks-bulk-template.xlsx');
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// POST /courses/:courseId/content/blocks-import — bulk import
// ---------------------------------------------------------------------------
export const importContentBlocksForCourse = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');

  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');
  assertSafeSpreadsheetUpload(req.file);

  let doc = await CourseContent.findOne({ course: courseId });
  if (!doc) {
    doc = new CourseContent({ course: courseId, chapters: [] });
  }

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  if (workbook.SheetNames.length === 0) throw new BadRequestError('The uploaded file has no sheets');

  interface GroupedRow { sheetName: string; rowNum: number; data: Record<string, any> }
  const lessonGroups = new Map<string, { chapterTitle: string; lessonTitle: string; rows: GroupedRow[] }>();
  const errors: { row: number; message: string }[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
    if (sheetRows.length === 0) continue;

    // Sheets without a "Chapter Title"/"Lesson Title" column at all aren't
    // meant for this importer (the AI-prompt sheets in the template, or any
    // other unrelated tab) — skip them silently instead of spamming a
    // per-row error for every line of instructional text.
    const sampleKeys = Object.keys(sheetRows[0]).map((k) => k.trim().toLowerCase());
    const hasChapterCol = sampleKeys.some((k) => k.startsWith('chapter title'));
    const hasLessonCol = sampleKeys.some((k) => k.startsWith('lesson title'));
    if (!hasChapterCol || !hasLessonCol) continue;

    for (let i = 0; i < sheetRows.length; i++) {
      const rowNum = i + 2; // +1 for 0-index, +1 for the header row already stripped by sheet_to_json
      const row = sheetRows[i];
      const cellValues = Object.values(row).map((v) => String(v ?? '').trim());
      if (cellValues.every((v) => v === '')) continue; // blank row
      if (looksLikeContentBlockHeaderRow(cellValues)) continue; // a re-pasted header row further down the batch

      const chapterTitle = String(getField(row, 'Chapter Title') ?? '').trim();
      const lessonTitle = String(getField(row, 'Lesson Title') ?? '').trim();
      if (!chapterTitle || !lessonTitle) {
        errors.push({ row: 0, message: `Sheet "${sheetName}" row ${rowNum}: Chapter Title and Lesson Title are both required` });
        continue;
      }

      const key = `${chapterTitle.toLowerCase()}|||${lessonTitle.toLowerCase()}`;
      if (!lessonGroups.has(key)) lessonGroups.set(key, { chapterTitle, lessonTitle, rows: [] });
      lessonGroups.get(key)!.rows.push({ sheetName, rowNum, data: row });
    }
  }

  if (lessonGroups.size === 0) {
    throw new BadRequestError('No valid rows found — every sheet was either missing Chapter Title/Lesson Title columns, or every row was missing those values.');
  }

  let chaptersCreated = 0;
  let lessonsCreated = 0;
  let lessonsUpdated = 0;
  let blocksCreated = 0;
  let questionsCreated = 0;

  const findLesson = (chapter: any, title: string) =>
    (chapter.items || []).find((it: any) => it.type === 'lesson' && String(it.title || '').trim().toLowerCase() === title.toLowerCase());

  for (const { chapterTitle, lessonTitle, rows } of lessonGroups.values()) {
    let chapter: any = doc.chapters.find((ch: any) => String(ch.title || '').trim().toLowerCase() === chapterTitle.toLowerCase());
    let lessonItem: any;

    if (!chapter) {
      // Build the chapter WITH its lesson already inside `items` before
      // pushing — `doc.chapters.push(x)` casts/clones `x` into a new
      // subdocument instance, so a pre-push plain-object reference would
      // silently mutate nothing that actually saves (same caveat as
      // importContent above). Re-fetch the live subdocument afterward for
      // anything that still needs mutating (contentBlocks, below).
      const newLesson = {
        _id: new mongoose.Types.ObjectId(),
        title: lessonTitle,
        type: 'lesson',
        content: '',
        attachments: [],
        order: 0,
        status: 'draft',
        duration: 0,
        deliveryMode: 'traditional',
      };
      doc.chapters.push({
        _id: new mongoose.Types.ObjectId(),
        title: chapterTitle,
        description: '',
        order: doc.chapters.length,
        status: 'draft',
        collapsed: false,
        items: [newLesson],
      } as any);
      chaptersCreated++;
      lessonsCreated++;
      chapter = doc.chapters[doc.chapters.length - 1];
      lessonItem = findLesson(chapter, lessonTitle);
    } else {
      lessonItem = findLesson(chapter, lessonTitle);
      if (!lessonItem) {
        lessonItem = {
          _id: new mongoose.Types.ObjectId(),
          title: lessonTitle,
          type: 'lesson',
          content: '',
          attachments: [],
          order: (chapter.items || []).length,
          status: 'draft',
          duration: 0,
          deliveryMode: 'traditional',
        };
        // A live subdocument reference from `.find()` — pushing onto its
        // own `items` array mutates the actual document (see importContent
        // above for the same pattern on an existing chapter).
        chapter.items.push(lessonItem);
        lessonsCreated++;
      }
    }

    const { blocks, errors: blockErrors } = await parseBlockRows(rows.map((r) => ({ rowNum: r.rowNum, data: r.data })));
    for (const be of blockErrors) {
      const sourceRow = rows.find((r) => r.rowNum === be.row);
      const location = sourceRow ? `Sheet "${sourceRow.sheetName}" row ${be.row}` : `Lesson "${lessonTitle}"`;
      errors.push({ row: 0, message: `${location}: ${be.message}` });
    }
    if (blocks.length === 0) continue;

    // Append — never replace — any content blocks the lesson already has,
    // same non-destructive default as the single-lesson import modal.
    const baseOrder = (lessonItem.contentBlocks || []).length;
    const newBlocks = blocks.map((b, idx) => ({
      _id: new mongoose.Types.ObjectId(),
      title: b.title,
      order: baseOrder + idx,
      content: b.content,
      minReadSeconds: b.minReadSeconds || 30,
      questions: b.questions,
    }));
    lessonItem.contentBlocks = [...(lessonItem.contentBlocks || []), ...newBlocks];
    lessonItem.deliveryMode = 'interactive_gate';

    lessonsUpdated++;
    blocksCreated += newBlocks.length;
    questionsCreated += newBlocks.reduce((sum, b) => sum + b.questions.length, 0);
  }

  doc.markModified('chapters');
  await doc.save();

  return ApiResponse.success(res, {
    chaptersCreated,
    lessonsCreated,
    lessonsUpdated,
    blocksCreated,
    questionsCreated,
    errors,
  }, 'Content blocks imported successfully');
};
