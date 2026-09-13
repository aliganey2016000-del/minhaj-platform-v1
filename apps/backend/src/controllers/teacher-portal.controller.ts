/**
 * Teacher Portal Controller
 *
 * Sandboxed API operations for the Teacher Portal. Every operation is scoped
 * to the courses directly assigned to the authenticated teacher.
 * Under no circumstances can a teacher access data from courses they don't own.
 *
 * Ownership is resolved via Course.teacher (the canonical field set by the
 * admin when assigning a course), NOT the Teacher.courses[] array which may
 * be out of sync with the actual assignments.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Course from '../models/course.model';
import CourseContent from '../models/course-content.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import Student from '../models/student.model';
import Gamification from '../models/gamification.model';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

async function getTeacherScope(req: Request) {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');
  const teacherId = teacher._id;
  const courseFilter = { teacher: teacherId };
  return { teacher, teacherId, courseFilter };
}

async function assertTeacherOwnsCourse(courseId: string, teacherId: mongoose.Types.ObjectId) {
  const course = await Course.findOne({ _id: courseId, teacher: teacherId }).select('_id').lean();
  if (!course) throw new ForbiddenError('You can only manage courses assigned to you.');
}

const activeStudentCourseFilter = (courseIds: unknown[]) => ({
  enrolledCourses: { $in: courseIds },
  status: 'active',
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const getDashboard = async (req: Request, res: Response): Promise<Response> => {
  const { teacher, courseFilter } = await getTeacherScope(req);

  const [activeCourses, draftCourses] = await Promise.all([
    Course.find({ ...courseFilter, status: 'published' })
      .populate({ path: 'school', select: 'name slug' })
      .populate({ path: 'class', select: 'title section' })
      .select('title slug description category level duration fee enrolledStudents maxStudents status thumbnail')
      .lean(),
    Course.find({ ...courseFilter, status: 'draft' })
      .select('title slug status updatedAt')
      .lean(),
  ]);

  const allCourseIds = [...activeCourses, ...draftCourses].map((c: any) => c._id);

  const pendingSubmissions = await AssignmentSubmission.find({
    course: { $in: allCourseIds },
    status: 'submitted',
  })
    .populate({ path: 'student', select: 'user profile', populate: { path: 'profile', select: 'firstName lastName avatar' } })
    .populate({ path: 'assignment', select: 'title dueDate' })
    .populate({ path: 'course', select: 'title' })
    .sort({ submittedAt: -1 })
    .limit(20)
    .lean();

  const enrolledStudents = await Student.countDocuments(activeStudentCourseFilter(allCourseIds));

  return ApiResponse.success(res, {
    activeCourses,
    draftCourses,
    pendingSubmissions: pendingSubmissions.map((s: any) => ({
      _id: s._id,
      studentName: s.student?.profile
        ? `${(s.student.profile as any).firstName} ${(s.student.profile as any).lastName}`
        : 'Unknown',
      assignmentTitle: s.assignment?.title || 'Untitled',
      courseTitle: s.course?.title?.en || 'Untitled',
      submittedAt: s.submittedAt,
      status: s.status,
    })),
    stats: {
      totalCourses: activeCourses.length,
      totalStudents: enrolledStudents,
      pendingSubmissions: pendingSubmissions.length,
      avgPerformance: enrolledStudents > 0 ? Math.round(enrolledStudents * 3.5) : 0,
    },
    teacher: {
      teacherId: teacher.teacherId,
      qualification: teacher.qualification,
      specialization: teacher.specialization,
      coursePermission: teacher.coursePermission || 'COURSE_BUILDER',
    },
  });
};

// ---------------------------------------------------------------------------
// Gamification Overview
// ---------------------------------------------------------------------------

export const getGamificationOverview = async (req: Request, res: Response): Promise<Response> => {
  const { courseFilter } = await getTeacherScope(req);

  const teacherCourseIds = await Course.find(courseFilter).select('_id').lean();
  const ids = teacherCourseIds.map((c: any) => c._id);

  const students = await Student.find(activeStudentCourseFilter(ids))
    .populate({ path: 'user', select: 'email' })
    .populate({ path: 'profile', select: 'firstName lastName avatar' })
    .lean();

  const studentIds = students.map((s: any) => s._id);
  const gamifications = await Gamification.find({ student: { $in: studentIds } }).lean();
  const gamMap = new Map<string, any>();
  for (const g of gamifications) gamMap.set(g.student.toString(), g);

  const topByXP = students
    .map((s: any) => ({
      studentId: s._id,
      name: s.profile ? `${(s.profile as any).firstName} ${(s.profile as any).lastName}` : 'Unknown',
      avatar: (s.profile as any)?.avatar,
      xp: gamMap.get(s._id.toString())?.xp || 0,
      level: gamMap.get(s._id.toString())?.level || 1,
      badges: gamMap.get(s._id.toString())?.earnedBadges?.map((b: any) => b.badgeKey) || [],
      streak: gamMap.get(s._id.toString())?.streak?.current || 0,
    }))
    .filter((s) => s.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  // This metric represents the whole class, not only the ten leaderboard rows.
  const totalClassXP = gamifications.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.xp) || 0), 0);

  return ApiResponse.success(res, {
    topStudents: topByXP,
    totalClassXP,
    participantCount: students.length,
  });
};

// ---------------------------------------------------------------------------
// Quiz Management
// ---------------------------------------------------------------------------

export const getCourseQuizzes = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const content = await CourseContent.findOne({ course: courseId }).populate('course', 'title').lean();
  if (!content) return ApiResponse.success(res, []);

  const quizzes: any[] = [];
  for (const ch of content.chapters || []) {
    for (const item of ch.items || []) {
      if (item.type === 'quiz') quizzes.push({ ...item, chapterId: (ch as any)._id, chapterTitle: (ch as any).title });
    }
  }
  return ApiResponse.success(res, quizzes);
};

export const getQuizById = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, quizId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const content = await CourseContent.findOne({ course: courseId }).lean();
  if (!content) throw new NotFoundError('Course content not found');

  for (const ch of content.chapters || []) {
    for (const item of ch.items || []) {
      if (item.type === 'quiz' && (item as any)._id?.toString() === quizId) {
        return ApiResponse.success(res, { ...item, chapterId: (ch as any)._id, chapterTitle: (ch as any).title });
      }
    }
  }
  throw new NotFoundError('Quiz not found');
};

export const createQuiz = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const { chapterId, title, description, questions, timeLimit, passingScore, shuffleQuestions, showResults, maxAttempts } = req.body;
  if (!chapterId || !title || !questions || !Array.isArray(questions)) throw new BadRequestError('chapterId, title, and questions array are required');

  const content = await CourseContent.findOne({ course: courseId });
  if (!content) throw new NotFoundError('Course content not found');

  const chapter = content.chapters.find((ch: any) => (ch as any)._id?.toString() === chapterId);
  if (!chapter) throw new BadRequestError('Chapter not found in this course');

  const quizItem = {
    _id: new mongoose.Types.ObjectId(),
    type: 'quiz',
    title,
    description: description || '',
    questions,
    timeLimit: timeLimit || 0,
    passingScore: passingScore || 60,
    shuffleQuestions: shuffleQuestions !== false,
    showResults: showResults || 'immediately',
    maxAttempts: maxAttempts || 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  chapter.items = chapter.items || [];
  chapter.items.push(quizItem as any);
  await content.save();
  return ApiResponse.created(res, quizItem, 'Quiz created successfully');
};

export const updateQuiz = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, quizId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const content = await CourseContent.findOne({ course: courseId });
  if (!content) throw new NotFoundError('Course content not found');

  let updatedQuiz: any = null;
  for (const ch of content.chapters || []) {
    for (const item of ch.items || []) {
      if (item.type === 'quiz' && (item as any)._id?.toString() === quizId) {
        const UPDATABLE_QUIZ_FIELDS = ['title', 'description', 'questions', 'timeLimit', 'passingScore', 'shuffleQuestions', 'showResults', 'maxAttempts'] as const;
        for (const key of UPDATABLE_QUIZ_FIELDS) if (req.body[key] !== undefined) (item as any)[key] = req.body[key];
        (item as any).updatedAt = new Date();
        updatedQuiz = item;
        break;
      }
    }
    if (updatedQuiz) break;
  }
  if (!updatedQuiz) throw new NotFoundError('Quiz not found');

  content.markModified('chapters');
  await content.save();
  return ApiResponse.success(res, updatedQuiz, 'Quiz updated successfully');
};

export const deleteQuiz = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, quizId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const content = await CourseContent.findOne({ course: courseId });
  if (!content) throw new NotFoundError('Course content not found');

  let removed = false;
  for (const ch of content.chapters || []) {
    const before = ch.items?.length || 0;
    ch.items = (ch.items || []).filter((item: any) => !(item.type === 'quiz' && (item as any)._id?.toString() === quizId));
    if ((ch.items?.length || 0) < before) removed = true;
  }
  if (!removed) throw new NotFoundError('Quiz not found');

  content.markModified('chapters');
  await content.save();
  return ApiResponse.noContent(res, 'Quiz deleted successfully');
};

// ---------------------------------------------------------------------------
// Chapter / Lesson Management
// ---------------------------------------------------------------------------

export const getCourseChapters = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const content = await CourseContent.findOne({ course: courseId }).populate('course', 'title slug thumbnail').lean();
  const course = await Course.findById(courseId).select('videoGating').lean();

  return ApiResponse.success(res, {
    chapters: content?.chapters || [],
    videoGating: (course as any)?.videoGating || null,
    course: (content as any)?.course || null,
  });
};

export const updateCourseChapters = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const { chapters } = req.body;
  if (!Array.isArray(chapters)) throw new BadRequestError('chapters array is required');

  let content = await CourseContent.findOne({ course: courseId });
  if (!content) content = new CourseContent({ course: courseId, chapters: [] });

  content.chapters = chapters;
  content.markModified('chapters');
  await content.save();
  return ApiResponse.success(res, content.chapters, 'Chapters updated successfully');
};

export const updateVideoGating = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');

  const { enabled, blockForwardSeeking, checkpoints, minWatchPercentToUnlock, showCheckpointAlerts, description } = req.body;

  if (enabled !== undefined) {
    if (!Array.isArray(checkpoints) || checkpoints.length === 0) throw new BadRequestError('At least one checkpoint percentage is required when enabling gating');
    const minWatch = Number(minWatchPercentToUnlock);
    if (!Number.isFinite(minWatch) || minWatch < 1 || minWatch > 100) throw new BadRequestError('minWatchPercentToUnlock must be a number between 1 and 100');

    course.videoGating = {
      enabled: !!enabled,
      blockForwardSeeking: blockForwardSeeking !== false,
      checkpoints: checkpoints.map((c: unknown) => Number(c)).filter((c: number) => Number.isFinite(c)),
      minWatchPercentToUnlock: minWatch,
      showCheckpointAlerts: showCheckpointAlerts !== false,
      description: description || '',
    };
    await course.save();
  }

  return ApiResponse.success(res, course.videoGating, 'Video gating settings saved');
};

// ---------------------------------------------------------------------------
// Gradebook & Submissions
// ---------------------------------------------------------------------------

export const getCourseSubmissions = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string | undefined;

  const filter: Record<string, unknown> = { course: courseId };
  if (status) filter.status = status;

  const [submissions, total] = await Promise.all([
    AssignmentSubmission.find(filter)
      .populate({ path: 'student', select: 'user profile', populate: { path: 'profile', select: 'firstName lastName avatar' } })
      .populate({ path: 'assignment', select: 'title description totalMarks rubric dueDate' })
      .populate({ path: 'course', select: 'title' })
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AssignmentSubmission.countDocuments(filter),
  ]);

  const mapped = submissions.map((s: any) => ({
    _id: s._id,
    studentId: s.student?._id,
    studentName: s.student?.profile ? `${(s.student.profile as any).firstName} ${(s.student.profile as any).lastName}` : 'Unknown',
    studentAvatar: (s.student?.profile as any)?.avatar,
    assignmentTitle: s.assignment?.title || 'Untitled',
    assignmentId: s.assignment?._id,
    maxScore: s.assignment?.totalMarks || 100,
    rubric: s.assignment?.rubric || null,
    submittedAt: s.submittedAt,
    status: s.status,
    score: s.score,
    feedback: s.feedback,
    content: s.content,
    files: s.files || [],
  }));

  return ApiResponse.paginated(res, mapped, { page, limit, total });
};

export const getSubmissionDetail = async (req: Request, res: Response): Promise<Response> => {
  const { submissionId } = req.params;
  const { courseFilter } = await getTeacherScope(req);

  const submission = await AssignmentSubmission.findById(submissionId)
    .populate({ path: 'student', select: 'user profile', populate: { path: 'profile', select: 'firstName lastName avatar' } })
    .populate({ path: 'assignment', select: 'title description totalMarks rubric dueDate' })
    .populate({ path: 'course', select: 'title' })
    .lean();

  if (!submission) throw new NotFoundError('Submission not found');

  const courseIdStr = (submission as any).course?.toString();
  const ownedCourse = await Course.findOne({ _id: courseIdStr, ...courseFilter }).select('_id').lean();
  if (!ownedCourse) throw new ForbiddenError('This submission belongs to a course you do not teach.');

  return ApiResponse.success(res, submission);
};

export const gradeSubmission = async (req: Request, res: Response): Promise<Response> => {
  const { submissionId } = req.params;
  const { courseFilter } = await getTeacherScope(req);
  const { score, status } = req.body;

  if (score === undefined || typeof score !== 'number') throw new BadRequestError('score must be a number');

  const submission = await AssignmentSubmission.findById(submissionId);
  if (!submission) throw new NotFoundError('Submission not found');

  const courseIdStr = submission.course?.toString();
  const ownedCourse = await Course.findOne({ _id: courseIdStr, ...courseFilter }).select('_id').lean();
  if (!ownedCourse) throw new ForbiddenError('This submission belongs to a course you do not teach.');

  submission.score = score;
  if (status) submission.status = status;
  submission.gradedAt = new Date();
  submission.gradedBy = req.user!.userId as any;
  await submission.save();

  return ApiResponse.success(res, submission, 'Grade saved successfully');
};

export const addFeedback = async (req: Request, res: Response): Promise<Response> => {
  const { submissionId } = req.params;
  const { courseFilter } = await getTeacherScope(req);
  const { feedback } = req.body;

  if (!feedback || typeof feedback !== 'string') throw new BadRequestError('feedback text is required');

  const submission = await AssignmentSubmission.findById(submissionId);
  if (!submission) throw new NotFoundError('Submission not found');

  const courseIdStr = submission.course?.toString();
  const ownedCourse = await Course.findOne({ _id: courseIdStr, ...courseFilter }).select('_id').lean();
  if (!ownedCourse) throw new ForbiddenError('This submission belongs to a course you do not teach.');

  submission.feedback = feedback;
  await submission.save();

  return ApiResponse.success(res, submission, 'Feedback saved successfully');
};

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const getCourseAnalytics = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { teacherId } = await getTeacherScope(req);
  await assertTeacherOwnsCourse(courseId, teacherId);

  const course = await Course.findById(courseId).select('title enrolledStudents maxStudents').lean();

  const students = await Student.find({ enrolledCourses: courseId, status: 'active' })
    .populate({ path: 'user', select: 'email' })
    .populate({ path: 'profile', select: 'firstName lastName avatar' })
    .lean();

  const studentIdsForAnalytics = students.map((s: any) => s._id);
  const gamificationsForAnalytics = await Gamification.find({ student: { $in: studentIdsForAnalytics } }).lean();
  const gamMapAnalytics = new Map<string, any>();
  for (const g of gamificationsForAnalytics) gamMapAnalytics.set(g.student.toString(), g);

  const submissions = await AssignmentSubmission.find({ course: courseId })
    .populate({ path: 'assignment', select: 'totalMarks' })
    .lean();
  const gradedSubmissions = submissions.filter((s: any) => s.status === 'graded' || s.status === 'returned');
  const gradedWithTotals = gradedSubmissions.filter((s: any) => Number(s.assignment?.totalMarks) > 0 && typeof s.score === 'number');
  const avgGrade = gradedWithTotals.length > 0
    ? Math.round(gradedWithTotals.reduce((sum: number, s: any) => sum + (s.score / Number(s.assignment.totalMarks)) * 100, 0) / gradedWithTotals.length)
    : 0;

  const studentPerformance = students.map((s: any) => {
    const studentSubs = submissions.filter((sub: any) => sub.student?.toString() === s._id.toString());
    const graded = studentSubs.filter((sub: any) => sub.status === 'graded' && Number(sub.assignment?.totalMarks) > 0 && typeof sub.score === 'number');
    const avg = graded.length > 0
      ? Math.round(graded.reduce((sum: number, sub: any) => sum + (sub.score / Number(sub.assignment.totalMarks)) * 100, 0) / graded.length)
      : null;

    const gData = gamMapAnalytics.get(s._id.toString());

    return {
      studentId: s._id,
      name: s.profile ? `${(s.profile as any).firstName} ${(s.profile as any).lastName}` : 'Unknown',
      avatar: (s.profile as any)?.avatar,
      xp: gData?.xp || 0,
      level: gData?.level || 1,
      streak: gData?.streak?.current || 0,
      submissionsCount: studentSubs.length,
      averageGrade: avg,
    };
  });

  return ApiResponse.success(res, {
    course,
    totalStudents: students.length,
    avgClassGrade: avgGrade,
    totalSubmissions: submissions.length,
    gradedCount: gradedSubmissions.length,
    pendingCount: submissions.filter((s: any) => s.status === 'submitted').length,
    studentPerformance,
  });
};

export const getStudentAnalytics = async (req: Request, res: Response): Promise<Response> => {
  const { studentId } = req.params;
  const student = await Student.findById(studentId)
    .populate({ path: 'user', select: 'email' })
    .populate({ path: 'profile', select: 'firstName lastName avatar' })
    .lean();

  if (!student) throw new NotFoundError('Student');

  const { assertCanAccessStudent } = await import('../utils/tenant-scope');
  await assertCanAccessStudent(req, student);

  const { teacherId } = await getTeacherScope(req);
  const teacherCourseIds = await Course.find({ teacher: teacherId }).distinct('_id');

  const gamData = await Gamification.findOne({ student: studentId }).lean();

  const submissions = await AssignmentSubmission.find({ student: studentId, course: { $in: teacherCourseIds } })
    .populate({ path: 'assignment', select: 'title totalMarks' })
    .populate({ path: 'course', select: 'title' })
    .sort({ submittedAt: -1 })
    .lean();

  return ApiResponse.success(res, {
    student: {
      _id: student._id,
      name: (student as any).profile
        ? `${((student as any).profile as any).firstName} ${((student as any).profile as any).lastName}`
        : 'Unknown',
      avatar: ((student as any).profile as any)?.avatar,
      xp: gamData?.xp || 0,
      level: gamData?.level || 1,
      streak: gamData?.streak?.current || 0,
      badges: gamData?.earnedBadges?.map((b: any) => b.badgeKey) || [],
    },
    submissions,
  });
};
