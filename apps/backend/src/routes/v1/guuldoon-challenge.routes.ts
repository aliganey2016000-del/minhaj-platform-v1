import { Router } from 'express';
import mongoose from 'mongoose';
import Course from '../../models/course.model';
import ClassModel from '../../models/class.model';
import Student from '../../models/student.model';
import Profile from '../../models/profile.model';
import Notification from '../../models/notification.model';
import GuuldoonChallenge from '../../models/guuldoon-challenge.model';
import GuuldoonExam from '../../models/guuldoon-past-exam.model';
import GuuldoonQuestion from '../../models/guuldoon-question.model';
import GuuldoonAttempt from '../../models/guuldoon-attempt.model';
import { describeAnswer } from '../../services/guuldoon-marking.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';
import { buildMyAnswers, loadCourseExperienceShared } from './guuldoon.routes';

const router = Router();
router.use(authMiddleware);

const MAX_QUESTIONS = 300;
const MAX_CLASSES = 10;
const isStaff = (role?: string) => role === 'teacher' || role === 'org_admin';

function oid(value: unknown, label: string) {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) throw new BadRequestError(`Invalid ${label}`);
  return new mongoose.Types.ObjectId(value);
}

function plainTitle(title: any): string {
  if (!title) return '';
  if (typeof title === 'string') return title;
  return title.so || title.en || title.ar || Object.values(title).find((value) => typeof value === 'string') as string || '';
}

/**
 * Teachers and school administrators work inside their own school. The Super
 * Admin works across schools: `school` is null and every school's classes are in reach.
 */
function requireStaff(req: any): mongoose.Types.ObjectId | null {
  if (req.user?.isStaff) throw new ForbiddenError('Teacher access required');
  if (req.user?.role === 'admin') return null;
  if (!isStaff(req.user?.role) || !req.user?.organizationId) throw new ForbiddenError('Teacher access required');
  return new mongoose.Types.ObjectId(req.user.organizationId);
}
const schoolFilter = (school: mongoose.Types.ObjectId | null) => (school ? { school } : {});

/** A teacher sees their own challenges; a school administrator sees the whole school's. */
async function loadOwnChallenge(req: any, id: string) {
  const school = requireStaff(req);
  const challenge = await GuuldoonChallenge.findOne({ _id: oid(id, 'challenge ID'), ...schoolFilter(school) }).lean();
  if (!challenge) throw new NotFoundError('Challenge');
  if (req.user.role === 'teacher' && String(challenge.createdBy) !== String(req.user.userId)) throw new NotFoundError('Challenge');
  return challenge;
}

async function classRoster(school: mongoose.Types.ObjectId | null, classIds: mongoose.Types.ObjectId[]) {
  const students: any[] = await Student.find({ ...schoolFilter(school), class: { $in: classIds }, status: 'active', approvalStatus: 'approved' })
    .select('user profile class studentId').limit(5000).lean();
  const profiles: any[] = await Profile.find({ _id: { $in: students.map((student) => student.profile).filter(Boolean) } }).select('firstName lastName').lean();
  const nameOf = new Map(profiles.map((profile) => [String(profile._id), `${profile.firstName || ''} ${profile.lastName || ''}`.trim()]));
  return students.map((student) => ({
    userId: String(student.user),
    studentId: student.studentId as string,
    name: nameOf.get(String(student.profile)) || student.studentId,
  }));
}

/** Latest marked attempt per student and question, only counting work done after the challenge opened. */
async function latestAttempts(challenge: any, userIds: string[]) {
  if (!userIds.length || !challenge.questionIds.length) return [] as any[];
  return GuuldoonAttempt.find({
    user: { $in: userIds },
    question: { $in: challenge.questionIds },
    retry: { $ne: true },
    createdAt: { $gte: challenge.createdAt },
  }).sort({ createdAt: 1 }).select('user question answer correct timeMs createdAt').lean();
}

// ---------------------------------------------------------------------------
// Teacher: what can be put in a challenge
// ---------------------------------------------------------------------------

