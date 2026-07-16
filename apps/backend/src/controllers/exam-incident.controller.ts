/**
 * Exam Incident Controller
 * Log and resolve exam violations, cheating, disruptions, technical issues,
 * or special accommodations ("Compliances & Issues").
 */

import { Request, Response } from 'express';
import Exam from '../models/exam.model';
import Course from '../models/course.model';
import ExamIncident from '../models/exam-incident.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, assertOwnsExamIfTeacher, getOwnTeacherRecord } from '../utils/tenant-scope';

const TYPES = ['cheating', 'disruption', 'technical_issue', 'accommodation', 'other'];
const SEVERITIES = ['low', 'medium', 'high'];

/** Resolves the exam ids the caller may see incidents for. */
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

// GET /exam-incidents
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { examId, status } = req.query;

  const filter: Record<string, unknown> = {};
  if (examId) filter.exam = examId as string;
  if (status && ['open', 'resolved', 'dismissed'].includes(status as string)) filter.status = status;

  const allowedExamIds = await resolveAllowedExamIds(req);
  if (allowedExamIds !== null) {
    filter.exam = filter.exam
      ? { $in: allowedExamIds.filter((id) => id === filter.exam) }
      : { $in: allowedExamIds };
  }

  const incidents = await ExamIncident.find(filter)
    .populate({ path: 'exam', select: 'title examDate course', populate: { path: 'course', select: 'title.en' } })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('reportedBy', 'email')
    .populate('resolvedBy', 'email')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, incidents);
};

// POST /exam-incidents
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { exam: examId, student, type, severity, description } = req.body;

  if (!examId) throw new BadRequestError('exam is required');
  if (!type || !TYPES.includes(type)) throw new BadRequestError(`type must be one of ${TYPES.join(', ')}`);
  if (!description || !description.trim()) throw new BadRequestError('description is required');

  const exam = await Exam.findById(examId).populate('course', 'school teacher');
  if (!exam) throw new NotFoundError('Exam');
  assertOwnsOrg(req, exam, 'school');
  await assertOwnsExamIfTeacher(req, exam);

  const incident = await ExamIncident.create({
    exam: exam._id,
    student: student || null,
    type,
    severity: SEVERITIES.includes(severity) ? severity : 'medium',
    description,
    reportedBy: req.user!.userId,
    school: exam.school || null,
  });

  const populated = await ExamIncident.findById(incident._id)
    .populate({ path: 'exam', select: 'title examDate course', populate: { path: 'course', select: 'title.en' } })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('reportedBy', 'email')
    .lean();

  return ApiResponse.created(res, populated, 'Incident logged');
};

// PATCH /exam-incidents/:id — resolve/dismiss/update
export const update = async (req: Request, res: Response): Promise<Response> => {
  const existing = await ExamIncident.findById(req.params.id).populate('exam');
  if (!existing) throw new NotFoundError('Incident');
  assertOwnsOrg(req, existing.exam, 'school');
  await assertOwnsExamIfTeacher(req, existing.exam as any);

  const { status, severity, description, resolutionNotes } = req.body;

  if (status !== undefined) {
    if (!['open', 'resolved', 'dismissed'].includes(status)) throw new BadRequestError('Invalid status');
    existing.status = status;
    if (status !== 'open') {
      existing.resolvedBy = req.user!.userId as any;
      existing.resolvedAt = new Date();
    }
  }
  if (severity !== undefined && SEVERITIES.includes(severity)) existing.severity = severity;
  if (description !== undefined) existing.description = description;
  if (resolutionNotes !== undefined) existing.resolutionNotes = resolutionNotes;

  await existing.save();

  const populated = await ExamIncident.findById(existing._id)
    .populate({ path: 'exam', select: 'title examDate course', populate: { path: 'course', select: 'title.en' } })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('reportedBy', 'email')
    .populate('resolvedBy', 'email')
    .lean();

  return ApiResponse.success(res, populated, 'Incident updated');
};
