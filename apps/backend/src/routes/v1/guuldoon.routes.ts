import deviceRoutes, { promoteGuuldoonDeviceCookie, requireGuuldoonDevice } from './guuldoon-device.routes';
import guuldoonImportRoutes from './guuldoon-import.routes';
import guuldoonBuilderRoutes from './guuldoon-builder.routes';
import { Router, Request } from 'express';
import mongoose from 'mongoose';
import Profile from '../../models/profile.model';
import Course from '../../models/course.model';
import CourseContent from '../../models/course-content.model';
import Student from '../../models/student.model';
import ClassModel from '../../models/class.model';
import Teacher from '../../models/teacher.model';
import Progress from '../../models/progress.model';
import Subscription from '../../models/global-subscription.model';
import GuuldoonConfig from '../../models/guuldoon-course-config.model';
import GuuldoonExam from '../../models/guuldoon-past-exam.model';
import GuuldoonQuestion from '../../models/guuldoon-question.model';
import GuuldoonAttempt from '../../models/guuldoon-attempt.model';
import GuuldoonPracticeResult from '../../models/guuldoon-practice-result.model';
import GuuldoonMistake from '../../models/guuldoon-mistake.model';
import GuuldoonChapter from '../../models/guuldoon-chapter.model';
import GuuldoonResource from '../../models/guuldoon-resource.model';
import GuuldoonGlossary from '../../models/guuldoon-glossary.model';
import GuuldoonSubject from '../../models/guuldoon-subject.model';
import GuuldoonUnmatchedAnswer from '../../models/guuldoon-unmatched-answer.model';
import { describeAnswer, gradeAnswer, isAnswerSpec, isAutoMarkable, normalizeText } from '../../services/guuldoon-marking.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';

const router = Router();
const leitnerDays = [1, 2, 4, 7, 14];

router.use(authMiddleware);
router.use((req, _res, next) => {
  if (!['admin', 'org_admin', 'teacher', 'student'].includes(req.user?.role || '') || req.user?.isStaff) {
    return next(new ForbiddenError('Guuldoon access denied'));
  }
  if (req.user?.role !== 'admin' && !req.user?.organizationId) {
    return next(new ForbiddenError('Organization required'));
  }
  next();
});

router.use('/devices', deviceRoutes);
router.use('/admin/import', guuldoonImportRoutes);
router.use('/admin/builder', guuldoonBuilderRoutes);

function objectId(value: string, label = 'ID'): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) throw new BadRequestError(`Invalid ${label}`);
  return new mongoose.Types.ObjectId(value);
}

async function loadGlobalCourse(courseId: string, publishedOnly = true) {
  const course = await Course.findOne({
    _id: objectId(courseId, 'course ID'),
    scope: 'global',
    ...(publishedOnly ? { status: 'published' } : {}),
  }).select('_id title description thumbnail globalGrade scope status').lean();
  if (!course) throw new NotFoundError('Guuldoon course');
  return course as any;
}

async function loadStudentAccess(req: Request, courseId: string, requireEnrollment = true) {
  if (req.user?.role !== 'student' || req.user.isStaff) throw new ForbiddenError('Student access required');
  const course = await loadGlobalCourse(courseId, true);

  const student = await Student.findOne({
    user: req.user.userId,
    school: req.user.organizationId,
    approvalStatus: 'approved',
    status: 'active',
  }).select('_id class enrolledCourses school profile').lean();
  if (!student?.class) throw new ForbiddenError('Your active school class is required for Guuldoon');

  const classroom = await ClassModel.findOne({ _id: student.class, school: student.school }).select('gradeLevel').lean();
  const grade = classroom?.gradeLevel ?? null;
  if (![8, 12].includes(grade || 0) || grade !== course.globalGrade) {
    throw new ForbiddenError('This Guuldoon course is not available for your grade');
  }

  const now = new Date();
  const activeSubscription = await Subscription.exists({
    user: req.user.userId,
    school: student.school,
    grade,
    status: 'approved',
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
  });
  if (!activeSubscription) throw new ForbiddenError('Active Guuldoon subscription required for this grade');

  await requireGuuldoonDevice(req);

  const enrolled = (student.enrolledCourses || []).some(id => String(id) === String(course._id));
  if (requireEnrollment && !enrolled) throw new ForbiddenError('Open this Guuldoon course from the Courses page first');

  return { course, student: student as any, grade };
}

async function loadAdminCourse(req: Request, courseId: string) {
  if (req.user?.role !== 'admin') throw new ForbiddenError('Super Admin access required');
  return loadGlobalCourse(courseId, false);
}

function safeQuestion(question: any) {
  const {
    answer: _answer,
    __v: _v,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...safe
  } = question;
  return safe;
}

async function chapterStats(userId: string, courseId: mongoose.Types.ObjectId, chapterIds: string[]) {
  const recent = await GuuldoonAttempt.find({
    user: userId,
    course: courseId,
    chapterId: { $in: chapterIds },
    correct: { $ne: null },
    retry: { $ne: true },
  }).sort({ createdAt: -1 }).limit(1000).lean();

  const grouped = new Map<string, any[]>();
  for (const attempt of recent) {
    const list = grouped.get(attempt.chapterId) || [];
    if (list.length < 20) list.push(attempt);
    grouped.set(attempt.chapterId, list);
  }

  const result: Record<string, { mastery: number; confidence: number; attempts: number }> = {};
  for (const chapterId of chapterIds) {
    const attempts = grouped.get(chapterId) || [];
    let numerator = 0;
    let denominator = 0;
    attempts.forEach((attempt, index) => {
      const weight = 1 / (1 + index * 0.12);
      numerator += attempt.correct ? weight : 0;
      denominator += weight;
    });
    const raw = denominator ? (numerator / denominator) * 100 : 0;
    const confidence = Math.min(1, attempts.length / 10);
    result[chapterId] = {
      mastery: Math.round(raw * confidence),
      confidence: Math.round(confidence * 100),
      attempts: attempts.length,
    };
  }
  return result;
}

