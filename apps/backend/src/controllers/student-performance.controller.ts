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
  periodId: string;
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

interface PerformancePeriodSeed {
  id: string;
  academicYear: string;
  class: any;
  grade?: string;
  status: 'active' | 'completed' | 'graduated';
  isCurrent: boolean;
  startedAt?: Date;
  endedAt?: Date;
  courseIds: string[];
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

function classSnapshot(value: any, fallbackTitle?: string) {
  if (!value) return fallbackTitle ? { _id: '', title: fallbackTitle } : null;
  if (typeof value === 'object' && value._id) {
    return {
      _id: String(value._id),
      title: value.title || fallbackTitle || 'Class',
      section: value.section || '',
      academicYear: value.academicYear || '',
    };
  }
  return { _id: String(value), title: fallbackTitle || 'Class', section: '', academicYear: '' };
}

function uniqueIds(values: any[]): string[] {
  return Array.from(new Set(values.map((value) => String(value?._id || value || '')).filter(Boolean)));
}

function dateValue(value: unknown): number {
  const time = value ? new Date(value as any).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function resolvePeriodId(periods: PerformancePeriodSeed[], courseId: string, activityDate: unknown): string | null {
  const candidates = periods.filter((period) => period.courseIds.includes(courseId));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  const at = dateValue(activityDate);
  if (at) {
    const exact = candidates.find((period) => {
      const start = dateValue(period.startedAt);
      const end = dateValue(period.endedAt);
      return (!start || at >= start) && (!end || at <= end);
    });
    if (exact) return exact.id;

    const startedBefore = [...candidates]
      .filter((period) => dateValue(period.startedAt) <= at)
      .sort((a, b) => dateValue(b.startedAt) - dateValue(a.startedAt))[0];
    if (startedBefore) return startedBefore.id;
  }

  return candidates.find((period) => period.isCurrent)?.id
    || [...candidates].sort((a, b) => dateValue(b.startedAt) - dateValue(a.startedAt))[0].id;
}

export const getMyPerformance = async (req: Request, res: Response): Promise<Response> => {
  const student: any = await Student.findOne({ user: req.user!.userId })
    .populate('class', 'title section academicYear')
    .populate('enrollmentHistory.class', 'title section academicYear')
    .lean();
  if (!student) throw new NotFoundError('Student');

  const currentEnrolledCourseIds = uniqueIds(student.enrolledCourses || []);
  const history = Array.isArray(student.enrollmentHistory) ? student.enrollmentHistory : [];

  let periods: PerformancePeriodSeed[] = history.map((entry: any, index: number) => ({
    id: String(entry?._id || `history-${index}`),
    academicYear: entry.academicYear || 'Academic Year',
    class: classSnapshot(entry.class, entry.grade),
    grade: entry.grade || entry.class?.title || undefined,
    status: entry.status || 'completed',
    isCurrent: false,
    startedAt: entry.startedAt ? new Date(entry.startedAt) : undefined,
    endedAt: entry.endedAt ? new Date(entry.endedAt) : undefined,
    courseIds: uniqueIds(entry.courses || []),
  }));

  const activePeriod = [...periods]
    .filter((period) => period.status === 'active')
    .sort((a, b) => dateValue(b.startedAt) - dateValue(a.startedAt))[0];

  if (activePeriod) {
    activePeriod.isCurrent = true;
    activePeriod.courseIds = uniqueIds([...activePeriod.courseIds, ...currentEnrolledCourseIds]);
  } else if (currentEnrolledCourseIds.length > 0) {
    const currentClass = classSnapshot(student.class);
    periods.push({
      id: `current:${currentClass?._id || 'unassigned'}`,
      academicYear: currentClass?.academicYear || 'Current',
      class: currentClass,
      grade: currentClass?.title,
      status: 'active',
      isCurrent: true,
      startedAt: student.enrollmentDate ? new Date(student.enrollmentDate) : undefined,
      courseIds: currentEnrolledCourseIds,
    });
  }

  periods = periods.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return dateValue(b.startedAt) - dateValue(a.startedAt);
  });

  const allCourseIds = uniqueIds(periods.flatMap((period) => period.courseIds));
  const [courses, contents, quizAttempts, gateProgress, progressDocs] = await Promise.all([
    Course.find({ _id: { $in: allCourseIds } }).select('title').lean(),
    CourseContent.find({ course: { $in: allCourseIds } }).lean(),
    QuizAttempt.find({ student: student._id, course: { $in: allCourseIds } }).sort({ createdAt: -1 }).lean(),
    LessonBlockProgress.find({ student: student._id, course: { $in: allCourseIds } }).lean(),
    Progress.find({ student: student._id, course: { $in: allCourseIds } }).lean(),
  ]);

