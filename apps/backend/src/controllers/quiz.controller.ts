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

interface QuizAnswerSubmission {
  questionId: string;
  answer: unknown;
}

interface QuizAnswerResult {
  questionId: string;
  selectedAnswer: unknown;
  correct: boolean;
  points: number;
  explanation?: string;
}

function normalizeAnswers(submittedAnswers: any[]): Record<string, unknown> {
  const answerMap: Record<string, unknown> = {};
  if (!Array.isArray(submittedAnswers)) return answerMap;

  for (const answer of submittedAnswers) {
    if (!answer || typeof answer.questionId !== 'string') continue;
    answerMap[answer.questionId] = answer.answer;
  }

  return answerMap;
}

function arraysMatch<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function normalizeText(s: unknown): string {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

function textArraysMatch(a: unknown[], b: string[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((value, index) => normalizeText(value) === normalizeText(b[index]));
}

function compareMatching(correctPairs: any[], submittedPairs: any[]): boolean {
  if (!Array.isArray(submittedPairs) || submittedPairs.length !== correctPairs.length) {
    return false;
  }

  return correctPairs.every((correct) => {
    return submittedPairs.some(
      (submitted) =>
        submitted?.left === correct.left && submitted?.right === correct.right
    );
  });
}

function evaluateQuestion(question: any, answer: any): boolean {
  if (!question || typeof question !== 'object') return false;

  switch (question.type) {
    case 'mcq':
      // Graded by VALUE (the option text), not array index — the student
      // sees options in a server-shuffled order, so their submitted index
      // would be meaningless against the original (unshuffled) correctIndex.
      return (
        typeof answer === 'string' &&
        Array.isArray(question.options) &&
        typeof question.correctIndex === 'number' &&
        normalizeText(answer) === normalizeText(question.options[question.correctIndex])
      );

    case 'picture_choice':
      // Same reasoning as mcq, graded against each choice's image URL
      // (the stable identifier — choices are shuffled for display too).
      return (
        typeof answer === 'string' &&
        Array.isArray(question.choices) &&
        typeof question.correctIndex === 'number' &&
        answer === question.choices[question.correctIndex]?.image
      );

    case 'true_false':
      return answer === question.correctAnswer;

    case 'matching':
      return compareMatching(question.pairs || [], Array.isArray(answer) ? answer : []);

    case 'ordering':
      return Array.isArray(answer) && Array.isArray(question.items)
        ? arraysMatch(answer, question.items)
        : false;

    case 'fill_blank':
      // `answer` is one submitted word per blank, in blank order — matches
      // the real question shape (textTemplate + blanks[]), not a single
      // correctAnswer string (which this question type doesn't have).
      return Array.isArray(question.blanks) ? textArraysMatch(answer, question.blanks) : false;

    case 'word_scramble':
      return (
        typeof answer === 'string' &&
        typeof question.answer === 'string' &&
        answer.trim().toLowerCase() === question.answer.trim().toLowerCase()
      );

    case 'sentence_build':
      return Array.isArray(answer) && Array.isArray(question.words)
        ? arraysMatch(answer, question.words)
        : false;

    case 'listen_write':
      return (
        typeof answer === 'string' &&
        typeof question.correctText === 'string' &&
        answer.trim().toLowerCase() === question.correctText.trim().toLowerCase()
      );

    case 'swipe_sort':
      if (!Array.isArray(answer) || !Array.isArray(question.cards)) return false;
      return question.cards.every((card: any) => {
        const submitted = (answer as any[]).find((item) => item?.text === card.text);
        return submitted?.side === card.correctSide;
      });

    default:
      return false;
  }
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

/** Grades every question server-side and returns per-question results + totals. Explanations are only included here — never in the student-facing content payload (see stripQuizSecrets) — since this only runs after the student has already submitted an answer. */
function gradeQuiz(quizItem: any, answers: any[]) {
  const answerMap = normalizeAnswers(answers);
  const gradedAnswers: QuizAnswerResult[] = [];
  let earnedPoints = 0;
  let totalPoints = 0;

  for (const question of quizItem.questions || []) {
    const questionId = question._id?.toString();
    const selectedAnswer = questionId ? answerMap[questionId] : undefined;
    const isCorrect = evaluateQuestion(question, selectedAnswer);
    const points = typeof question.points === 'number' ? question.points : 1;

    if (isCorrect) earnedPoints += points;

    gradedAnswers.push({
      questionId,
      selectedAnswer,
      correct: isCorrect,
      points: isCorrect ? points : 0,
      explanation: !isCorrect && question.explanation ? question.explanation : undefined,
    });

    totalPoints += points;
  }

  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
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
      const total = (content.totalLessons || 0) + (content.totalQuizzes || 0) + (content.totalAssignments || 0);
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
