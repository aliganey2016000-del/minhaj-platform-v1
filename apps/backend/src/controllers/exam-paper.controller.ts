/**
 * Exam Paper Controller
 * Instructor paper submission with admin proofreading/moderation/approval
 * ("Papers & Approval").
 */

import { Request, Response } from 'express';
import Exam from '../models/exam.model';
import ExamPaper from '../models/exam-paper.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/api-error';
import { assertOwnsOrg, assertOwnsExamIfTeacher } from '../utils/tenant-scope';

const QUESTION_TYPES = ['mcq', 'true_false', 'short_answer'];

/** Loads the exam and verifies the caller may manage its paper. */
async function loadManageableExam(req: Request, examId: string) {
  const exam = await Exam.findById(examId).populate('course', 'title.en school teacher');
  if (!exam) throw new NotFoundError('Exam');
  assertOwnsOrg(req, exam, 'school');
  await assertOwnsExamIfTeacher(req, exam);
  return exam;
}

function validateQuestions(questions: any[]): void {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new BadRequestError('At least one question is required');
  }
  for (const q of questions) {
    if (!QUESTION_TYPES.includes(q.type)) throw new BadRequestError(`Invalid question type "${q.type}"`);
    if (!q.question || !q.question.trim()) throw new BadRequestError('Every question needs question text');
    if (q.type === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length < 2) throw new BadRequestError('MCQ questions need at least 2 options');
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        throw new BadRequestError('MCQ questions need a valid correctIndex');
      }
    }
    if (q.type === 'true_false' && typeof q.correctAnswer !== 'boolean') {
      throw new BadRequestError('True/False questions need a correctAnswer');
    }
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

  return ApiResponse.success(res, paper, 'Paper submitted for review');
};

// PATCH /exams/:id/paper/review — admin/org_admin approves or rejects
export const review = async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role === 'teacher') throw new ForbiddenError('Only an admin can approve or reject a paper.');

  const exam = await loadManageableExam(req, req.params.id);
  const { approved, notes } = req.body;
  if (typeof approved !== 'boolean') throw new BadRequestError('approved must be true or false');

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

  return ApiResponse.success(res, populated, approved ? 'Paper approved' : 'Paper rejected');
};
