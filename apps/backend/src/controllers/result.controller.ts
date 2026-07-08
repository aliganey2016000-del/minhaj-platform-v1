import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Result from '../models/result.model';
import Exam from '../models/exam.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

// GET /results — List all or by exam
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { examId, studentId, status, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (examId) filter.exam = examId as string;
  if (studentId) filter.student = studentId as string;
  if (status && ['passed', 'failed', 'absent'].includes(status as string)) filter.status = status;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));

  const [results, total] = await Promise.all([
    Result.find(filter)
      .populate('exam', 'title examDate totalMarks passingMarks course')
      .populate({ path: 'exam', populate: { path: 'course', select: 'title.en slug category' } })
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
      .populate('enteredBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Result.countDocuments(filter),
  ]);

  let resultList = results;
  if (search) {
    const s = (search as string).toLowerCase();
    resultList = results.filter((r: any) => {
      const name = `${r.student?.profile?.firstName || ''} ${r.student?.profile?.lastName || ''}`.toLowerCase();
      const sid = (r.student?.studentId || '').toLowerCase();
      const examTitle = (r.exam?.title || '').toLowerCase();
      return name.includes(s) || sid.includes(s) || examTitle.includes(s);
    });
  }

  return ApiResponse.paginated(res, resultList, { page: pageNum, limit: limitNum, total: search ? resultList.length : total });
};

// POST /results — Enter single result
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { exam: examId, student: studentId, marksObtained, totalMarks, remarks, status } = req.body;

  // Validate exam and student exist
  const [exam, student] = await Promise.all([
    Exam.findById(examId).lean(),
    Student.findById(studentId).lean(),
  ]);
  if (!exam) throw new NotFoundError('Exam');
  if (!student) throw new NotFoundError('Student');

  const payload = {
    exam: examId,
    student: studentId,
    marksObtained: marksObtained ?? 0,
    totalMarks: totalMarks || exam.totalMarks,
    remarks: remarks || '',
    status: status || (marksObtained == null ? 'absent' : undefined),
      enteredBy: new mongoose.Types.ObjectId(req.user!.userId),
  };

  const result = await Result.create(payload);
  const populated = await Result.findById(result._id)
    .populate('exam', 'title examDate totalMarks')
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('enteredBy', 'email')
    .lean();

  // Update student GPA — average of all percentages
  const allResults = await Result.find({ student: studentId }).lean();
  if (allResults.length > 0) {
    const avg = allResults.reduce((sum, r) => sum + r.percentage, 0) / allResults.length;
    await Student.findByIdAndUpdate(studentId, { gpa: Math.round(avg) / 100 * 4 });
  }

  return ApiResponse.created(res, populated, 'Result entered successfully');
};

// POST /results/bulk — Enter multiple results for an exam
export const bulkCreate = async (req: Request, res: Response): Promise<Response> => {
  const { exam: examId, results: resultsArray } = req.body;

  if (!examId || !resultsArray || !Array.isArray(resultsArray) || resultsArray.length === 0) {
    throw new BadRequestError('exam and results array are required');
  }

  const exam = await Exam.findById(examId).lean();
  if (!exam) throw new NotFoundError('Exam');

  const ops = resultsArray.map((r: any) => ({
    updateOne: {
      filter: { exam: examId, student: r.student },
      update: {
        $set: {
          marksObtained: r.marksObtained ?? 0,
          totalMarks: r.totalMarks || exam.totalMarks,
          remarks: r.remarks || '',
          status: r.status || (r.marksObtained == null ? 'absent' : undefined),
          enteredBy: new mongoose.Types.ObjectId(req.user!.userId),
        },
      },
      upsert: true,
    },
  }));

  await Result.bulkWrite(ops);

  // Recalculate all affected students' GPAs
  const studentIds = [...new Set(resultsArray.map((r: any) => r.student))];
  for (const sid of studentIds) {
    const all = await Result.find({ student: sid }).lean();
    if (all.length > 0) {
      const avg = all.reduce((sum, r) => sum + r.percentage, 0) / all.length;
      await Student.findByIdAndUpdate(sid, { gpa: Math.round(avg) / 100 * 4 });
    }
  }

  const populated = await Result.find({ exam: examId })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('enteredBy', 'email')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, populated, `${resultsArray.length} results saved`);
};

// PATCH /results/:id
export const update = async (req: Request, res: Response): Promise<Response> => {
  const result = await Result.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('exam', 'title totalMarks')
    .lean();

  if (!result) throw new NotFoundError('Result');
  return ApiResponse.success(res, result, 'Result updated');
};

// DELETE /results/:id
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const result = await Result.findByIdAndDelete(req.params.id);
  if (!result) throw new NotFoundError('Result');
  return ApiResponse.noContent(res, 'Result deleted');
};