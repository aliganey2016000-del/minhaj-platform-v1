import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import Course from '../models/course.model';
import CourseContent from '../models/course-content.model';
import Student from '../models/student.model';
import QuizAttempt from '../models/quiz-attempt.model';
import LessonBlockProgress from '../models/lesson-block-progress.model';
import Progress from '../models/progress.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { getOwnTeacherRecord, resolveViewableOrgId } from '../utils/tenant-scope';

type ActivityType = 'quiz' | 'interactive_lesson';

type ActivityRow = {
  id: string;
  studentId: string;
  courseId: string;
  chapterTitle: string;
  title: string;
  type: ActivityType;
  score: number;
  total: number;
  percentage: number;
  status: string;
  date: Date;
  attempts: number;
};

type CourseDoc = any;
type StudentDoc = any;

const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
const average = (values: number[]) => values.length
  ? clamp(values.reduce((sum, value) => sum + value, 0) / values.length)
  : 0;

function objectIdQuery(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value);
  if (!mongoose.isValidObjectId(text)) throw new BadRequestError(`${label} is invalid.`);
  return text;
}

function localizedTitle(value: any) {
  return value || { en: 'Course', so: '', ar: '' };
}

function classSnapshot(value: any) {
  if (!value) return null;
  return {
    id: String(value._id || value),
    title: value.title || 'Class',
    section: value.section || '',
    academicYear: value.academicYear || '',
  };
}

function teacherSnapshot(value: any) {
  if (!value) return null;
  const profile = value.profile;
  const name = profile
    ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
    : (value.teacherId || 'Teacher');
  return {
    id: String(value._id || value),
    teacherId: value.teacherId || '',
    name: name || value.teacherId || 'Teacher',
  };
}

function studentSnapshot(student: StudentDoc) {
  const profile = student.profile;
  const name = profile
    ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
    : student.studentId;
  return {
    id: String(student._id),
    studentId: student.studentId,
    name: name || student.studentId,
    avatar: profile?.avatar || null,
    class: classSnapshot(student.class),
  };
}

function gateScore(progress: any) {
  const firstByQuestion = new Map<string, any>();
  for (const attempt of progress.attempts || []) {
    const key = `${attempt.blockIndex}:${attempt.questionIndex ?? 0}`;
    if (!firstByQuestion.has(key)) firstByQuestion.set(key, attempt);
  }
  const firstAttempts = Array.from(firstByQuestion.values());
  const total = firstAttempts.length;
  const score = firstAttempts.filter((attempt: any) => attempt.correct).length;
  return { score, total, percentage: total ? clamp((score / total) * 100) : 0 };
}

function courseStudentKey(courseId: unknown, studentId: unknown) {
  return `${String(courseId)}:${String(studentId)}`;
}

function buildInsights(rows: ActivityRow[]) {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const key = row.chapterTitle?.trim() || 'General';
    const values = grouped.get(key) || [];
    values.push(row.percentage);
    grouped.set(key, values);
  }
  const areas = Array.from(grouped.entries()).map(([name, scores]) => ({ name, score: average(scores) }));
  return {
    strongAreas: areas.filter((area) => area.score >= 70).sort((a, b) => b.score - a.score).slice(0, 3),
    areasToImprove: areas.filter((area) => area.score < 70).sort((a, b) => a.score - b.score).slice(0, 3),
  };
}

async function fetchCourses(filter: Record<string, unknown>): Promise<CourseDoc[]> {
  return Course.find(filter)
    .select('_id title class teacher school status')
    .populate({ path: 'class', select: 'title section academicYear' })
    .populate({
      path: 'teacher',
      select: 'teacherId profile',
      populate: { path: 'profile', select: 'firstName lastName' },
    })
    .sort({ 'title.en': 1 })
    .lean();
}