router.get('/options', asyncHandler(async (req, res) => {
  const school = requireStaff(req);
  const [courses, classes] = await Promise.all([
    Course.find({ scope: 'global', status: 'published', globalGrade: { $in: [8, 12] } }).select('title globalGrade').lean(),
    ClassModel.find({ ...schoolFilter(school), gradeLevel: { $in: [8, 12] } }).select('title gradeLevel school').populate('school', 'name').limit(2000).lean(),
  ]);
  const courseRows = await Promise.all((courses as any[]).map(async (course) => {
    const shared: any = await loadCourseExperienceShared(course._id);
    // Names are shown in the language the book is written in.
    const language: 'so' | 'en' | 'ar' = shared.importedSubject?.language === 'ar' ? 'ar' : shared.importedSubject?.language === 'so' ? 'so' : 'en';
    const order: Array<'So' | 'En' | 'Ar'> = language === 'ar' ? ['Ar', 'En', 'So'] : language === 'so' ? ['So', 'En', 'Ar'] : ['En', 'So', 'Ar'];
    const exams: any[] = await GuuldoonExam.find({ course: course._id, published: true }).sort({ year: -1 }).select('year kind durationMin totalMarks').lean();
    const examCounts = new Map<string, number>((await GuuldoonQuestion.aggregate([
      { $match: { course: course._id, exam: { $in: exams.map((exam) => exam._id) } } },
      { $group: { _id: '$exam', count: { $sum: 1 } } },
    ])).map((row: any) => [String(row._id), Number(row.count)]));
    const pastCount = new Map<string, number>();
    for (const row of shared.chapterQuestionRows as any[]) pastCount.set(String(row._id.chapterId), (pastCount.get(String(row._id.chapterId)) || 0) + Number(row.count || 0));
    const understandCount = new Map<string, number>((shared.practiceRows as any[]).map((row) => [String(row._id), Number(row.count || 0)]));
    const courseTitle = course.title && typeof course.title === 'object'
      ? order.map((key) => course.title[key.toLowerCase()]).find(Boolean) || plainTitle(course.title)
      : plainTitle(course.title);
    return {
      id: String(course._id),
      title: courseTitle,
      grade: course.globalGrade,
      language,
      chapters: shared.chapters.map((chapter: any, index: number) => {
        const id = shared.usingUniversalImport ? String(chapter.externalId) : String(chapter._id);
        const title = shared.usingUniversalImport ? order.map((key) => chapter[`title${key}`]).find(Boolean) : chapter.title;
        return { id, number: index + 1, title: title || id, understand: understandCount.get(id) || 0, past: pastCount.get(id) || 0 };
      }),
      exams: exams.filter((exam) => exam.kind !== 'practice').map((exam) => ({
        id: String(exam._id), year: exam.year, questions: examCounts.get(String(exam._id)) || 0, durationMin: exam.durationMin, totalMarks: exam.totalMarks,
      })),
    };
  }));
  return ApiResponse.success(res, {
    courses: courseRows,
    classes: (classes as any[]).map((classroom) => ({ id: String(classroom._id), title: classroom.title, grade: classroom.gradeLevel, school: school ? '' : classroom.school?.name || '' })),
    platformWide: !school,
  });
}));

/** The question ids a chapter/exam selection resolves to (capped one over the limit so callers can detect "too many"). */
async function resolveQuestionIds(courseId: mongoose.Types.ObjectId, chapterIds: string[], sources: string[], examIds: mongoose.Types.ObjectId[], pickedIds: mongoose.Types.ObjectId[] = []) {
  const published: any[] = await GuuldoonExam.find({ course: courseId, published: true }).select('_id kind').lean();
  const understandExams = published.filter((exam) => exam.kind === 'practice').map((exam) => exam._id);
  const pastExams = published.filter((exam) => exam.kind !== 'practice').map((exam) => exam._id);
  const allowedExams = new Set(published.map((exam) => String(exam._id)));
  if (examIds.some((id) => !allowedExams.has(String(id)))) throw new BadRequestError('Exam not available in this course');
  const filters: any[] = [];
  if (chapterIds.length && sources.includes('understand') && understandExams.length) filters.push({ exam: { $in: understandExams }, chapterId: { $in: chapterIds } });
  if (chapterIds.length && sources.includes('past') && pastExams.length) filters.push({ exam: { $in: pastExams }, chapterId: { $in: chapterIds } });
  if (examIds.length) filters.push({ exam: { $in: examIds } });
  // Individually picked questions (part of a chapter or exam); only ones that really belong to this course's published exams.
  if (pickedIds.length) filters.push({ _id: { $in: pickedIds }, exam: { $in: published.map((exam) => exam._id) } });
  const questions: any[] = filters.length
    ? await GuuldoonQuestion.find({ course: courseId, $or: filters }).select('_id').limit(MAX_QUESTIONS + 1).lean()
    : [];
  return questions.map((question) => question._id as mongoose.Types.ObjectId);
}

