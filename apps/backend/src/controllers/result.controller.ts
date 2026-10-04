import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Result from '../models/result.model';
import Exam from '../models/exam.model';
import Course from '../models/course.model';
import Student from '../models/student.model';
import School from '../models/school.model';
import Attendance from '../models/attendance.model';
import QuizAttempt from '../models/quiz-attempt.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import ManualGradeEntry from '../models/manual-grade-entry.model';
import GradingScheme from '../models/grading-scheme.model';
import ExamAttendance from '../models/exam-attendance.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, getOwnTeacherRecord } from '../utils/tenant-scope';
import { castObjectIdFilter } from '../utils/cast-object-id-filter';
import { escapeRegex } from '../utils/escape-regex';

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

// exam.passingMarks is a raw mark out of exam.totalMarks, not a percent —
// convert it to the same percent basis `percentage` is computed on. Falls
// back to the flat 50% default when the exam has no usable passingMarks
// (mirrors models/result.model.ts's own pre-save fallback).
function passThresholdFor(exam: { passingMarks?: number; totalMarks?: number } | null | undefined): number {
  if (exam && typeof exam.passingMarks === 'number' && exam.passingMarks > 0 && (exam.totalMarks || 0) > 0) {
    return (exam.passingMarks / (exam.totalMarks as number)) * 100;
  }
  return 50;
}

function computeStatus(percentage: number, isAbsent: boolean, exam?: { passingMarks?: number; totalMarks?: number } | null): 'passed' | 'failed' | 'absent' {
  if (isAbsent) return 'absent';
  return percentage >= passThresholdFor(exam) ? 'passed' : 'failed';
}

// Only these fields may ever be set on a Result by a client request —
// percentage/grade/status are always server-computed from them, never
// taken from the request body directly (see update()).
const CLIENT_WRITABLE_RESULT_FIELDS = ['marksObtained', 'totalMarks', 'remarks', 'feedback', 'status'] as const;

function pickResultInput(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of CLIENT_WRITABLE_RESULT_FIELDS) {
    if (body[key] !== undefined) picked[key] = body[key];
  }
  return picked;
}

/** The student must actually belong to this exam — either enrolled in its course, or at least in the same school. Otherwise any student id could be handed a fabricated Result. */
async function assertStudentBelongsToExam(
  exam: { course?: unknown; school?: unknown },
  student: { _id: unknown; enrolledCourses?: unknown[]; school?: unknown }
): Promise<void> {
  const examCourseId = exam.course ? String(exam.course) : null;
  const inCourse = !!examCourseId && (student.enrolledCourses || []).some((id) => String(id) === examCourseId);
  const sameSchool = !!exam.school && !!student.school && String(exam.school) === String(student.school);
  if (!inCourse && !sameSchool) {
    throw new BadRequestError('This student is not enrolled in this exam\'s course or school.');
  }
}

