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
import { sanitizeQuestionForStudent, gradeQuestionSet, questionFraction } from '../utils/question-engine';
import { isEligibleForAutoScheduledExam } from '../utils/exam-eligibility';

/** Strips correct-answer fields (and shuffles options/choices/etc.) so students never receive them — same engine as course quizzes. */
function sanitizeQuestion(q: IPaperQuestion) {
  return sanitizeQuestionForStudent(q);
}

/**
 * Whether `now` actually falls inside an exam's scheduled start/end window.
 * "Active Exams" used to key off the exam's manually-set `status ===
 * 'ongoing'` field alone — a teacher had to remember to flip it, so an exam
 * could be scheduled for right now and still not be launchable because
 * nobody toggled the status. Time is the source of truth; `cancelled`
 * still short-circuits it (a cancelled exam is never launchable no matter
 * what its clock says).
 */
function isWithinExamWindow(exam: { examDate?: Date; startTime?: string; endTime?: string; status: string }): boolean {
  if (exam.status === 'cancelled') return false;
  if (!exam.examDate || !exam.startTime || !exam.endTime) return false;
  const datePart = new Date(exam.examDate).toISOString().split('T')[0];
  const start = new Date(`${datePart}T${exam.startTime}`);
  const end = new Date(`${datePart}T${exam.endTime}`);
  const now = new Date();
  return now >= start && now <= end;
}

/** Whether the exam's window has fully finished — the earliest point review/results can be shown. Auto-scheduled exams have no calendar window, so review is available as soon as there's something to review (a submitted attempt, or — for a missed review — never, since "missed" isn't meaningful without a deadline). */
function isPastExamWindow(exam: { examDate?: Date; endTime?: string; autoSchedule?: boolean }): boolean {
  if (exam.autoSchedule) return true;
  if (!exam.examDate || !exam.endTime) return false;
  const datePart = new Date(exam.examDate).toISOString().split('T')[0];
  const end = new Date(`${datePart}T${exam.endTime}`);
  return new Date() > end;
}

/** The correct-answer value in the same shape evaluateQuestion compares a submitted answer against — normalized once here so the review screen can show "correct answer" per type without re-deriving it on the frontend. */
function correctAnswerFor(q: any): unknown {
  switch (q.type) {
    case 'mcq':
      return typeof q.correctIndex === 'number' ? q.options?.[q.correctIndex] : undefined;
    case 'picture_choice':
      return typeof q.correctIndex === 'number' ? q.choices?.[q.correctIndex]?.image : undefined;
    case 'true_false':
      return q.correctAnswer;
    case 'matching':
      return q.pairs;
    case 'ordering':
      return q.items;
    case 'fill_blank':
      return q.blanks;
    case 'word_scramble':
      return q.answer;
    case 'sentence_build':
      return q.words;
    case 'listen_write':
      return q.correctText;
    case 'swipe_sort':
      return (q.cards || []).map((c: any) => ({ text: c.text, side: c.correctSide }));
    default:
      return undefined;
  }
}