function parseSelection(body: any) {
  const chapterIds: string[] = Array.isArray(body.chapterIds) ? body.chapterIds.filter((id: unknown) => typeof id === 'string').slice(0, 100) : [];
  const sources: Array<'understand' | 'past'> = Array.isArray(body.sources) ? body.sources.filter((value: unknown) => value === 'understand' || value === 'past') : [];
  const examIds: mongoose.Types.ObjectId[] = Array.isArray(body.examIds) ? body.examIds.slice(0, 50).map((id: unknown) => oid(id, 'exam ID')) : [];
  const pickedIds: mongoose.Types.ObjectId[] = Array.isArray(body.questionIds) ? body.questionIds.slice(0, MAX_QUESTIONS).map((id: unknown) => oid(id, 'question ID')) : [];
  return { chapterIds, sources, examIds, pickedIds };
}

// ---------------------------------------------------------------------------
// Teacher: create and list
// ---------------------------------------------------------------------------

/** The questions of one chapter (understanding or past papers) or one exam, so a teacher can pick some of them. Never sends answers. */
router.get('/questions', asyncHandler(async (req, res) => {
  requireStaff(req);
  const courseId = oid(req.query.courseId, 'course ID');
  const course = await Course.exists({ _id: courseId, scope: 'global', status: 'published' });
  if (!course) throw new NotFoundError('Guulgaar course');
  let filter: any;
  if (typeof req.query.examId === 'string' && req.query.examId) {
    const exam = await GuuldoonExam.exists({ _id: oid(req.query.examId, 'exam ID'), course: courseId, published: true });
    if (!exam) throw new NotFoundError('Guulgaar exam');
    filter = { exam: oid(req.query.examId, 'exam ID') };
  } else {
    const chapterId = typeof req.query.chapterId === 'string' ? req.query.chapterId : '';
    if (!chapterId) throw new BadRequestError('chapterId or examId is required');
    const exams: any[] = await GuuldoonExam.find({ course: courseId, published: true, kind: req.query.source === 'past' ? { $ne: 'practice' } : 'practice' }).select('_id').lean();
    filter = { exam: { $in: exams.map((exam) => exam._id) }, chapterId };
  }
  const rows: any[] = await GuuldoonQuestion.find({ course: courseId, ...filter }).select('number type textSo textEn marks exam').populate('exam', 'year').sort({ number: 1 }).limit(500).lean();
  const items = rows.map((row) => ({
    id: String(row._id), number: row.number, type: row.type, marks: row.marks, year: row.exam?.year || null,
    text: String(row.textSo || row.textEn || '').slice(0, 220),
  }));
  items.sort((a, b) => (b.year || 0) - (a.year || 0) || a.number - b.number);
  return ApiResponse.success(res, items);
}));

/** How many questions a selection holds, so the form can show it live. */
router.post('/preview', asyncHandler(async (req, res) => {
  requireStaff(req);
  const courseId = oid(req.body?.courseId, 'course ID');
  const { chapterIds, sources, examIds, pickedIds } = parseSelection(req.body || {});
  const ids = await resolveQuestionIds(courseId, chapterIds, sources, examIds, pickedIds);
  return ApiResponse.success(res, { questions: Math.min(ids.length, MAX_QUESTIONS), tooMany: ids.length > MAX_QUESTIONS, max: MAX_QUESTIONS });
}));

