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
import { marked } from 'marked';
import CourseContent from '../models/course-content.model';
import Course from '../models/course.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { assertOwnsOrg } from '../utils/tenant-scope';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

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
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Every field, across all 10 question types, that can reveal a correct
// answer. Stripped unconditionally BEFORE any type-specific handling runs —
// so a question with a missing/unrecognized/misspelled `type` (e.g. legacy
// or malformed AI-generated content) still can't leak an answer just
// because it fell through every `if (question.type === ...)` branch below.
const ANSWER_REVEALING_FIELDS = [
  'explanation', 'correctAnswers', 'correctIndex', 'correctAnswer', 'pairs',
  'correctText', 'answer', 'blanks', 'distractors',
] as const;

function stripQuizSecrets(content: any, isStudent: boolean) {
  if (!isStudent || !content?.chapters) return content;

  for (const chapter of content.chapters) {
    for (const item of chapter.items || []) {
      if (item.type !== 'quiz') continue;

      item.questions = (item.questions || []).map((question: any) => {
        const safeQuestion = { ...question };
        for (const field of ANSWER_REVEALING_FIELDS) delete safeQuestion[field];
        // `cards[].correctSide` lives one level deeper than the fields
        // above, so it needs its own strip regardless of type.
        if (Array.isArray(question.cards)) {
          safeQuestion.cards = question.cards.map((card: any) => ({ text: card.text }));
        }

        if (question.type === 'mcq' && Array.isArray(question.options)) {
          safeQuestion.options = shuffleArray(question.options);
        }

        if (question.type === 'picture_choice' && Array.isArray(question.choices)) {
          safeQuestion.choices = shuffleArray(question.choices);
        }

        if (question.type === 'matching' && Array.isArray(question.pairs)) {
          safeQuestion.leftItems = question.pairs.map((pair: any) => pair.left);
          safeQuestion.rightItems = shuffleArray(question.pairs.map((pair: any) => pair.right));
        }

        if (question.type === 'ordering' && Array.isArray(question.items)) {
          safeQuestion.items = shuffleArray(question.items);
        }

        if (question.type === 'swipe_sort' && Array.isArray(question.cards)) {
          safeQuestion.cards = shuffleArray(safeQuestion.cards);
        }

        if (question.type === 'word_scramble' && typeof question.answer === 'string') {
          // The only student-facing signal for what to unscramble — since
          // the plaintext `answer` is stripped, ship pre-scrambled letters
          // instead so the client has tiles to work with but never the word.
          safeQuestion.scrambledLetters = shuffleArray(question.answer.split(''));
        }

        if (question.type === 'sentence_build' && Array.isArray(question.words)) {
          // wordBank mixes the correct words with decoys so their presence
          // doesn't give away which ones matter — grading only cares about
          // the order the student places words into, never sent here.
          safeQuestion.wordBank = shuffleArray([...question.words, ...(question.distractors || [])]);
        }

        if (question.type === 'fill_blank' && Array.isArray(question.blanks)) {
          // `blanks` holds the correct answer for each gap — a real leak if
          // shipped as-is. Replace with a shuffled word bank (correct words
          // + distractors) the student picks from; grading still happens
          // server-side against the original (never-sent) blanks array.
          safeQuestion.wordBank = shuffleArray([...question.blanks, ...(question.distractors || [])]);
        }

        return safeQuestion;
      });
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

  const content = await CourseContent.findOneAndUpdate(
    { course: courseId },
    {
      course: courseId,
      chapters: chapters || [],
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

const IMPORT_HEADER_TITLES = new Set(['chapter title', 'lesson title', 'duration', 'duration (minutes)', 'content']);

function looksLikeHeaderRow(cellValues: string[]): boolean {
  const matches = cellValues.filter((v) => IMPORT_HEADER_TITLES.has(v.toLowerCase())).length;
  return matches >= 2;
}

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// GET /courses/:courseId/content/template — Download import template (XLSX)
// ---------------------------------------------------------------------------
export const downloadImportTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = ['Chapter Title', 'Lesson Title', 'Duration (minutes)', 'Content (optional — plain text or Markdown)'];
  const rows = [
    ['Unit 1: Greetings', "Lesson 1: What's your name?", '30', 'Say hello and make introductions.\n\n# Practice\nSay your name, then ask a partner theirs.'],
    ['Unit 1: Greetings', 'Lesson 2: Nice to meet you', '30', ''],
    ['Unit 2: Family', 'Lesson 1: This is my family', '30', ''],
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

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const errors: { row: number; message: string }[] = [];
  const groups = new Map<string, { title: string; lessons: { title: string; content: string; duration: number }[] }>();

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
    const contentRaw = String(getField(row, 'Content') ?? '').trim();
    const content = contentRaw ? (marked.parse(contentRaw, { async: false }) as string) : '';

    const key = chapterTitle.toLowerCase();
    if (!groups.has(key)) groups.set(key, { title: chapterTitle, lessons: [] });
    groups.get(key)!.lessons.push({ title: lessonTitle, content, duration });
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
      videoUrl: '',
      videoDuration: 0,
      featuredImage: '',
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