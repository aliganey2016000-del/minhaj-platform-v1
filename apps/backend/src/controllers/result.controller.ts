import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Result from '../models/result.model';
import Exam from '../models/exam.model';
import Course from '../models/course.model';
import Student from '../models/student.model';
import ExamAttendance from '../models/exam-attendance.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, getOwnTeacherRecord } from '../utils/tenant-scope';

// ---------------------------------------------------------------------------
// Helper: compute percentage + grade from raw marks
// ---------------------------------------------------------------------------

function computePercentage(obtained: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((obtained / total) * 100);
}

function computeGrade(percentage: number, isAbsent: boolean): string {
  if (isAbsent) return 'N/A';
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  return 'F';
}

function computeStatus(percentage: number, isAbsent: boolean): 'passed' | 'failed' | 'absent' {
  if (isAbsent) return 'absent';
  return percentage >= 50 ? 'passed' : 'failed';
}

// ---------------------------------------------------------------------------
// Helper: scope exam IDs by role
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// GET /results — List all or by exam, with exam attendance status
// ---------------------------------------------------------------------------

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

  // ── Attach exam attendance status per (exam, student) pair ──
  const resultList = results;
  const examIds = [...new Set(resultList.map((r: any) => r.exam?._id?.toString()).filter(Boolean))];
  const attendanceMap: Record<string, string> = {};

  if (examIds.length > 0) {
    const attendances = await ExamAttendance.find({ exam: { $in: examIds } })
      .select('exam student status')
      .lean();

    for (const a of attendances) {
      const key = `${(a as any).exam?.toString()}_${(a as any).student?.toString()}`;
      attendanceMap[key] = (a as any).status || 'absent';
    }
  }

  // Enrich each result with attendance status
  let enriched = resultList.map((r: any) => {
    const key = `${r.exam?._id?.toString()}_${r.student?._id?.toString()}`;
    return {
      ...r,
      attendanceStatus: attendanceMap[key] || 'absent',
    };
  });

  // Post-filter by search
  if (search) {
    const s = (search as string).toLowerCase();
    enriched = enriched.filter((r: any) => {
      const name = `${r.student?.profile?.firstName || ''} ${r.student?.profile?.lastName || ''}`.toLowerCase();
      const sid = (r.student?.studentId || '').toLowerCase();
      const examTitle = (r.exam?.title || '').toLowerCase();
      return name.includes(s) || sid.includes(s) || examTitle.includes(s);
    });
  }

  return ApiResponse.paginated(res, enriched, { page: pageNum, limit: limitNum, total: search ? enriched.length : total });
};

// ---------------------------------------------------------------------------
// GET /results/my — Student's own results
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// POST /results — Enter single result (with explicit calculations)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { exam: examId, student: studentId, marksObtained, totalMarks, remarks, feedback, status: inputStatus } = req.body;

  if (!examId) throw new BadRequestError('exam is required');
  await assertCanManageExamResults(req, examId);

  const [exam, student] = await Promise.all([
    Exam.findById(examId).lean(),
    Student.findById(studentId).lean(),
  ]);
  if (!exam) throw new NotFoundError('Exam');
  if (!student) throw new NotFoundError('Student');

  // Look up exam attendance to determine if student was present/absent
  const examAttendance = await ExamAttendance.findOne({ exam: examId, student: studentId }).lean();
  const isAbsent = !!(inputStatus === 'absent' || (examAttendance && (examAttendance as any).status === 'absent'));
  const actualObtained = isAbsent ? 0 : (marksObtained ?? 0);
  const actualTotal = totalMarks || exam.totalMarks;

  const percentage = computePercentage(actualObtained, actualTotal);
  const grade = computeGrade(percentage, isAbsent);
  const resultStatus = computeStatus(percentage, isAbsent);

  const payload = {
    exam: examId,
    student: studentId,
    marksObtained: actualObtained,
    totalMarks: actualTotal,
    percentage,
    grade,
    remarks: remarks || '',
    feedback: feedback || '',
    status: resultStatus,
    enteredBy: new mongoose.Types.ObjectId(req.user!.userId),
  };

  const result = await Result.create(payload);
  const populated = await Result.findById(result._id)
    .populate('exam', 'title examDate totalMarks')
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('enteredBy', 'email')
    .lean();

  // Update student GPA
  const allResults = await Result.find({ student: studentId }).lean();
  if (allResults.length > 0) {
    const avgPct = allResults.reduce((sum, r) => sum + r.percentage, 0) / allResults.length;
    await Student.findByIdAndUpdate(studentId, { gpa: Math.round((avgPct / 100) * 4 * 10) / 10 });
  }

  return ApiResponse.created(res, populated, 'Result entered successfully');
};

