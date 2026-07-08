import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Certificate from '../models/certificate.model';
import Student from '../models/student.model';
import Course from '../models/course.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

// GET /certificates — List all with filters, search, pagination
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, courseId, status, page = '1', limit = '20', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (studentId) filter.student = studentId as string;
  if (courseId) filter.course = courseId as string;
  if (status && ['issued', 'revoked', 'expired'].includes(status as string)) filter.status = status;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [certs, total] = await Promise.all([
    Certificate.find(filter)
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
      .populate('course', 'title.en slug category')
      .populate('issuedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Certificate.countDocuments(filter),
  ]);

  let result = certs;
  if (search) {
    const s = (search as string).toLowerCase();
    result = certs.filter((c: any) => {
      const name = `${c.student?.profile?.firstName || ''} ${c.student?.profile?.lastName || ''}`.toLowerCase();
      const sid = (c.student?.studentId || '').toLowerCase();
      const certNum = (c.certificateNumber || '').toLowerCase();
      const title = (c.title || '').toLowerCase();
      return name.includes(s) || sid.includes(s) || certNum.includes(s) || title.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};

// POST /certificates — Issue a new certificate
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { title, student: studentId, course: courseId, issueDate, expiryDate, grade, notes } = req.body;

  if (!title || !studentId || !courseId) {
    throw new BadRequestError('title, student, and course are required');
  }

  const [student, course] = await Promise.all([
    Student.findById(studentId).lean(),
    Course.findById(courseId).lean(),
  ]);
  if (!student) throw new NotFoundError('Student');
  if (!course) throw new NotFoundError('Course');

  const cert = await Certificate.create({
    title,
    student: studentId,
    course: courseId,
    issueDate: issueDate || new Date(),
    expiryDate: expiryDate || undefined,
    grade: grade || '',
    notes: notes || '',
    status: 'issued',
    issuedBy: new mongoose.Types.ObjectId(req.user!.userId),
  });

  const populated = await Certificate.findById(cert._id)
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('course', 'title.en slug category')
    .populate('issuedBy', 'email')
    .lean();

  return ApiResponse.created(res, populated, 'Certificate issued successfully');
};

// PATCH /certificates/:id
export const update = async (req: Request, res: Response): Promise<Response> => {
  const cert = await Certificate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('course', 'title.en slug category')
    .populate('issuedBy', 'email')
    .lean();

  if (!cert) throw new NotFoundError('Certificate');
  return ApiResponse.success(res, cert, 'Certificate updated');
};

// PATCH /certificates/:id/status
export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['issued', 'revoked', 'expired'].includes(status)) {
    throw new BadRequestError('Valid status required: issued, revoked, or expired');
  }

  const cert = await Certificate.findByIdAndUpdate(req.params.id, { status }, { new: true })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('course', 'title.en slug')
    .lean();

  if (!cert) throw new NotFoundError('Certificate');
  return ApiResponse.success(res, cert, `Certificate status updated to ${status}`);
};

// DELETE /certificates/:id
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const cert = await Certificate.findByIdAndDelete(req.params.id);
  if (!cert) throw new NotFoundError('Certificate');
  return ApiResponse.noContent(res, 'Certificate deleted');
};

// GET /certificates/my — Student's own certificates
export const getMyCertificates = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findOne({ user: req.user!.userId }).lean();
  if (!student) return ApiResponse.success(res, []);

  const certs = await Certificate.find({ student: student._id })
    .populate('course', 'title.en slug category')
    .populate('issuedBy', 'email')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, certs);
};