function validateMarks(obtained: number, total: number): void {
  if (!(total >= 1)) throw new BadRequestError('totalMarks must be at least 1');
  if (!(obtained >= 0) || obtained > total) throw new BadRequestError('marksObtained must be between 0 and totalMarks');
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
  const populateResults = (q: ReturnType<typeof Result.find>) => q
    .populate('exam', 'title examDate totalMarks passingMarks course')
    .populate({ path: 'exam', populate: { path: 'course', select: 'title.en slug category' } })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('enteredBy', 'email');

  let resultList: any[];
  let total: number;

  if (search) {
    // Previously: paginate first (skip/limit), THEN filter that one page by
    // search in memory — a matching result outside the current page never
    // showed up, and `total` reported only how many of that one page
    // matched. Matched and paginated at the database level instead, same as
    // students/teachers/classes/parents/invoices/payments/schools/
    // certificates/exams (see student.controller.ts getAll).
    const regex = new RegExp(escapeRegex(search as string), 'i');
    const aggregateMatch = castObjectIdFilter(filter, ['exam', 'student']);
    const [facetResult] = await Result.aggregate([
      { $match: aggregateMatch },
      { $lookup: { from: 'exams', localField: 'exam', foreignField: '_id', as: 'examDoc' } },
      { $unwind: { path: '$examDoc', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'studentDoc' } },
      { $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'profiles', localField: 'studentDoc.profile', foreignField: '_id', as: 'profileDoc' } },
      { $unwind: { path: '$profileDoc', preserveNullAndEmptyArrays: true } },
      { $addFields: { fullName: { $concat: [{ $ifNull: ['$profileDoc.firstName', ''] }, ' ', { $ifNull: ['$profileDoc.lastName', ''] }] } } },
      { $match: { $or: [{ fullName: regex }, { 'studentDoc.studentId': regex }, { 'examDoc.title': regex }] } },
      { $sort: { createdAt: -1 } },
      { $facet: {
          data: [{ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }, { $project: { _id: 1 } }],
          totalCount: [{ $count: 'count' }],
        } },
    ]);

    const orderedIds: string[] = (facetResult?.data || []).map((row: any) => String(row._id));
    total = facetResult?.totalCount?.[0]?.count || 0;
    const pageDocs = orderedIds.length
      ? await populateResults(Result.find({ _id: { $in: orderedIds } })).lean()
      : [];
    const docById = new Map((pageDocs as any[]).map((doc) => [String(doc._id), doc]));
    resultList = orderedIds.map((id) => docById.get(id)).filter(Boolean);
  } else {
    const [results, count] = await Promise.all([
      populateResults(Result.find(filter))
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Result.countDocuments(filter),
    ]);
    resultList = results;
    total = count;
  }

  // ── Attach exam attendance status per (exam, student) pair ──
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
  const enriched = resultList.map((r: any) => {
    const key = `${r.exam?._id?.toString()}_${r.student?._id?.toString()}`;
    return {
      ...r,
      attendanceStatus: attendanceMap[key] || 'absent',
    };
  });

  return ApiResponse.paginated(res, enriched, { page: pageNum, limit: limitNum, total });
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
// GET /results/my/courses — Student's own results, broken down per course
// ---------------------------------------------------------------------------