// GET /exams/:id/review — this student's per-question breakdown after the
// exam window has closed: their answer, the correct answer, and whether it
// was right, for both a submitted attempt AND a missed one (a missed exam
// has no attempt document at all, so every question is shown as
// unanswered/incorrect with an earned score of 0).
export const getReview = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const exam = await Exam.findById(req.params.id).lean();
  if (!exam) throw new NotFoundError('Exam');
  if (!isPastExamWindow(exam as any)) throw new BadRequestError('This exam has not finished yet.');

  const isEnrolled = (student.enrolledCourses || []).some((id: any) => id.toString() === exam.course.toString());
  if (!isEnrolled) throw new ForbiddenError('You are not enrolled in this exam\'s course.');

  const paper = await ExamPaper.findOne({ exam: exam._id, status: 'approved' }).lean();
  if (!paper) throw new NotFoundError('Exam paper');

  const attempt = await ExamAttempt.findOne({ exam: exam._id, student: student._id }).lean();
  // Auto-scheduled exams have no calendar deadline, so "missed" (a deadline
  // that passed with nothing submitted) isn't a meaningful state — a
  // student who simply hasn't reached this exam yet has no attempt to
  // review, full stop, rather than a false "you missed it".
  if (!attempt && exam.autoSchedule) throw new BadRequestError('You have not taken this exam yet.');

  const answerByQuestion: Record<string, unknown> = {};
  if (attempt) {
    for (const a of attempt.answers) answerByQuestion[a.questionId.toString()] = a.value;
  }

  let earnedPoints = 0;
  let totalPoints = 0;
  const questions = (paper.questions as any[]).map((q) => {
    const givenAnswer = attempt ? answerByQuestion[q._id.toString()] : undefined;
    const points = typeof q.points === 'number' ? q.points : 1;
    // Matching gets partial credit (2 of 3 pairs right = 2/3 the points),
    // same rule as actual grading (question-engine.ts) — the review's score
    // must match what was actually awarded, not re-derive a stricter one.
    const fraction = attempt ? questionFraction(q, givenAnswer) : 0;
    const earned = Math.round(points * fraction * 100) / 100;
    const isCorrect = fraction === 1;
    totalPoints += points;
    earnedPoints += earned;

    return {
      _id: q._id,
      type: q.type,
      question: q.question,
      points,
      earnedPoints: earned,
      isCorrect,
      givenAnswer: givenAnswer ?? null,
      correctAnswer: correctAnswerFor(q),
    };
  });

  return ApiResponse.success(res, {
    examTitle: exam.title,
    paperTitle: paper.title,
    missed: !attempt,
    submittedAt: attempt?.submittedAt || null,
    earnedPoints,
    totalPoints,
    questions,
  });
};

// GET /exams/my/active — exams the student can currently launch (or resume)
export const getActiveExams = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const courseIds = (student.enrolledCourses || []).map((id: any) => id);

  const allExams = await Exam.find({ course: { $in: courseIds }, status: { $ne: 'cancelled' } })
    .populate('course', 'title.en slug category')
    .lean();
  const eligibility = await Promise.all(
    allExams.map((e: any) => (e.autoSchedule ? isEligibleForAutoScheduledExam(e, student._id) : Promise.resolve(isWithinExamWindow(e))))
  );
  const exams = allExams.filter((_: any, i: number) => eligibility[i]);

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

  const isEnrolled = (student.enrolledCourses || []).some((id: any) => id.toString() === exam.course.toString());
  if (!isEnrolled) throw new ForbiddenError('You are not enrolled in this exam\'s course.');

  const eligible = exam.autoSchedule ? await isEligibleForAutoScheduledExam(exam, student._id) : isWithinExamWindow(exam);
  if (!eligible) {
    throw new BadRequestError(
      exam.autoSchedule
        ? 'Complete the required lessons for this course before starting this exam.'
        : 'This exam is not currently live.'
    );
  }

  // .lean() matters here — sanitizeQuestionForStudent spreads each question
  // with `{...question}`, which only sees a Mongoose subdocument's actual
  // field values (question text, options, etc. — schema paths are getters,
  // not own enumerable properties) once it's a plain lean object. Without
  // it every question came back looking empty (no text, no options).
  const paper = await ExamPaper.findOne({ exam: exam._id, status: 'approved' }).lean();
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

  const paper = await ExamPaper.findById(attempt.paper).lean();
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

  const paper = await ExamPaper.findById(attempt.paper).lean();
  if (!paper) throw new NotFoundError('Exam paper');

  const answerByQuestion: Record<string, unknown> = {};
  for (const a of attempt.answers) answerByQuestion[a.questionId.toString()] = a.value;

  // Same grading engine as course quizzes — every one of the 10 question
  // types is auto-graded server-side, nothing needs manual review anymore.
  const { earnedPoints } = gradeQuestionSet(paper.questions as any, answerByQuestion);

  const isLate = new Date() > attempt.deadline;
  attempt.autoGradedScore = earnedPoints;
  attempt.ungradedQuestionCount = 0;
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
