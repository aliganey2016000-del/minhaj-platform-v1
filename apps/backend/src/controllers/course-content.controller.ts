/**
 * Course Content Controller
 *
 * Handles curriculum building: chapters, lessons, quizzes, and assignments.
 * One content document per course (upsert pattern).
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import CourseContent from '../models/course-content.model';
import Course from '../models/course.model';
import { NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { assertOwnsOrg } from '../utils/tenant-scope';

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