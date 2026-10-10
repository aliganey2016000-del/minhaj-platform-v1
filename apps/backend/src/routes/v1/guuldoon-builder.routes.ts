import { Router } from 'express';
import mongoose from 'mongoose';
import Course from '../../models/course.model';
import CourseContent from '../../models/course-content.model';
import Student from '../../models/student.model';
import GuuldoonConfig from '../../models/guuldoon-course-config.model';
import GuuldoonExam from '../../models/guuldoon-past-exam.model';
import GuuldoonQuestion from '../../models/guuldoon-question.model';
import GuuldoonAttempt from '../../models/guuldoon-attempt.model';
import GuuldoonMistake from '../../models/guuldoon-mistake.model';
import GuuldoonChapter from '../../models/guuldoon-chapter.model';
import GuuldoonResource from '../../models/guuldoon-resource.model';
import GuuldoonGlossary from '../../models/guuldoon-glossary.model';
import GuuldoonSubject from '../../models/guuldoon-subject.model';
import GuuldoonUnmatchedAnswer from '../../models/guuldoon-unmatched-answer.model';
import { describeAnswer, isAnswerSpec, isAutoMarkable } from '../../services/guuldoon-marking.service';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';

/**
 * Super Admin view of a Guuldoon course, shaped like the student experience:
 * chapters with their lessons, past-exam questions per year and practice
 * questions, each editable in place. Hand edits are flagged `manuallyEdited`
 * so a later Excel import keeps them.
 */
const router = Router();

router.use((req, _res, next) => {
  if (req.user?.role !== 'admin') return next(new ForbiddenError('Super Admin access required'));
  next();
});

const RESOURCE_TYPES = ['video', 'audio', 'pdf', 'book', 'image', 'note', 'link'];
const QUESTION_TYPES = ['mcq', 'structured', 'fill', 'match'];
const LANGUAGES = ['so', 'en', 'ar'];

function objectId(value: string, label = 'ID'): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) throw new BadRequestError(`Invalid ${label}`);
  return new mongoose.Types.ObjectId(value);
}

async function loadCourse(courseId: string) {
  const course = await Course.findOne({ _id: objectId(courseId, 'course ID'), scope: 'global' })
    .select('_id title description thumbnail globalGrade status')
    .lean();
  if (!course) throw new NotFoundError('Guuldoon course');
  return course as any;
}

type ChapterRef = { id: string; kind: 'imported' | 'legacy'; doc: any };

/** The course's chapters: imported (Excel) chapters when any exist, otherwise the classic Course Builder chapters. */
async function loadChapters(courseId: mongoose.Types.ObjectId): Promise<{ mode: 'imported' | 'legacy'; chapters: ChapterRef[] }> {
  const imported = await GuuldoonChapter.find({ course: courseId }).sort({ order: 1 }).lean();
  if (imported.length) return { mode: 'imported', chapters: imported.map(doc => ({ id: String(doc.externalId), kind: 'imported', doc })) };
  const content = await CourseContent.findOne({ course: courseId }).lean();
  const legacy = [...(content?.chapters || [])].sort((a: any, b: any) => a.order - b.order);
  return { mode: 'legacy', chapters: legacy.map((doc: any) => ({ id: String(doc._id), kind: 'legacy', doc })) };
}

async function findChapter(courseId: mongoose.Types.ObjectId, chapterId: string) {
  const loaded = await loadChapters(courseId);
  const chapter = loaded.chapters.find(item => item.id === chapterId);
  if (!chapter) throw new NotFoundError('Guuldoon chapter');
  return { ...loaded, chapter };
}