// ---------------------------------------------------------------------------
// POST /results/bulk — Enter multiple results (with explicit calculations)
// ---------------------------------------------------------------------------

export const bulkCreate = async (req: Request, res: Response): Promise<Response> => {
  const { exam: examId, results: resultsArray } = req.body;

  if (!examId || !resultsArray || !Array.isArray(resultsArray) || resultsArray.length === 0) {
    throw new BadRequestError('exam and results array are required');
  }
  await assertCanManageExamResults(req, examId);

  const exam = await Exam.findById(examId).lean();
  if (!exam) throw new NotFoundError('Exam');

  // Fetch all exam attendances for this exam to determine present/absent
  const attendances = await ExamAttendance.find({ exam: examId }).lean();
  const attendanceMap: Record<string, boolean> = {};
  for (const a of attendances) {
    attendanceMap[(a as any).student.toString()] = (a as any).status !== 'absent';
  }

  const userId = new mongoose.Types.ObjectId(req.user!.userId);

  // Build explicit update operations with calculated percentage/grade
  const ops = resultsArray.map((r: any) => {
    const studentId = r.student;
    const isAbsent = r.status === 'absent' || (attendanceMap[studentId] !== undefined && !attendanceMap[studentId]);
    const obtained = isAbsent ? 0 : (r.marksObtained ?? 0);
    const total = r.totalMarks || exam.totalMarks;
    const percentage = computePercentage(obtained, total);
    const grade = computeGrade(percentage, isAbsent);
    const status = computeStatus(percentage, isAbsent);

    return {
      updateOne: {
        filter: { exam: examId, student: studentId },
        update: {
          $set: {
            marksObtained: obtained,
            totalMarks: total,
            percentage,
            grade,
            remarks: r.remarks || '',
            feedback: r.feedback || '',
            status,
            enteredBy: userId,
          },
        },
        upsert: true,
      },
    };
  });

  await Result.bulkWrite(ops);

  // Recalculate all affected students' GPAs
  const studentIds = [...new Set(resultsArray.map((r: any) => r.student))];
  for (const sid of studentIds) {
    const all = await Result.find({ student: sid }).lean();
    if (all.length > 0) {
      const avgPct = all.reduce((sum, r) => sum + r.percentage, 0) / all.length;
      await Student.findByIdAndUpdate(sid, { gpa: Math.round((avgPct / 100) * 4 * 10) / 10 });
    }
  }

  const populated = await Result.find({ exam: examId })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('enteredBy', 'email')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, populated, `${resultsArray.length} results saved`);
};

// ---------------------------------------------------------------------------
// PATCH /results/:id
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Result.findById(req.params.id);
  if (!existing) throw new NotFoundError('Result');
  await assertCanManageExamResults(req, existing.exam.toString());

  const updates = { ...req.body };
  delete updates.exam;
  delete updates.student;
  delete updates.enteredBy;

  // If marks or status changed, recalculate. `isAbsent` prefers an explicit
  // status in this request; otherwise it only stays absent if the caller
  // isn't also submitting new marks — submitting marksObtained is itself a
  // clear signal the result should now be graded normally, even if the
  // caller didn't separately flip `status` away from 'absent'.
  if (updates.marksObtained !== undefined || updates.totalMarks !== undefined || updates.status !== undefined) {
    const isAbsent = updates.status !== undefined
      ? updates.status === 'absent'
      : updates.marksObtained === undefined && existing.status === 'absent';
    const obtained = isAbsent ? 0 : (updates.marksObtained ?? existing.marksObtained);
    const total = updates.totalMarks || existing.totalMarks;
    updates.percentage = computePercentage(obtained, total);
    updates.grade = computeGrade(updates.percentage, isAbsent);
    updates.status = computeStatus(updates.percentage, isAbsent);
  }

  const result = await Result.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('exam', 'title totalMarks')
    .lean();

  if (!result) throw new NotFoundError('Result');

  // Recalculate GPA
  if (result) {
    const allResults = await Result.find({ student: result.student }).lean();
    if (allResults.length > 0) {
      const avgPct = allResults.reduce((sum, r) => sum + r.percentage, 0) / allResults.length;
      await Student.findByIdAndUpdate(result.student, { gpa: Math.round((avgPct / 100) * 4 * 10) / 10 });
    }
  }

  return ApiResponse.success(res, result, 'Result updated');
};

// ---------------------------------------------------------------------------
// DELETE /results/:id
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Result.findById(req.params.id);
  if (!existing) throw new NotFoundError('Result');
  await assertCanManageExamResults(req, existing.exam.toString());

  await Result.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Result deleted');
};