async function derivedWeights(courseId: mongoose.Types.ObjectId, examIds: mongoose.Types.ObjectId[]) {
  const rows = await GuuldoonQuestion.aggregate([
    { $match: { course: courseId, exam: { $in: examIds } } },
    { $group: { _id: '$chapterId', marks: { $sum: '$marks' } } },
  ]);
  const total = rows.reduce((sum, row) => sum + Number(row.marks || 0), 0);
  const weights: Record<string, number> = {};
  for (const row of rows) weights[String(row._id)] = total ? (Number(row.marks || 0) / total) * 100 : 0;
  return weights;
}

// ---------------------------------------------------------------------------
// Student learning access
// ---------------------------------------------------------------------------

router.post('/courses/:courseId/open', asyncHandler(async (req, res) => {
  const { course, student, grade } = await loadStudentAccess(req, req.params.courseId, false);
  const enrolled = (student.enrolledCourses || []).some((id: any) => String(id) === String(course._id));

  if (!enrolled) {
    const result = await Student.updateOne(
      { _id: student._id, enrolledCourses: { $ne: course._id } },
      { $addToSet: { enrolledCourses: course._id } },
    );
    if (result.modifiedCount > 0) await Course.updateOne({ _id: course._id }, { $inc: { enrolledStudents: 1 } });
  }

  promoteGuuldoonDeviceCookie(req, res);
  res.set('Cache-Control', 'no-store, private, max-age=0');
  return ApiResponse.success(
    res,
    { courseId: String(course._id), grade, access: 'granted', destination: `/student/guuldoon/courses/${course._id}` },
    'Guuldoon course access granted',
  );
}));

