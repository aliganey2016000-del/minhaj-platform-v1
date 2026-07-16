/**
 * Exam Attempt Controller
 * Student-facing "Active Exams" — securely launch, take, and submit a
 * computer-based exam once its paper has been approved and the exam is live.
 */

import { Request, Response } from 'express';
import Exam from '../models/exam.model';
import ExamPaper, { IPaperQuestion } from '../models/exam-paper.model';
import ExamAttempt from '../models/exam-attempt.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';

/** Strips correct-answer fields so students never receive them. */
function sanitizeQuestion(q: IPaperQuestion) {
  return {
    _id: q._id,
    type: q.type,
    question: q.question,
    points: q.points,
    options: q.options,
  };
}

// GET /exams/my/active — exams the student can currently launch (or resume)
export const getActiveExams = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const courseIds = (student.enrolledCourses || []).map((id: any) => id);

  const exams = await Exam.find({ course: { $in: courseIds }, status: 'ongoing' })
    .populate('course', 'title.en slug category')
    .lean();

  const examIds = exams.map((e: any) => e._id);
  const [papers, attempts] = await Promise.all([
    ExamPaper.find({ exam: { $in: examIds }, status: 'approved' }).select('exam title totalPoints').lean(),
    ExamAttempt.find({ exam: { $in: examIds }, student: student._id }).lean(),
  ]);

  const paperByExam: Record<string, any> = {};
  for (const p of papers) paperByExam[p.exam.toString()] = p;
  const attemptByExam: Record<string, any> = {};
  for (const a of attempts) attemptByExam[a.exam.toString()] = a;

  // Only exams with an approved paper are actually launchable.
  const launchable = exams
    .filter((e: any) => paperByExam[e._id.toString()])
    .map((e: any) => ({
      exam: e,
      paper: { title: paperByExam[e._id.toString()].title, totalPoints: paperByExam[e._id.toString()].totalPoints },
      attempt: attemptByExam[e._id.toString()] || null,
    }));

  return ApiResponse.success(res, launchable);
};

// POST /exams/:id/attempt/start — begin (or resume) an attempt
export const start = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new NotFoundError('Exam');
  if (exam.status !== 'ongoing') throw new BadRequestError('This exam is not currently live.');

  const isEnrolled = (student.enrolledCourses || []).some((id: any) => id.toString() === exam.course.toString());
  if (!isEnrolled) throw new ForbiddenError('You are not enrolled in this exam\'s course.');

  const paper = await ExamPaper.findOne({ exam: exam._id, status: 'approved' });
  if (!paper) throw new BadRequestError('This exam has no approved paper yet.');

  let attempt = await ExamAttempt.findOne({ exam: exam._id, student: student._id });
  if (attempt && attempt.status !== 'in_progress') {
    throw new BadRequestError('You have already submitted this exam.');
  }

  if (!attempt) {
    const deadline = new Date(Date.now() + exam.duration * 60 * 1000);
    attempt = await ExamAttempt.create({
      exam: exam._id,
      paper: paper._id,
      student: student._id,
      startedAt: new Date(),
      deadline,
      maxScore: paper.totalPoints,
      school: exam.school || null,
    });
  }

  return ApiResponse.success(res, {
    attemptId: attempt._id,
    deadline: attempt.deadline,
    answers: attempt.answers,
    paper: {
      title: paper.title,
      instructions: paper.instructions,
      questions: paper.questions.map(sanitizeQuestion),
    },
  });
};

// GET /exams/:id/attempt — resume an in-progress (or view a submitted) attempt
export const getMine = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const attempt = await ExamAttempt.findOne({ exam: req.params.id, student: student._id });
  if (!attempt) throw new NotFoundError('Exam attempt');

  const paper = await ExamPaper.findById(attempt.paper);
  if (!paper) throw new NotFoundError('Exam paper');

  return ApiResponse.success(res, {
    attemptId: attempt._id,
    status: attempt.status,
    deadline: attempt.deadline,
    answers: attempt.answers,
    autoGradedScore: attempt.autoGradedScore,
    maxScore: attempt.maxScore,
    submittedAt: attempt.submittedAt,
    paper: {
      title: paper.title,
      instructions: paper.instructions,
      questions: paper.questions.map(sanitizeQuestion),
    },
  });
};

// PATCH /exams/:id/attempt — autosave answers
export const saveAnswers = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const attempt = await ExamAttempt.findOne({ exam: req.params.id, student: student._id });
  if (!attempt) throw new NotFoundError('Exam attempt');
  if (attempt.status !== 'in_progress') throw new BadRequestError('This attempt has already been submitted.');
  if (new Date() > attempt.deadline) throw new BadRequestError('Time is up for this exam.');

  const { answers } = req.body as { answers: { questionId: string; value: unknown }[] };
  if (!Array.isArray(answers)) throw new BadRequestError('answers must be an array');

  attempt.answers = answers.map((a) => ({ questionId: a.questionId as any, value: a.value as any }));
  await attempt.save();

  return ApiResponse.success(res, { saved: true });
};

// POST /exams/:id/attempt/submit — finalize and auto-grade
export const submit = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const attempt = await ExamAttempt.findOne({ exam: req.params.id, student: student._id });
  if (!attempt) throw new NotFoundError('Exam attempt');
  if (attempt.status !== 'in_progress') throw new BadRequestError('This attempt has already been submitted.');

  const { answers } = req.body as { answers?: { questionId: string; value: unknown }[] };
  if (Array.isArray(answers)) {
    attempt.answers = answers.map((a) => ({ questionId: a.questionId as any, value: a.value as any }));
  }

  const paper = await ExamPaper.findById(attempt.paper);
  if (!paper) throw new NotFoundError('Exam paper');

  const answerByQuestion: Record<string, unknown> = {};
  for (const a of attempt.answers) answerByQuestion[a.questionId.toString()] = a.value;

  let autoGradedScore = 0;
  let ungradedQuestionCount = 0;
  for (const q of paper.questions) {
    const given = answerByQuestion[(q._id as any).toString()];
    if (q.type === 'mcq') {
      if (typeof given === 'number' && given === q.correctIndex) autoGradedScore += q.points;
    } else if (q.type === 'true_false') {
      if (typeof given === 'boolean' && given === q.correctAnswer) autoGradedScore += q.points;
    } else {
      ungradedQuestionCount += 1; // short_answer needs manual grading
    }
  }

  const isLate = new Date() > attempt.deadline;
  attempt.autoGradedScore = autoGradedScore;
  attempt.ungradedQuestionCount = ungradedQuestionCount;
  attempt.status = isLate ? 'auto_submitted' : 'submitted';
  attempt.submittedAt = new Date();
  await attempt.save();

  return ApiResponse.success(res, {
    status: attempt.status,
    autoGradedScore: attempt.autoGradedScore,
    maxScore: attempt.maxScore,
    ungradedQuestionCount: attempt.ungradedQuestionCount,
  }, 'Exam submitted');
};
