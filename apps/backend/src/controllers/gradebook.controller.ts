/**
 * Gradebook Controller — weighted grading scheme configuration + computed
 * class/student grade views. Admin (and org_admin, within their org) can
 * configure any course; a teacher may only configure/view their own courses.
 */

import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import Course from '../models/course.model';
import Student from '../models/student.model';
import GradingScheme from '../models/grading-scheme.model';
import ManualGradeEntry from '../models/manual-grade-entry.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { getOwnTeacherRecord, assertOwnsOrg } from '../utils/tenant-scope';
import { computeCourseGrade, validateCategoryWeights } from '../utils/grade-calculator';

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