router.get('/courses/:courseId/experience', asyncHandler(async (req, res) => {
  const { course, student, grade } = await loadStudentAccess(req, req.params.courseId, true);
  promoteGuuldoonDeviceCookie(req, res);
  res.set('Cache-Control', 'no-store, private, max-age=0');

  const [content, config, exams, progress, profile, mistakes, importedChapters, importedResources, importedGlossary, importedSubject] = await Promise.all([
    CourseContent.findOne({ course: course._id }).lean(),
    GuuldoonConfig.findOne({ course: course._id }).lean(),
    GuuldoonExam.find({ course: course._id, published: true, kind: { $ne: 'practice' } }).sort({ year: -1 }).lean(),
    Progress.findOne({ student: student._id, course: course._id }).lean(),
    student.profile ? Profile.findById(student.profile).select('firstName lastName').lean() : null,
    GuuldoonMistake.find({ user: req.user!.userId, course: course._id }).select('box dueAt').lean(),
    GuuldoonChapter.find({ course: course._id, status: 'published' }).sort({ order: 1 }).lean(),
    GuuldoonResource.find({ course: course._id }).sort({ chapterExternalId: 1, pageFrom: 1, createdAt: 1 }).lean(),
    GuuldoonGlossary.find({ course: course._id }).sort({ termSo: 1 }).lean(),
    GuuldoonSubject.findOne({ course: course._id, status: 'published' }).select('language externalId').lean(),
  ]);

  const usingUniversalImport = importedChapters.length > 0;
  const chapters = usingUniversalImport
    ? importedChapters
    : (content?.chapters || [])
      .filter((chapter: any) => chapter.status === 'published' || !chapter.status)
      .sort((a: any, b: any) => a.order - b.order);

  const chapterIds = chapters.map((chapter: any) => usingUniversalImport ? String(chapter.externalId) : String(chapter._id));
  const [stats, automaticWeights, chapterQuestionRows] = await Promise.all([
    chapterStats(req.user!.userId, course._id, chapterIds),
    derivedWeights(course._id, exams.map(exam => exam._id)),
    GuuldoonQuestion.aggregate([
      { $match: { course: course._id, exam: { $in: exams.map(exam => exam._id) }, chapterId: { $in: chapterIds } } },
      { $group: { _id: { chapterId: '$chapterId', exam: '$exam' }, count: { $sum: 1 } } },
    ]),
  ]);

  const practiceExamIds = (await GuuldoonExam.find({ course: course._id, published: true, kind: 'practice' }).select('_id').lean()).map(exam => exam._id);
  const practiceRows = practiceExamIds.length
    ? await GuuldoonQuestion.aggregate([
      { $match: { course: course._id, exam: { $in: practiceExamIds }, chapterId: { $in: chapterIds } } },
      { $group: { _id: '$chapterId', count: { $sum: 1 } } },
    ])
    : [];
  const practiceCountMap = new Map<string, number>(practiceRows.map(row => [String(row._id), Number(row.count || 0)]));

  const manualWeights = new Map((config?.chapterWeights || []).map(item => [item.chapterId, item.examWeight]));
  const examYearMap = new Map(exams.map(exam => [String(exam._id), Number(exam.year)]));
  const countMap = new Map<string, number>();
  const yearCountsMap = new Map<string, Map<number, number>>();
  for (const row of chapterQuestionRows) {
    const chapterId = String(row._id.chapterId);
    const count = Number(row.count || 0);
    countMap.set(chapterId, (countMap.get(chapterId) || 0) + count);
    const year = examYearMap.get(String(row._id.exam));
    if (!year) continue;
    const perYear = yearCountsMap.get(chapterId) || new Map<number, number>();
    perYear.set(year, (perYear.get(year) || 0) + count);
    yearCountsMap.set(chapterId, perYear);
  }
  const resourcesByChapter = new Map<string, any[]>();
  for (const resource of importedResources) {
    if (!resource.chapterExternalId) continue;
    const list = resourcesByChapter.get(resource.chapterExternalId) || [];
    list.push(resource);
    resourcesByChapter.set(resource.chapterExternalId, list);
  }
  const chapterRows = chapters.map((chapter: any) => {
    const id = usingUniversalImport ? String(chapter.externalId) : String(chapter._id);
    const importedWeight = usingUniversalImport && chapter.examWeight !== null && chapter.examWeight !== undefined ? Number(chapter.examWeight) : undefined;
    const examWeight = importedWeight ?? manualWeights.get(id) ?? Math.round((automaticWeights[id] || 0) * 10) / 10;
    const mastery = stats[id]?.mastery || 0;
    const importedItems = (resourcesByChapter.get(id) || []).map((resource: any) => ({
      id: String(resource._id),
      title: resource.title,
      type: resource.type,
      duration: 0,
      videoSeconds: 0,
      hasVideo: resource.type === 'video',
      url: resource.url || '',
      contentText: resource.contentText || '',
      pageFrom: resource.pageFrom || null,
      pageTo: resource.pageTo || null,
      language: resource.language,
      direction: resource.direction,
      offlineAvailable: resource.offlineAvailable,
      notes: resource.type === 'pdf' ? [{ name: resource.title, url: resource.url, type: 'pdf' }] : [],
    }));
    const builderItems = usingUniversalImport ? [] : (chapter.items || [])
      .filter((item: any) => item.status === 'published' || !item.status)
      .sort((a: any, b: any) => a.order - b.order)
      .map((item: any) => ({
        id: String(item._id),
        title: item.title,
        type: item.type,
        duration: item.duration || 0,
        videoSeconds: item.videoDuration || 0,
        hasVideo: !!item.videoUrl,
        notes: (item.attachments || []).filter((attachment: any) => /pdf/i.test(attachment.type || attachment.name || '')),
      }));
    const subjectLanguage = importedSubject?.language || 'en';
    const localizedTitle = subjectLanguage === 'ar'
      ? (chapter.titleAr || chapter.titleEn || chapter.titleSo)
      : subjectLanguage === 'so'
        ? (chapter.titleSo || chapter.titleEn || chapter.titleAr)
        : (chapter.titleEn || chapter.titleSo || chapter.titleAr);
    const yearCounts = [...(yearCountsMap.get(id) || new Map<number, number>()).entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year);
    const items = usingUniversalImport ? importedItems : builderItems;
    return {
      id,
      title: usingUniversalImport ? localizedTitle : chapter.title,
      description: usingUniversalImport ? '' : chapter.description || '',
      order: chapter.order,
      examWeight,
      mastery,
      confidence: stats[id]?.confidence || 0,
      attempts: stats[id]?.attempts || 0,
      started: (stats[id]?.attempts || 0) > 0,
      questionCount: countMap.get(id) || 0,
      practiceCount: practiceCountMap.get(id) || 0,
      yearCount: yearCounts.length,
      yearCounts,
      outsideBook: usingUniversalImport && /other topics|outside the book/i.test(localizedTitle || ''),
      items,
    };
  });

  const totalWeight = chapterRows.reduce((sum, chapter) => sum + chapter.examWeight, 0);
  const passMeter = totalWeight
    ? Math.round(chapterRows.reduce((sum, chapter) => sum + chapter.mastery * chapter.examWeight, 0) / totalWeight)
    : 0;

  const weakest = [...chapterRows]
    .sort((a, b) => (b.examWeight * (100 - b.mastery)) - (a.examWeight * (100 - a.mastery)))
    .slice(0, 2)
    .map(({ id, title, examWeight, mastery }) => ({ id, title, examWeight, mastery }));

  const completed = Number((progress as any)?.completedItems || 0)
    || Number((progress as any)?.completedLessons || 0)
    + Number((progress as any)?.completedQuizzes || 0)
    + Number((progress as any)?.completedAssignments || 0);
  const flatItems = chapterRows.flatMap(chapter => chapter.items.map((item: any) => ({ ...item, chapterId: chapter.id, chapterTitle: chapter.title })));
  const continueItem = flatItems.length ? flatItems[Math.min(completed, flatItems.length - 1)] : null;

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const mistakeSummary = {
    total: mistakes.length,
    today: mistakes.filter(item => item.dueAt <= now).length,
    tomorrow: mistakes.filter(item => item.dueAt > now && item.dueAt <= tomorrow).length,
    thisWeek: mistakes.filter(item => item.dueAt > tomorrow && item.dueAt <= week).length,
  };

  return ApiResponse.success(res, {
    course: {
      id: String(course._id),
      title: course.title,
      description: course.description,
      thumbnail: course.thumbnail,
      grade,
      language: importedSubject?.language || 'en',
    },
    studentName: profile?.firstName || '',
    passMeter,
    passTarget: config?.passTarget ?? 70,
    targetExamDate: config?.targetExamDate || null,
    chapters: chapterRows,
    weakest,
    continueItem,
    exams: exams.map(exam => ({
      id: String(exam._id),
      year: exam.year,
      durationMin: exam.durationMin,
      totalMarks: exam.totalMarks,
      answerKeyStatus: exam.answerKeyStatus,
    })),
    mistakeSummary,
    glossary: importedGlossary.length ? importedGlossary.map(item => ({ termSo: item.termSo, termEn: item.termEn, termAr: item.termAr })) : (config?.glossary || []),
  });
}));

