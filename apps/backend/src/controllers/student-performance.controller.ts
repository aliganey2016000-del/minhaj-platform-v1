import type { Request, Response } from 'express';
import Student from '../models/student.model';
import Course from '../models/course.model';
import CourseContent from '../models/course-content.model';
import QuizAttempt from '../models/quiz-attempt.model';
import LessonBlockProgress from '../models/lesson-block-progress.model';
import Progress from '../models/progress.model';
import ApiResponse from '../utils/api-response';
import { NotFoundError } from '../utils/api-error';

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
