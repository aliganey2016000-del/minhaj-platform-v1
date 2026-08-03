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
import Exam from '../models/exam.model';
import GradingScheme, { IGradingCategory } from '../models/grading-scheme.model';
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
      const result = await computeCourseGrade(courseId, s._id.toString(), scheme);
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
// "Enter Results" bulk manual-entry sheet — fixed 4 UI columns (Mid Exam,
// Mid Activity, Final, Final Activity) matched onto whichever categories a
// course's own GradingScheme actually defines with those labels, same
// matching heuristic the "View Results" table uses (sourceType 'exam' +
// label keyword = the exam-graded column; any other sourceType + the same
// keyword = the "activity" column). A slot with no matching category is
// simply not returned/writable for that course — there's nothing to save it
// against.
// ---------------------------------------------------------------------------
const MANUAL_ENTRY_SLOTS = ['midExam', 'midActivity', 'final', 'finalActivity'] as const;
type ManualEntrySlot = (typeof MANUAL_ENTRY_SLOTS)[number];

function matchCategoryForSlot(categories: IGradingCategory[], slot: ManualEntrySlot): IGradingCategory | undefined {
  const hasKeyword = (label: string, keyword: string) => (label || '').toLowerCase().includes(keyword);
  if (slot === 'midExam') return categories.find((c) => c.sourceType === 'exam' && hasKeyword(c.label, 'mid'));
  if (slot === 'midActivity') return categories.find((c) => c.sourceType !== 'exam' && hasKeyword(c.label, 'mid'));
  if (slot === 'final') return categories.find((c) => c.sourceType === 'exam' && hasKeyword(c.label, 'final'));
  return categories.find((c) => c.sourceType !== 'exam' && hasKeyword(c.label, 'final')); // finalActivity
}

