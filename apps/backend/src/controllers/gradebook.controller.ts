/**
 * Gradebook Controller — weighted grading scheme configuration + computed
 * class/student grade views. Admin (and org_admin, within their org) can
 * configure any course; a teacher may only configure/view their own courses.
 */

import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import Course from '../models/course.model';
import Student from '../models/student.model';
import School from '../models/school.model';
import GradingScheme from '../models/grading-scheme.model';
import ManualGradeEntry from '../models/manual-grade-entry.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { getOwnTeacherRecord, assertOwnsOrg, applyOrgFilter } from '../utils/tenant-scope';
import { computeCourseGrade, validateCategoryWeights } from '../utils/grade-calculator';
import ensureStudentRecord from '../utils/ensure-student';

async function assertOwnsCourseIfTeacher(req: Request, course: any): Promise<void> {
  if (req.user?.role !== 'teacher') return;
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher || course.teacher?.toString() !== teacher._id.toString()) {
    throw new ForbiddenError('You can only manage grading for your own courses.');
  }
}

async function loadCourseAndAssertAccess(req: Request, courseId: string) {
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');
  await assertOwnsCourseIfTeacher(req, course);
  return course;
}

// ---------------------------------------------------------------------------
// GET /gradebook/:courseId/scheme
// ---------------------------------------------------------------------------
export const getScheme = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  await loadCourseAndAssertAccess(req, courseId);

  const scheme = await GradingScheme.findOne({ course: courseId }).lean();
  return ApiResponse.success(res, scheme || {
    course: courseId,
    categories: [],
    passingScore: 60,
    latePenaltyPercent: 0,
    bonusCapPercent: 0,
    dropLowestQuiz: false,
  });
};

// ---------------------------------------------------------------------------
// PUT /gradebook/:courseId/scheme — upsert the full grading scheme
// ---------------------------------------------------------------------------
export const saveScheme = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  await loadCourseAndAssertAccess(req, courseId);

  const { categories, passingScore, latePenaltyPercent, bonusCapPercent, dropLowestQuiz } = req.body;

  if (!Array.isArray(categories) || categories.length === 0) {
    throw new BadRequestError('At least one grading category is required.');
  }
  for (const cat of categories) {
    if (!cat.key || !cat.label || typeof cat.weight !== 'number') {
      throw new BadRequestError('Each category needs a key, label, and numeric weight.');
    }
    if (!['attendance', 'assignments', 'quizzes', 'exam', 'manual'].includes(cat.sourceType)) {
      throw new BadRequestError(`Invalid source type "${cat.sourceType}".`);
    }
    if (cat.sourceType === 'exam' && !cat.examId) {
      throw new BadRequestError(`Category "${cat.label}" is set to source from an exam but no exam was selected.`);
    }
  }
  if (!validateCategoryWeights(categories)) {
    throw new BadRequestError('Category weights must add up to exactly 100%.');
  }

  const scheme = await GradingScheme.findOneAndUpdate(
    { course: courseId },
    {
      course: courseId,
      categories,
      passingScore: passingScore ?? 60,
      latePenaltyPercent: latePenaltyPercent ?? 0,
      bonusCapPercent: bonusCapPercent ?? 0,
      dropLowestQuiz: !!dropLowestQuiz,
    },
    { new: true, upsert: true, runValidators: true }
  );

  return ApiResponse.success(res, scheme, 'Grading scheme saved');
};