function chapterTitle(chapter: ChapterRef): string {
  if (chapter.kind === 'imported') return chapter.doc.titleEn || chapter.doc.titleSo || chapter.doc.titleAr || '';
  return chapter.doc.title || '';
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function text(value: unknown, max = 20000): string {
  return String(value ?? '').trim().slice(0, max);
}

// ---------------------------------------------------------------------------
// Course overview
// ---------------------------------------------------------------------------

router.get('/courses/:courseId', asyncHandler(async (req, res) => {
  const course = await loadCourse(req.params.courseId);
  const courseId = course._id as mongoose.Types.ObjectId;
  const { mode, chapters } = await loadChapters(courseId);
  const chapterIds = chapters.map(chapter => chapter.id);

  const [config, exams, questionRows, lessonRows, masteryRows, students, unmatchedPending, importedGlossary, subject] = await Promise.all([
    GuuldoonConfig.findOne({ course: courseId }).lean(),
    GuuldoonExam.find({ course: courseId }).sort({ year: -1 }).lean(),
    GuuldoonQuestion.aggregate([
      { $match: { course: courseId } },
      { $group: { _id: { chapterId: '$chapterId', exam: '$exam' }, count: { $sum: 1 }, marks: { $sum: '$marks' } } },
    ]),
    mode === 'imported'
      ? GuuldoonResource.aggregate([
        { $match: { course: courseId } },
        { $group: { _id: '$chapterExternalId', count: { $sum: 1 } } },
      ])
      : Promise.resolve([] as any[]),
    // Accuracy per student first, then the mean across students, so one very active student does not dominate.
    GuuldoonAttempt.aggregate([
      { $match: { course: courseId, chapterId: { $in: chapterIds }, correct: { $ne: null }, retry: { $ne: true } } },
      { $group: { _id: { chapterId: '$chapterId', user: '$user' }, total: { $sum: 1 }, right: { $sum: { $cond: ['$correct', 1, 0] } } } },
      { $group: { _id: '$_id.chapterId', students: { $sum: 1 }, avg: { $avg: { $multiply: [{ $divide: ['$right', '$total'] }, 100] } } } },
    ]),
    Student.countDocuments({ enrolledCourses: courseId }),
    GuuldoonUnmatchedAnswer.countDocuments({ course: courseId, status: 'pending' }),
    GuuldoonGlossary.find({ course: courseId }).sort({ termSo: 1 }).select('termSo termEn termAr').lean(),
    GuuldoonSubject.findOne({ course: courseId }).select('language').lean(),
  ]);

  const examById = new Map(exams.map(exam => [String(exam._id), exam]));
  const manualWeights = new Map((config?.chapterWeights || []).map(item => [item.chapterId, item.examWeight]));

  // Same fallback the student sees: chapter weight, then manual weight, then each chapter's share of past-exam marks.
  const marksByChapter = new Map<string, number>();
  let totalMarks = 0;
  for (const row of questionRows) {
    const exam = examById.get(String(row._id.exam));
    if (!exam || exam.kind === 'practice' || !exam.published) continue;
    marksByChapter.set(String(row._id.chapterId), (marksByChapter.get(String(row._id.chapterId)) || 0) + Number(row.marks || 0));
    totalMarks += Number(row.marks || 0);
  }

  const lessonCount = new Map<string, number>(lessonRows.map((row: any) => [String(row._id), Number(row.count)]));
  const mastery = new Map<string, { avg: number; students: number }>(masteryRows.map((row: any) => [String(row._id), { avg: Math.round(row.avg), students: Number(row.students) }]));

  const rows = chapters.map(chapter => {
    const chapterId = chapter.id;
    const title = chapterTitle(chapter);
    const yearMap = new Map<number, number>();
    let questionCount = 0;
    let practiceCount = 0;
    for (const row of questionRows) {
      if (String(row._id.chapterId) !== chapterId) continue;
      const exam = examById.get(String(row._id.exam));
      if (!exam) continue;
      if (exam.kind === 'practice') practiceCount += row.count;
      else {
        questionCount += row.count;
        yearMap.set(exam.year, (yearMap.get(exam.year) || 0) + row.count);
      }
    }
    const chapterWeight = chapter.kind === 'imported' && chapter.doc.examWeight !== null && chapter.doc.examWeight !== undefined ? Number(chapter.doc.examWeight) : undefined;
    const manual = manualWeights.get(chapterId);
    const auto = totalMarks ? round1(((marksByChapter.get(chapterId) || 0) / totalMarks) * 100) : 0;
    const weightSource = chapterWeight !== undefined ? 'chapter' : manual !== undefined ? 'manual' : 'auto';
    const lessons = chapter.kind === 'imported'
      ? lessonCount.get(chapterId) || 0
      : (chapter.doc.items || []).filter((item: any) => item.type === 'lesson').length;
    return {
      id: chapterId,
      order: chapter.doc.order,
      title,
      titleSo: chapter.kind === 'imported' ? chapter.doc.titleSo || '' : '',
      titleEn: chapter.kind === 'imported' ? chapter.doc.titleEn || '' : title,
      titleAr: chapter.kind === 'imported' ? chapter.doc.titleAr || '' : '',
      status: chapter.doc.status || 'published',
      examWeight: chapterWeight ?? manual ?? auto,
      weightSource,
      manuallyEdited: chapter.kind === 'imported' ? !!chapter.doc.manuallyEdited : false,
      lessonCount: lessons,
      questionCount,
      practiceCount,
      years: [...yearMap.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year),
      avgMastery: mastery.get(chapterId)?.avg ?? null,
      masteryStudents: mastery.get(chapterId)?.students ?? 0,
      outsideBook: chapter.kind === 'imported' && /other topics|outside the book/i.test(title),
      editableLessons: chapter.kind === 'imported',
    };
  });

  const totalWeight = rows.reduce((sum, row) => sum + row.examWeight, 0);
  const passMeter = totalWeight
    ? Math.round(rows.reduce((sum, row) => sum + (row.avgMastery || 0) * row.examWeight, 0) / totalWeight)
    : 0;

  const examQuestionCount = new Map<string, number>();
  for (const row of questionRows) examQuestionCount.set(String(row._id.exam), (examQuestionCount.get(String(row._id.exam)) || 0) + row.count);

  return ApiResponse.success(res, {
    course: { id: String(course._id), title: course.title, grade: course.globalGrade, status: course.status, language: subject?.language || 'en', students },
    mode,
    config: {
      passTarget: config?.passTarget ?? 70,
      targetExamDate: config?.targetExamDate || null,
    },
    glossary: importedGlossary.length
      ? { source: 'import', terms: importedGlossary.map(item => ({ termSo: item.termSo, termEn: item.termEn, termAr: item.termAr })) }
      : { source: 'config', terms: config?.glossary || [] },
    chapters: rows,
    exams: exams.map(exam => ({
      id: String(exam._id),
      year: exam.year,
      kind: exam.kind || 'past',
      published: exam.published,
      answerKeyStatus: exam.answerKeyStatus,
      durationMin: exam.durationMin,
      totalMarks: exam.totalMarks,
      source: exam.source || '',
      questionCount: examQuestionCount.get(String(exam._id)) || 0,
    })),
    stats: {
      chapters: rows.length,
      questions: questionRows.reduce((sum: number, row: any) => sum + row.count, 0),
      pastExams: exams.filter(exam => (exam.kind || 'past') !== 'practice').length,
      totalWeight: round1(totalWeight),
      passMeter,
      unmatchedPending,
    },
  });
}));

// ---------------------------------------------------------------------------
// One chapter: lessons + questions
// ---------------------------------------------------------------------------

function answerView(question: any) {
  return {
    answer: question.answer ?? null,
    answerDisplay: describeAnswer(question.type, question.answer, question.options),
  };
}

router.get('/courses/:courseId/chapters/:chapterId', asyncHandler(async (req, res) => {
  const course = await loadCourse(req.params.courseId);
  const { chapter } = await findChapter(course._id, req.params.chapterId);

  const [exams, questions, resources] = await Promise.all([
    GuuldoonExam.find({ course: course._id }).sort({ year: -1 }).lean(),
    GuuldoonQuestion.find({ course: course._id, chapterId: chapter.id }).select('+answer').sort({ number: 1 }).limit(1500).lean(),
    chapter.kind === 'imported'
      ? GuuldoonResource.find({ course: course._id, chapterExternalId: chapter.id }).sort({ pageFrom: 1, createdAt: 1 }).lean()
      : Promise.resolve([] as any[]),
  ]);

  const lessons = chapter.kind === 'imported'
    ? resources.map((resource: any) => ({
      id: String(resource._id),
      title: resource.title,
      type: resource.type,
      contentText: resource.contentText || '',
      url: resource.url || '',
      pageFrom: resource.pageFrom ?? null,
      pageTo: resource.pageTo ?? null,
      language: resource.language,
      direction: resource.direction,
      manuallyEdited: !!resource.manuallyEdited,
      readOnly: false,
    }))
    : (chapter.doc.items || [])
      .filter((item: any) => item.type === 'lesson')
      .sort((a: any, b: any) => a.order - b.order)
      .map((item: any) => ({
        id: String(item._id), title: item.title, type: 'note', contentText: '', url: '', pageFrom: null, pageTo: null,
        language: 'en', direction: 'auto', manuallyEdited: false, readOnly: true,
      }));

  return ApiResponse.success(res, {
    chapterId: chapter.id,
    chapter: { id: chapter.id, title: chapterTitle(chapter), order: chapter.doc.order },
    lessons,
    questions: questions.map((question: any) => ({
      id: String(question._id),
      examId: String(question.exam),
      number: question.number,
      type: question.type,
      language: question.language,
      direction: question.direction,
      textSo: question.textSo,
      textEn: question.textEn || '',
      options: question.options || [],
      marks: question.marks,
      figureUrl: question.figureUrl || '',
      chapterId: question.chapterId,
      topicTags: question.topicTags || [],
      answerStatus: question.answerStatus,
      explainerText: question.explainerText || '',
      manuallyEdited: !!question.manuallyEdited,
      ...answerView(question),
    })),
    exams: exams.map(exam => ({
      id: String(exam._id), year: exam.year, kind: exam.kind || 'past', published: exam.published, answerKeyStatus: exam.answerKeyStatus,
    })),
  });
}));

// ---------------------------------------------------------------------------
// Chapter edits
// ---------------------------------------------------------------------------

router.patch('/courses/:courseId/chapters/:chapterId', asyncHandler(async (req, res) => {
  const course = await loadCourse(req.params.courseId);
  const { chapter } = await findChapter(course._id, req.params.chapterId);

  let examWeight: number | undefined;
  if (req.body?.examWeight !== undefined && req.body.examWeight !== null && req.body.examWeight !== '') {
    examWeight = Number(req.body.examWeight);
    if (!Number.isFinite(examWeight) || examWeight < 0 || examWeight > 100) throw new BadRequestError('Exam weight must be between 0 and 100');
  }

  if (chapter.kind === 'imported') {
    const set: Record<string, unknown> = { manuallyEdited: true };
    const titleSo = req.body?.titleSo !== undefined ? text(req.body.titleSo, 300) : chapter.doc.titleSo || '';
    const titleAr = req.body?.titleAr !== undefined ? text(req.body.titleAr, 300) : chapter.doc.titleAr || '';
    let titleEn = req.body?.titleEn !== undefined ? text(req.body.titleEn, 300) : chapter.doc.titleEn || '';
    titleEn = titleEn || titleSo || titleAr;
    if (!titleEn) throw new BadRequestError('Chapter title is required');
    Object.assign(set, { titleSo, titleEn, titleAr });
    if (examWeight !== undefined) set.examWeight = examWeight;
    if (req.body?.status !== undefined) {
      if (!['draft', 'published'].includes(req.body.status)) throw new BadRequestError('Invalid chapter status');
      set.status = req.body.status;
    }
    await GuuldoonChapter.updateOne({ _id: chapter.doc._id }, { $set: set });
  } else {
    if (examWeight === undefined) throw new BadRequestError('Only the exam weight can be edited for this course');
    const config = await GuuldoonConfig.findOne({ course: course._id });
    const weights = (config?.chapterWeights || []).filter(item => item.chapterId !== chapter.id);
    weights.push({ chapterId: chapter.id, examWeight });
    await GuuldoonConfig.updateOne({ course: course._id }, { $set: { chapterWeights: weights } }, { upsert: true, setDefaultsOnInsert: true });
  }
  return ApiResponse.success(res, { id: chapter.id }, 'Chapter updated');
}));

// ---------------------------------------------------------------------------
// Lessons (imported resources)
// ---------------------------------------------------------------------------

function lessonFields(body: any, partial: boolean) {
  const set: Record<string, unknown> = {};
  if (!partial || body?.title !== undefined) {
    const title = text(body?.title, 300);
    if (!title) throw new BadRequestError('Lesson title is required');
    set.title = title;
  }
  if (body?.contentText !== undefined) set.contentText = String(body.contentText ?? '').slice(0, 200000);
  if (body?.url !== undefined) set.url = text(body.url, 2000);
  for (const key of ['pageFrom', 'pageTo'] as const) {
    if (body?.[key] === undefined) continue;
    const value = body[key] === null || body[key] === '' ? null : Number(body[key]);
    if (value !== null && (!Number.isInteger(value) || value < 1)) throw new BadRequestError(`${key} must be a positive whole number`);
    set[key] = value;
  }
  if (body?.language !== undefined) {
    if (!LANGUAGES.includes(body.language)) throw new BadRequestError('Invalid language');
    set.language = body.language;
  }
  if (body?.direction !== undefined) {
    if (!['ltr', 'rtl', 'auto'].includes(body.direction)) throw new BadRequestError('Invalid direction');
    set.direction = body.direction;
  }
  return set;
}

router.post('/courses/:courseId/chapters/:chapterId/lessons', asyncHandler(async (req, res) => {
  const course = await loadCourse(req.params.courseId);
  const { chapter } = await findChapter(course._id, req.params.chapterId);
  if (chapter.kind !== 'imported') throw new BadRequestError('Lessons of this course are edited in Chapters & Lessons');
  const type = req.body?.type === undefined ? 'note' : String(req.body.type);
  if (!RESOURCE_TYPES.includes(type)) throw new BadRequestError('Invalid lesson type');
  const subject = await GuuldoonSubject.findOne({ course: course._id, externalId: chapter.doc.subjectExternalId }).select('language').lean();
  const fields = lessonFields(req.body, false);
  const resource = await GuuldoonResource.create({
    language: subject?.language || 'so',
    direction: 'auto',
    ...fields,
    course: course._id,
    externalId: `${chapter.id}_MANUAL_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase(),
    subjectExternalId: chapter.doc.subjectExternalId,
    chapterExternalId: chapter.id,
    type,
    manuallyEdited: true,
  });
  return ApiResponse.created(res, { id: String(resource._id) }, 'Lesson created');
}));

async function loadLesson(lessonId: string) {
  const resource = await GuuldoonResource.findById(objectId(lessonId, 'lesson ID'));
  if (!resource) throw new NotFoundError('Lesson');
  return resource;
}

router.patch('/lessons/:lessonId', asyncHandler(async (req, res) => {
  const resource = await loadLesson(req.params.lessonId);
  Object.assign(resource, lessonFields(req.body, true), { manuallyEdited: true });
  await resource.save();
  return ApiResponse.success(res, { id: String(resource._id) }, 'Lesson updated');
}));

router.delete('/lessons/:lessonId', asyncHandler(async (req, res) => {
  const resource = await loadLesson(req.params.lessonId);
  await resource.deleteOne();
  return ApiResponse.success(res, { deleted: true }, 'Lesson deleted');
}));

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/** Validates the answer key the editor sends against the (possibly edited) question type and options. */
function checkedAnswer(type: string, options: string[] | undefined, answer: unknown): unknown {
  if (answer === undefined || answer === null || answer === '') return undefined;
  if (type === 'mcq') {
    if (!Number.isInteger(answer) || (answer as number) < 0 || (answer as number) >= (options?.length || 0)) {
      throw new BadRequestError('The correct option must be one of the listed options');
    }
    return answer;
  }
  if (type === 'match') throw new BadRequestError('Matching answers are changed in the Excel import');
  if (typeof answer === 'string') return answer.trim().slice(0, 2000);
  if (isAnswerSpec(answer)) {
    if (answer.kind === 'text') {
      const accepted = [...new Set(answer.accepted.map(item => item.trim()).filter(Boolean))];
      if (!accepted.length) throw new BadRequestError('At least one accepted answer is required');
      return { kind: 'text', accepted };
    }
    const spec: Record<string, unknown> = { kind: 'numeric', value: Number(answer.value) };
    if (answer.tolerancePct !== undefined && answer.tolerancePct !== null) spec.tolerancePct = Math.max(0, Number(answer.tolerancePct) || 0);
    if (answer.unit) spec.unit = String(answer.unit).trim().slice(0, 40);
    return spec;
  }
  throw new BadRequestError('Unsupported answer format');
}

async function courseChapterIdSet(courseId: mongoose.Types.ObjectId): Promise<Set<string>> {
  const { chapters } = await loadChapters(courseId);
  return new Set(chapters.map(chapter => chapter.id));
}

async function nextQuestionNumber(examId: mongoose.Types.ObjectId): Promise<number> {
  const last = await GuuldoonQuestion.findOne({ exam: examId }).sort({ number: -1 }).select('number').lean();
  return (last?.number || 0) + 1;
}

function questionFields(body: any, type: string, partial: boolean) {
  const set: Record<string, unknown> = {};
  if (!partial || body?.textSo !== undefined) {
    const textSo = text(body?.textSo, 10000);
    if (!textSo) throw new BadRequestError('Question text is required');
    set.textSo = textSo;
  }
  if (body?.textEn !== undefined) set.textEn = text(body.textEn, 10000);
  if (body?.marks !== undefined) {
    const marks = Number(body.marks);
    if (!Number.isFinite(marks) || marks < 0 || marks > 100) throw new BadRequestError('Marks must be between 0 and 100');
    set.marks = marks;
  }
  if (body?.topicTags !== undefined) {
    set.topicTags = Array.isArray(body.topicTags) ? [...new Set(body.topicTags.map((tag: unknown) => text(tag, 80).toLowerCase()).filter(Boolean))] : [];
  }
  if (body?.explainerText !== undefined) set.explainerText = text(body.explainerText, 10000);
  if (body?.language !== undefined) {
    if (!LANGUAGES.includes(body.language)) throw new BadRequestError('Invalid language');
    set.language = body.language;
  }
  if (body?.direction !== undefined) {
    if (!['ltr', 'rtl', 'auto'].includes(body.direction)) throw new BadRequestError('Invalid direction');
    set.direction = body.direction;
  }
  if (body?.answerStatus !== undefined) {
    if (!['verified', 'pending'].includes(body.answerStatus)) throw new BadRequestError('Invalid answer status');
    set.answerStatus = body.answerStatus;
  }
  if (body?.options !== undefined) {
    if (type === 'match') throw new BadRequestError('Matching pairs are changed in the Excel import');
    const options = Array.isArray(body.options) ? body.options.map((option: unknown) => text(option, 1000)) : [];
    if (options.some((option: string) => !option)) throw new BadRequestError('Options cannot be empty');
    if (type === 'mcq' && options.length < 2) throw new BadRequestError('A multiple-choice question needs at least two options');
    set.options = options;
  }
  return set;
}

router.post('/courses/:courseId/questions', asyncHandler(async (req, res) => {
  const course = await loadCourse(req.params.courseId);
  const exam = await GuuldoonExam.findOne({ _id: objectId(String(req.body?.examId), 'exam ID'), course: course._id }).lean();
  if (!exam) throw new NotFoundError('Exam');
  const chapterId = text(req.body?.chapterId, 200);
  if (!(await courseChapterIdSet(course._id)).has(chapterId)) throw new BadRequestError('chapterId does not exist in this course');
  const type = String(req.body?.type || 'mcq');
  if (!QUESTION_TYPES.includes(type) || type === 'match') throw new BadRequestError('Choose multiple-choice, short-answer or structured');

  const fields: any = questionFields(req.body, type, false);
  const answer = checkedAnswer(type, fields.options, req.body?.answer);
  const answerStatus = fields.answerStatus === 'verified' ? 'verified' : 'pending';
  if (answerStatus === 'verified' && answer === undefined && ['mcq', 'fill'].includes(type)) throw new BadRequestError('A verified question needs a correct answer');

  const question = await GuuldoonQuestion.create({
    marks: 1,
    ...fields,
    course: course._id,
    exam: exam._id,
    examExternalId: exam.externalId || '',
    number: await nextQuestionNumber(exam._id),
    type,
    chapterId,
    answer,
    answerStatus,
    markingMode: answerStatus === 'verified' && isAutoMarkable(type, answer) ? 'auto' : 'manual',
    manuallyEdited: true,
  });
  return ApiResponse.created(res, { id: String(question._id), number: question.number }, 'Question created');
}));

async function loadQuestion(questionId: string) {
  const question = await GuuldoonQuestion.findById(objectId(questionId, 'question ID')).select('+answer');
  if (!question) throw new NotFoundError('Question');
  return question;
}

router.patch('/questions/:questionId', asyncHandler(async (req, res) => {
  const question = await loadQuestion(req.params.questionId);
  const type = question.type;
  const set: any = questionFields(req.body, type, true);

  if (req.body?.chapterId !== undefined) {
    const chapterId = text(req.body.chapterId, 200);
    if (!(await courseChapterIdSet(question.course)).has(chapterId)) throw new BadRequestError('chapterId does not exist in this course');
    set.chapterId = chapterId;
  }
  if (req.body?.examId !== undefined && String(req.body.examId) !== String(question.exam)) {
    const target = await GuuldoonExam.findOne({ _id: objectId(String(req.body.examId), 'exam ID'), course: question.course }).lean();
    if (!target) throw new NotFoundError('Exam');
    set.exam = target._id;
    set.examExternalId = target.externalId || '';
    set.number = await nextQuestionNumber(target._id);
  }

  const options: string[] | undefined = set.options ?? question.options;
  let answer: unknown = question.answer;
  if (req.body?.answer !== undefined) answer = checkedAnswer(type, options, req.body.answer);
  else if (type === 'mcq' && set.options && Number.isInteger(answer) && (answer as number) >= (set.options as string[]).length) {
    throw new BadRequestError('The correct option no longer exists; choose the correct answer again');
  }
  const answerStatus = set.answerStatus ?? question.answerStatus;
  if (answerStatus === 'verified' && ['mcq', 'fill'].includes(type) && (answer === undefined || answer === null || answer === '')) {
    throw new BadRequestError('A verified question needs a correct answer');
  }

  question.set({
    ...set,
    answer,
    answerStatus,
    markingMode: answerStatus === 'verified' && isAutoMarkable(type, answer) ? 'auto' : 'manual',
    manuallyEdited: true,
  });
  question.markModified('answer');
  await question.save();
  return ApiResponse.success(res, { id: String(question._id), number: question.number }, 'Question updated');
}));

router.delete('/questions/:questionId', asyncHandler(async (req, res) => {
  const question = await loadQuestion(req.params.questionId);
  await Promise.all([
    GuuldoonAttempt.deleteMany({ course: question.course, question: question._id }),
    GuuldoonMistake.deleteMany({ course: question.course, question: question._id }),
    GuuldoonUnmatchedAnswer.deleteMany({ question: question._id }),
    GuuldoonQuestion.updateMany({ similarIds: question._id }, { $pull: { similarIds: question._id } }),
    GuuldoonQuestion.updateMany({ parent: question._id }, { $set: { parent: null } }),
  ]);
  await question.deleteOne();
  return ApiResponse.success(res, { deleted: true }, 'Question deleted');
}));

// ---------------------------------------------------------------------------
// Course settings (target and date; never touches chapter weights)
// ---------------------------------------------------------------------------

router.put('/courses/:courseId/settings', asyncHandler(async (req, res) => {
  const course = await loadCourse(req.params.courseId);
  const set: Record<string, unknown> = {};
  if (req.body?.passTarget !== undefined) {
    const passTarget = Number(req.body.passTarget);
    if (!Number.isFinite(passTarget) || passTarget < 0 || passTarget > 100) throw new BadRequestError('Pass target must be between 0 and 100');
    set.passTarget = passTarget;
  }
  if (req.body?.targetExamDate !== undefined) {
    const date = req.body.targetExamDate ? new Date(req.body.targetExamDate) : null;
    if (date && Number.isNaN(date.getTime())) throw new BadRequestError('Invalid target exam date');
    set.targetExamDate = date;
  }
  if (req.body?.glossary !== undefined) {
    const glossary = Array.isArray(req.body.glossary) ? req.body.glossary.slice(0, 1000) : [];
    set.glossary = glossary
      .map((row: any) => ({ termSo: text(row?.termSo, 200), termEn: text(row?.termEn, 200), termAr: text(row?.termAr, 200) }))
      .filter((row: any) => row.termSo && row.termEn && row.termAr);
  }
  const saved = await GuuldoonConfig.findOneAndUpdate(
    { course: course._id },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return ApiResponse.success(res, { passTarget: saved.passTarget, targetExamDate: saved.targetExamDate || null }, 'Guuldoon settings saved');
}));

export default router;
