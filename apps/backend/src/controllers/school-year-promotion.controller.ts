import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassModel from '../models/class.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';
import { completeStudentEnrollmentHistory, reassignStudentClassCourses } from '../services/enrollment.service';
import { findPersistentTargetClass, describeMissingTarget, classifyClasses, MissingTarget } from '../services/class-promotion.service';

/**
 * Bulk year-end promotion. Classes are persistent (Grade 1 A, Grade 2 A, ...)
 * — the same Class and its Courses/Schedule are reused every year, so this
 * never creates or clones a Class or Course, and never marks a source class
 * "completed". It simply moves each currently-active student in a class to
 * the class one grade up (or graduates them, for the final grade); the move
 * is recorded in the student's enrollmentHistory.
 *
 * A missing target class is reported, not auto-created — that group is
 * skipped and the admin creates the class in Manage Classes before
 * re-running. Re-running promotion is naturally safe: a student who already
 * moved is no longer found in the source class, so nothing is repeated.
 */

function academicYearStart(value: string): number | null {
  const match = value.trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return end === start + 1 ? start : null;
}

function suggestedAcademicYear(years: string[]): string {
  const starts = years.map(academicYearStart).filter((value): value is number => value !== null);
  const currentYear = new Date().getFullYear();
  const start = starts.length ? Math.max(...starts) + 1 : currentYear;
  return `${start}-${start + 1}`;
}

/** Display-only label ("2027-2028" -> "2026-2027") — classes no longer carry a source year themselves. */
function previousAcademicYear(target: string): string {
  const start = academicYearStart(target);
  return start === null ? '' : `${start - 1}-${start}`;
}

async function getScopedSchoolId(req: Request): Promise<string> {
  const requested = req.method === 'GET' ? req.query.schoolId : req.body?.schoolId;
  const resolved = resolveOrgIdForCreate(req, requested as string | undefined);
  if (!resolved) throw new BadRequestError('An organization must be selected');
  return String(resolved);
}

async function assertClassInOrg(req: Request, classId: mongoose.Types.ObjectId, schoolId: string) {
  const cls = await ClassModel.findById(classId);
  if (!cls) throw new NotFoundError('Class');
  if (String(cls.school) !== schoolId) throw new BadRequestError('Class does not belong to the selected organization');
  assertOwnsOrg(req, cls, 'school');
  return cls;
}

export const getPromotionPreview = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const activeYears = await ClassModel.find({ school: schoolId, status: 'active' }).select('academicYear').lean();
  const requestedTarget = String(req.query.targetAcademicYear || '').trim();
  const targetAcademicYear = requestedTarget || suggestedAcademicYear(activeYears.map((item) => item.academicYear || '').filter(Boolean));

  const activeClasses = await ClassModel.find({ school: schoolId, status: 'active' }).sort({ gradeLevel: 1, title: 1, section: 1 });
  const gradedClasses = activeClasses.filter((item) => item.gradeLevel !== null && item.gradeLevel !== undefined);
  const missingGradeLevel = activeClasses
    .filter((item) => item.gradeLevel === null || item.gradeLevel === undefined)
    .map((item) => ({ classId: item._id, title: item.title, section: item.section }));

  const { isFinalClass } = classifyClasses(gradedClasses);
  const groups: Array<Record<string, unknown>> = [];

  for (const cls of gradedClasses) {
    const studentCount = await Student.countDocuments({ class: cls._id, status: 'active' });
    if (!studentCount) continue;

    if (isFinalClass(cls)) {
      groups.push({ classId: cls._id, title: cls.title, section: cls.section, gradeLevel: cls.gradeLevel, studentCount, action: 'graduate' });
      continue;
    }

    const targetGradeLevel = Number(cls.gradeLevel) + 1;
    const targetClass = await findPersistentTargetClass({
      schoolId, gradeLevel: targetGradeLevel,
      section: cls.section || undefined,
    });

    if (!targetClass) {
      const missing = describeMissingTarget(cls, targetGradeLevel);
      groups.push({
        classId: cls._id, title: cls.title, section: cls.section, gradeLevel: cls.gradeLevel, studentCount,
        action: 'missing-target', targetGradeLevel, targetTitle: missing.title, reason: missing.message,
      });
      continue;
    }

    groups.push({
      classId: cls._id, title: cls.title, section: cls.section, gradeLevel: cls.gradeLevel, studentCount,
      action: 'promote', targetClassId: targetClass._id, targetTitle: targetClass.title, targetGradeLevel,
    });
  }

  return ApiResponse.success(res, {
    sourceAcademicYear: previousAcademicYear(targetAcademicYear),
    targetAcademicYear,
    suggestedAcademicYear: targetAcademicYear,
    groups,
    missingGradeLevel,
    missingTargetCount: groups.filter((g) => g.action === 'missing-target').length,
  });
};