  const courseMap = new Map(courses.map((course: any) => [String(course._id), course]));
  const contentMap = new Map(contents.map((content: any) => [String(content.course), content]));
  const progressMap = new Map(progressDocs.map((progress: any) => [String(progress.course), progress]));
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
    const courseId = String(attempt.course);
    const periodId = resolvePeriodId(periods, courseId, attempt.createdAt);
    if (!periodId) continue;
    const key = `${periodId}:${courseId}:${String(attempt.quizId)}`;
    quizAttemptCount.set(key, (quizAttemptCount.get(key) || 0) + 1);
    if (!latestQuizByKey.has(key)) latestQuizByKey.set(key, attempt);
  }

  for (const [key, attempt] of latestQuizByKey) {
    const item = itemMap.get(String(attempt.quizId));
    if (!item) continue;
    const periodId = key.split(':', 1)[0];
    activities.push({
      id: String(attempt._id),
      periodId,
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      chapterTitle: item.chapterTitle,
      title: item.title,
      type: 'quiz',
      score: Number(attempt.score || 0),
      total: Number(attempt.totalPoints || 0),
      percentage: Math.round(Number(attempt.percentage || 0)),
      status: attempt.passed ? 'Completed' : 'Needs Review',
      date: new Date(attempt.createdAt || 0),
      attempts: quizAttemptCount.get(key) || 1,
    });
  }

  for (const gate of gateProgress as any[]) {
    if (!(gate.attempts || []).length) continue;
    const item = itemMap.get(String(gate.lessonId));
    if (!item) continue;
    const date = gate.updatedAt || gate.createdAt;
    const periodId = resolvePeriodId(periods, item.courseId, date);
    if (!periodId) continue;
    const score = gateScore(gate);
    activities.push({
      id: String(gate._id),
      periodId,
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      chapterTitle: item.chapterTitle,
      title: item.title,
      type: 'interactive_lesson',
      score: score.score,
      total: score.total,
      percentage: score.percentage,
      status: gate.gateCompleted ? 'Completed' : 'In Progress',
      date: new Date(date || 0),
    });
  }

  activities.sort((a, b) => b.date.getTime() - a.date.getTime());
  const avg = (rows: ActivityRow[]) => rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length)
    : 0;

  const coursePeriodCount = new Map<string, number>();
  for (const period of periods) {
    for (const courseId of period.courseIds) {
      coursePeriodCount.set(courseId, (coursePeriodCount.get(courseId) || 0) + 1);
    }
  }

  const periodPayloads = periods.map((period) => {
    const periodActivities = activities.filter((row) => row.periodId === period.id);
    const existingCourseIds = period.courseIds.filter((courseId) => courseMap.has(courseId));
    const periodCourses = existingCourseIds.map((courseId) => {
      const course: any = courseMap.get(courseId);
      const content: any = contentMap.get(courseId);
      const progress: any = progressMap.get(courseId);
      const courseActivities = periodActivities.filter((row) => row.courseId === courseId);
      const progressAvailable = (coursePeriodCount.get(courseId) || 0) === 1 || period.isCurrent;
      const completed = progressAvailable
        ? Number(progress?.completedLessons || 0) + Number(progress?.completedQuizzes || 0) + Number(progress?.completedAssignments || 0)
        : 0;
      const totalItems = progressAvailable ? Number(progress?.totalItems || 0) : 0;
      return {
        courseId,
        title: course.title,
        lessonsCompleted: progressAvailable ? Number(progress?.completedLessons || 0) : 0,
        totalLessons: Number(content?.totalLessons || 0),
        quizzesCompleted: progressAvailable ? Number(progress?.completedQuizzes || 0) : 0,
        totalQuizzes: Number(content?.totalQuizzes || 0),
        averageScore: avg(courseActivities),
        progressPercent: totalItems ? Math.min(100, Math.round((completed / totalItems) * 100)) : 0,
        progressAvailable,
      };
    });

    const interactive = periodActivities.filter((row) => row.type === 'interactive_lesson');
    const quizzes = periodActivities.filter((row) => row.type === 'quiz');
    const totalActivities = existingCourseIds.reduce((sum, courseId) => {
      const content: any = contentMap.get(courseId);
      if (!content) return sum;
      let interactiveCount = 0;
      for (const chapter of content.chapters || []) {
        for (const item of chapter.items || []) {
          if (item.type === 'lesson' && item.deliveryMode === 'interactive_gate') interactiveCount += 1;
        }
      }
      return sum + interactiveCount + Number(content.totalQuizzes || 0);
    }, 0);

    return {
      id: period.id,
      academicYear: period.academicYear,
      class: period.class,
      grade: period.grade,
      status: period.status,
      isCurrent: period.isCurrent,
      startedAt: period.startedAt || null,
      endedAt: period.endedAt || null,
      summary: {
        overallScore: avg(periodActivities),
        interactiveLessonAvg: avg(interactive),
        quizAvg: avg(quizzes),
        completedActivities: periodActivities.filter((row) => row.status === 'Completed').length,
        totalActivities,
      },
      courses: periodCourses,
      activities: periodActivities,
    };
  });

  const currentPeriod = periodPayloads.find((period) => period.isCurrent) || periodPayloads[0] || null;
  const currentActivities: ActivityRow[] = currentPeriod?.activities || [];
  const areaMap = new Map<string, number[]>();
  for (const row of currentActivities) {
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
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const rows = currentActivities.filter((row) => row.date >= day && row.date < next);
    return { date: day.toISOString(), count: rows.length, averageScore: avg(rows) };
  });

  const emptySummary = {
    overallScore: 0,
    interactiveLessonAvg: 0,
    quizAvg: 0,
    completedActivities: 0,
    totalActivities: 0,
  };

  return ApiResponse.success(res, {
    student: { class: classSnapshot(student.class) },
    summary: currentPeriod?.summary || emptySummary,
    courses: currentPeriod?.courses || [],
    activities: currentPeriod?.activities || [],
    periods: periodPayloads,
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
