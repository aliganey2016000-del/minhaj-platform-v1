/**
 * Lesson Block Progress Controller
 *
 * Drives the "Interactive Gate" delivery mode's server-side state: how far a
 * student has unlocked a lesson's content blocks, and grading of each
 * block's Stop & Check question. The correct answer for a block's question
 * is never sent to the client (see stripGateAnswers in
 * course-content.controller.ts) — this controller is the only place that
 * ever compares a submitted answer against it.
 */

import { Request, Response } from 'express';
import CourseContent from '../models/course-content.model';
import LessonBlockProgress from '../models/lesson-block-progress.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import ensureStudentRecord from '../utils/ensure-student';

// A block's Stop & Check questions, normalizing the legacy singular
// `question` field (lessons saved before multi-question support) into the
// array shape every read/write path now uses.
function blockQuestions(block: any): any[] {
  return block.questions ?? (block.question ? [block.question] : []);
}

// mcq/true_false are the only types graded and rendered end-to-end today
// (see interactive-gate-lesson-view.tsx) — `correctIndex` is the field the
// editor actually writes (course-builder.types.ts ContentBlockQuestion),
// not a legacy `correctOptionIndex` that nothing ever populates.
function isCorrectGateAnswer(question: any, answer: unknown): boolean {
  return question.type === 'mcq' ? answer === question.correctIndex : answer === question.correctAnswer;
}

async function findLesson(courseId: string, lessonId: string) {
  const content = await CourseContent.findOne({ course: courseId }).lean();
  if (!content) throw new NotFoundError('Course content');
  for (const chapter of content.chapters) {
    for (const item of chapter.items as any[]) {
      if (item.type === 'lesson' && item._id?.toString() === lessonId) return item;
    }
  }
  throw new NotFoundError('Lesson');
}

// ---------------------------------------------------------------------------
// GET /courses/:courseId/lessons/:lessonId/gate — this student's progress
// ---------------------------------------------------------------------------
export const getBlockProgress = async (req: Request, res: Response): Promise<Response> => {
  const { lessonId } = req.params;
  const student = await ensureStudentRecord(req.user!.userId);

  const progress = await LessonBlockProgress.findOne({ student: student._id, lessonId }).lean();

  return ApiResponse.success(res, progress || {
    unlockedBlockIndex: 0, gateCompleted: false, attempts: [],
    maxTimeWatched: 0, clearedCheckpoints: [],
  });
};

// ---------------------------------------------------------------------------
// POST /courses/:courseId/lessons/:lessonId/blocks/:blockIndex/answer
// ---------------------------------------------------------------------------
export const submitBlockAnswer = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, lessonId } = req.params;
  const blockIndex = parseInt(req.params.blockIndex, 10);
  const { answer } = req.body;
  const questionIndex = Number.isInteger(req.body.questionIndex) ? req.body.questionIndex : 0;

  if (Number.isNaN(blockIndex) || blockIndex < 0) {
    throw new BadRequestError('Invalid block index');
  }

  const lesson = await findLesson(courseId, lessonId);
  if (lesson.deliveryMode !== 'interactive_gate' || !lesson.contentBlocks?.length) {
    throw new BadRequestError('This lesson does not use Interactive Gate delivery');
  }
  const block = lesson.contentBlocks[blockIndex];
  if (!block) throw new NotFoundError('Content block');
  const questions = blockQuestions(block);
  if (questionIndex < 0 || (questions.length > 0 && questionIndex >= questions.length)) {
    throw new BadRequestError('Invalid question index');
  }
  const question = questions[questionIndex];

  const student = await ensureStudentRecord(req.user!.userId);

  let progress = await LessonBlockProgress.findOne({ student: student._id, lessonId });
  if (!progress) {
    progress = await LessonBlockProgress.create({
      student: student._id, course: courseId, lessonId, unlockedBlockIndex: 0, gateCompleted: false, attempts: [],
    });
  }

  // Reject answering a block that isn't the one currently gating them —
  // prevents skipping ahead by guessing later block indices.
  if (blockIndex !== progress.unlockedBlockIndex) {
    throw new ForbiddenError('This block is not currently active for you.');
  }

  const correct = question ? isCorrectGateAnswer(question, answer) : true; // no question on this block — reaching it is enough to advance

  progress.attempts.push({ blockIndex, questionIndex, selectedAnswer: answer, correct, attemptedAt: new Date() });

  // A block with several questions only unlocks the next block once every
  // one of them has a correct attempt on record — order doesn't matter, only
  // full coverage does.
  let blockCleared = false;
  if (correct) {
    const clearedIndices = new Set(
      progress.attempts.filter((a) => a.blockIndex === blockIndex && a.correct).map((a) => a.questionIndex)
    );
    blockCleared = questions.length === 0 || questions.every((_, qi) => clearedIndices.has(qi));
    if (blockCleared) {
      const isLastBlock = blockIndex === lesson.contentBlocks.length - 1;
      progress.unlockedBlockIndex = blockIndex + 1;
      progress.gateCompleted = isLastBlock;
    }
  }

  await progress.save();

  return ApiResponse.success(res, {
    correct,
    blockCleared,
    gateCompleted: progress.gateCompleted,
    unlockedBlockIndex: progress.unlockedBlockIndex,
    // Only worth sending on a miss — safe to reveal now since they already answered.
    explanation: !correct ? question?.explanation || undefined : undefined,
  });
};

