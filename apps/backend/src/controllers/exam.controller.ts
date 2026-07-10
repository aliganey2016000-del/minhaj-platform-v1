import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Exam from '../models/exam.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';

// GET /exams — List all with optional filters
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, status, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (courseId) filter.course = courseId as string;
  if (status && ['scheduled', 'ongoing', 'completed', 'cancelled'].includes(status as string))
    filter.status = status;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));

  const [exams, total] = await Promise.all([
    Exam.find(filter)
      .populate('course', 'title.en slug category')
      .populate('createdBy', 'email')
      .sort({ examDate: 1, startTime: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Exam.countDocuments(filter),
  ]);

  let result = exams;
  if (search) {
    const s = (search as string).toLowerCase();
    result = exams.filter((e: any) => {
      const title = (e.title || '').toLowerCase();
      const courseName = (e.course?.title?.en || '').toLowerCase();
      const room = (e.room || '').toLowerCase();
      return title.includes(s) || courseName.includes(s) || room.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, {
    page: pageNum,
    limit: limitNum,
    total: search ? result.length : total,
  });
};

// GET /exams/:id
export const getById = async (req: Request, res: Response): Promise<Response> => {
  const exam = await Exam.findById(req.params.id)
    .populate('course', 'title.en slug category enrolledStudents maxStudents')
    .populate('createdBy', 'email')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.success(res, exam);
};

// POST /exams
export const create = async (req: Request, res: Response): Promise<Response> => {
  const payload = { ...req.body, createdBy: req.user!.userId };
  const exam = await Exam.create(payload);
  const populated = await Exam.findById(exam._id)
    .populate('course', 'title.en slug category')
    .populate('createdBy', 'email')
    .lean();

  return ApiResponse.created(res, populated, 'Exam created successfully');
};

// PATCH /exams/:id
export const update = async (req: Request, res: Response): Promise<Response> => {
  const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate('course', 'title.en slug category')
    .populate('createdBy', 'email')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.success(res, exam, 'Exam updated successfully');
};

// DELETE /exams/:id
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const exam = await Exam.findByIdAndDelete(req.params.id);
  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.noContent(res, 'Exam deleted');
};

// GET /exams/my — Student's exams from enrolled courses
export const getMyExams = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const courseIds = (student.enrolledCourses || []).map((id: any) => id);
  const exams = await Exam.find({ course: { $in: courseIds } })
    .populate('course', 'title.en slug category')
    .populate('createdBy', 'email')
    .sort({ examDate: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, exams);
};

// PATCH /exams/:id/status
export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['scheduled', 'ongoing', 'completed', 'cancelled'].includes(status)) {
    throw new BadRequestError('Valid status required: scheduled, ongoing, completed, or cancelled');
  }

  const exam = await Exam.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  )
    .populate('course', 'title.en slug')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.success(res, exam, `Exam status updated to ${status}`);
};