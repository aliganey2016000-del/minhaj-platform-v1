import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import Student from '../models/student.model';
import Course from '../models/course.model';
import CourseContent from '../models/course-content.model';
import QuizAttempt from '../models/quiz-attempt.model';
import LessonBlockProgress from '../models/lesson-block-progress.model';
import Progress from '../models/progress.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

type ActivityType = 'interactive_lesson' | 'quiz';

interface ActivityRow {
  id: string;
  courseId: string;
  courseTitle: any;
  chapterTitle: string;
  title: string;
  type: ActivityType;
  score: number;
  total: number;
  percentage: number;
  status: string;
  date: Date;
  attempts?: number;
}

function gateScore(progress: any) {
  const firstByQuestion = new Map<string, any>();
  for (const attempt of progress.attempts || []) {
    const key = `${attempt.blockIndex}:${attempt.questionIndex ?? 0}`;
    if (!firstByQuestion.has(key)) firstByQuestion.set(key, attempt);
  }
  const firstAttempts = Array.from(firstByQuestion.values());
  const total = firstAttempts.length;
  const score = firstAttempts.filter((a: any) => a.correct).length;
  return { score, total, percentage: total ? Math.round((score / total) * 100) : 0 };
}

function findContentItem(content: any, itemId: string) {
  for (const chapter of content?.chapters || []) {
    for (const item of chapter.items || []) {
      if (String(item?._id || '') === itemId) {
        return { item, chapterTitle: chapter.title || 'General' };
      }
    }
  }
  return null;
}

function blockQuestions(block: any): any[] {
  if (Array.isArray(block?.questions)) return block.questions;
  return block?.question ? [block.question] : [];
}

function correctAnswerFor(question: any): unknown {
  switch (question?.type) {
    case 'mcq':
      return Array.isArray(question.options) && typeof question.correctIndex === 'number'
        ? question.options[question.correctIndex]
        : null;
    case 'picture_choice':
      if (!Array.isArray(question.choices) || typeof question.correctIndex !== 'number') return null;
      return question.choices[question.correctIndex] || null;
    case 'true_false':
      return typeof question.correctAnswer === 'boolean' ? question.correctAnswer : null;
    case 'matching':
      return Array.isArray(question.pairs) ? question.pairs : [];
    case 'ordering':
      return Array.isArray(question.items) ? question.items : [];
    case 'swipe_sort':
      return Array.isArray(question.cards)
        ? question.cards.map((card: any) => ({ text: card.text, side: card.correctSide }))
        : [];
    case 'listen_write':
      return question.correctText ?? null;
    case 'fill_blank':
      return Array.isArray(question.blanks) ? question.blanks : [];
    case 'word_scramble':
      return question.answer ?? null;
    case 'sentence_build':
      return Array.isArray(question.words) ? question.words : [];
    default:
      return null;
  }
}

function displayAnswer(question: any, answer: unknown): unknown {
  if (answer === undefined || answer === null) return null;

  if (question?.type === 'picture_choice' && typeof answer === 'string' && Array.isArray(question.choices)) {
    const choice = question.choices.find((entry: any) => entry?.image === answer);
    return choice?.label || answer;
  }

  if (question?.type === 'mcq' && typeof answer === 'number' && Array.isArray(question.options)) {
    return question.options[answer] ?? answer;
  }

  if (question?.type === 'true_false' && typeof answer === 'boolean') {
    return answer ? 'True' : 'False';
  }

  return answer;
}