// ---------------------------------------------------------------------------
// POST /courses/:courseId/lessons/:lessonId/video-progress
// Reports the furthest continuous position reached in the lesson's video, so
// "block forward seeking" can be enforced client-side even across reloads.
// This is pacing state (like the block reading timers), not a graded gate —
// only checkpoint answers below are server-verified.
// ---------------------------------------------------------------------------
export const updateVideoProgress = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, lessonId } = req.params;
  const { currentTime } = req.body as { currentTime?: number };

  if (typeof currentTime !== 'number' || Number.isNaN(currentTime) || currentTime < 0) {
    throw new BadRequestError('Invalid currentTime');
  }

  const lesson = await findLesson(courseId, lessonId);
  const clamped = lesson.videoDuration ? Math.min(currentTime, lesson.videoDuration) : currentTime;

  const student = await ensureStudentRecord(req.user!.userId);

  const progress = await LessonBlockProgress.findOneAndUpdate(
    { student: student._id, lessonId },
    {
      $setOnInsert: { student: student._id, course: courseId, lessonId },
      $max: { maxTimeWatched: clamped },
    },
    { new: true, upsert: true }
  );

  return ApiResponse.success(res, { maxTimeWatched: progress.maxTimeWatched });
};

// ---------------------------------------------------------------------------
// POST /courses/:courseId/lessons/:lessonId/checkpoints/:index/answer
// Grades a video checkpoint's question — mirrors submitBlockAnswer, but for
// timeline-based video gating instead of sequential content blocks.
// ---------------------------------------------------------------------------
export const submitCheckpointAnswer = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, lessonId } = req.params;
  const checkpointIndex = parseInt(req.params.index, 10);
  const { answer } = req.body;

  if (Number.isNaN(checkpointIndex) || checkpointIndex < 0) {
    throw new BadRequestError('Invalid checkpoint index');
  }

  const lesson = await findLesson(courseId, lessonId);
  const checkpoint = lesson.videoCheckpoints?.[checkpointIndex];
  if (!checkpoint) throw new NotFoundError('Video checkpoint');

  const student = await ensureStudentRecord(req.user!.userId);

  const correct = isCorrectGateAnswer(checkpoint.question, answer);

  const update: any = {
    $setOnInsert: { student: student._id, course: courseId, lessonId },
  };
  if (correct) update.$addToSet = { clearedCheckpoints: checkpointIndex };

  const progress = await LessonBlockProgress.findOneAndUpdate(
    { student: student._id, lessonId },
    update,
    { new: true, upsert: true }
  );

  return ApiResponse.success(res, {
    correct,
    clearedCheckpoints: progress.clearedCheckpoints,
    explanation: !correct ? checkpoint.question.explanation || undefined : undefined,
  });
};
