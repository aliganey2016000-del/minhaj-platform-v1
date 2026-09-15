import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassModel from '../models/class.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';
import { completeStudentEnrollmentHistory, reassignStudentClassCourses } from '../services/enrollment.service';
import { findPersistentTargetClass, describeMissingTarget, classifyClasses, runWithConcurrency, MissingTarget } from '../services/class-promotion.service';

const PROMOTION_CONCURRENCY = 10;

/**
 * Per-student reviewed promotion (promote / repeat / graduate exceptions).
 * Classes are persistent — see school-year-promotion.controller.ts for the
 * full rationale. "Repeat" moves a student into a NEW academic year within
 * the SAME class (no class change at all — just a fresh enrollmentHistory
 * entry), which is why reassignStudentClassCourses is called with an
 * explicit academicYear even when old/new class ids are identical.
 */

type StudentAction = 'promote' | 'repeat' | 'graduate';

function academicYearStart(value: string): number | null {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  return Number(match[2]) === start + 1 ? start : null;
}

function previousAcademicYear(target: string): string | null {
  const start = academicYearStart(target);
  return start === null ? null : `${start - 1}-${start}`;
}

function suggestedAcademicYear(years: string[]): string {
  const starts = years.map(academicYearStart).filter((x): x is number => x !== null);
  const start = starts.length ? Math.max(...starts) + 1 : new Date().getFullYear();
  return `${start}-${start + 1}`;
}

async function getSchoolId(req: Request): Promise<string> {
  const requested = req.method === 'GET' ? req.query.schoolId : req.body?.schoolId;
  const resolved = resolveOrgIdForCreate(req, requested as string | undefined);
  if (!resolved) throw new BadRequestError('An organization must be selected');
  return String(resolved);
}

async function activeGradedClasses(schoolId: string) {
  return ClassModel.find({
    school: schoolId, status: 'active', gradeLevel: { $ne: null },
  }).sort({ gradeLevel: 1, title: 1, section: 1 });
}