router.get('/courses/:courseId/chapters/:chapterId/questions', asyncHandler(async (req, res) => {
  const { course } = await loadStudentAccess(req, req.params.courseId, true);
  const importedChapter = await GuuldoonChapter.findOne({ course: course._id, externalId: req.params.chapterId, status: 'published' }).lean();
  const content = importedChapter ? null : await CourseContent.findOne({ course: course._id }).select('chapters._id chapters.title').lean();
  const chapter = importedChapter || (content?.chapters || []).find((item: any) => String(item._id) === req.params.chapterId);
  if (!chapter) throw new NotFoundError('Guuldoon chapter');

  const practiceMode = req.query.kind === 'practice';
  const publishedExams = await GuuldoonExam.find({
    course: course._id,
    published: true,
    kind: practiceMode ? 'practice' : { $ne: 'practice' },
  }).select('_id year').lean();
  const examIds = publishedExams.map(exam => exam._id);
  const reviewMode = !practiceMode && req.query.review === '1';
  const examYearMap = new Map(publishedExams.map(exam => [String(exam._id), Number(exam.year)]));
  const allQuestions = await GuuldoonQuestion.find({
    course: course._id,
    exam: { $in: examIds },
    chapterId: req.params.chapterId,
  })
    .select(reviewMode ? '+answer' : '-answer')
    .sort(practiceMode ? { number: 1 } : { number: 1 })
    .limit(500)
    .lean();

  const yearCounts = new Map<number, number>();
  for (const question of allQuestions) {
    const year = examYearMap.get(String(question.exam));
    if (year) yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
  }

  const requestedYear = Number(req.query.year) || null;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
  const questions = allQuestions
    .filter(question => !requestedYear || examYearMap.get(String(question.exam)) === requestedYear)
    .slice(0, limit)
    .map(question => ({
      ...safeQuestion(question),
      examYear: examYearMap.get(String(question.exam)) || null,
      ...(reviewMode ? {
        answerDisplay: describeAnswer(question.type, (question as any).answer, question.options),
        explanation: question.explainerText || '',
        answerVerified: question.answerStatus === 'verified',
      } : {}),
    }));

  return ApiResponse.success(res, {
    chapter: {
      id: importedChapter ? String((chapter as any).externalId) : String((chapter as any)._id),
      title: importedChapter ? ((chapter as any).titleEn || (chapter as any).titleSo || (chapter as any).titleAr) : (chapter as any).title,
    },
    yearCounts: [...yearCounts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year),
    questions,
  });
}));

router.get('/courses/:courseId/chapters/:chapterId/lesson', asyncHandler(async (req, res) => {
  const { course } = await loadStudentAccess(req, req.params.courseId, true);
  const chapter = await GuuldoonChapter.findOne({
    course: course._id,
    externalId: req.params.chapterId,
    status: 'published',
  }).lean();
  if (!chapter) throw new NotFoundError('Guuldoon chapter');

  const [subject, resources, publishedExams] = await Promise.all([
    GuuldoonSubject.findById(chapter.subject).select('language').lean(),
    GuuldoonResource.find({ course: course._id, chapterExternalId: chapter.externalId }).sort({ pageFrom: 1, createdAt: 1 }).lean(),
    GuuldoonExam.find({ course: course._id, published: true, kind: { $ne: 'practice' } }).select('_id year').lean(),
  ]);
  const examYearMap = new Map(publishedExams.map(exam => [String(exam._id), Number(exam.year)]));
  const questions = await GuuldoonQuestion.find({
    course: course._id,
    chapterId: chapter.externalId,
    exam: { $in: publishedExams.map(exam => exam._id) },
    bookAnchorText: { $exists: true, $ne: '' },
    bookRelation: { $in: ['direct', 'indirect', 'similar', 'derived'] },
  }).select('-answer').lean();

  const normalize = (value: unknown) => String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const sections = resources.map((resource, index) => {
    const normalizedContent = normalize(resource.contentText);
    const groupedHighlights = new Map<string, any>();
    for (const question of questions) {
      const anchor = normalize(question.bookAnchorText);
      if (!normalizedContent || !anchor || !normalizedContent.includes(anchor)) continue;
      const key = `${anchor}::${question.bookRelation}`;
      const current = groupedHighlights.get(key) || {
        anchorText: question.bookAnchorText,
        relation: question.bookRelation,
        questions: [],
      };
      current.questions.push({
        ...safeQuestion(question),
        examYear: examYearMap.get(String(question.exam)) || null,
      });
      groupedHighlights.set(key, current);
    }
    const highlights = [...groupedHighlights.values()];
    return {
      id: String(resource._id),
      externalId: resource.externalId,
      order: index + 1,
      title: resource.title,
      type: resource.type,
      url: resource.url || '',
      contentText: resource.contentText || '',
      figureFiles: resource.figureFiles || [],
      pageFrom: resource.pageFrom || null,
      pageTo: resource.pageTo || null,
      language: resource.language,
      direction: resource.direction,
      highlights,
    };
  });

  const language = subject?.language || 'en';
  const title = language === 'ar'
    ? (chapter.titleAr || chapter.titleEn || chapter.titleSo)
    : language === 'so'
      ? (chapter.titleSo || chapter.titleEn || chapter.titleAr)
      : (chapter.titleEn || chapter.titleSo || chapter.titleAr);

  return ApiResponse.success(res, {
    chapter: { id: chapter.externalId, title, language, outsideBook: !sections.some(section => !!section.contentText) },
    sections,
  });
}));