router.post('/', asyncHandler(async (req, res) => {
  const school = requireStaff(req);
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
  if (!title) throw new BadRequestError('Title is required');
  const courseId = oid(body.courseId, 'course ID');
  const course: any = await Course.findOne({ _id: courseId, scope: 'global', status: 'published' }).select('globalGrade').lean();
  if (!course) throw new NotFoundError('Guulgaar course');

  const { chapterIds, sources, examIds, pickedIds } = parseSelection(body);
  if (!(chapterIds.length && sources.length) && !examIds.length && !pickedIds.length) throw new BadRequestError('Choose at least one chapter, exam or question');

  let classIds: mongoose.Types.ObjectId[];
  if (!school && body.allSchools === true) {
    // Super Admin: every class of the course grade, in every school.
    const every: any[] = await ClassModel.find({ gradeLevel: course.globalGrade }).select('_id').limit(5000).lean();
    classIds = every.map((classroom) => classroom._id);
  } else {
    classIds = Array.isArray(body.classIds) ? body.classIds.slice(0, school ? MAX_CLASSES : 500).map((id: unknown) => oid(id, 'class ID')) : [];
    const classes: any[] = await ClassModel.find({ _id: { $in: classIds }, ...schoolFilter(school), gradeLevel: course.globalGrade }).select('_id').lean();
    if (classes.length !== classIds.length) throw new BadRequestError('Every class must belong to your school and match the course grade');
  }
  if (!classIds.length) throw new BadRequestError('Choose at least one class');

  let deadline: Date | undefined;
  if (body.deadline) {
    deadline = new Date(body.deadline);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() < Date.now()) throw new BadRequestError('Deadline must be a future date');
  }

  const questions = await resolveQuestionIds(courseId, chapterIds, sources, examIds, pickedIds).then((ids) => ids.map((id) => ({ _id: id })));
  if (!questions.length) throw new BadRequestError('The chosen material has no questions yet');
  if (questions.length > MAX_QUESTIONS) throw new BadRequestError(`A challenge can hold at most ${MAX_QUESTIONS} questions`);

  const challenge = await GuuldoonChallenge.create({
    ...(school ? { school } : {}), createdBy: req.user!.userId, course: courseId, title, chapterIds, sources, examIds,
    classes: classIds, deadline, questionIds: questions.map((question) => question._id),
  });

  // Tell the students in the chosen classes (one notification each).
  const roster = await classRoster(school, classIds);
  if (roster.length) {
    await Notification.insertMany(roster.map((student) => ({
      user: student.userId,
      title: 'Tartan cusub',
      message: `${title}${deadline ? ` · Dhammaad: ${deadline.toISOString().slice(0, 10)}` : ''}`,
      type: 'info',
      link: '/student/guuldoon/challenges',
      metadata: { dedupeKey: `challenge:${challenge._id}` },
    })), { ordered: false });
  }
  return ApiResponse.created(res, { id: String(challenge._id), questions: questions.length, students: roster.length });
}));

router.get('/', asyncHandler(async (req, res) => {
  const school = requireStaff(req);
  const filter: any = { ...schoolFilter(school) };
  if (req.user!.role === 'teacher') filter.createdBy = req.user!.userId;
  const challenges: any[] = await GuuldoonChallenge.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  const rows = await Promise.all(challenges.map(async (challenge) => {
    const roster = await classRoster(school, challenge.classes);
    const attempts = await latestAttempts(challenge, roster.map((student) => student.userId));
    const answeredBy = new Map<string, Set<string>>();
    for (const attempt of attempts) {
      const set = answeredBy.get(String(attempt.user)) || new Set<string>();
      set.add(String(attempt.question));
      answeredBy.set(String(attempt.user), set);
    }
    const total = challenge.questionIds.length;
    const done = [...answeredBy.values()].filter((set) => set.size >= total).length;
    return {
      id: String(challenge._id), title: challenge.title, status: challenge.status,
      deadline: challenge.deadline || null, questions: total, students: roster.length,
      done, started: answeredBy.size, createdAt: challenge.createdAt,
    };
  }));
  return ApiResponse.success(res, rows);
}));

