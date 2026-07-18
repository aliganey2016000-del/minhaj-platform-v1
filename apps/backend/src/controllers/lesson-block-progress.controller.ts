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

  return ApiResponse.success(res, progress || { unlockedBlockIndex: 0, gateCompleted: false, attempts: [] });
};

// ---------------------------------------------------------------------------
// POST /courses/:courseId/lessons/:lessonId/blocks/:blockIndex/answer
// ---------------------------------------------------------------------------
export const submitBlockAnswer = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, lessonId } = req.params;
  const blockIndex = parseInt(req.params.blockIndex, 10);
  const { answer } = req.body;

  if (Number.isNaN(blockIndex) || blockIndex < 0) {
    throw new BadRequestError('Invalid block index');
  }

  const lesson = await findLesson(courseId, lessonId);
  if (lesson.deliveryMode !== 'interactive_gate' || !lesson.contentBlocks?.length) {
    throw new BadRequestError('This lesson does not use Interactive Gate delivery');
  }
  const block = lesson.contentBlocks[blockIndex];
  if (!block) throw new NotFoundError('Content block');

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

  const correct = block.question
    ? block.question.type === 'mcq'
      ? answer === block.question.correctOptionIndex
      : answer === block.question.correctAnswer
    : true; // no question on this block — reaching it is enough to advance

  progress.attempts.push({ blockIndex, selectedAnswer: answer, correct, attemptedAt: new Date() });

  if (correct) {
    const isLastBlock = blockIndex === lesson.contentBlocks.length - 1;
    progress.unlockedBlockIndex = blockIndex + 1;
    progress.gateCompleted = isLastBlock;
  }

  await progress.save();

  return ApiResponse.success(res, {
    correct,
    gateCompleted: progress.gateCompleted,
    unlockedBlockIndex: progress.unlockedBlockIndex,
    // Only worth sending on a miss — safe to reveal now since they already answered.
    explanation: !correct ? block.question?.explanation || undefined : undefined,
  });
};