router.get('/courses/:courseId/exams/:examId', asyncHandler(async (req, res) => {
  const { course } = await loadStudentAccess(req, req.params.courseId, true);
  const exam = await GuuldoonExam.findOne({
    _id: objectId(req.params.examId, 'exam ID'),
    course: course._id,
    published: true,
    kind: { $ne: 'practice' },
  }).lean();
  if (!exam) throw new NotFoundError('Past exam');

  const questions = await GuuldoonQuestion.find({ exam: exam._id, course: course._id })
    .select('-answer')
    .sort({ number: 1 })
    .lean();

  return ApiResponse.success(res, {
    exam: {
      id: String(exam._id),
      year: exam.year,
      durationMin: exam.durationMin,
      totalMarks: exam.totalMarks,
      answerKeyStatus: exam.answerKeyStatus,
      source: exam.source || '',
    },
    questions: questions.map(safeQuestion),
  });
}));

router.post('/questions/:questionId/answer', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student') throw new ForbiddenError('Student access required');
  const question = await GuuldoonQuestion.findById(objectId(req.params.questionId, 'question ID')).select('+answer').lean();
  if (!question) throw new NotFoundError('Guuldoon question');

  const { course, student } = await loadStudentAccess(req, String(question.course), true);
  const publishedExam = await GuuldoonExam.exists({ _id: question.exam, course: course._id, published: true });
  if (!publishedExam) throw new NotFoundError('Guuldoon question');
  const submitted = req.body?.answer;
  const isRetry = req.body?.retry === true;
  const timeMs = Math.max(0, Math.min(60 * 60 * 1000, Number(req.body?.timeMs) || 0));
  const markingMode = question.markingMode || (isAutoMarkable(question.type, question.answer) ? 'auto' : 'manual');
  const marked = question.answerStatus === 'verified' && markingMode === 'auto' && isAutoMarkable(question.type, question.answer);
  const grade = marked ? gradeAnswer(question.type, question.answer, submitted) : null;
  const correct = grade ? grade.correct : null;

  await GuuldoonAttempt.create({
    user: req.user!.userId,
    student: student._id,
    course: course._id,
    question: question._id,
    chapterId: question.chapterId,
    correct,
    answer: submitted,
    timeMs,
    retry: isRetry,
  });

  if (!isRetry && marked && correct === false && isAnswerSpec(question.answer) && question.answer.kind === 'text') {
    await recordUnmatchedAnswer(String(course._id), String(question._id), submitted);
  }

  if (!isRetry && marked && correct === false) {
    await GuuldoonMistake.findOneAndUpdate(
      { user: req.user!.userId, question: question._id },
      {
        $set: {
          course: course._id,
          box: 1,
          dueAt: new Date(Date.now() + leitnerDays[0] * 86400000),
          lastResult: 'wrong',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } else if (!isRetry && marked && correct === true) {
    const existing = await GuuldoonMistake.findOne({ user: req.user!.userId, question: question._id });
    if (existing) {
      const nextBox = Math.min(5, existing.box + 1);
      existing.box = nextBox;
      existing.dueAt = new Date(Date.now() + leitnerDays[nextBox - 1] * 86400000);
      existing.lastResult = 'correct';
      await existing.save();
    }
  }

  const revealAnswer = !marked || correct === true || isRetry;
  const similar = question.similarIds?.length
    ? await GuuldoonQuestion.find({ _id: { $in: question.similarIds.slice(0, 2) } }).select('-answer').lean()
    : [];

  return ApiResponse.success(res, {
    marked,
    correct,
    reason: grade && !grade.correct ? grade.reason : undefined,
    answerStatus: question.answerStatus,
    markingMode,
    answerDisplay: revealAnswer ? describeAnswer(question.type, question.answer, question.options) : undefined,
    explanation: revealAnswer ? question.explainerText || '' : '',
    explanationStatus: question.answerStatus === 'verified' ? 'verified' : 'draft',
    explainerAudioUrl: question.answerStatus === 'verified' ? question.explainerAudioUrl || '' : '',
    bookRef: question.bookRef || null,
    similar: similar.map(safeQuestion),
    message: marked ? (correct ? 'Sax' : 'Khalad') : question.answerStatus === 'verified' ? 'Jawaabta macallin ayaa qiimeyn doona' : 'Jawaab la xaqiijin doonaa',
  });
}));

router.post('/courses/:courseId/practice-results', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student') throw new ForbiddenError('Student access required');
  const { course } = await loadStudentAccess(req, req.params.courseId, true);
  const body = req.body || {};
  const num = (value: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
  const total = num(body.total, 500);
  const correct = num(body.correct, total);
  const firstTry = num(body.firstTry, correct);
  const source = ['understand', 'past', 'single'].includes(body.source) ? body.source : null;
  const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim().slice(0, 100) : '';
  if (!total || !source || !chapterId) throw new BadRequestError('Invalid practice result');
  const result = await GuuldoonPracticeResult.create({
    user: req.user!.userId,
    course: course._id,
    chapterId,
    source,
    total,
    firstTry,
    correct,
    wrong: total - correct,
    durationMs: num(body.durationMs, 24 * 60 * 60 * 1000),
  });
  const history = await GuuldoonPracticeResult.find({ user: req.user!.userId, course: course._id, chapterId, source })
    .sort({ createdAt: -1 }).limit(10).lean();
  const best = history.reduce((max, item) => Math.max(max, Math.round((item.correct / item.total) * 100)), 0);
  return ApiResponse.success(res, { saved: String(result._id), best, history: history.map(item => ({ total: item.total, correct: item.correct, firstTry: item.firstTry, at: item.createdAt })) });
}));

router.get('/courses/:courseId/practice-results', asyncHandler(async (req, res) => {
  const { course } = await loadStudentAccess(req, req.params.courseId, true);
  const chapterId = String(req.query.chapterId || '');
  const rows = await GuuldoonPracticeResult.find({ user: req.user!.userId, course: course._id, ...(chapterId ? { chapterId } : {}) })
    .sort({ createdAt: -1 }).limit(20).lean();
  return ApiResponse.success(res, rows.map(item => ({ chapterId: item.chapterId, source: item.source, total: item.total, correct: item.correct, firstTry: item.firstTry, at: item.createdAt })));
}));

