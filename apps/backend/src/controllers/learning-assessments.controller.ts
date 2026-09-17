/** Admin Learning & Assessments inventory built from real course content. */
import { Request, Response } from 'express';
import Course from '../models/course.model';
import CourseContent from '../models/course-content.model';
import ApiResponse from '../utils/api-response';
import { resolveViewableOrgId } from '../utils/tenant-scope';

function titleOf(value: any): string {
  if (typeof value === 'string') return value;
  return value?.en || value?.so || value?.ar || 'Untitled';
}

function classLabel(value: any): string {
  if (!value) return '';
  const title = typeof value.title === 'string' ? value.title : titleOf(value.title);
  return [title, value.section].filter(Boolean).join(' - ');
}

function teacherName(value: any): string {
  if (!value) return '';
  const profile = value.profile;
  const name = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') : '';
  return name || value.teacherId || '';
}

function normalizeDate(value: unknown, fallback: unknown): Date {
  const date = value ? new Date(value as any) : new Date(fallback as any);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export const getLearningAssessments = async (req: Request, res: Response): Promise<Response> => {
  const requestedSchool = typeof req.query.schoolId === 'string' ? req.query.schoolId : undefined;
  const viewableOrgId = resolveViewableOrgId(req, requestedSchool);
  const courseFilter: Record<string, unknown> = {};
  if (viewableOrgId) courseFilter.school = viewableOrgId;

  const courses = await Course.find(courseFilter)
    .select('_id title status class teacher updatedAt')
    .populate({ path: 'class', select: 'title section academicYear' })
    .populate({ path: 'teacher', select: 'teacherId profile', populate: { path: 'profile', select: 'firstName lastName' } })
    .sort({ title: 1 })
    .lean();

  const courseIds = courses.map((course: any) => course._id);
  const contents = courseIds.length
    ? await CourseContent.find({ course: { $in: courseIds } }).lean()
    : [];
  const contentMap = new Map(contents.map((content: any) => [String(content.course), content]));

  const lessons: any[] = [];
  const quizzes: any[] = [];
  const questions: any[] = [];
  let interactiveLessons = 0;

  for (const course of courses as any[]) {
    const courseId = String(course._id);
    const content: any = contentMap.get(courseId);
    if (!content) continue;
    const courseTitle = titleOf(course.title);
    const fallbackDate = content.lastSaved || course.updatedAt;

    for (const chapter of content.chapters || []) {
      const chapterTitle = chapter.title || 'General';
      for (const item of chapter.items || []) {
        const id = String(item._id || '');
        if (!id) continue;
        const updatedAt = normalizeDate(item.updatedAt || item.createdAt, fallbackDate).toISOString();

        if (item.type === 'lesson') {
          const deliveryMode = item.deliveryMode || 'traditional';
          if (deliveryMode === 'interactive_gate') interactiveLessons += 1;
          lessons.push({
            id,
            title: item.title || 'Untitled lesson',
            courseId,
            courseTitle,
            chapterTitle,
            className: classLabel(course.class),
            teacherName: teacherName(course.teacher),
            deliveryMode,
            status: item.status || course.status || 'draft',
            duration: Number(item.duration || 0),
            updatedAt,
          });
        }

        if (item.type === 'quiz') {
          const quizQuestions = Array.isArray(item.questions) ? item.questions : [];
          quizzes.push({
            id,
            title: item.title || 'Untitled quiz',
            courseId,
            courseTitle,
            chapterTitle,
            className: classLabel(course.class),
            teacherName: teacherName(course.teacher),
            questionCount: quizQuestions.length,
            passingScore: Number(item.passingScore || 0),
            maxAttempts: Number(item.maxAttempts || 0),
            status: item.status || course.status || 'draft',
            updatedAt,
          });

          quizQuestions.forEach((question: any, index: number) => {
            questions.push({
              id: `${id}:${question._id || index}`,
              quizId: id,
              quizTitle: item.title || 'Untitled quiz',
              courseId,
              courseTitle,
              chapterTitle,
              type: question.type || 'question',
              text: question.text || question.question || `Question ${index + 1}`,
              points: Number(question.points || 0),
            });
          });
        }
      }
    }
  }

  const recentActivities = [
    ...lessons.map((item) => ({ ...item, type: 'lesson' as const })),
    ...quizzes.map((item) => ({ ...item, type: 'quiz' as const })),
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 12);

  const courseOptions = (courses as any[]).map((course) => ({
    id: String(course._id),
    title: titleOf(course.title),
    className: classLabel(course.class),
    teacherName: teacherName(course.teacher),
    status: course.status,
    lessons: lessons.filter((item) => item.courseId === String(course._id)).length,
    quizzes: quizzes.filter((item) => item.courseId === String(course._id)).length,
  }));

  return ApiResponse.success(res, {
    summary: {
      courses: courses.length,
      coursesWithContent: contents.length,
      lessons: lessons.length,
      interactiveLessons,
      quizzes: quizzes.length,
      questions: questions.length,
    },
    courses: courseOptions,
    lessons,
    quizzes,
    questions,
    recentActivities,
  });
};