export const getPromotionReview = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getSchoolId(req);
  const years = await ClassModel.find({ school: schoolId, status: 'active' }).select('academicYear').lean();
  const requested = String(req.query.targetAcademicYear || '').trim();
  const targetAcademicYear = requested || suggestedAcademicYear(years.map((x) => x.academicYear || '').filter(Boolean));

  const classes = await activeGradedClasses(schoolId);
  const { isFinalClass } = classifyClasses(classes);
  const groups: any[] = [];

  for (const cls of classes) {
    const isFinal = isFinalClass(cls);
    const students = await Student.find({ class: cls._id, status: 'active' })
      .select('_id studentId profile').populate('profile', 'firstName lastName').sort({ studentId: 1 }).lean();
    if (!students.length) continue;

    let targetGradeLevel: number | null = null;
    let targetTitle = 'Graduate';
    let targetReady = true;
    let missingReason: string | undefined;

    if (!isFinal) {
      targetGradeLevel = Number(cls.gradeLevel) + 1;
      const targetClass = await findPersistentTargetClass({
        schoolId, gradeLevel: targetGradeLevel,
        section: cls.section || undefined,
      });
      if (targetClass) {
        targetTitle = targetClass.title;
      } else {
        const missing = describeMissingTarget(cls, targetGradeLevel);
        targetTitle = missing.title;
        targetReady = false;
        missingReason = missing.message;
      }
    }

    groups.push({
      classId: cls._id, title: cls.title, section: cls.section, gradeLevel: cls.gradeLevel, isFinal,
      targetGradeLevel, targetTitle, targetReady, missingReason,
      students: students.map((student: any) => ({
        _id: student._id, studentId: student.studentId,
        name: `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim(),
        defaultAction: isFinal ? 'graduate' : 'promote',
      })),
    });
  }

  return ApiResponse.success(res, {
    sourceAcademicYear: previousAcademicYear(targetAcademicYear) || '', targetAcademicYear, groups,
  });
};

export const promoteReviewed = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getSchoolId(req);
  const targetAcademicYear = String(req.body?.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('Target academic year is required');
  if (academicYearStart(targetAcademicYear) === null) {
    throw new BadRequestError('Academic year must use YYYY-YYYY, for example 2027-2028.');
  }

  const classes = await activeGradedClasses(schoolId);
  const { isFinalClass } = classifyClasses(classes);

  const rawDecisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  const decisions = new Map<string, StudentAction>();
  for (const item of rawDecisions) {
    const studentId = String(item?.studentId || '');
    const action = String(item?.action || '') as StudentAction;
    if (!mongoose.isValidObjectId(studentId) || !['promote', 'repeat', 'graduate'].includes(action)) throw new BadRequestError('Invalid student promotion decision');
    decisions.set(studentId, action);
  }

  const classIds = classes.map((x) => x._id);
  const rawStudents = await Student.find({ class: { $in: classIds }, status: 'active' })
    .select('_id class enrollmentHistory').lean();
  const validStudentIds = new Set(rawStudents.map((x) => String(x._id)));
  for (const studentId of decisions.keys()) if (!validStudentIds.has(studentId)) throw new BadRequestError('A promotion decision references a student outside the active classes');

  const isFinalById = new Map(classes.map((cls) => [String(cls._id), isFinalClass(cls)]));

  // Guard against a duplicate submission for the SAME target year — a
  // client retry after a timeout (the request can succeed on the server
  // after the client already gave up and reports failure), or a
  // double-click of Confirm. Without this, a student already moved into
  // targetAcademicYear by an earlier, unacknowledged run would be found
  // again in their new (now source) class and swept one grade further.
  //
  // Scoped to 'promote' only: a 'repeat' or 'graduate' decision is already
  // naturally idempotent (repeat's history entry is deduped by class+year in
  // syncEnrollmentHistory; graduate's status-guarded update just no-ops), and
  // re-submitting either is expected to keep succeeding rather than being
  // silently skipped.
  let alreadyHandled = 0;
  const allStudents = rawStudents.filter((student) => {
    const requested = decisions.get(String(student._id)) || (isFinalById.get(String(student.class)) ? 'graduate' : 'promote');
    if (requested !== 'promote') return true;
    const activeEntry = (student.enrollmentHistory || []).find((entry: any) => entry.status === 'active');
    if (activeEntry?.academicYear === targetAcademicYear) {
      alreadyHandled += 1;
      return false;
    }
    return true;
  });

  const byClass = new Map<string, typeof allStudents>();
  for (const student of allStudents) {
    const key = String(student.class);
    const list = byClass.get(key) || [];
    list.push(student);
    byClass.set(key, list);
  }

  let studentsPromoted = 0;
  let studentsRepeated = 0;
  let studentsGraduated = 0;
  const missingTargets: (MissingTarget & { sourceClassId: mongoose.Types.ObjectId; sourceTitle: string })[] = [];
  const skippedStudents: { studentId: string; reason: string }[] = [];

  // See school-year-promotion.controller.ts: a class is persistent and its
  // own `academicYear` is display metadata, not per-student history — left
  // untouched it would keep showing the old year forever. Every class this
  // run actually moved, repeated, or graduated someone through now operates
  // in targetAcademicYear.
  const promotedIntoYear = new Set<string>();

  for (const cls of classes) {
    const students = byClass.get(String(cls._id)) || [];
    if (!students.length) continue;
    const isFinal = isFinalClass(cls);

    const requestedFor = (student: (typeof students)[number]) => decisions.get(String(student._id)) || (isFinal ? 'graduate' : 'promote');

    // Validate every decision for this class before any write happens, so a
    // bad request fails cleanly instead of partway through a concurrent batch.
    for (const student of students) {
      const requested = requestedFor(student);
      if (isFinal && requested === 'promote') throw new BadRequestError(`Final grade students cannot be promoted beyond ${cls.title}; choose Graduate or Repeat.`);
      if (!isFinal && requested === 'graduate') throw new BadRequestError(`Only final grade students can be graduated; ${cls.title} must use Promote or Repeat.`);
    }

    let promotionTarget: Awaited<ReturnType<typeof findPersistentTargetClass>> = null;
    let promotionMissing: MissingTarget | null = null;
    if (!isFinal && students.some((student) => requestedFor(student) === 'promote')) {
      const targetGradeLevel = Number(cls.gradeLevel) + 1;
      promotionTarget = await findPersistentTargetClass({ schoolId, gradeLevel: targetGradeLevel, section: cls.section || undefined });
      if (!promotionTarget) {
        promotionMissing = describeMissingTarget(cls, targetGradeLevel);
        missingTargets.push({ ...promotionMissing, sourceClassId: cls._id as mongoose.Types.ObjectId, sourceTitle: cls.title });
      }
    }

    await runWithConcurrency(students, PROMOTION_CONCURRENCY, async (student) => {
      const requested = requestedFor(student);
      if (requested === 'graduate') {
        await Student.updateOne({ _id: student._id, status: 'active' }, { $set: { status: 'graduated' } });
        await completeStudentEnrollmentHistory(student._id, 'graduated');
        studentsGraduated += 1;
        promotedIntoYear.add(String(cls._id));
      } else if (requested === 'repeat') {
        // Same persistent class, new academic year — no class change, just a fresh history entry.
        await reassignStudentClassCourses(student._id, cls._id, cls._id, targetAcademicYear);
        studentsRepeated += 1;
        promotedIntoYear.add(String(cls._id));
      } else if (!promotionTarget) {
        skippedStudents.push({ studentId: String(student._id), reason: promotionMissing!.message });
      } else {
        await reassignStudentClassCourses(student._id, cls._id, promotionTarget._id, targetAcademicYear);
        studentsPromoted += 1;
        promotedIntoYear.add(String(cls._id));
        promotedIntoYear.add(String(promotionTarget._id));
      }
    });
  }

  if (promotedIntoYear.size) {
    await ClassModel.updateMany({ _id: { $in: [...promotedIntoYear] } }, { $set: { academicYear: targetAcademicYear } });
  }

  const alreadyHandledNote = alreadyHandled
    ? ` ${alreadyHandled} student(s) were already moved for ${targetAcademicYear} by an earlier run and were left untouched.`
    : '';
  const message = skippedStudents.length
    ? `Promotion complete: ${studentsPromoted} promoted, ${studentsRepeated} repeating, ${studentsGraduated} graduated. ${skippedStudents.length} student(s) skipped — create the missing target class(es) in Manage Classes, then promote them.${alreadyHandledNote}`
    : `Promotion complete: ${studentsPromoted} promoted, ${studentsRepeated} repeating, ${studentsGraduated} graduated.${alreadyHandledNote}`;

  return ApiResponse.success(res, {
    sourceAcademicYear: previousAcademicYear(targetAcademicYear) || '', targetAcademicYear,
    studentsPromoted, studentsRepeated, studentsGraduated, missingTargets, skippedStudents, alreadyHandled,
  }, message);
};
