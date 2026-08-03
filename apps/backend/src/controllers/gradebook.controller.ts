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
import { computeCourseGradesBulk } from '../utils/bulk-grade-calculator';
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

  const gradeMap = await computeCourseGradesBulk(courseId, students.map((s: any) => s._id.toString()), scheme);
  const grades = students.map((s: any) => {
    const result = gradeMap.get(s._id.toString())!;
    return {
      ...result,
      studentId: s._id,
      studentCode: s.studentId,
      name: `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim(),
    };
  });

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

const MANUAL_ENTRY_SLOT_LABELS: Record<ManualEntrySlot, string> = {
  midExam: 'Mid Exam',
  midActivity: 'Mid Activity',
  final: 'Final',
  finalActivity: 'Final Activity',
};

/**
 * Guarantees a course's GradingScheme has all 4 standard categories (Mid
 * Exam, Mid Activity, Final, Final Activity), so the "Enter Results" sheet's
 * 4 columns are always fillable for ANY course — not just ones an admin
 * already hand-configured in Grading Rules. Missing categories are added as
 * sourceType 'manual': if the scheme didn't exist at all, at 25% each (sums
 * to exactly 100); if some categories already exist, any missing ones are
 * added at 0% weight so existing weights are never silently redistributed —
 * the admin can raise a new category's weight later from Grading Rules if
 * they want it to actually count toward the student's total.
 */
async function ensureManualEntryCategories(courseId: string, scheme: any): Promise<any> {
  const categories: IGradingCategory[] = scheme?.categories ? [...scheme.categories] : [];
  const missingSlots = MANUAL_ENTRY_SLOTS.filter((slot) => !matchCategoryForSlot(categories, slot));
  if (missingSlots.length === 0) return scheme;

  const isBrandNew = categories.length === 0;
  const newCategories: IGradingCategory[] = missingSlots.map((slot) => ({
    key: `${slot}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label: MANUAL_ENTRY_SLOT_LABELS[slot],
    weight: isBrandNew ? Math.round(100 / MANUAL_ENTRY_SLOTS.length) : 0,
    sourceType: 'manual',
  }));

  return GradingScheme.findOneAndUpdate(
    { course: courseId },
    {
      course: courseId,
      categories: [...categories, ...newCategories],
      $setOnInsert: { passingScore: 60, latePenaltyPercent: 0, bonusCapPercent: 0, dropLowestQuiz: false },
    },
    { new: true, upsert: true }
  ).lean();
}

/** A slot's point cap for entry purposes — its category's weight, or 100 when the weight is 0. Mirrors the frontend's own entryMax (results-entry.tsx). */
function entryMaxForWeight(weight: number | undefined): number {
  return weight && weight > 0 ? weight : 100;
}
/** Stored value (0-100 percent-of-category) -> raw points out of the category's weight, for the downloadable template. */
function percentToPointsServer(percent: number, weight: number | undefined): number {
  if (!weight || weight <= 0) return percent;
  return Math.round((percent / 100) * weight);
}
/** Raw points typed/imported -> stored value (0-100 percent-of-category). */
function pointsToPercentServer(points: number, weight: number | undefined): number {
  if (!weight || weight <= 0) return Math.min(100, points);
  return Math.min(100, Math.round((points / weight) * 100 * 100) / 100);
}

