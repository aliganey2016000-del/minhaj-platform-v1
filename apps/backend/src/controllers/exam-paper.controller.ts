/**
 * Exam Paper Controller
 * Instructor paper submission with admin proofreading/moderation/approval
 * ("Papers & Approval").
 */

import { Request, Response } from 'express';
import Exam from '../models/exam.model';
import ExamPaper from '../models/exam-paper.model';
import User from '../models/user.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/api-error';
import { assertOwnsOrg, assertOwnsExamIfTeacher } from '../utils/tenant-scope';
import { validateQuestions as validateQuestionSet } from '../utils/question-engine';
import { notifyUser, notifyUsers } from '../utils/notify';

/** Loads the exam and verifies the caller may manage its paper. */
async function loadManageableExam(req: Request, examId: string) {
  const exam = await Exam.findById(examId).populate('course', 'title.en school teacher');
  if (!exam) throw new NotFoundError('Exam');
  assertOwnsOrg(req, exam, 'school');
  await assertOwnsExamIfTeacher(req, exam);
  return exam;
}

// Same 10-type validation as course quizzes (../utils/question-engine) —
// exam paper questions are quiz questions, not a separate smaller schema.
function validateQuestions(questions: any[]): void {
  try {
    validateQuestionSet(questions);
  } catch (err: any) {
    throw new BadRequestError(err.message);
  }
}

// GET /exams/:id/paper
export const getForExam = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const paper = await ExamPaper.findOne({ exam: exam._id })
    .populate('submittedBy', 'email')
    .populate('reviewedBy', 'email')
    .lean();

  return ApiResponse.success(res, paper || null);
};

// PUT /exams/:id/paper — create or update (draft)
export const upsert = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const { title, instructions, questions } = req.body;

  if (!title || !title.trim()) throw new BadRequestError('title is required');
  validateQuestions(questions);

  let paper = await ExamPaper.findOne({ exam: exam._id });

  if (paper && !['draft', 'rejected'].includes(paper.status) && req.user?.role !== 'admin' && req.user?.role !== 'org_admin') {
    throw new ForbiddenError('This paper is under review or already approved — only an admin can edit it now.');
  }

  if (!paper) {
    paper = new ExamPaper({
      exam: exam._id,
      submittedBy: req.user!.userId,
      school: exam.school || null,
    });
  }

  paper.title = title;
  paper.instructions = instructions || '';
  paper.questions = questions;
  if (paper.status === 'rejected') paper.status = 'draft'; // editing a rejected paper resets it for resubmission

  await paper.save();

  const populated = await ExamPaper.findById(paper._id)
    .populate('submittedBy', 'email')
    .populate('reviewedBy', 'email')
    .lean();

  return ApiResponse.success(res, populated, 'Paper saved');
};

// POST /exams/:id/paper/submit — teacher submits for admin review
export const submit = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const paper = await ExamPaper.findOne({ exam: exam._id });
  if (!paper) throw new NotFoundError('Exam paper');
  if (!['draft', 'rejected'].includes(paper.status)) {
    throw new BadRequestError(`Cannot submit a paper with status "${paper.status}"`);
  }
  if (paper.questions.length === 0) throw new BadRequestError('Add at least one question before submitting');

  paper.status = 'submitted';
  paper.reviewNotes = '';
  await paper.save();

  // Nudge whoever can actually approve it — the platform admin plus any
  // org_admin scoped to this exam's school — otherwise a submitted paper
  // can sit unnoticed until someone happens to open Papers & Approval.
  User.find({ $or: [{ role: 'admin' }, { role: 'org_admin', organizationId: exam.school || undefined }] })
    .select('_id')
    .lean()
    .then((admins) =>
      notifyUsers(admins.map((a: any) => a._id.toString()), {
        title: 'Exam paper submitted for review',
        message: `"${paper.title}" (${(exam as any).course?.title?.en || exam.title}) is awaiting your approval.`,
        type: 'info',
        link: `/admin/exams/${exam._id}/paper/review`,
      })
    )
    .catch(() => {});

  return ApiResponse.success(res, paper, 'Paper submitted for review');
};

// PATCH /exams/:id/paper/review — admin/org_admin approves or rejects
export const review = async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role === 'teacher') throw new ForbiddenError('Only an admin can approve or reject a paper.');

  const exam = await loadManageableExam(req, req.params.id);
  const { approved, notes } = req.body;
  if (typeof approved !== 'boolean') throw new BadRequestError('approved must be true or false');
  // A reject with no reason leaves the instructor guessing what to fix —
  // require actual feedback whenever a paper is sent back.
  if (!approved && (!notes || !String(notes).trim())) {
    throw new BadRequestError('Please explain what needs to change before rejecting a paper.');
  }

  const paper = await ExamPaper.findOne({ exam: exam._id });
  if (!paper) throw new NotFoundError('Exam paper');
  if (paper.status !== 'submitted') throw new BadRequestError('Only a submitted paper can be reviewed');

  paper.status = approved ? 'approved' : 'rejected';
  paper.reviewNotes = notes || '';
  paper.reviewedBy = req.user!.userId as any;
  paper.reviewedAt = new Date();
  await paper.save();

  const populated = await ExamPaper.findById(paper._id)
    .populate('submittedBy', 'email')
    .populate('reviewedBy', 'email')
    .lean();

  // Let the instructor know right away instead of them finding out only by
  // reopening this exam later. Link them back to the course builder (not
  // the paper editor directly — that route needs the module item's id,
  // which this controller doesn't have) where the exam item is one click away.
  User.findById(paper.submittedBy)
    .select('role')
    .lean()
    .then((submitter: any) => {
      const portal = submitter?.role === 'teacher' ? 'teacher' : 'admin';
      const courseId = (exam as any).course?._id || '';
      return notifyUser({
        userId: paper.submittedBy.toString(),
        title: approved ? 'Exam paper approved' : 'Exam paper rejected',
        message: approved
          ? `"${paper.title}" was approved and is now live for Active Exams.`
          : `"${paper.title}" was rejected: ${paper.reviewNotes}`,
        type: approved ? 'success' : 'warning',
        link: courseId ? `/${portal}/courses/${courseId}/builder` : '',
      });
    })
    .catch(() => {});

  return ApiResponse.success(res, populated, approved ? 'Paper approved' : 'Paper rejected');
};