export const getMyResultsByCourse = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  // Same course-resolution rule used for attendance: for a class-based
  // organization every course tied to the student's Class shows up (even
  // with zero activity yet); for a course-based one, only courses the
  // student individually enrolled in.
  const studentSchoolId = (student as any).school;
  const studentClassId = (student as any).class;
  const school = studentSchoolId ? await School.findById(studentSchoolId).select('attendanceType').lean() : null;
  const isClassBased = school?.attendanceType === 'class_based' && !!studentClassId;

  const courseFilter = isClassBased
    ? { class: studentClassId }
    : { _id: { $in: student.enrolledCourses } };

  const courses = await Course.find(courseFilter)
    .select('title slug category')
    .populate('class', 'title section')
    .lean();

  const courseIds = courses.map((c) => c._id);
  if (courseIds.length === 0) return ApiResponse.success(res, []);

  const [attendanceAgg, quizAttempts, assignmentSubs, publishedExams, manualEntries, schemes] = await Promise.all([
    Attendance.aggregate([
      { $match: { student: student._id, course: { $in: courseIds } } },
      {
        $group: {
          _id: '$course',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
        },
      },
    ]),
    QuizAttempt.find({ student: student._id, course: { $in: courseIds } }).select('course quizId percentage').lean(),
    AssignmentSubmission.find({ student: student._id, course: { $in: courseIds }, status: { $in: ['graded', 'returned'] } })
      .select('course assignment score isLate')
      .populate('assignment', 'title totalMarks')
      .lean(),
    Exam.find({ course: { $in: courseIds }, resultsPublished: true }).select('_id title examDate course').lean(),
    ManualGradeEntry.find({ student: student._id, course: { $in: courseIds }, categoryKey: { $ne: '__bonus' } }).lean(),
    GradingScheme.find({ course: { $in: courseIds } }).select('course categories').lean(),
  ]);

  const examIds = publishedExams.map((e: any) => e._id);
  const examResults = examIds.length
    ? await Result.find({ exam: { $in: examIds }, student: student._id }).lean()
    : [];
  const examMap = new Map(publishedExams.map((e: any) => [e._id.toString(), e]));

  const attendanceMap = new Map(attendanceAgg.map((a: any) => [a._id.toString(), a]));

  const quizByCourse = new Map<string, Map<string, number>>(); // courseId -> quizId -> best %
  for (const a of quizAttempts as any[]) {
    const cId = a.course.toString();
    if (!quizByCourse.has(cId)) quizByCourse.set(cId, new Map());
    const byQuiz = quizByCourse.get(cId)!;
    const existing = byQuiz.get(a.quizId);
    if (existing === undefined || a.percentage > existing) byQuiz.set(a.quizId, a.percentage);
  }

  const assignmentsByCourse = new Map<string, any[]>();
  for (const s of assignmentSubs as any[]) {
    const cId = s.course.toString();
    if (!assignmentsByCourse.has(cId)) assignmentsByCourse.set(cId, []);
    const max = s.assignment?.totalMarks || 100;
    const percentage = max > 0 ? Math.round(((s.score || 0) / max) * 100) : 0;
    assignmentsByCourse.get(cId)!.push({
      title: s.assignment?.title || 'Assignment',
      score: s.score || 0,
      totalMarks: max,
      percentage,
      isLate: s.isLate,
    });
  }

  const examsByCourse = new Map<string, any[]>();
  for (const r of examResults as any[]) {
    const exam = examMap.get(r.exam.toString());
    if (!exam) continue;
    const cId = exam.course.toString();
    if (!examsByCourse.has(cId)) examsByCourse.set(cId, []);
    examsByCourse.get(cId)!.push({
      resultId: r._id,
      title: exam.title,
      examDate: exam.examDate,
      marksObtained: r.marksObtained,
      totalMarks: r.totalMarks,
      percentage: r.percentage,
      grade: r.grade,
      status: r.status,
      feedback: r.feedback,
    });
  }

  const schemeLabelByCourse = new Map<string, Map<string, string>>();
  for (const sch of schemes as any[]) {
    const labels = new Map<string, string>();
    for (const cat of sch.categories || []) labels.set(cat.key, cat.label);
    schemeLabelByCourse.set(sch.course.toString(), labels);
  }

  const otherByCourse = new Map<string, any[]>();
  for (const m of manualEntries as any[]) {
    const cId = m.course.toString();
    if (!otherByCourse.has(cId)) otherByCourse.set(cId, []);
    const labels = schemeLabelByCourse.get(cId);
    otherByCourse.get(cId)!.push({
      label: labels?.get(m.categoryKey) || m.categoryKey,
      score: m.score,
    });
  }

  const result = courses.map((course) => {
    const cId = course._id.toString();
    const att = attendanceMap.get(cId);
    const quizzes = [...(quizByCourse.get(cId)?.values() || [])];
    const assignments = assignmentsByCourse.get(cId) || [];

    return {
      courseId: course._id,
      code: course.slug?.toUpperCase() || '',
      title: course.title?.en || 'Unknown Course',
      section: (course as any).class ? `${(course as any).class.title} (${(course as any).class.section})` : (course as any).category || '',
      attendance: att
        ? {
            days: att.total,
            present: att.present,
            absent: att.absent,
            late: att.late,
            excused: att.excused,
            presentPercentage: att.total > 0 ? Math.round((att.present / att.total) * 100) : 0,
          }
        : null,
      quizzes: quizzes.length
        ? { count: quizzes.length, averagePercent: Math.round(quizzes.reduce((s, p) => s + p, 0) / quizzes.length) }
        : null,
      assignments: assignments.length
        ? {
            count: assignments.length,
            averagePercent: Math.round(assignments.reduce((s, a) => s + a.percentage, 0) / assignments.length),
            items: assignments,
          }
        : null,
      exams: examsByCourse.get(cId) || [],
      other: otherByCourse.get(cId) || [],
    };
  });

  return ApiResponse.success(res, result);
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
  await assertStudentBelongsToExam(exam, student as any);

  // Look up exam attendance to determine if student was present/absent
  const examAttendance = await ExamAttendance.findOne({ exam: examId, student: studentId }).lean();
  const isAbsent = !!(inputStatus === 'absent' || (examAttendance && (examAttendance as any).status === 'absent'));
  const actualObtained = isAbsent ? 0 : (marksObtained ?? 0);
  const actualTotal = totalMarks || exam.totalMarks;
  if (!isAbsent) validateMarks(actualObtained, actualTotal);

  const percentage = computePercentage(actualObtained, actualTotal);
  const grade = computeGrade(percentage, isAbsent);
  const resultStatus = computeStatus(percentage, isAbsent, exam);

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

  // Every student in the batch must actually belong to this exam — same
  // check as the single-result create path, just done once for the whole
  // batch instead of per-row.
  const studentIdsIn = [...new Set(resultsArray.map((r: any) => String(r.student)))];
  const studentDocs = await Student.find({ _id: { $in: studentIdsIn } })
    .select('enrolledCourses school')
    .lean();
  const studentById = new Map(studentDocs.map((s: any) => [String(s._id), s]));
  for (const sid of studentIdsIn) {
    const s = studentById.get(sid);
    if (!s) throw new NotFoundError(`Student ${sid}`);
    await assertStudentBelongsToExam(exam, s as any);
  }

  const userId = new mongoose.Types.ObjectId(req.user!.userId);

  // Build explicit update operations with calculated percentage/grade
  const ops = resultsArray.map((r: any) => {
    const studentId = r.student;
    const isAbsent = r.status === 'absent' || (attendanceMap[studentId] !== undefined && !attendanceMap[studentId]);
    const obtained = isAbsent ? 0 : (r.marksObtained ?? 0);
    const total = r.totalMarks || exam.totalMarks;
    if (!isAbsent) validateMarks(obtained, total);
    const percentage = computePercentage(obtained, total);
    const grade = computeGrade(percentage, isAbsent);
    const status = computeStatus(percentage, isAbsent, exam);

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
  // One read and one write for the whole batch, instead of a find + update
  // per student (200 round trips for a 100-student class). Same formula.
  const studentIds = [...new Set(resultsArray.map((r: any) => String(r.student)))];
  const allResults = await Result.find({ student: { $in: studentIds } }).select('student percentage').lean();
  const percentagesByStudent = new Map<string, number[]>();
  for (const r of allResults) {
    const key = String(r.student);
    const list = percentagesByStudent.get(key) || [];
    list.push(r.percentage);
    percentagesByStudent.set(key, list);
  }
  const gpaOps = [...percentagesByStudent].map(([sid, percentages]) => {
    const avgPct = percentages.reduce((sum, pct) => sum + pct, 0) / percentages.length;
    return { updateOne: { filter: { _id: sid }, update: { $set: { gpa: Math.round((avgPct / 100) * 4 * 10) / 10 } } } };
  });
  if (gpaOps.length) await Student.bulkWrite(gpaOps as any);

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

  const exam = await Exam.findById(existing.exam).lean();

  // Whitelist what a client may actually set — percentage/grade/status are
  // never taken from the request body, only ever recomputed below, so a
  // caller can't forge a passing grade by sending percentage/grade/status
  // directly without touching marksObtained.
  const updates = pickResultInput(req.body || {});

  // Always recompute, even when neither marksObtained/totalMarks/status was
  // sent — the previous "only recalc if one of those three changed" left
  // percentage/grade/status completely untouched (and thus exactly as the
  // client sent them, if they sent them) on any other kind of update.
  const isAbsent = updates.status !== undefined
    ? updates.status === 'absent'
    : updates.marksObtained === undefined && existing.status === 'absent';
  const obtained = isAbsent ? 0 : Number(updates.marksObtained ?? existing.marksObtained);
  const total = Number(updates.totalMarks || existing.totalMarks);
  if (!isAbsent) validateMarks(obtained, total);
  updates.marksObtained = obtained;
  updates.totalMarks = total;
  updates.percentage = computePercentage(obtained, total);
  updates.grade = computeGrade(updates.percentage as number, isAbsent);
  updates.status = computeStatus(updates.percentage as number, isAbsent, exam);

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