router.get('/courses/:courseId/mistakes', asyncHandler(async (req, res) => {
  const { course } = await loadStudentAccess(req, req.params.courseId, true);
  const rows = await GuuldoonMistake.find({ user: req.user!.userId, course: course._id })
    .sort({ dueAt: 1 })
    .populate({ path: 'question', select: '-answer' })
    .lean();
  return ApiResponse.success(res, rows);
}));

// ---------------------------------------------------------------------------
// Super Admin Guuldoon Builder APIs
// ---------------------------------------------------------------------------

router.get('/admin/courses/:courseId/config', asyncHandler(async (req, res) => {
  const course = await loadAdminCourse(req, req.params.courseId);
  const [config, content, exams] = await Promise.all([
    GuuldoonConfig.findOne({ course: course._id }).lean(),
    CourseContent.findOne({ course: course._id }).select('chapters._id chapters.title chapters.order chapters.status chapters.items').lean(),
    GuuldoonExam.find({ course: course._id }).sort({ year: -1 }).lean(),
  ]);
  return ApiResponse.success(res, {
    course,
    config: config || { passTarget: 70, targetExamDate: null, chapterWeights: [], glossary: [] },
    chapters: (content?.chapters || []).map((chapter: any) => ({
      id: String(chapter._id),
      title: chapter.title,
      order: chapter.order,
      status: chapter.status,
      lessons: (chapter.items || []).filter((item: any) => item.type === 'lesson').length,
    })),
    exams,
  });
}));

router.put('/admin/courses/:courseId/config', asyncHandler(async (req, res) => {
  const course = await loadAdminCourse(req, req.params.courseId);
  const content = await CourseContent.findOne({ course: course._id }).select('chapters._id').lean();
  const validChapters = new Set((content?.chapters || []).map((chapter: any) => String(chapter._id)));

  const chapterWeights = Array.isArray(req.body?.chapterWeights) ? req.body.chapterWeights : [];
  for (const row of chapterWeights) {
    if (!validChapters.has(String(row.chapterId))) throw new BadRequestError('Chapter weight references an unknown chapter');
    const weight = Number(row.examWeight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) throw new BadRequestError('Exam weight must be between 0 and 100');
  }
  const totalWeight = chapterWeights.reduce((sum: number, row: any) => sum + Number(row.examWeight || 0), 0);
  if (chapterWeights.length && Math.abs(totalWeight - 100) > 0.5) {
    throw new BadRequestError('Chapter exam weights must total 100%');
  }

  const glossary = Array.isArray(req.body?.glossary) ? req.body.glossary.slice(0, 1000) : [];
  const passTarget = Math.max(0, Math.min(100, Number(req.body?.passTarget) || 70));
  const targetExamDate = req.body?.targetExamDate ? new Date(req.body.targetExamDate) : null;
  if (targetExamDate && Number.isNaN(targetExamDate.getTime())) throw new BadRequestError('Invalid target exam date');

  const saved = await GuuldoonConfig.findOneAndUpdate(
    { course: course._id },
    {
      $set: {
        passTarget,
        targetExamDate,
        chapterWeights: chapterWeights.map((row: any) => ({ chapterId: String(row.chapterId), examWeight: Number(row.examWeight) })),
        glossary: glossary.map((row: any) => ({
          termSo: String(row.termSo || '').trim(),
          termEn: String(row.termEn || '').trim(),
          termAr: String(row.termAr || '').trim(),
        })).filter((row: any) => row.termSo && row.termEn && row.termAr),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return ApiResponse.success(res, saved, 'Guuldoon course settings saved');
}));

router.post('/admin/courses/:courseId/exams', asyncHandler(async (req, res) => {
  const course = await loadAdminCourse(req, req.params.courseId);
  const year = Number(req.body?.year);
  const durationMin = Number(req.body?.durationMin);
  const totalMarks = Number(req.body?.totalMarks);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new BadRequestError('Valid exam year is required');
  if (!Number.isFinite(durationMin) || durationMin <= 0) throw new BadRequestError('Exam duration is required');
  if (!Number.isFinite(totalMarks) || totalMarks <= 0) throw new BadRequestError('Total marks are required');

  try {
    const exam = await GuuldoonExam.create({
      course: course._id,
      year,
      durationMin,
      totalMarks,
      source: String(req.body?.source || '').trim(),
      answerKeyStatus: req.body?.answerKeyStatus === 'verified' ? 'verified' : 'pending',
      published: req.body?.published === true,
    });
    return ApiResponse.created(res, exam, 'Past exam created');
  } catch (error: any) {
    if (error?.code === 11000) throw new ConflictError('This exam year already exists for the course');
    throw error;
  }
}));

router.patch('/admin/exams/:examId', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') throw new ForbiddenError('Super Admin access required');
  const exam = await GuuldoonExam.findById(objectId(req.params.examId, 'exam ID'));
  if (!exam) throw new NotFoundError('Past exam');
  const allowed = ['durationMin', 'totalMarks', 'source', 'answerKeyStatus', 'published'] as const;
  for (const key of allowed) if (req.body?.[key] !== undefined) (exam as any)[key] = req.body[key];
  await exam.save();
  return ApiResponse.success(res, exam, 'Past exam updated');
}));

router.delete('/admin/exams/:examId', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') throw new ForbiddenError('Super Admin access required');
  const exam = await GuuldoonExam.findById(objectId(req.params.examId, 'exam ID'));
  if (!exam) throw new NotFoundError('Past exam');
  await Promise.all([
    GuuldoonQuestion.deleteMany({ exam: exam._id }),
    GuuldoonAttempt.deleteMany({ course: exam.course, question: { $in: await GuuldoonQuestion.distinct('_id', { exam: exam._id }) } }),
    GuuldoonMistake.deleteMany({ course: exam.course, question: { $in: await GuuldoonQuestion.distinct('_id', { exam: exam._id }) } }),
  ]);
  await exam.deleteOne();
  return ApiResponse.success(res, { deleted: true }, 'Past exam deleted');
}));

