/**
 * Exam Appeal Controller
 * Student-submitted grade reviews, violation disputes, and general exam
 * issue reports ("Academic Appeals"), reviewed by admin/teacher.
 */

import { Request, Response } from 'express';
import Exam from '../models/exam.model';
import Course from '../models/course.model';
import ExamAppeal from '../models/exam-appeal.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, assertOwnsExamIfTeacher, getOwnTeacherRecord } from '../utils/tenant-scope';
import ensureStudentRecord from '../utils/ensure-student';

const TYPES = ['grade_review', 'violation_dispute', 'other'];

async function resolveAllowedExamIds(req: Request): Promise<string[] | null> {
  if (req.user?.role === 'admin') return null;

  if (req.user?.role === 'org_admin') {
    const scoped = applyOrgFilter(req, {}, 'school');
    return (await Exam.find(scoped).distinct('_id')).map(String);
  }

  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const courseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    return (await Exam.find({ course: { $in: courseIds } }).distinct('_id')).map(String);
  }

  return [];
}

// GET /exam-appeals — admin/teacher
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.query;
  const filter: Record<string, unknown> = {};
  if (status && ['pending', 'under_review', 'approved', 'rejected'].includes(status as string)) filter.status = status;

  const allowedExamIds = await resolveAllowedExamIds(req);
  if (allowedExamIds !== null) filter.exam = { $in: allowedExamIds };

  const appeals = await ExamAppeal.find(filter)
    .populate({ path: 'exam', select: 'title examDate course', populate: { path: 'course', select: 'title.en' } })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('resolvedBy', 'email')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, appeals);
};

// PATCH /exam-appeals/:id — admin/teacher resolves
export const update = async (req: Request, res: Response): Promise<Response> => {
  const existing = await ExamAppeal.findById(req.params.id).populate('exam');
  if (!existing) throw new NotFoundError('Appeal');
  assertOwnsOrg(req, existing.exam, 'school');
  await assertOwnsExamIfTeacher(req, existing.exam as any);

  const { status, adminResponse } = req.body;
  if (status !== undefined) {
    if (!['pending', 'under_review', 'approved', 'rejected'].includes(status)) throw new BadRequestError('Invalid status');
    existing.status = status;
    if (status === 'approved' || status === 'rejected') {
      existing.resolvedBy = req.user!.userId as any;
      existing.resolvedAt = new Date();
    }
  }
  if (adminResponse !== undefined) existing.adminResponse = adminResponse;

  await existing.save();

  const populated = await ExamAppeal.findById(existing._id)
    .populate({ path: 'exam', select: 'title examDate course', populate: { path: 'course', select: 'title.en' } })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('resolvedBy', 'email')
    .lean();

  return ApiResponse.success(res, populated, 'Appeal updated');
};

// POST /exams/:id/appeals — student submits
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { type, description } = req.body;
  if (!type || !TYPES.includes(type)) throw new BadRequestError(`type must be one of ${TYPES.join(', ')}`);
  if (!description || !description.trim()) throw new BadRequestError('description is required');

  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new NotFoundError('Exam');

  const student = await ensureStudentRecord(req.user!.userId);

  const appeal = await ExamAppeal.create({
    exam: exam._id,
    student: student._id,
    type,
    description,
    school: exam.school || null,
  });

  const populated = await ExamAppeal.findById(appeal._id)
    .populate({ path: 'exam', select: 'title examDate course', populate: { path: 'course', select: 'title.en' } })
    .lean();

  return ApiResponse.created(res, populated, 'Appeal submitted');
};

// GET /exams/my/appeals — student's own appeals
export const getMy = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const appeals = await ExamAppeal.find({ student: student._id })
    .populate({ path: 'exam', select: 'title examDate course', populate: { path: 'course', select: 'title.en' } })
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, appeals);
};
