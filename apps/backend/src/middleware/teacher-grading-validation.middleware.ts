import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import AssignmentSubmission from '../models/assignment-submission.model';
import Assignment from '../models/assignment.model';
import Course from '../models/course.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

const ALLOWED_STATUSES = new Set(['graded', 'returned']);

/**
 * Defense-in-depth validation for teacher grading mutations.
 * The controller also checks course ownership; this middleware additionally
 * validates the score against the assignment's real totalMarks before any
 * database mutation is attempted.
 */
export async function validateTeacherGrade(req: Request, _res: Response, next: NextFunction) {
  const { submissionId } = req.params;
  if (!mongoose.isValidObjectId(submissionId)) {
    throw new BadRequestError('Invalid submission id');
  }

  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found');

  const submission = await AssignmentSubmission.findById(submissionId)
    .select('course assignment')
    .lean();
  if (!submission) throw new NotFoundError('Submission not found');

  const ownedCourse = await Course.findOne({
    _id: submission.course,
    teacher: teacher._id,
  }).select('_id').lean();
  if (!ownedCourse) {
    throw new ForbiddenError('This submission belongs to a course you do not teach.');
  }

  const assignment = await Assignment.findById(submission.assignment)
    .select('totalMarks')
    .lean();
  if (!assignment) throw new NotFoundError('Assignment not found');

  const score = req.body?.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new BadRequestError('score must be a finite number');
  }

  if (score < 0 || score > assignment.totalMarks) {
    throw new BadRequestError(`score must be between 0 and ${assignment.totalMarks}`);
  }

  if (req.body?.status !== undefined && !ALLOWED_STATUSES.has(req.body.status)) {
    throw new BadRequestError('status must be graded or returned');
  }

  next();
}

/** Validates feedback mutations without duplicating course ownership logic in routes. */
export async function validateTeacherFeedback(req: Request, _res: Response, next: NextFunction) {
  const { submissionId } = req.params;
  if (!mongoose.isValidObjectId(submissionId)) {
    throw new BadRequestError('Invalid submission id');
  }

  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found');

  const submission = await AssignmentSubmission.findById(submissionId)
    .select('course')
    .lean();
  if (!submission) throw new NotFoundError('Submission not found');

  const ownedCourse = await Course.findOne({
    _id: submission.course,
    teacher: teacher._id,
  }).select('_id').lean();
  if (!ownedCourse) {
    throw new ForbiddenError('This submission belongs to a course you do not teach.');
  }

  const feedback = req.body?.feedback;
  if (typeof feedback !== 'string' || !feedback.trim()) {
    throw new BadRequestError('feedback text is required');
  }
  if (feedback.length > 5000) {
    throw new BadRequestError('feedback must be 5000 characters or fewer');
  }

  next();
}