router.get('/admin/exams/:examId/questions', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') throw new ForbiddenError('Super Admin access required');
  const exam = await GuuldoonExam.findById(objectId(req.params.examId, 'exam ID')).lean();
  if (!exam) throw new NotFoundError('Past exam');
  const questions = await GuuldoonQuestion.find({ exam: exam._id }).select('+answer').sort({ number: 1 }).lean();
  return ApiResponse.success(res, questions);
}));

/** Short label of the stored answer key, shown to the admin next to a student's wrong answer. */
function expectedAnswerLabel(answer: unknown): string {
  if (isAnswerSpec(answer)) return answer.kind === 'text' ? answer.accepted.join(' | ') : String(answer.value) + (answer.unit ? ' ' + answer.unit : '');
  return typeof answer === 'string' ? answer : '';
}

async function recordUnmatchedAnswer(courseId: string, questionId: string, submitted: unknown) {
  const normalized = normalizeText(submitted).slice(0, 200);
  if (!normalized) return;
  try {
    await GuuldoonUnmatchedAnswer.updateOne(
      { question: questionId, normalized },
      {
        $setOnInsert: { course: courseId, sample: String(submitted).trim().slice(0, 200), status: 'pending' },
        $inc: { count: 1 },
        $set: { lastSeenAt: new Date() },
      },
      { upsert: true },
    );
  } catch {
    // Learning the answer list is best-effort and must never block marking.
  }
}

router.get('/admin/courses/:courseId/unmatched-answers', asyncHandler(async (req, res) => {
  const course = await loadAdminCourse(req, req.params.courseId);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
  const rows = await GuuldoonUnmatchedAnswer.find({ course: course._id, status: 'pending' })
    .sort({ count: -1, lastSeenAt: -1 })
    .limit(limit)
    .populate('question', '+answer textSo textEn externalId number chapterId')
    .lean();
  return ApiResponse.success(res, rows.map((row: any) => ({
    id: String(row._id),
    answer: row.sample,
    count: row.count,
    lastSeenAt: row.lastSeenAt,
    expected: row.question ? expectedAnswerLabel(row.question.answer) : '',
    question: row.question ? { id: String(row.question._id), externalId: row.question.externalId || '', number: row.question.number, text: row.question.textSo, chapterId: row.question.chapterId } : null,
  })));
}));

router.post('/admin/unmatched-answers/:id/:decision', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') throw new ForbiddenError('Super Admin access required');
  const decision = req.params.decision;
  if (!['accept', 'reject'].includes(decision)) throw new BadRequestError('Decision must be accept or reject');
  const row = await GuuldoonUnmatchedAnswer.findById(objectId(req.params.id, 'unmatched answer ID'));
  if (!row) throw new NotFoundError('Unmatched answer');
  if (row.status !== 'pending') throw new ConflictError('This answer was already reviewed');
  if (decision === 'accept') {
    const question = await GuuldoonQuestion.findById(row.question).select('+answer');
    if (!question) throw new NotFoundError('Guuldoon question');
    const current: unknown = question.answer;
    if (!(isAnswerSpec(current) && current.kind === 'text') && !(typeof current === 'string' && question.type === 'fill')) {
      throw new BadRequestError('Only text answer keys can accept extra answers');
    }
    const accepted = isAnswerSpec(current) && current.kind === 'text' ? current.accepted : [String(current)];
    if (!accepted.some(item => normalizeText(item) === row.normalized)) accepted.push(row.sample);
    question.answer = { kind: 'text', accepted };
    question.markModified('answer');
    await question.save();
  }
  row.status = decision === 'accept' ? 'accepted' : 'rejected';
  row.decidedBy = new mongoose.Types.ObjectId(req.user!.userId);
  row.decidedAt = new Date();
  await row.save();
  return ApiResponse.success(res, { id: String(row._id), status: row.status }, decision === 'accept' ? 'Answer accepted' : 'Answer rejected');
}));

