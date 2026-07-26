/**
 * Quiz Controller
 *
 * Handles secure student quiz evaluation without exposing correct answers
 * in the student-facing content payload.
 */

import mongoose from 'mongoose';
import { Request, Response } from 'express';
import Course from '../models/course.model';
import CourseContent from '../models/course-content.model';
import Progress from '../models/progress.model';
import QuizAttempt from '../models/quiz-attempt.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import Student from '../models/student.model';
import { awardQuizXP, QuizXPResult } from './gamification.controller';
import { logActivityFromRequest } from '../utils/learning-activity-logger';
import { gradeQuestionSet } from '../utils/question-engine';

function normalizeAnswers(submittedAnswers: any[]): Record<string, unknown> {
  const answerMap: Record<string, unknown> = {};
  if (!Array.isArray(submittedAnswers)) return answerMap;

  for (const answer of submittedAnswers) {
    if (!answer || typeof answer.questionId !== 'string') continue;
    answerMap[answer.questionId] = answer.answer;
  }

  return answerMap;
}

/** Locates the quiz subdocument by id within a course's content, or null. */
function findQuizItem(content: any, quizId: string): any {
  for (const chapter of content.chapters || []) {
    for (const item of chapter.items || []) {
      if (item.type === 'quiz' && item._id?.toString() === quizId) return item;
    }
  }
  return null;
}

/** Grades every question server-side and returns per-question results + totals, plus the quiz's own pass/fail threshold. Explanations are only included here — never in the student-facing content payload (see stripQuizSecrets) — since this only runs after the student has already submitted an answer. */
function gradeQuiz(quizItem: any, answers: any[]) {
  const answerMap = normalizeAnswers(answers);
  const { gradedAnswers, earnedPoints, totalPoints, percentage } = gradeQuestionSet(quizItem.questions || [], answerMap);
  const passed = percentage >= (quizItem.passingScore || 60);

  return { gradedAnswers, earnedPoints, totalPoints, percentage, passed };
}

export const checkQuiz = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, quizId, answers } = req.body;

  if (!courseId || !quizId || !Array.isArray(answers)) {
    throw new BadRequestError('courseId, quizId, and answers are required');
  }

  const course = await Course.findById(courseId).select('_id');
  if (!course) {
    throw new NotFoundError('Course');
  }

  const student = await Student.findOne({ user: (req.user as any).userId, enrolledCourses: courseId }).select('_id').lean();
  if (!student) {
    throw new ForbiddenError('You are not enrolled in this course');
  }

  const content = await CourseContent.findOne({ course: courseId }).lean();
  if (!content) {
    throw new NotFoundError('Course content not found');
  }

  const quizItem = findQuizItem(content, quizId);
  if (!quizItem) {
    throw new NotFoundError('Quiz not found');
  }

  const { gradedAnswers, earnedPoints, totalPoints, percentage, passed } = gradeQuiz(quizItem, answers);

  return ApiResponse.success(res, {
    correct: passed,
    score: earnedPoints,
    totalPoints,
    percentage,
    passed,
    answers: gradedAnswers,
  });
};

// ---------------------------------------------------------------------------
// POST /quizzes/submit-attempt
//
// The authoritative, atomic quiz-submission endpoint: grades server-side
// (same evaluateQuestion as checkQuiz — the client never has the answer
// key), then in a single Mongo transaction records the QuizAttempt, bumps
// Progress.completedQuizzes, and awards Gamification XP/badges — but only
// on the student's FIRST attempt at this quiz, so retries can't farm XP.
// ---------------------------------------------------------------------------
export const submitAttempt = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, quizId, answers, durationSeconds } = req.body;

  if (!courseId || !quizId || !Array.isArray(answers)) {
    throw new BadRequestError('courseId, quizId, and answers are required');
  }

  const course = await Course.findById(courseId).select('_id title');
  if (!course) throw new NotFoundError('Course');

  const student = await Student.findOne({ user: (req.user as any).userId, enrolledCourses: courseId }).select('_id school').lean();
  if (!student) throw new ForbiddenError('You are not enrolled in this course');

  const content = await CourseContent.findOne({ course: courseId }).lean();
  if (!content) throw new NotFoundError('Course content not found');

  const quizItem = findQuizItem(content, quizId);
  if (!quizItem) throw new NotFoundError('Quiz not found');

  const { gradedAnswers, earnedPoints, totalPoints, percentage, passed } = gradeQuiz(quizItem, answers);
  const safeDuration = Math.max(0, parseInt(durationSeconds, 10) || 0);

  // No multi-document transaction here — this deployment's MongoDB runs as
  // a standalone instance (no replica set), which doesn't support
  // transactions at all: `session.withTransaction()` throws immediately
  // ("Transaction numbers are only allowed on a replica set member or
  // mongos"), and previously had no catch here, so every quiz submission
  // was failing with an uncaught 500. Writes below run as plain sequential
  // operations instead — not atomic, but functional.
  let gamification: QuizXPResult | null = null;
  let isFirstAttempt = !(await QuizAttempt.exists({ student: student._id, quizId }));

  await QuizAttempt.create({
    student: student._id,
    course: courseId,
    quizId,
    answers: gradedAnswers.map((a) => ({
      questionId: a.questionId,
      selectedAnswer: a.selectedAnswer,
      correct: a.correct,
      points: a.points,
    })),
    score: earnedPoints,
    totalPoints,
    percentage,
    passed,
    durationSeconds: safeDuration,
    isFirstAttempt,
  });

  void logActivityFromRequest(req, {
    student: (student as any)._id,
    school: (student as any).school,
    type: 'quiz_attempt',
    course: courseId,
    resourceName: (quizItem as any).title,
    status: passed ? 'passed' : 'failed',
    durationSeconds: safeDuration,
    percent: percentage,
    metadata: { score: earnedPoints, totalPoints, isFirstAttempt },
  });

  if (isFirstAttempt) {
    let progress = await Progress.findOne({ student: student._id, course: courseId });
    if (!progress) {
      const total = (content.totalLessons || 0) + (content.totalQuizzes || 0) + (content.totalAssignments || 0) + (content.totalExams || 0);
      progress = await Progress.create({ student: student._id, course: courseId, completedQuizzes: 1, totalItems: total, lastAccessed: new Date(), status: 'in_progress' });
    } else {
      progress.completedQuizzes += 1;
      const done = progress.completedLessons + progress.completedQuizzes + progress.completedAssignments;
      if (done >= progress.totalItems && progress.totalItems > 0) progress.status = 'completed';
      progress.lastAccessed = new Date();
      await progress.save();
    }

    gamification = await awardQuizXP(
      student._id.toString(),
      (req.user as any).userId,
      { score: earnedPoints, totalQuestions: quizItem.questions?.length || 0, timeSpentSeconds: safeDuration },
    );
  }

  const gam = gamification as QuizXPResult | null;

  return ApiResponse.success(res, {
    correct: passed,
    score: earnedPoints,
    totalPoints,
    percentage,
    passed,
    answers: gradedAnswers,
    isFirstAttempt,
    xpEarned: gam?.xpEarned,
    levelUp: gam?.levelUp,
    newLevel: gam?.level,
    newBadges: gam?.newBadgeKeys,
  });
};