// ---------------------------------------------------------------------------
// GET /gradebook/:courseId/grades — every enrolled student's computed grade
// ---------------------------------------------------------------------------
export const getClassGrades = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  await loadCourseAndAssertAccess(req, courseId);

  const scheme = await GradingScheme.findOne({ course: courseId }).lean();
  if (!scheme) {
    return ApiResponse.success(res, { configured: false, students: [] });
  }

  const students = await Student.find({ enrolledCourses: courseId })
    .populate('profile', 'firstName lastName')
    .select('profile studentId')
    .lean();

  const grades = await Promise.all(
    students.map(async (s: any) => {
      const result = await computeCourseGrade(courseId, s._id.toString());
      return {
        ...result,
        studentId: s._id,
        studentCode: s.studentId,
        name: `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim(),
      };
    })
  );

  return ApiResponse.success(res, { configured: true, students: grades });
};

// ---------------------------------------------------------------------------
// GET /gradebook/:courseId/grades/:studentId — one student's grade breakdown
// ---------------------------------------------------------------------------
export const getStudentGrade = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, studentId } = req.params;
  await loadCourseAndAssertAccess(req, courseId);

  const student = await Student.findById(studentId).select('_id').lean();
  if (!student) throw new NotFoundError('Student');

  const result = await computeCourseGrade(courseId, studentId);
  return ApiResponse.success(res, result);
};

// ---------------------------------------------------------------------------
// GET /gradebook/:courseId/my — the calling student's own grade breakdown
// for a course they're actually enrolled in (or auto-rostered into, for a
// class-based organization). No admin/teacher access required.
// ---------------------------------------------------------------------------
export const getMyCourseGrade = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const student = await ensureStudentRecord(req.user!.userId);

  const course = await Course.findById(courseId).select('school class').lean();
  if (!course) throw new NotFoundError('Course');

  const school = course.school ? await School.findById(course.school).select('attendanceType').lean() : null;
  const isClassBased = school?.attendanceType === 'class_based' && !!course.class;
  const studentClassId = (student as any).class?.toString();

  const owns = isClassBased
    ? course.class?.toString() === studentClassId
    : student.enrolledCourses.some((id: any) => id.toString() === courseId);
  if (!owns) throw new ForbiddenError('You are not enrolled in this course.');

  const scheme = await GradingScheme.findOne({ course: courseId }).lean();
  if (!scheme) return ApiResponse.success(res, { configured: false });

  const result = await computeCourseGrade(courseId, student._id.toString());
  return ApiResponse.success(res, { configured: true, ...result });
};

// ---------------------------------------------------------------------------
// PUT /gradebook/:courseId/manual/:studentId — set a manual category score
// (Participation, bonus, or any other category with sourceType 'manual')
// ---------------------------------------------------------------------------
export const setManualGrade = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, studentId } = req.params;
  const { categoryKey, score } = req.body;
  await loadCourseAndAssertAccess(req, courseId);

  if (!categoryKey || typeof score !== 'number' || score < 0 || score > 100) {
    throw new BadRequestError('categoryKey and a score between 0 and 100 are required.');
  }

  const entry = await ManualGradeEntry.findOneAndUpdate(
    { course: courseId, student: studentId, categoryKey },
    { score, enteredBy: req.user!.userId },
    { new: true, upsert: true, runValidators: true }
  );

  return ApiResponse.success(res, entry, 'Grade entry saved');
};

// ---------------------------------------------------------------------------
// GET /gradebook/:courseId/export?format=csv|xlsx
// ---------------------------------------------------------------------------
export const exportClassGrades = async (req: Request, res: Response): Promise<void> => {
  const { courseId } = req.params;
  const course = await loadCourseAndAssertAccess(req, courseId);

  const scheme = await GradingScheme.findOne({ course: courseId }).lean();
  const students = await Student.find({ enrolledCourses: courseId })
    .populate('profile', 'firstName lastName')
    .select('profile studentId')
    .lean();

  const categories = scheme?.categories || [];
  const headers = ['Student ID', 'Name', ...categories.map((c: any) => c.label), 'Bonus', 'Final Grade', 'Status'];
  const rows = await Promise.all(
    students.map(async (s: any) => {
      const result = await computeCourseGrade(courseId, s._id.toString());
      const name = `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim();
      return [
        s.studentId,
        name,
        ...result.categories.map((c) => `${c.earnedPercent}%`),
        `${result.bonusApplied}%`,
        `${result.finalGrade}%`,
        result.passed ? 'Pass' : 'Fail',
      ];
    })
  );

  const format = (req.query.format as string) === 'csv' ? 'csv' : 'xlsx';
  const filename = `gradebook-${((course as any).title?.en || courseId).replace(/\s+/g, '-')}`;

  if (format === 'csv') {
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
    res.end('﻿' + csv);
    return;
  }

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Gradebook');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// POST /gradebook-courses/bulk-apply — apply one grading scheme template to
// many courses at once, instead of building the same category list one
// course at a time. 'exam' sourceType categories are rejected here — each
// course has its own distinct Exam documents, so a shared template can't
// reference a valid examId for every target course; those categories still
// have to be added per-course from the individual editor.
// ---------------------------------------------------------------------------
export const bulkApplyScheme = async (req: Request, res: Response): Promise<Response> => {
  const { courseIds, categories, passingScore, latePenaltyPercent, bonusCapPercent, dropLowestQuiz } = req.body;

  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw new BadRequestError('At least one target course is required.');
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new BadRequestError('At least one grading category is required.');
  }
  for (const cat of categories) {
    if (!cat.key || !cat.label || typeof cat.weight !== 'number') {
      throw new BadRequestError('Each category needs a key, label, and numeric weight.');
    }
    if (!['attendance', 'assignments', 'quizzes', 'manual'].includes(cat.sourceType)) {
      throw new BadRequestError(
        `Category "${cat.label}": bulk templates only support Attendance, Assignments, Quizzes, or Manual — exam-specific categories must be added per course since each course has its own exams.`
      );
    }
  }
  if (!validateCategoryWeights(categories)) {
    throw new BadRequestError('Category weights must add up to exactly 100%.');
  }

  // Scope target courses to the caller's own organization — an org_admin
  // must never be able to write a scheme onto another tenant's course by
  // passing its id, even though this endpoint is admin/org_admin only.
  const scopedFilter = applyOrgFilter(req, { _id: { $in: courseIds } }, 'school');
  const ownedCourses = await Course.find(scopedFilter).select('_id').lean();
  const ownedIds = ownedCourses.map((c) => c._id.toString());
  const skipped = courseIds.filter((id: string) => !ownedIds.includes(id));

  const payload = {
    categories,
    passingScore: passingScore ?? 60,
    latePenaltyPercent: latePenaltyPercent ?? 0,
    bonusCapPercent: bonusCapPercent ?? 0,
    dropLowestQuiz: !!dropLowestQuiz,
  };

  await Promise.all(
    ownedIds.map((courseId) =>
      GradingScheme.findOneAndUpdate(
        { course: courseId },
        { course: courseId, ...payload },
        { upsert: true, runValidators: true }
      )
    )
  );

  return ApiResponse.success(
    res,
    { applied: ownedIds.length, skipped: skipped.length },
    `Grading rules applied to ${ownedIds.length} course${ownedIds.length === 1 ? '' : 's'}.`
  );
};

