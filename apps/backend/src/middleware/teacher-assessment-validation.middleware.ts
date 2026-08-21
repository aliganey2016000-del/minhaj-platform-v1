import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Course from '../models/course.model';
import { BadRequestError, ForbiddenError } from '../utils/api-error';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

const QUESTION_TYPES = new Set([
  'mcq',
  'true_false',
  'matching',
  'ordering',
  'fill_blank',
  'word_scramble',
  'sentence_build',
  'picture_choice',
  'swipe_sort',
  'listen_write',
]);

const SHOW_RESULTS = new Set(['immediately', 'after_submission', 'never']);

/**
 * Defense-in-depth validation for teacher quiz mutations.
 * Ownership is checked before accepting assessment data so a malformed or
 * cross-course request cannot reach the quiz controller.
 */
export async function validateTeacherAssessment(req: Request, _res: Response, next: NextFunction) {
  const { courseId } = req.params;
  if (!mongoose.isValidObjectId(courseId)) {
    throw new BadRequestError('Invalid course id');
  }

  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found');

  const ownedCourse = await Course.findOne({ _id: courseId, teacher: teacher._id })
    .select('_id')
    .lean();
  if (!ownedCourse) {
    throw new ForbiddenError('You can only manage assessments in courses assigned to you.');
  }

  const body = req.body || {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new BadRequestError('title must be a non-empty string');
    }
    if (body.title.trim().length > 200) {
      throw new BadRequestError('title must be 200 characters or fewer');
    }
  }

  if (body.description !== undefined && typeof body.description !== 'string') {
    throw new BadRequestError('description must be a string');
  }

  if (body.questions !== undefined) {
    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      throw new BadRequestError('questions must be a non-empty array');
    }
    if (body.questions.length > 100) {
      throw new BadRequestError('a quiz cannot contain more than 100 questions');
    }

    for (const [index, question] of body.questions.entries()) {
      if (!question || typeof question !== 'object') {
        throw new BadRequestError(`question ${index + 1} must be an object`);
      }
      if (!QUESTION_TYPES.has(question.type)) {
        throw new BadRequestError(`question ${index + 1} has an unsupported type`);
      }
      if (typeof question.question !== 'string' || !question.question.trim()) {
        throw new BadRequestError(`question ${index + 1} must have prompt text`);
      }
      if (question.points !== undefined) {
        const points = Number(question.points);
        if (!Number.isFinite(points) || points <= 0 || points > 100) {
          throw new BadRequestError(`question ${index + 1} points must be between 0 and 100`);
        }
      }
    }
  }

  if (body.timeLimit !== undefined) {
    const timeLimit = Number(body.timeLimit);
    if (!Number.isFinite(timeLimit) || timeLimit < 0 || timeLimit > 600) {
      throw new BadRequestError('timeLimit must be between 0 and 600 minutes');
    }
  }

  if (body.passingScore !== undefined) {
    const passingScore = Number(body.passingScore);
    if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
      throw new BadRequestError('passingScore must be between 0 and 100');
    }
  }

  if (body.maxAttempts !== undefined) {
    const maxAttempts = Number(body.maxAttempts);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new BadRequestError('maxAttempts must be an integer between 1 and 20');
    }
  }

  if (body.showResults !== undefined && !SHOW_RESULTS.has(body.showResults)) {
    throw new BadRequestError('showResults must be immediately, after_submission, or never');
  }

  next();
}