// ---------------------------------------------------------------------------
// Shared roster builder — used by the JSON roster endpoint, the downloadable
// bulk-import template, and (implicitly, by re-deriving slot categories) the
// file import handler below.
// ---------------------------------------------------------------------------
async function buildManualEntryRoster(req: Request, courseId: string) {
  const course = await Course.findById(courseId)
    .select('title school class')
    .populate('school', 'name attendanceType')
    .populate({ path: 'class', select: 'title section department', populate: { path: 'department', select: 'name' } })
    .lean();
  if (!course) throw new NotFoundError('Course');

  let scheme = await GradingScheme.findOne({ course: courseId }).lean();
  scheme = await ensureManualEntryCategories(courseId, scheme);
  const categories: IGradingCategory[] = scheme?.categories || [];

  // A teacher never sees/edits a category the admin marked teacherVisible:
  // false (e.g. an official invigilated exam score they shouldn't be able to
  // touch) — org_admin/admin always see every slot.
  const isTeacher = req.user?.role === 'teacher';
  const slotCategory: Record<ManualEntrySlot, { key: string; label: string; weight: number } | null> = {
    midExam: null, midActivity: null, final: null, finalActivity: null,
  };
  for (const slot of MANUAL_ENTRY_SLOTS) {
    const match = matchCategoryForSlot(categories, slot);
    if (match && !(isTeacher && match.teacherVisible === false)) {
      slotCategory[slot] = { key: match.key, label: match.label, weight: match.weight };
    }
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

  return {
    slots: slotCategory,
    organization: orgLabel,
    courseClass: courseClassLabel,
    courseTitle: (course as any).title?.en || '',
    passingScore: scheme?.passingScore ?? 60,
    students: roster,
  };
}

// ---------------------------------------------------------------------------
// GET /gradebook/:courseId/manual-entry-roster
// ---------------------------------------------------------------------------
export const getManualEntryRoster = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  await loadCourseAndAssertAccess(req, courseId);
  const roster = await buildManualEntryRoster(req, courseId);
  return ApiResponse.success(res, roster);
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

  let scheme = await GradingScheme.findOne({ course: courseId }).lean();
  scheme = await ensureManualEntryCategories(courseId, scheme);
  const categories: IGradingCategory[] = scheme?.categories || [];
  const isTeacher = req.user?.role === 'teacher';
  const slotKey: Partial<Record<ManualEntrySlot, string>> = {};
  for (const slot of MANUAL_ENTRY_SLOTS) {
    const match = matchCategoryForSlot(categories, slot);
    if (match && !(isTeacher && match.teacherVisible === false)) slotKey[slot] = match.key;
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
// course at a time. Admin/org_admin see every course in scope; a teacher
// calling this (e.g. from Enter Results) only ever gets courses THEY teach —
// applyOrgFilter doesn't scope the 'teacher' role at all, so that has to be
// applied here explicitly.
// ---------------------------------------------------------------------------
export const listCourseGradingStatus = async (req: Request, res: Response): Promise<Response> => {
  const { search, status } = req.query;

  const filter: Record<string, unknown> = {};
  if (status && ['draft', 'published', 'archived'].includes(status as string)) filter.status = status;
  if (search) filter['title.en'] = { $regex: search as string, $options: 'i' };

  let scopedFilter = applyOrgFilter(req, filter, 'school');
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    scopedFilter = { ...scopedFilter, teacher: teacher?._id ?? null };
  }

  const courses = await Course.find(scopedFilter)
    .select('title slug category status teacher class school')
    .populate({
      path: 'teacher',
      select: 'profile',
      populate: { path: 'profile', select: 'firstName lastName' },
    })
    .populate('school', 'name')
    .populate({ path: 'class', select: 'title section department', populate: { path: 'department', select: 'name' } })
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
      class: c.class ? { _id: c.class._id, title: c.class.title, section: c.class.section } : null,
      organization: c.school ? { _id: c.school._id, name: c.school.name } : null,
      department: c.class?.department ? { _id: c.class.department._id, name: c.class.department.name } : null,
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

  // Each course's students are graded with ONE batch call (computeCourseGradesBulk)
  // instead of one computeCourseGrade call per student — that fixed-query-count
  // batching (not just parallelizing N per-student calls) is what keeps this
  // endpoint fast regardless of how many students an org's courses have.
  // Courses themselves still run in parallel across each other.
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
      const gradeMap = await computeCourseGradesBulk(course._id.toString(), (students as any[]).map((s) => s._id.toString()), scheme);

      return (students as any[]).map((s) => {
        const result = gradeMap.get(s._id.toString())!;
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
      });
    })
  );

  return ApiResponse.success(res, rowsByCourse.flat());
};

