import { Request, Response } from 'express';
import * as contentController from './course-content.controller';
import Student from '../models/student.model';
import { generateRandomQuizQuestions } from '../utils/random-quiz-generator';
import { sanitizeQuestionForStudent } from '../utils/question-engine';

/**
 * Wraps the existing course-content response so Manual/AI quizzes remain
 * untouched while Random Quiz quizzes are materialized per student.
 * The same student/course/quiz seed always receives the same set, so reloads
 * do not silently replace an in-progress quiz with another paper.
 */
export const getByCourse = async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'student') return contentController.getByCourse(req, res);

  let captured: any;
  const originalJson = res.json.bind(res);
  const originalJsonMethod = res.json;
  (res as any).json = (body: any) => {
    captured = body;
    return res;
  };

  try {
    await contentController.getByCourse(req, res);
    if (!captured?.success || !captured.data?.chapters) return originalJson(captured);

    const student = await Student.findOne({ user: (req.user as any).userId }).select('_id').lean();
    if (!student) return originalJson(captured);

    const content = captured.data;
    for (const chapter of content.chapters || []) {
      for (const item of chapter.items || []) {
        if (item.type !== 'quiz' || !item.randomConfig?.enabled) continue;
        const seed = `${student._id.toString()}:${content.course?.toString()}:${item._id?.toString()}:${item.randomConfig.version || 1}`;
        const generated = generateRandomQuizQuestions(content.chapters, item.randomConfig, seed);
        item.questions = generated.map(sanitizeQuestionForStudent);
        item.randomGenerated = true;
        delete item.randomConfig;
      }
    }

    return originalJson(captured);
  } finally {
    (res as any).json = originalJsonMethod;
  }
};
