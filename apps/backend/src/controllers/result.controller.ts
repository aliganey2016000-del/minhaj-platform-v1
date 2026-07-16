import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Result from '../models/result.model';
import Exam from '../models/exam.model';
import Course from '../models/course.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, getOwnTeacherRecord } from '../utils/tenant-scope';

/**
 * Returns the Mongo `_id` list of exams the caller is allowed to touch:
 *   - admin: null (no restriction)
 *   - org_admin: exams whose course belongs to their org
 *   - teacher: exams for courses assigned to them
 * Used to scope Result queries, since Result itself has no `school` field —
 * ownership always flows through its parent Exam -> Course.
 */
async function resolveAllowedExamIds(req: Request): Promise<mongoose.Types.ObjectId[] | null> {
  if (req.user?.role === 'admin') return null;

  if (req.user?.role === 'org_admin') {
    const scoped = applyOrgFilter(req, {}, 'school');
    return Exam.find(scoped).distinct('_id');
  }

  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const courseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    return Exam.find({ course: { $in: courseIds } }).distinct('_id');
  }

  return [];
}

/** Throws ForbiddenError unless the caller may enter/edit results for this exam. */
async function assertCanManageExamResults(req: Request, examId: string): Promise<void> {
  if (req.user?.role === 'admin') return;

  const exam = await Exam.findById(examId).populate('course', 'school teacher');
  if (!exam) throw new NotFoundError('Exam');
  assertOwnsOrg(req, exam, 'school');

  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const courseTeacherId = (exam.course as any)?.teacher?.toString();
    if (!teacher || courseTeacherId !== teacher._id.toString()) {
      throw new ForbiddenError('You can only manage results for your own courses.');
    }
  }
}

// GET /results — List all or by exam
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { examId, studentId, status, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (examId) filter.exam = examId as string;
  if (studentId) filter.student = studentId as string;
  if (status && ['passed', 'failed', 'absent'].includes(status as string)) filter.status = status;

  const allowedExamIds = await resolveAllowedExamIds(req);
  if (allowedExamIds !== null) {
    filter.exam = filter.exam
      ? { $in: allowedExamIds.filter((id) => id.toString() === filter.exam) }
      : { $in: allowedExamIds };
  }

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

// GET /results/my — Student's own results, only for exams with published results
export const getMyResults = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const publishedExamIds = await Exam.find({ resultsPublished: true }).distinct('_id');

  const results = await Result.find({ student: student._id, exam: { $in: publishedExamIds } })
    .populate({
      path: 'exam',
      select: 'title examDate totalMarks passingMarks course',
      populate: { path: 'course', select: 'title.en slug category' },
    })
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, results);
};

// POST /results — Enter single result
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { exam: examId, student: studentId, marksObtained, totalMarks, remarks, feedback, status } = req.body;

  if (!examId) throw new BadRequestError('exam is required');
  await assertCanManageExamResults(req, examId);

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
    feedback: feedback || '',
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
  await assertCanManageExamResults(req, examId);

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
          feedback: r.feedback || '',
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
  const existing = await Result.findById(req.params.id);
  if (!existing) throw new NotFoundError('Result');
  await assertCanManageExamResults(req, existing.exam.toString());

  const updates = { ...req.body };
  delete updates.exam;
  delete updates.student;
  delete updates.enteredBy;

  const result = await Result.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('exam', 'title totalMarks')
    .lean();

  if (!result) throw new NotFoundError('Result');
  return ApiResponse.success(res, result, 'Result updated');
};

// DELETE /results/:id
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Result.findById(req.params.id);
  if (!existing) throw new NotFoundError('Result');
  await assertCanManageExamResults(req, existing.exam.toString());

  await Result.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Result deleted');
};