// ---------------------------------------------------------------------------
// Teacher: results
// ---------------------------------------------------------------------------

router.get('/:id/results', asyncHandler(async (req, res) => {
  const challenge: any = await loadOwnChallenge(req, req.params.id);
  const school = requireStaff(req);
  const roster = await classRoster(school, challenge.classes);
  const attempts = await latestAttempts(challenge, roster.map((student) => student.userId));
  const questions: any[] = await GuuldoonQuestion.find({ _id: { $in: challenge.questionIds } })
    .select('+answer number type textSo textEn options chapterId exam answerStatus').sort({ number: 1 }).lean();
  const qMap = new Map(questions.map((question) => [String(question._id), question]));

  // Latest attempt per student per question.
  const latest = new Map<string, Map<string, any>>();
  for (const attempt of attempts) {
    const perStudent = latest.get(String(attempt.user)) || new Map<string, any>();
    perStudent.set(String(attempt.question), attempt);
    latest.set(String(attempt.user), perStudent);
  }
  const total = challenge.questionIds.length;

  const students = roster.map((student) => {
    const mine = latest.get(student.userId);
    const answered = mine ? mine.size : 0;
    const marked = mine ? [...mine.values()].filter((attempt) => attempt.correct !== null) : [];
    const correct = marked.filter((attempt) => attempt.correct === true).length;
    const timeMs = mine ? [...mine.values()].reduce((sum, attempt) => sum + (attempt.timeMs || 0), 0) : 0;
    return {
      userId: student.userId, studentId: student.studentId, name: student.name,
      state: answered >= total ? 'done' : answered > 0 ? 'mid' : 'none',
      answered, correct, markedCount: marked.length,
      accuracy: marked.length ? Math.round((correct / marked.length) * 100) : null,
      minutes: Math.round(timeMs / 60000),
    };
  }).sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1) || a.name.localeCompare(b.name));

  const questionRows = questions.map((question) => {
    const picks: Array<{ answer: string; correct: boolean | null }> = [];
    for (const perStudent of latest.values()) {
      const attempt = perStudent.get(String(question._id));
      if (attempt) picks.push({ answer: describeAnswer(question.type, attempt.answer, question.options) || '—', correct: attempt.correct });
    }
    const marked = picks.filter((pick) => pick.correct !== null);
    const correct = marked.filter((pick) => pick.correct).length;
    const spread = new Map<string, { answer: string; count: number; right: boolean }>();
    for (const pick of picks) {
      const entry = spread.get(pick.answer) || { answer: pick.answer, count: 0, right: pick.correct === true };
      entry.count += 1;
      spread.set(pick.answer, entry);
    }
    return {
      id: String(question._id), number: question.number, type: question.type, text: question.textSo || question.textEn,
      attempted: picks.length, correct, accuracy: marked.length ? Math.round((correct / marked.length) * 100) : null,
      right: question.answerStatus === 'verified' ? describeAnswer(question.type, question.answer, question.options) : '',
      spread: [...spread.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    };
  });

  const withAccuracy = students.filter((student) => student.accuracy !== null);
  return ApiResponse.success(res, {
    challenge: { id: String(challenge._id), title: challenge.title, deadline: challenge.deadline || null, status: challenge.status, questions: total },
    summary: {
      students: students.length,
      done: students.filter((student) => student.state === 'done').length,
      mid: students.filter((student) => student.state === 'mid').length,
      none: students.filter((student) => student.state === 'none').length,
      average: withAccuracy.length ? Math.round(withAccuracy.reduce((sum, student) => sum + (student.accuracy as number), 0) / withAccuracy.length) : 0,
    },
    students,
    questions: questionRows,
    // Questions most students got wrong, and students who need a nudge.
    reteach: {
      hardQuestions: questionRows.filter((question) => question.accuracy !== null && question.accuracy < 40 && question.attempted >= 2).map((question) => question.id),
      weakStudents: students.filter((student) => student.state === 'none' || (student.accuracy !== null && student.accuracy < 50)).map((student) => student.userId),
    },
  });
}));