// ---------------------------------------------------------------------------
// GET /gradebook/:courseId/manual-entry-roster/template — download an XLSX
// pre-filled with this course's roster and any scores already entered (as
// raw points, same convention as the Enter Results sheet itself), so a
// teacher who prepared scores offline can fill in the blanks and re-upload
// via /manual-entry-roster/import instead of typing each student one at a
// time in the browser.
// ---------------------------------------------------------------------------
export const exportManualEntryTemplate = async (req: Request, res: Response): Promise<void> => {
  const { courseId } = req.params;
  const course = await loadCourseAndAssertAccess(req, courseId);
  const roster = await buildManualEntryRoster(req, courseId);

  const headers = [
    'Student Code',
    'Student Name',
    ...MANUAL_ENTRY_SLOTS.map((slot) => {
      const cat = roster.slots[slot];
      const label = MANUAL_ENTRY_SLOT_LABELS[slot];
      return cat ? `${label} (out of ${entryMaxForWeight(cat.weight)})` : `${label} (not set up)`;
    }),
  ];

  const rows = roster.students.map((s: any) => [
    s.studentCode,
    s.studentName,
    ...MANUAL_ENTRY_SLOTS.map((slot) => {
      const cat = roster.slots[slot];
      const percent = s.scores[slot];
      if (!cat || percent === null) return '';
      return percentToPointsServer(percent, cat.weight);
    }),
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Enter Results');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const filename = `enter-results-${(roster.courseTitle || (course as any).title?.en || courseId).replace(/\s+/g, '-')}`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// POST /gradebook/:courseId/manual-entry-roster/import — bulk-upload scores
// from an Excel/CSV file matching the /template download's columns (Student
// Code, Student Name, then the 4 slot columns in a fixed order). Rows are
// matched to students by Student Code (case-insensitive, trimmed); a code
// that doesn't match this course's roster is skipped and reported back
// rather than failing the whole import, same tolerant behavior as the
// Content Blocks import.
// ---------------------------------------------------------------------------
export const importManualEntryRoster = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  await loadCourseAndAssertAccess(req, courseId);
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file").');

  const roster = await buildManualEntryRoster(req, courseId);
  const studentByCode = new Map(roster.students.map((s: any) => [String(s.studentCode).trim().toLowerCase(), s]));

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets.');
  const rows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  const dataRows = rows.slice(1); // first row is the header
  if (dataRows.length === 0) throw new BadRequestError('The file has no data rows.');

  const entries: { studentId: string; slot: ManualEntrySlot; score: number }[] = [];
  const notFound: string[] = [];

  for (const row of dataRows) {
    const code = String(row[0] ?? '').trim();
    if (!code) continue;
    const student = studentByCode.get(code.toLowerCase()) as any;
    if (!student) { notFound.push(code); continue; }

    MANUAL_ENTRY_SLOTS.forEach((slot, i) => {
      const cat = roster.slots[slot];
      if (!cat) return;
      const raw = row[2 + i];
      if (raw === '' || raw === undefined || raw === null) return;
      const points = Number(raw);
      if (Number.isNaN(points) || points < 0) return;
      const max = entryMaxForWeight(cat.weight);
      entries.push({ studentId: student.studentId, slot, score: pointsToPercentServer(Math.min(points, max), cat.weight) });
    });
  }

  if (entries.length === 0) {
    throw new BadRequestError(
      notFound.length > 0
        ? `No matching students found — check that the Student Code column matches this course's roster (${notFound.length} unmatched code${notFound.length === 1 ? '' : 's'}).`
        : 'No scores found in the file to import.'
    );
  }

  let scheme = await GradingScheme.findOne({ course: courseId }).lean();
  scheme = await ensureManualEntryCategories(courseId, scheme);
  const categories: IGradingCategory[] = scheme?.categories || [];
  const isTeacher = req.user?.role === 'teacher';
  const slotKey: Partial<Record<ManualEntrySlot, string>> = {};
  for (const slot of MANUAL_ENTRY_SLOTS) {
    const match = matchCategoryForSlot(categories, slot);
    if (match && !(isTeacher && match.teacherVisible === false)) slotKey[slot] = match.key;
  }

  let saved = 0;
  for (const entry of entries) {
    const categoryKey = slotKey[entry.slot];
    if (!categoryKey) continue;
    await ManualGradeEntry.findOneAndUpdate(
      { course: courseId, student: entry.studentId, categoryKey },
      { score: entry.score, enteredBy: req.user!.userId },
      { upsert: true, runValidators: true }
    );
    saved++;
  }

  return ApiResponse.success(
    res,
    { saved, notFound },
    `Imported ${saved} score${saved === 1 ? '' : 's'}.${notFound.length > 0 ? ` ${notFound.length} student code${notFound.length === 1 ? '' : 's'} didn't match this course's roster.` : ''}`
  );
};

// ---------------------------------------------------------------------------
// GET /gradebook-courses/entry-summary — quick-glance progress metrics for
// the Enter Results landing screen (before an admin/teacher has picked a
// course): how many courses have every enrolled student fully scored across
// all 4 manual-entry slots vs still pending, and the students-graded count
// underneath. Fixed query count regardless of how many courses/students are
// in scope — same batching approach as computeCourseGradesBulk, since this
// runs on every page load rather than on demand.
// ---------------------------------------------------------------------------
export const getEntrySummary = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = {};
  let scopedFilter = applyOrgFilter(req, filter, 'school');
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    scopedFilter = { ...scopedFilter, teacher: teacher?._id ?? null };
  }

  const courses = await Course.find(scopedFilter)
    .select('school class')
    .populate('school', 'attendanceType')
    .populate('class', 'department')
    .lean();

  if (courses.length === 0) {
    return ApiResponse.success(res, { coursesTotal: 0, coursesCompleted: 0, coursesPending: 0, studentsGraded: 0, studentsTotal: 0 });
  }

  const courseIds = courses.map((c: any) => c._id);
  const schemes = await GradingScheme.find({ course: { $in: courseIds } }).select('course categories').lean();
  const schemeByCourse = new Map(schemes.map((s: any) => [s.course.toString(), s]));
  const isTeacher = req.user?.role === 'teacher';

  const classBasedCourses = (courses as any[]).filter((c) => c.school?.attendanceType === 'class_based' && c.class);
  const enrollBasedCourses = (courses as any[]).filter((c) => !(c.school?.attendanceType === 'class_based' && c.class));
  const classIds = classBasedCourses.map((c) => c.class._id);
  const enrollCourseIds = enrollBasedCourses.map((c) => c._id);

  const [classStudents, enrollStudents] = await Promise.all([
    classIds.length ? Student.find({ class: { $in: classIds } }).select('class').lean() : Promise.resolve([]),
    enrollCourseIds.length ? Student.find({ enrolledCourses: { $in: enrollCourseIds } }).select('enrolledCourses').lean() : Promise.resolve([]),
  ]);

  const studentsByClass = new Map<string, string[]>();
  for (const s of classStudents as any[]) {
    const cid = s.class?.toString();
    if (!cid) continue;
    if (!studentsByClass.has(cid)) studentsByClass.set(cid, []);
    studentsByClass.get(cid)!.push(s._id.toString());
  }

  const rosterByCourse = new Map<string, string[]>();
  for (const c of classBasedCourses) rosterByCourse.set(c._id.toString(), studentsByClass.get(c.class._id.toString()) || []);
  for (const c of enrollBasedCourses) {
    const cid = c._id.toString();
    const roster = (enrollStudents as any[])
      .filter((s) => s.enrolledCourses?.some((id: any) => id.toString() === cid))
      .map((s) => s._id.toString());
    rosterByCourse.set(cid, roster);
  }

  const entries = await ManualGradeEntry.find({ course: { $in: courseIds } }).select('course student categoryKey').lean();
  const filledByCourseStudent = new Map<string, Set<string>>();
  for (const e of entries as any[]) {
    const k = `${e.course.toString()}_${e.student.toString()}`;
    if (!filledByCourseStudent.has(k)) filledByCourseStudent.set(k, new Set());
    filledByCourseStudent.get(k)!.add(e.categoryKey);
  }

  let coursesCompleted = 0;
  let studentsGraded = 0;
  let studentsTotal = 0;

  for (const c of courses as any[]) {
    const cid = c._id.toString();
    const roster = rosterByCourse.get(cid) || [];
    studentsTotal += roster.length;
    if (roster.length === 0) continue;

    const categories: IGradingCategory[] = schemeByCourse.get(cid)?.categories || [];
    const activeSlotKeys = MANUAL_ENTRY_SLOTS.map((slot) => matchCategoryForSlot(categories, slot))
      .filter((cat) => cat && !(isTeacher && cat.teacherVisible === false))
      .map((cat) => cat!.key);
    if (activeSlotKeys.length === 0) continue; // never opened yet — nothing entered, correctly pending

    let studentsGradedInCourse = 0;
    for (const sid of roster) {
      const filled = filledByCourseStudent.get(`${cid}_${sid}`);
      const filledCount = filled ? activeSlotKeys.filter((k) => filled.has(k)).length : 0;
      if (filledCount === activeSlotKeys.length) studentsGradedInCourse++;
    }
    studentsGraded += studentsGradedInCourse;
    if (studentsGradedInCourse === roster.length) coursesCompleted++;
  }

  return ApiResponse.success(res, {
    coursesTotal: courses.length,
    coursesCompleted,
    coursesPending: courses.length - coursesCompleted,
    studentsGraded,
    studentsTotal,
  });
};