export const getMyPerformance = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findOne({ user: req.user!.userId })
    .populate('class', 'title section')
    .lean();
  if (!student) throw new NotFoundError('Student');

  const courseIds = (student.enrolledCourses || []).map((id: any) => String(id));
  if (courseIds.length === 0) {
    return ApiResponse.success(res, {
      student: { class: (student as any).class || null },
      summary: { overallScore: 0, interactiveLessonAvg: 0, quizAvg: 0, completedActivities: 0, totalActivities: 0 },
      courses: [], activities: [], weekly: [], strongAreas: [], areasToImprove: [],
    });
  }

  const [courses, contents, quizAttempts, gateProgress, progressDocs] = await Promise.all([
    Course.find({ _id: { $in: courseIds } }).select('title').lean(),
    CourseContent.find({ course: { $in: courseIds } }).lean(),
    QuizAttempt.find({ student: student._id, course: { $in: courseIds } }).sort({ createdAt: -1 }).lean(),
    LessonBlockProgress.find({ student: student._id, course: { $in: courseIds } }).lean(),
    Progress.find({ student: student._id, course: { $in: courseIds } }).lean(),
  ]);

  const courseMap = new Map(courses.map((c: any) => [String(c._id), c]));
  const contentMap = new Map(contents.map((c: any) => [String(c.course), c]));
  const progressMap = new Map(progressDocs.map((p: any) => [String(p.course), p]));
  const itemMap = new Map<string, { courseId: string; courseTitle: any; title: string; type: string; chapterTitle: string }>();

  for (const content of contents as any[]) {
    const courseId = String(content.course);
    const courseTitle = courseMap.get(courseId)?.title || { en: 'Course', so: 'Course', ar: 'Course' };
    for (const chapter of content.chapters || []) {
      for (const item of chapter.items || []) {
        if (!item?._id) continue;
        itemMap.set(String(item._id), {
          courseId,
          courseTitle,
          title: item.title || 'Untitled',
          type: item.type,
          chapterTitle: chapter.title || 'General',
        });
      }
    }
  }

  const activities: ActivityRow[] = [];
  const latestQuizByKey = new Map<string, any>();
  const quizAttemptCount = new Map<string, number>();
  for (const attempt of quizAttempts as any[]) {
    const key = `${String(attempt.course)}:${String(attempt.quizId)}`;
    quizAttemptCount.set(key, (quizAttemptCount.get(key) || 0) + 1);
    if (!latestQuizByKey.has(key)) latestQuizByKey.set(key, attempt);
  }

  for (const [key, attempt] of latestQuizByKey) {
    const item = itemMap.get(String(attempt.quizId));
    if (!item) continue;
    activities.push({
      id: String(attempt._id),
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      chapterTitle: item.chapterTitle,
      title: item.title,
      type: 'quiz',
      score: Number(attempt.score || 0),
      total: Number(attempt.totalPoints || 0),
      percentage: Math.round(Number(attempt.percentage || 0)),
      status: attempt.passed ? 'Completed' : 'Needs Review',
      date: attempt.createdAt,
      attempts: quizAttemptCount.get(key) || 1,
    });
  }

  for (const gate of gateProgress as any[]) {
    if (!(gate.attempts || []).length) continue;
    const item = itemMap.get(String(gate.lessonId));
    if (!item) continue;
    const score = gateScore(gate);
    activities.push({
      id: String(gate._id),
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      chapterTitle: item.chapterTitle,
      title: item.title,
      type: 'interactive_lesson',
      score: score.score,
      total: score.total,
      percentage: score.percentage,
      status: gate.gateCompleted ? 'Completed' : 'In Progress',
      date: gate.updatedAt || gate.createdAt,
    });
  }

  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const interactive = activities.filter((a) => a.type === 'interactive_lesson');
  const quizzes = activities.filter((a) => a.type === 'quiz');
  const avg = (rows: ActivityRow[]) => rows.length ? Math.round(rows.reduce((s, r) => s + r.percentage, 0) / rows.length) : 0;

  const courseRows = courses.map((course: any) => {
    const courseId = String(course._id);
    const content: any = contentMap.get(courseId);
    const progress: any = progressMap.get(courseId);
    const courseActivities = activities.filter((a) => a.courseId === courseId);
    const completed = Number(progress?.completedLessons || 0) + Number(progress?.completedQuizzes || 0) + Number(progress?.completedAssignments || 0);
    const totalItems = Number(progress?.totalItems || 0);
    return {
      courseId,
      title: course.title,
      lessonsCompleted: Number(progress?.completedLessons || 0),
      totalLessons: Number(content?.totalLessons || 0),
      quizzesCompleted: Number(progress?.completedQuizzes || 0),
      totalQuizzes: Number(content?.totalQuizzes || 0),
      averageScore: avg(courseActivities),
      progressPercent: totalItems ? Math.min(100, Math.round((completed / totalItems) * 100)) : 0,
    };
  });

  const areaMap = new Map<string, number[]>();
  for (const row of activities) {
    const list = areaMap.get(row.chapterTitle) || [];
    list.push(row.percentage);
    areaMap.set(row.chapterTitle, list);
  }
  const areas = Array.from(areaMap.entries()).map(([name, scores]) => ({
    name,
    score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  })).sort((a, b) => b.score - a.score);

  const now = new Date();
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - index));
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const rows = activities.filter((a) => {
      const at = new Date(a.date);
      return at >= d && at < next;
    });
    return { date: d.toISOString(), count: rows.length, averageScore: avg(rows) };
  });

  const totalActivities = contents.reduce((sum: number, content: any) => {
    let interactiveCount = 0;
    for (const chapter of content.chapters || []) {
      for (const item of chapter.items || []) {
        if (item.type === 'lesson' && item.deliveryMode === 'interactive_gate') interactiveCount += 1;
      }
    }
    return sum + interactiveCount + Number(content.totalQuizzes || 0);
  }, 0);

  return ApiResponse.success(res, {
    student: { class: (student as any).class || null },
    summary: {
      overallScore: avg(activities),
      interactiveLessonAvg: avg(interactive),
      quizAvg: avg(quizzes),
      completedActivities: activities.filter((a) => a.status === 'Completed').length,
      totalActivities,
    },
    courses: courseRows,
    activities,
    weekly,
    strongAreas: areas.slice(0, 3),
    areasToImprove: [...areas].sort((a, b) => a.score - b.score).slice(0, 3),
  });
};