// ---------------------------------------------------------------------------
// GET /gradebook-courses — every course in the caller's organization, with
// its grading-scheme status, so an org_admin can jump straight into any
// course's Grading Rules editor without hunting through Course Builder one
// course at a time. Admin/org_admin only (teachers keep using the existing
// per-course Gradebook link inside their own Course Builder).
// ---------------------------------------------------------------------------
export const listCourseGradingStatus = async (req: Request, res: Response): Promise<Response> => {
  const { search, status } = req.query;

  const filter: Record<string, unknown> = {};
  if (status && ['draft', 'published', 'archived'].includes(status as string)) filter.status = status;
  if (search) filter['title.en'] = { $regex: search as string, $options: 'i' };

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  const courses = await Course.find(scopedFilter)
    .select('title slug category status teacher class school')
    .populate({
      path: 'teacher',
      select: 'profile',
      populate: { path: 'profile', select: 'firstName lastName' },
    })
    .populate('class', 'title section')
    .sort({ 'title.en': 1 })
    .lean();

  const courseIds = courses.map((c: any) => c._id);
  const schemes = await GradingScheme.find({ course: { $in: courseIds } })
    .select('course categories passingScore')
    .lean();
  const schemeByCourse = new Map(schemes.map((s: any) => [s.course.toString(), s]));

  const result = courses.map((c: any) => {
    const scheme = schemeByCourse.get(c._id.toString());
    return {
      _id: c._id,
      title: c.title,
      slug: c.slug,
      category: c.category,
      status: c.status,
      teacher: c.teacher ? { name: `${c.teacher.profile?.firstName || ''} ${c.teacher.profile?.lastName || ''}`.trim() } : null,
      class: c.class ? { title: c.class.title, section: c.class.section } : null,
      configured: !!scheme,
      categoriesCount: scheme?.categories?.length || 0,
      passingScore: scheme?.passingScore ?? null,
    };
  });

  return ApiResponse.success(res, result);
};