export const promoteAll = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const targetAcademicYear = String(req.body?.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('Target academic year is required');
  if (academicYearStart(targetAcademicYear) === null) {
    throw new BadRequestError('Academic year must use the format YYYY-YYYY, for example 2027-2028.');
  }

  const activeClasses = await ClassModel.find({
    school: schoolId, status: 'active', gradeLevel: { $ne: null },
  }).sort({ gradeLevel: 1, title: 1, section: 1 });

  const { isFinalClass } = classifyClasses(activeClasses);

  // Snapshot every active student's current class BEFORE any moves happen.
  // Classes are processed in gradeLevel order, and a target class is often
  // also a source class further down the loop — without this snapshot, a
  // Grade 9 student moved into Grade 10 earlier in this same request would
  // be picked up again when Grade 10's turn comes and swept straight to
  // Grade 11, cascading multiple grades in one promotion run.
  const classIds = activeClasses.map((cls) => cls._id);
  const rawStudents = await Student.find({ class: { $in: classIds }, status: 'active' })
    .select('_id class enrollmentHistory').lean();

  // Guard against a duplicate submission for the SAME target year — a
  // client retry after a timeout (the request can succeed on the server
  // after the client already gave up and reports failure), or a
  // double-click of Confirm. Without this, a student already moved into
  // targetAcademicYear by an earlier, unacknowledged run would be found
  // again in their new (now source) class and swept one grade further —
  // Grade 2 -> Grade 3 the first time, then straight to Grade 4 the second.
  // A student whose current active enrollment history entry already
  // targets this academic year has already been promoted for it and must
  // not be moved again.
  let alreadyPromoted = 0;
  const allStudents = rawStudents.filter((student) => {
    const activeEntry = (student.enrollmentHistory || []).find((entry: any) => entry.status === 'active');
    if (activeEntry?.academicYear === targetAcademicYear) {
      alreadyPromoted += 1;
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

  const results: Record<string, unknown>[] = [];
  const missingTargets: (MissingTarget & { sourceClassId: mongoose.Types.ObjectId; sourceTitle: string })[] = [];
  let studentsMoved = 0;
  let graduated = 0;
  let promotedGroups = 0;

  for (const cls of activeClasses) {
    const students = byClass.get(String(cls._id)) || [];
    if (!students.length) continue;

    if (isFinalClass(cls)) {
      let modifiedCount = 0;
      for (const student of students) {
        const update = await Student.updateOne({ _id: student._id, status: 'active' }, { $set: { status: 'graduated' } });
        modifiedCount += update.modifiedCount;
        await completeStudentEnrollmentHistory(student._id, 'graduated');
      }
      graduated += modifiedCount;
      results.push({ classId: cls._id, title: cls.title, section: cls.section, action: 'graduated', studentsMoved: modifiedCount });
      continue;
    }

    const targetGradeLevel = Number(cls.gradeLevel) + 1;
    const targetClass = await findPersistentTargetClass({
      schoolId, gradeLevel: targetGradeLevel,
      section: cls.section || undefined,
    });

    if (!targetClass) {
      const missing = describeMissingTarget(cls, targetGradeLevel);
      missingTargets.push({ ...missing, sourceClassId: cls._id as mongoose.Types.ObjectId, sourceTitle: cls.title });
      results.push({ classId: cls._id, title: cls.title, section: cls.section, action: 'skipped-missing-target', message: missing.message });
      continue;
    }

    for (const student of students) {
      await reassignStudentClassCourses(student._id, cls._id, targetClass._id, targetAcademicYear);
    }

    promotedGroups += 1;
    studentsMoved += students.length;
    results.push({
      classId: cls._id, title: cls.title, section: cls.section, action: 'promoted',
      targetClassId: targetClass._id, targetTitle: targetClass.title, studentsMoved: students.length,
    });
  }

  const alreadyPromotedNote = alreadyPromoted
    ? ` ${alreadyPromoted} student(s) were already promoted to ${targetAcademicYear} by an earlier run and were left untouched.`
    : '';
  const message = missingTargets.length
    ? `Promotion complete: moved ${studentsMoved} student(s), graduated ${graduated}. ${missingTargets.length} class(es) skipped — create the missing target class(es) in Manage Classes, then promote again.${alreadyPromotedNote}`
    : `Promotion complete: moved ${studentsMoved} student(s), graduated ${graduated}.${alreadyPromotedNote}`;

  return ApiResponse.success(res, {
    sourceAcademicYear: previousAcademicYear(targetAcademicYear),
    targetAcademicYear, results, promoted: promotedGroups, graduated, studentsMoved, missingTargets, alreadyPromoted,
  }, message);
};

export const validatePromotionTarget = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await getScopedSchoolId(req);
  const classId = String(req.query.classId || '').trim();
  if (!classId || !mongoose.isValidObjectId(classId)) throw new BadRequestError('A valid classId is required');

  const source = await assertClassInOrg(req, new mongoose.Types.ObjectId(classId), schoolId);
  if (source.gradeLevel === null || source.gradeLevel === undefined) {
    throw new BadRequestError('This class has no Grade Level set and cannot be promoted.');
  }

  const targetGradeLevel = Number(source.gradeLevel) + 1;
  const targetClass = await findPersistentTargetClass({
    schoolId, gradeLevel: targetGradeLevel,
    section: source.section || undefined,
  });

  if (!targetClass) {
    const missing = describeMissingTarget(source, targetGradeLevel);
    return ApiResponse.success(res, {
      sourceClassId: source._id, targetClassId: null, targetClassTitle: missing.title,
      ready: false, reason: missing.message,
    });
  }

  return ApiResponse.success(res, {
    sourceClassId: source._id, targetClassId: targetClass._id, targetClassTitle: targetClass.title, ready: true,
  });
};