// ---------------------------------------------------------------------------
// GET /gradebook/:courseId/manual-entry-roster
// ---------------------------------------------------------------------------
export const getManualEntryRoster = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  await loadCourseAndAssertAccess(req, courseId);

  const course = await Course.findById(courseId)
    .select('title school class')
    .populate('school', 'name attendanceType')
    .populate({ path: 'class', select: 'title section department', populate: { path: 'department', select: 'name' } })
    .lean();
  if (!course) throw new NotFoundError('Course');

  const scheme = await GradingScheme.findOne({ course: courseId }).lean();
  const categories: IGradingCategory[] = scheme?.categories || [];

  const slotCategory: Record<ManualEntrySlot, { key: string; label: string } | null> = {
    midExam: null, midActivity: null, final: null, finalActivity: null,
  };
  for (const slot of MANUAL_ENTRY_SLOTS) {
    const match = matchCategoryForSlot(categories, slot);
    if (match) slotCategory[slot] = { key: match.key, label: match.label };
  }

  const isClassBased = (course as any).school?.attendanceType === 'class_based' && !!(course as any).class;
  const students = await Student.find(isClassBased ? { class: (course as any).class._id } : { enrolledCourses: courseId })
    .populate('profile', 'firstName lastName')
    .select('profile studentId department')
    .lean();

  const activeKeys = MANUAL_ENTRY_SLOTS.map((s) => slotCategory[s]?.key).filter(Boolean) as string[];
  const entries = activeKeys.length
    ? await ManualGradeEntry.find({ course: courseId, categoryKey: { $in: activeKeys } }).select('student categoryKey score').lean()
    : [];
  const entryMap = new Map(entries.map((e: any) => [`${e.student.toString()}_${e.categoryKey}`, e.score]));

  const orgLabel = (course as any).school?.name || '';
  const deptLabel = (course as any).class?.department?.name || '';
  const courseClassLabel = (course as any).class
    ? `${(course as any).title?.en || ''} · ${(course as any).class.title} (${(course as any).class.section})`
    : (course as any).title?.en || '';

  const roster = (students as any[]).map((s) => {
    const scores: Record<ManualEntrySlot, number | null> = { midExam: null, midActivity: null, final: null, finalActivity: null };
    for (const slot of MANUAL_ENTRY_SLOTS) {
      const cat = slotCategory[slot];
      if (!cat) continue;
      const v = entryMap.get(`${s._id.toString()}_${cat.key}`);
      scores[slot] = v !== undefined ? v : null;
    }
    return {
      studentId: s._id,
      studentCode: s.studentId,
      studentName: `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim(),
      department: deptLabel || s.department || '',
      scores,
    };
  });

  return ApiResponse.success(res, {
    slots: slotCategory,
    organization: orgLabel,
    courseClass: courseClassLabel,
    passingScore: scheme?.passingScore ?? 60,
    students: roster,
  });
};

// ---------------------------------------------------------------------------
// POST /gradebook/:courseId/manual-entry-roster/bulk
// body: { entries: [{ studentId, slot: 'midExam'|'midActivity'|'final'|'finalActivity', score: number }] }
// ---------------------------------------------------------------------------
export const bulkSetManualGrades = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  await loadCourseAndAssertAccess(req, courseId);

  const { entries } = req.body as { entries?: { studentId: string; slot: ManualEntrySlot; score: number }[] };
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new BadRequestError('At least one entry is required.');
  }

  const scheme = await GradingScheme.findOne({ course: courseId }).lean();
  const categories: IGradingCategory[] = scheme?.categories || [];
  const slotKey: Partial<Record<ManualEntrySlot, string>> = {};
  for (const slot of MANUAL_ENTRY_SLOTS) {
    const match = matchCategoryForSlot(categories, slot);
    if (match) slotKey[slot] = match.key;
  }

  let saved = 0;
  for (const entry of entries) {
    const categoryKey = slotKey[entry.slot];
    if (!categoryKey) continue; // course has no category configured for this slot
    if (typeof entry.score !== 'number' || entry.score < 0 || entry.score > 100) continue;

    await ManualGradeEntry.findOneAndUpdate(
      { course: courseId, student: entry.studentId, categoryKey },
      { score: entry.score, enteredBy: req.user!.userId },
      { upsert: true, runValidators: true }
    );
    saved++;
  }

  return ApiResponse.success(res, { saved }, 'Results saved');
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
// course at a time.
//
// 'exam' categories can't carry a single shared examId (each course has its
// own distinct Exam documents), so instead the template carries an
// `examTitleMatch` string (e.g. "Final Exam") per exam category — applied
// per course, each course's own Exam collection is searched for a
// case-insensitive title match and THAT course's exam id is linked. A
// course with no matching exam still gets the category (so weights stay at
// 100%), just left unlinked until the admin picks one manually from that
// course's own editor.
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
    if (!['attendance', 'assignments', 'quizzes', 'exam', 'manual'].includes(cat.sourceType)) {
      throw new BadRequestError(`Invalid source type "${cat.sourceType}".`);
    }
    if (cat.sourceType === 'exam' && !String(cat.examTitleMatch || '').trim()) {
      throw new BadRequestError(
        `Category "${cat.label}": enter the exam title to match (e.g. "Final Exam") — each course's matching exam will be linked automatically.`
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

  const hasExamCategory = categories.some((c: any) => c.sourceType === 'exam');
  let unlinkedExamCount = 0;

  await Promise.all(
    ownedIds.map(async (courseId) => {
      let courseExams: { _id: any; title: string }[] = [];
      if (hasExamCategory) {
        courseExams = await Exam.find({ course: courseId }).select('title').lean();
      }

      const courseCategories = categories.map((cat: any) => {
        if (cat.sourceType !== 'exam') {
          return { key: cat.key, label: cat.label, weight: cat.weight, sourceType: cat.sourceType };
        }
        const wanted = String(cat.examTitleMatch || '').trim().toLowerCase();
        const match = courseExams.find((e) => e.title.trim().toLowerCase() === wanted);
        if (!match) unlinkedExamCount++;
        return { key: cat.key, label: cat.label, weight: cat.weight, sourceType: 'exam', examId: match?._id };
      });

      await GradingScheme.findOneAndUpdate(
        { course: courseId },
        {
          course: courseId,
          categories: courseCategories,
          passingScore: passingScore ?? 60,
          latePenaltyPercent: latePenaltyPercent ?? 0,
          bonusCapPercent: bonusCapPercent ?? 0,
          dropLowestQuiz: !!dropLowestQuiz,
        },
        { upsert: true, runValidators: true }
      );
    })
  );

  const unlinkedNote = unlinkedExamCount > 0
    ? ` ${unlinkedExamCount} exam-category link${unlinkedExamCount === 1 ? '' : 's'} couldn't be matched automatically — open those courses' editors to pick the exam manually.`
    : '';

  return ApiResponse.success(
    res,
    { applied: ownedIds.length, skipped: skipped.length, unlinkedExamCount },
    `Grading rules applied to ${ownedIds.length} course${ownedIds.length === 1 ? '' : 's'}.${unlinkedNote}`
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

// ---------------------------------------------------------------------------
// GET /gradebook-courses/overview — one row per (student, course) across
// every configured course in the caller's organization, with each grading
// category's earned % as its own column plus the weighted Grand Total.
// Feeds the "View Results" table on Manage Results — courses with no
// GradingScheme configured yet are skipped (nothing to show a breakdown
// of), matching "Grading Rules" page's own configured/not-configured split.
// ---------------------------------------------------------------------------
export const getOrgGradebookOverview = async (req: Request, res: Response): Promise<Response> => {
  const { search } = req.query;

  const filter: Record<string, unknown> = {};
  if (search) filter['title.en'] = { $regex: search as string, $options: 'i' };
  const scopedFilter = applyOrgFilter(req, filter, 'school');

  const courses = await Course.find(scopedFilter)
    .select('title slug school class')
    .populate('school', 'name attendanceType')
    .populate({
      path: 'class',
      select: 'title section department',
      populate: { path: 'department', select: 'name' },
    })
    .lean();

  const courseIds = courses.map((c: any) => c._id);
  const schemes = await GradingScheme.find({ course: { $in: courseIds } }).lean();
  const schemeByCourse = new Map(schemes.map((s: any) => [s.course.toString(), s]));

  // Configured courses only — courses with no GradingScheme have nothing to
  // break down, and skipping them here avoids wasted student/grade lookups.
  const configuredCourses = (courses as any[]).filter((c) => {
    const scheme = schemeByCourse.get(c._id.toString());
    return scheme && scheme.categories?.length;
  });

  // Both the course loop AND the per-student grade computation inside it
  // are fanned out with Promise.all instead of sequential awaits — this
  // endpoint can easily be computing grades for hundreds of (student,
  // category) combinations, and awaiting them one at a time serially was
  // slow enough to trip the request timeout.
  const rowsByCourse = await Promise.all(
    configuredCourses.map(async (course) => {
      const isClassBased = course.school?.attendanceType === 'class_based' && !!course.class;
      const students = await Student.find(
        isClassBased ? { class: course.class._id } : { enrolledCourses: course._id }
      )
        .populate('profile', 'firstName lastName')
        .select('profile studentId department class')
        .lean();

      const orgLabel = course.school?.name || '';
      const deptLabel = course.class?.department?.name || '';
      const courseClassLabel = course.class ? `${course.title?.en || ''} · ${course.class.title} (${course.class.section})` : (course.title?.en || '');
      const scheme = schemeByCourse.get(course._id.toString());

      return Promise.all(
        (students as any[]).map(async (s) => {
          const result = await computeCourseGrade(course._id.toString(), s._id.toString(), scheme);
          return {
            studentId: s._id,
            studentCode: s.studentId,
            studentName: `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim(),
            organization: orgLabel,
            department: deptLabel || s.department || '',
            courseClass: courseClassLabel,
            categories: result.categories,
            grandTotal: result.finalGrade,
            passed: result.passed,
            passingScore: result.passingScore,
          };
        })
      );
    })
  );

  return ApiResponse.success(res, rowsByCourse.flat());
};