async function buildPayload(courses: CourseDoc[], selectedCourseId?: string, selectedStudentId?: string) {
  const courseIds = courses.map((course) => course._id);
  if (courseIds.length === 0) {
    return {
      summary: { courses: 0, students: 0, averageScore: 0, quizAverage: 0, interactiveAverage: 0, completedActivities: 0 },
      courses: [],
      selectedCourse: null,
      studentDetail: null,
    };
  }

  if (selectedCourseId && !courses.some((course) => String(course._id) === selectedCourseId)) {
    throw new ForbiddenError('This course is outside your accessible performance scope.');
  }
  if (selectedStudentId && !selectedCourseId) {
    throw new BadRequestError('courseId is required when requesting a student performance detail.');
  }

  const students: StudentDoc[] = await Student.find({
    status: 'active',
    enrolledCourses: { $in: courseIds },
  })
    .select('_id studentId profile class enrolledCourses')
    .populate({ path: 'profile', select: 'firstName lastName avatar' })
    .populate({ path: 'class', select: 'title section academicYear' })
    .sort({ studentId: 1 })
    .lean();

  const studentIds = students.map((student) => student._id);
  const [contents, quizAttempts, gates, progressDocs] = await Promise.all([
    CourseContent.find({ course: { $in: courseIds } }).lean(),
    QuizAttempt.find({ student: { $in: studentIds }, course: { $in: courseIds } }).sort({ createdAt: -1 }).lean(),
    LessonBlockProgress.find({ student: { $in: studentIds }, course: { $in: courseIds } }).lean(),
    Progress.find({ student: { $in: studentIds }, course: { $in: courseIds } }).lean(),
  ]);

  const contentMap = new Map(contents.map((content: any) => [String(content.course), content]));
  const progressMap = new Map(progressDocs.map((progress: any) => [courseStudentKey(progress.course, progress.student), progress]));
  const itemMap = new Map<string, { courseId: string; title: string; chapterTitle: string; type: string }>();

  for (const content of contents as any[]) {
    const courseId = String(content.course);
    for (const chapter of content.chapters || []) {
      for (const item of chapter.items || []) {
        if (!item?._id) continue;
        itemMap.set(String(item._id), {
          courseId,
          title: item.title || 'Untitled',
          chapterTitle: chapter.title || 'General',
          type: item.type,
        });
      }
    }
  }

  const activities: ActivityRow[] = [];
  const latestQuiz = new Map<string, any>();
  const quizAttemptCount = new Map<string, number>();

  for (const attempt of quizAttempts as any[]) {
    const key = `${String(attempt.student)}:${String(attempt.course)}:${String(attempt.quizId)}`;
    quizAttemptCount.set(key, (quizAttemptCount.get(key) || 0) + 1);
    if (!latestQuiz.has(key)) latestQuiz.set(key, attempt);
  }

  for (const [key, attempt] of latestQuiz) {
    const item = itemMap.get(String(attempt.quizId));
    if (!item || item.courseId !== String(attempt.course)) continue;
    activities.push({
      id: String(attempt._id),
      studentId: String(attempt.student),
      courseId: String(attempt.course),
      chapterTitle: item.chapterTitle,
      title: item.title,
      type: 'quiz',
      score: Number(attempt.score || 0),
      total: Number(attempt.totalPoints || 0),
      percentage: clamp(Number(attempt.percentage || 0)),
      status: attempt.passed ? 'Completed' : 'Needs Review',
      date: new Date(attempt.createdAt || 0),
      attempts: quizAttemptCount.get(key) || 1,
    });
  }

  for (const gate of gates as any[]) {
    if (!(gate.attempts || []).length) continue;
    const item = itemMap.get(String(gate.lessonId));
    if (!item || item.courseId !== String(gate.course)) continue;
    const score = gateScore(gate);
    activities.push({
      id: String(gate._id),
      studentId: String(gate.student),
      courseId: String(gate.course),
      chapterTitle: item.chapterTitle,
      title: item.title,
      type: 'interactive_lesson',
      score: score.score,
      total: score.total,
      percentage: score.percentage,
      status: gate.gateCompleted ? 'Completed' : 'In Progress',
      date: new Date(gate.updatedAt || gate.createdAt || 0),
      attempts: Number((gate.attempts || []).length) || 1,
    });
  }

  activities.sort((a, b) => b.date.getTime() - a.date.getTime());
  const studentById = new Map(students.map((student) => [String(student._id), student]));

  const courseRows = courses.map((course) => {
    const courseId = String(course._id);
    const enrolled = students.filter((student) => (student.enrolledCourses || []).some((id: any) => String(id) === courseId));
    const courseActivities = activities.filter((row) => row.courseId === courseId);
    const quizRows = courseActivities.filter((row) => row.type === 'quiz');
    const interactiveRows = courseActivities.filter((row) => row.type === 'interactive_lesson');
    return {
      courseId,
      title: localizedTitle(course.title),
      class: classSnapshot(course.class),
      teacher: teacherSnapshot(course.teacher),
      status: course.status,
      students: enrolled.length,
      averageScore: average(courseActivities.map((row) => row.percentage)),
      quizAverage: average(quizRows.map((row) => row.percentage)),
      interactiveAverage: average(interactiveRows.map((row) => row.percentage)),
      completedActivities: courseActivities.filter((row) => row.status === 'Completed').length,
    };
  });

  const uniqueStudents = new Set(students.map((student) => String(student._id)));
  const allQuizRows = activities.filter((row) => row.type === 'quiz');
  const allInteractiveRows = activities.filter((row) => row.type === 'interactive_lesson');
  const summary = {
    courses: courses.length,
    students: uniqueStudents.size,
    averageScore: average(activities.map((row) => row.percentage)),
    quizAverage: average(allQuizRows.map((row) => row.percentage)),
    interactiveAverage: average(allInteractiveRows.map((row) => row.percentage)),
    completedActivities: activities.filter((row) => row.status === 'Completed').length,
  };

  let selectedCourse: any = null;
  let studentDetail: any = null;

  if (selectedCourseId) {
    const course = courses.find((entry) => String(entry._id) === selectedCourseId)!;
    const content: any = contentMap.get(selectedCourseId);
    const enrolled = students.filter((student) => (student.enrolledCourses || []).some((id: any) => String(id) === selectedCourseId));
    const studentRows = enrolled.map((student) => {
      const studentId = String(student._id);
      const rows = activities.filter((row) => row.courseId === selectedCourseId && row.studentId === studentId);
      const quizRows = rows.filter((row) => row.type === 'quiz');
      const interactiveRows = rows.filter((row) => row.type === 'interactive_lesson');
      const progress: any = progressMap.get(courseStudentKey(selectedCourseId, studentId));
      const completed = Number(progress?.completedLessons || 0)
        + Number(progress?.completedQuizzes || 0)
        + Number(progress?.completedAssignments || 0);
      const totalItems = Number(progress?.totalItems || 0);
      return {
        ...studentSnapshot(student),
        averageScore: average(rows.map((row) => row.percentage)),
        quizAverage: average(quizRows.map((row) => row.percentage)),
        interactiveAverage: average(interactiveRows.map((row) => row.percentage)),
        activitiesCompleted: rows.filter((row) => row.status === 'Completed').length,
        lessonsCompleted: Number(progress?.completedLessons || 0),
        totalLessons: Number(content?.totalLessons || 0),
        quizzesCompleted: Number(progress?.completedQuizzes || 0),
        totalQuizzes: Number(content?.totalQuizzes || 0),
        progressPercent: totalItems ? clamp((completed / totalItems) * 100) : 0,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const courseActivities = activities.filter((row) => row.courseId === selectedCourseId);
    const quizRows = courseActivities.filter((row) => row.type === 'quiz');
    const interactiveRows = courseActivities.filter((row) => row.type === 'interactive_lesson');
    selectedCourse = {
      courseId: selectedCourseId,
      title: localizedTitle(course.title),
      class: classSnapshot(course.class),
      teacher: teacherSnapshot(course.teacher),
      summary: {
        students: studentRows.length,
        averageScore: average(courseActivities.map((row) => row.percentage)),
        quizAverage: average(quizRows.map((row) => row.percentage)),
        interactiveAverage: average(interactiveRows.map((row) => row.percentage)),
        completedActivities: courseActivities.filter((row) => row.status === 'Completed').length,
      },
      students: studentRows,
    };

    if (selectedStudentId) {
      const student = studentById.get(selectedStudentId);
      const isEnrolled = student && (student.enrolledCourses || []).some((id: any) => String(id) === selectedCourseId);
      if (!student || !isEnrolled) throw new NotFoundError('Student performance');
      const rows = activities.filter((row) => row.courseId === selectedCourseId && row.studentId === selectedStudentId);
      const metric = studentRows.find((row) => row.id === selectedStudentId);
      const insights = buildInsights(rows);
      studentDetail = {
        student: studentSnapshot(student),
        course: { id: selectedCourseId, title: localizedTitle(course.title), class: classSnapshot(course.class) },
        summary: metric || null,
        activities: rows,
        ...insights,
      };
    }
  }

  return { summary, courses: courseRows, selectedCourse, studentDetail };
}

export const getTeacherPerformance = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');

  const courseId = objectIdQuery(req.query.courseId, 'courseId');
  const studentId = objectIdQuery(req.query.studentId, 'studentId');
  const courses = await fetchCourses({ teacher: teacher._id });
  const payload = await buildPayload(courses, courseId, studentId);

  return ApiResponse.success(res, {
    scope: 'teacher',
    filters: {
      courses: payload.courses.map((course: any) => ({ id: course.courseId, title: course.title, class: course.class })),
      classes: [],
      teachers: [],
    },
    ...payload,
  });
};

export const getAdminPerformance = async (req: Request, res: Response): Promise<Response> => {
  const courseId = objectIdQuery(req.query.courseId, 'courseId');
  const studentId = objectIdQuery(req.query.studentId, 'studentId');
  const classId = objectIdQuery(req.query.classId, 'classId');
  const teacherId = objectIdQuery(req.query.teacherId, 'teacherId');
  const schoolId = objectIdQuery(req.query.schoolId, 'schoolId');
  const viewableOrgId = resolveViewableOrgId(req, schoolId);

  const baseFilter: Record<string, unknown> = {};
  if (viewableOrgId) baseFilter.school = viewableOrgId;

  const optionCourses = await fetchCourses(baseFilter);
  const filter: Record<string, unknown> = { ...baseFilter };
  if (classId) filter.class = classId;
  if (teacherId) filter.teacher = teacherId;
  const courses = (classId || teacherId) ? await fetchCourses(filter) : optionCourses;
  const payload = await buildPayload(courses, courseId, studentId);

  const classMap = new Map<string, any>();
  const teacherMap = new Map<string, any>();
  for (const course of optionCourses) {
    const klass = classSnapshot(course.class);
    if (klass?.id) classMap.set(klass.id, klass);
    const teacher = teacherSnapshot(course.teacher);
    if (teacher?.id) teacherMap.set(teacher.id, teacher);
  }

  return ApiResponse.success(res, {
    scope: 'admin',
    filters: {
      courses: optionCourses.map((course) => ({
        id: String(course._id),
        title: localizedTitle(course.title),
        class: classSnapshot(course.class),
        teacher: teacherSnapshot(course.teacher),
      })),
      classes: Array.from(classMap.values()).sort((a, b) => `${a.title} ${a.section}`.localeCompare(`${b.title} ${b.section}`)),
      teachers: Array.from(teacherMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    },
    ...payload,
  });
};