router.get('/:id/students/:userId', asyncHandler(async (req, res) => {
  const challenge: any = await loadOwnChallenge(req, req.params.id);
  const school = requireStaff(req);
  const roster = await classRoster(school, challenge.classes);
  const student = roster.find((entry) => entry.userId === req.params.userId);
  if (!student) throw new NotFoundError('Student');
  const questions: any[] = await GuuldoonQuestion.find({ _id: { $in: challenge.questionIds } }).select('+answer').sort({ number: 1 }).lean();
  const attempts = await latestAttempts(challenge, [student.userId]);
  const result = buildMyAnswers(questions, attempts as any[]);
  result.items.sort((a: any, b: any) => Number(a.correct === true) - Number(b.correct === true) || a.number - b.number);
  return ApiResponse.success(res, { student, total: challenge.questionIds.length, ...result });
}));

router.post('/:id/remind', asyncHandler(async (req, res) => {
  const challenge: any = await loadOwnChallenge(req, req.params.id);
  const school = requireStaff(req);
  const roster = await classRoster(school, challenge.classes);
  const attempts = await latestAttempts(challenge, roster.map((student) => student.userId));
  const answered = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    const set = answered.get(String(attempt.user)) || new Set<string>();
    set.add(String(attempt.question));
    answered.set(String(attempt.user), set);
  }
  const total = challenge.questionIds.length;
  let targets = roster.filter((student) => (answered.get(student.userId)?.size || 0) < total);
  if (Array.isArray(req.body?.userIds)) {
    const wanted = new Set(req.body.userIds.map(String));
    targets = targets.filter((student) => wanted.has(student.userId));
  }
  if (targets.length) {
    await Notification.insertMany(targets.map((student) => ({
      user: student.userId,
      title: 'Xusuusin tartan',
      message: `Ku dhammaystir tartanka: ${challenge.title}`,
      type: 'warning',
      link: '/student/guuldoon/challenges',
    })), { ordered: false });
  }
  return ApiResponse.success(res, { sent: targets.length });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const challenge: any = await loadOwnChallenge(req, req.params.id);
  const status = req.body?.status;
  if (status !== 'active' && status !== 'closed') throw new BadRequestError('Invalid status');
  await GuuldoonChallenge.updateOne({ _id: challenge._id }, { $set: { status } });
  return ApiResponse.success(res, { status });
}));

// ---------------------------------------------------------------------------
// Student: my challenges
// ---------------------------------------------------------------------------

router.get('/mine/list', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student' || req.user.isStaff) throw new ForbiddenError('Student access required');
  const student: any = await Student.findOne({ user: req.user.userId, school: req.user.organizationId, status: 'active', approvalStatus: 'approved' }).select('class').lean();
  if (!student?.class) return ApiResponse.success(res, []);
  const challenges: any[] = await GuuldoonChallenge.find({ classes: student.class, status: 'active' }).sort({ createdAt: -1 }).limit(20).lean();
  const rows = await Promise.all(challenges.map(async (challenge) => {
    const attempts = await latestAttempts(challenge, [String(req.user!.userId)]);
    const done = new Set(attempts.map((attempt: any) => String(attempt.question))).size;
    const correct = new Map<string, boolean>();
    for (const attempt of attempts as any[]) correct.set(String(attempt.question), attempt.correct === true);
    const first: any = await GuuldoonQuestion.findById(challenge.questionIds[0]).select('exam chapterId').populate('exam', 'kind').lean();
    return {
      id: String(challenge._id), title: challenge.title, deadline: challenge.deadline || null,
      courseId: String(challenge.course), total: challenge.questionIds.length, done,
      right: [...correct.values()].filter(Boolean).length,
      chapterId: challenge.chapterIds[0] || first?.chapterId || '',
      examId: challenge.examIds[0] ? String(challenge.examIds[0]) : '',
      source: challenge.sources[0] || (first?.exam?.kind && first.exam.kind !== 'practice' ? 'past' : ''),
    };
  }));
  return ApiResponse.success(res, rows);
}));

export default router;