router.post('/admin/exams/:examId/questions/bulk', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') throw new ForbiddenError('Super Admin access required');
  const exam = await GuuldoonExam.findById(objectId(req.params.examId, 'exam ID')).lean();
  if (!exam) throw new NotFoundError('Past exam');
  const rows = Array.isArray(req.body?.questions) ? req.body.questions : [];
  if (!rows.length || rows.length > 500) throw new BadRequestError('Provide 1 to 500 questions');

  const content = await CourseContent.findOne({ course: exam.course }).select('chapters._id').lean();
  const validChapters = new Set((content?.chapters || []).map((chapter: any) => String(chapter._id)));
  const operations = rows.map((row: any, index: number) => {
    const number = Number(row.number);
    const chapterId = String(row.chapterId || '');
    const type = String(row.type || 'mcq');
    if (!Number.isInteger(number) || number < 1) throw new BadRequestError(`Question row ${index + 1}: valid number required`);
    if (!['mcq', 'structured', 'fill', 'match'].includes(type)) throw new BadRequestError(`Question ${number}: invalid type`);
    if (!String(row.textSo || '').trim()) throw new BadRequestError(`Question ${number}: Somali question text required`);
    if (!validChapters.has(chapterId)) throw new BadRequestError(`Question ${number}: chapterId does not exist in this course`);
    const answerStatus = row.answerStatus === 'verified' ? 'verified' : 'pending';
    const markingMode = answerStatus === 'verified' && isAutoMarkable(type, row.answer) ? 'auto' : 'manual';
    if (answerStatus === 'verified' && ['mcq', 'fill'].includes(type) && row.answer === undefined) throw new BadRequestError(`Question ${number}: verified auto-marked questions require an answer`);

    return {
      updateOne: {
        filter: { exam: exam._id, number },
        update: {
          $set: {
            course: exam.course,
            exam: exam._id,
            number,
            type,
            textSo: String(row.textSo).trim(),
            textEn: String(row.textEn || '').trim(),
            options: Array.isArray(row.options) ? row.options.map(String) : undefined,
            marks: Math.max(0, Number(row.marks) || 1),
            figureUrl: String(row.figureUrl || '').trim(),
            chapterId,
            topicTags: Array.isArray(row.topicTags) ? row.topicTags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [],
            answer: row.answer,
            answerStatus,
            markingMode,
            explainerAudioUrl: String(row.explainerAudioUrl || '').trim(),
            explainerText: String(row.explainerText || '').trim(),
            bookRef: row.bookRef || undefined,
            similarIds: Array.isArray(row.similarIds)
              ? row.similarIds.filter((id: unknown) => mongoose.isValidObjectId(String(id))).map((id: unknown) => new mongoose.Types.ObjectId(String(id)))
              : [],
          },
        },
        upsert: true,
      },
    };
  });

  await GuuldoonQuestion.bulkWrite(operations, { ordered: false });
  const count = await GuuldoonQuestion.countDocuments({ exam: exam._id });
  return ApiResponse.success(res, { imported: rows.length, totalQuestions: count }, 'Question bank imported');
}));

// ---------------------------------------------------------------------------
// Existing admin / teacher performance views
// ---------------------------------------------------------------------------

/** All scope derives from authentication, never client school or student IDs. */
async function studentScope(req: Request): Promise<Record<string, unknown>> {
  if (req.user!.role === 'admin') return {};
  const filter: Record<string, unknown> = { school: req.user!.organizationId };
  if (req.user!.role === 'student') filter.user = req.user!.userId;
  if (req.user!.role === 'teacher') {
    const teacher = await Teacher.findOne({ user: req.user!.userId, school: req.user!.organizationId }).select('_id').lean();
    if (!teacher) return { _id: { $in: [] } };
    const courses = await Course.find({ teacher: teacher._id, school: req.user!.organizationId, scope: { $ne: 'global' } }).select('_id class').lean();
    filter.$or = [
      { class: { $in: courses.map(course => course.class).filter(Boolean) } },
      { enrolledCourses: { $in: courses.map(course => course._id) } },
    ];
  }
  return filter;
}

router.get('/overview', asyncHandler(async (req, res) => {
  if (!['admin', 'org_admin'].includes(req.user!.role)) throw new ForbiddenError('Administrator access required');
  const scope = req.user!.role === 'admin' ? {} : { school: new mongoose.Types.ObjectId(req.user!.organizationId) };
  const now = new Date();
  const [publishedCourses, activeUsers, pendingPayments, payments] = await Promise.all([
    Course.countDocuments({ scope: 'global', status: 'published' }),
    Subscription.distinct('user', { ...scope, status: 'approved', startsAt: { $lte: now }, expiresAt: { $gt: now } }),
    Subscription.countDocuments({ ...scope, status: 'pending' }),
    Subscription.aggregate([{ $match: { ...scope, verifiedReference: { $exists: true } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  return ApiResponse.success(res, {
    publishedCourses,
    activeSubscribers: activeUsers.length,
    pendingPayments,
    verifiedPaymentsUsd: payments[0]?.total || 0,
  });
}));

router.get('/performance', asyncHandler(async (req, res) => {
  const scopedStudents = await studentScope(req);
  if (scopedStudents.school) scopedStudents.school = new mongoose.Types.ObjectId(String(scopedStudents.school));
  if (scopedStudents.user) scopedStudents.user = new mongoose.Types.ObjectId(String(scopedStudents.user));
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const pipeline: mongoose.PipelineStage[] = [
    { $lookup: { from: Student.collection.name, localField: 'student', foreignField: '_id', pipeline: [{ $match: scopedStudents }, { $project: { studentId: 1, profile: 1 } }], as: 'student' } },
    { $unwind: '$student' },
    { $lookup: { from: Course.collection.name, localField: 'course', foreignField: '_id', pipeline: [{ $match: { scope: 'global', ...(req.user!.role === 'admin' ? {} : { status: 'published' }) } }, { $project: { title: 1, globalGrade: 1 } }], as: 'course' } },
    { $unwind: '$course' },
    { $sort: { lastAccessed: -1 } },
    { $facet: {
      rows: [
        { $skip: (page - 1) * 50 },
        { $limit: 50 },
        { $lookup: { from: Profile.collection.name, localField: 'student.profile', foreignField: '_id', pipeline: [{ $project: { firstName: 1, lastName: 1 } }], as: 'profile' } },
        { $set: { 'student.profile': { $arrayElemAt: ['$profile', 0] } } },
        { $project: { student: 1, course: 1, completedLessons: 1, completedQuizzes: 1, completedAssignments: 1, totalItems: 1, status: 1, lastAccessed: 1 } },
      ],
      count: [{ $count: 'total' }],
    } },
  ];
  const [result] = await Progress.aggregate(pipeline);
  return ApiResponse.paginated(res, result?.rows || [], { page, limit: 50, total: result?.count[0]?.total || 0 });
}));

export default router;