export const getMyAttemptDetail = async (req: Request, res: Response): Promise<Response> => {
  const { type, id } = req.params;
  if (type !== 'quiz' && type !== 'interactive_lesson') {
    throw new BadRequestError('type must be quiz or interactive_lesson');
  }
  if (!mongoose.Types.ObjectId.isValid(id)) throw new NotFoundError('Attempt');

  const student = await Student.findOne({ user: req.user!.userId }).select('_id').lean();
  if (!student) throw new NotFoundError('Student');

  if (type === 'quiz') {
    const attempt: any = await QuizAttempt.findOne({ _id: id, student: student._id }).lean();
    if (!attempt) throw new NotFoundError('Quiz attempt');

    const [course, content, attemptHistory] = await Promise.all([
      Course.findById(attempt.course).select('title').lean(),
      CourseContent.findOne({ course: attempt.course }).lean(),
      QuizAttempt.find({
        student: student._id,
        course: attempt.course,
        quizId: attempt.quizId,
      }).sort({ createdAt: 1 }).lean(),
    ]);
    if (!content) throw new NotFoundError('Course content');

    const located = findContentItem(content, String(attempt.quizId));
    if (!located || located.item?.type !== 'quiz') throw new NotFoundError('Quiz');

    const answerMap = new Map((attempt.answers || []).map((answer: any) => [String(answer.questionId), answer]));
    const questions = (located.item.questions || []).map((question: any, index: number) => {
      const questionId = String(question?._id || '');
      const answer: any = answerMap.get(questionId);
      const possiblePoints = typeof question.points === 'number' ? question.points : 1;
      const rawCorrectAnswer = correctAnswerFor(question);
      return {
        key: questionId || `question-${index}`,
        number: index + 1,
        questionId,
        type: question.type || 'mcq',
        question: question.question || `Question ${index + 1}`,
        selectedAnswer: answer?.selectedAnswer ?? null,
        selectedAnswerDisplay: displayAnswer(question, answer?.selectedAnswer),
        correctAnswer: rawCorrectAnswer,
        correctAnswerDisplay: displayAnswer(question, rawCorrectAnswer),
        correct: Boolean(answer?.correct),
        earnedPoints: Number(answer?.points || 0),
        possiblePoints,
        explanation: question.explanation || '',
      };
    });

    const history = (attemptHistory as any[]).map((row, index) => ({
      id: String(row._id),
      attemptNumber: index + 1,
      score: Number(row.score || 0),
      totalPoints: Number(row.totalPoints || 0),
      percentage: Math.round(Number(row.percentage || 0)),
      passed: Boolean(row.passed),
      durationSeconds: Number(row.durationSeconds || 0),
      isFirstAttempt: Boolean(row.isFirstAttempt),
      date: row.createdAt,
    }));
    const attemptNumber = Math.max(1, history.find((row) => row.id === String(attempt._id))?.attemptNumber || history.length);

    return ApiResponse.success(res, {
      type: 'quiz',
      course: { id: String(attempt.course), title: (course as any)?.title || 'Course' },
      chapterTitle: located.chapterTitle,
      activity: {
        id: String(attempt._id),
        title: located.item.title || 'Quiz',
        status: attempt.passed ? 'Passed' : 'Needs Review',
        date: attempt.createdAt,
      },
      summary: {
        score: Number(attempt.score || 0),
        totalPoints: Number(attempt.totalPoints || 0),
        percentage: Math.round(Number(attempt.percentage || 0)),
        passed: Boolean(attempt.passed),
        attemptNumber,
        totalAttempts: history.length,
        durationSeconds: Number(attempt.durationSeconds || 0),
      },
      questions,
      attemptHistory: history,
    });
  }

  const gate: any = await LessonBlockProgress.findOne({ _id: id, student: student._id }).lean();
  if (!gate) throw new NotFoundError('Interactive lesson attempt');

  const [course, content] = await Promise.all([
    Course.findById(gate.course).select('title').lean(),
    CourseContent.findOne({ course: gate.course }).lean(),
  ]);
  if (!content) throw new NotFoundError('Course content');

  const located = findContentItem(content, String(gate.lessonId));
  if (!located || located.item?.type !== 'lesson') throw new NotFoundError('Lesson');

  const attemptsByQuestion = new Map<string, any[]>();
  for (const row of gate.attempts || []) {
    const key = `${row.blockIndex}:${row.questionIndex ?? 0}`;
    const list = attemptsByQuestion.get(key) || [];
    list.push(row);
    attemptsByQuestion.set(key, list);
  }

  const questions: any[] = [];
  for (let blockIndex = 0; blockIndex < (located.item.contentBlocks || []).length; blockIndex += 1) {
    const block = located.item.contentBlocks[blockIndex];
    const blockQuestionList = blockQuestions(block);
    for (let questionIndex = 0; questionIndex < blockQuestionList.length; questionIndex += 1) {
      const question = blockQuestionList[questionIndex];
      const key = `${blockIndex}:${questionIndex}`;
      const history = (attemptsByQuestion.get(key) || [])
        .sort((a: any, b: any) => new Date(a.attemptedAt).getTime() - new Date(b.attemptedAt).getTime());
      if (history.length === 0) continue;

      const first = history[0];
      const rawCorrectAnswer = correctAnswerFor(question);
      questions.push({
        key,
        number: questions.length + 1,
        type: question.type || 'mcq',
        question: question.question || `Question ${questions.length + 1}`,
        blockTitle: block.title || `Section ${blockIndex + 1}`,
        selectedAnswer: first.selectedAnswer ?? null,
        selectedAnswerDisplay: displayAnswer(question, first.selectedAnswer),
        correctAnswer: rawCorrectAnswer,
        correctAnswerDisplay: displayAnswer(question, rawCorrectAnswer),
        correct: Boolean(first.correct),
        earnedPoints: first.correct ? 1 : 0,
        possiblePoints: 1,
        explanation: question.explanation || '',
        attempts: history.map((row: any, index: number) => ({
          attemptNumber: index + 1,
          selectedAnswer: row.selectedAnswer ?? null,
          selectedAnswerDisplay: displayAnswer(question, row.selectedAnswer),
          correct: Boolean(row.correct),
          attemptedAt: row.attemptedAt,
          timeSpentSeconds: Number(row.timeSpentSeconds || 0),
        })),
      });
    }
  }

  const score = gateScore(gate);
  return ApiResponse.success(res, {
    type: 'interactive_lesson',
    course: { id: String(gate.course), title: (course as any)?.title || 'Course' },
    chapterTitle: located.chapterTitle,
    activity: {
      id: String(gate._id),
      title: located.item.title || 'Interactive Lesson',
      status: gate.gateCompleted ? 'Completed' : 'In Progress',
      date: gate.updatedAt || gate.createdAt,
    },
    summary: {
      score: score.score,
      totalPoints: score.total,
      percentage: score.percentage,
      passed: Boolean(gate.gateCompleted),
      attemptNumber: 1,
      totalAttempts: Number((gate.attempts || []).length),
      durationSeconds: Number((gate.attempts || []).reduce(
        (sum: number, row: any) => sum + Number(row.timeSpentSeconds || 0),
        0,
      )),
    },
    questions,
    attemptHistory: [],
  });
};
