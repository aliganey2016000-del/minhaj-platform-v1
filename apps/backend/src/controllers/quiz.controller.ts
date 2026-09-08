/**
 * Quiz Controller
 *
 * Handles secure student quiz evaluation without exposing correct answers
 * in the student-facing content payload.
 */

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
import { generateRandomQuizQuestions } from '../utils/random-quiz-generator';

function normalizeAnswers(submittedAnswers: any[]): Record<string, unknown> {
  const answerMap: Record<string, unknown> = {};
  if (!Array.isArray(submittedAnswers)) return answerMap;
  for (const answer of submittedAnswers) {
    if (!answer || typeof answer.questionId !== 'string') continue;
    answerMap[answer.questionId] = answer.answer;
  }
  return answerMap;
}

function findQuizItem(content: any, quizId: string): any {
  for (const chapter of content.chapters || []) {
    for (const item of chapter.items || []) {
      if (item.type === 'quiz' && item._id?.toString() === quizId) return item;
    }
  }
  return null;
}

function resolveQuizQuestions(content: any, quizItem: any, studentId: string): any[] {
  if (!quizItem?.randomConfig?.enabled) return quizItem.questions || [];
  try {
    const seed = `${studentId}:${content.course?.toString()}:${quizItem._id?.toString()}:${quizItem.randomConfig.version || 1}`;
    return generateRandomQuizQuestions(content.chapters || [], quizItem.randomConfig, seed);
  } catch (error: any) {
    throw new BadRequestError(error?.message || 'Random quiz configuration is invalid');
  }
}

function gradeQuiz(questions: any[], answers: any[]) {
  const answerMap = normalizeAnswers(answers);
  const { gradedAnswers, earnedPoints, totalPoints, percentage } = gradeQuestionSet(questions || [], answerMap);
  return { gradedAnswers, earnedPoints, totalPoints, percentage };
}

export const checkQuiz = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, quizId, answers } = req.body;
  if (!courseId || !quizId || !Array.isArray(answers)) throw new BadRequestError('courseId, quizId, and answers are required');

  const course = await Course.findById(courseId).select('_id');
  if (!course) throw new NotFoundError('Course');
  const student = await Student.findOne({ user: (req.user as any).userId, enrolledCourses: courseId }).select('_id').lean();
  if (!student) throw new ForbiddenError('You are not enrolled in this course');

  const content = await CourseContent.findOne({ course: courseId }).lean();
  if (!content) throw new NotFoundError('Course content not found');
  const quizItem = findQuizItem(content, quizId);
  if (!quizItem) throw new NotFoundError('Quiz not found');

  const questions = resolveQuizQuestions(content, quizItem, student._id.toString());
  const { gradedAnswers, earnedPoints, totalPoints, percentage } = gradeQuiz(questions, answers);
  const passed = percentage >= (quizItem.passingScore || 60);
  return ApiResponse.success(res, { correct: passed, score: earnedPoints, totalPoints, percentage, passed, answers: gradedAnswers });
};

export const submitAttempt = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, quizId, answers, durationSeconds } = req.body;
  if (!courseId || !quizId || !Array.isArray(answers)) throw new BadRequestError('courseId, quizId, and answers are required');

  const course = await Course.findById(courseId).select('_id title');
  if (!course) throw new NotFoundError('Course');
  const student = await Student.findOne({ user: (req.user as any).userId, enrolledCourses: courseId }).select('_id school').lean();
  if (!student) throw new ForbiddenError('You are not enrolled in this course');

  const content = await CourseContent.findOne({ course: courseId }).lean();
  if (!content) throw new NotFoundError('Course content not found');
  const quizItem = findQuizItem(content, quizId);
  if (!quizItem) throw new NotFoundError('Quiz not found');

  const questions = resolveQuizQuestions(content, quizItem, student._id.toString());
  const { gradedAnswers, earnedPoints, totalPoints, percentage } = gradeQuiz(questions, answers);
  const passed = percentage >= (quizItem.passingScore || 60);
  const safeDuration = Math.max(0, parseInt(durationSeconds, 10) || 0);

  let gamification: QuizXPResult | null = null;
  const isFirstAttempt = !(await QuizAttempt.exists({ student: student._id, quizId }));

  await QuizAttempt.create({
    student: student._id,
    course: courseId,
    quizId,
    answers: gradedAnswers.map((a) => ({ questionId: a.questionId, selectedAnswer: a.selectedAnswer, correct: a.correct, points: a.points })),
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
    lessonId: quizId,
    lessonTitle: (quizItem as any).title,
    resourceName: (quizItem as any).title,
    status: passed ? 'passed' : 'failed',
    durationSeconds: safeDuration,
    percent: percentage,
    metadata: { score: earnedPoints, totalPoints, isFirstAttempt, randomQuiz: Boolean(quizItem.randomConfig?.enabled) },
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
      { score: earnedPoints, totalQuestions: questions.length, timeSpentSeconds: safeDuration },
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
