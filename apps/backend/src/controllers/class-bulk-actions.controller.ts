import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassModel from '../models/class.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg } from '../utils/tenant-scope';
import { refreshStudentCoursesForCurrentClass, reassignStudentClassCourses } from '../services/enrollment.service';

const PROMOTION_WINDOW_MS = 24 * 60 * 60 * 1000;

function parseClassIds(raw: unknown): string[] {
  const ids = Array.isArray(raw) ? [...new Set(raw.map(String).filter(Boolean))] : [];
  if (!ids.length) throw new BadRequestError('Select at least one class.');
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new BadRequestError('One or more selected class ids are invalid.');
  return ids;
}

function academicYearParts(value: string): { start: number; end: number } | null {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end !== start + 1) return null;
  return { start, end };
}

function nextAcademicYear(value: string): string | null {
  const parts = academicYearParts(value);
  return parts ? `${parts.end}-${parts.end + 1}` : null;
}

function previousAcademicYear(value: string): string | null {
  const parts = academicYearParts(value);
  return parts ? `${parts.start - 1}-${parts.start}` : null;
}

function sameId(a: unknown, b: unknown) {
  return String(a || '') === String(b || '');
}

function withinPromotionWindow(value: unknown, promotedAt: Date) {
  if (!value) return false;
  const time = new Date(value as any).getTime();
  return Number.isFinite(time) && Math.abs(promotedAt.getTime() - time) <= PROMOTION_WINDOW_MS;
}

export const bulkUpdateStatus = async (req: Request, res: Response): Promise<Response> => {
  const ids = parseClassIds(req.body?.ids);
  const status = String(req.body?.status || '');
  if (!['active', 'inactive', 'completed'].includes(status)) {
    throw new BadRequestError('Valid status required: active, inactive, or completed.');
  }

  const classes = await ClassModel.find({ _id: { $in: ids } });
  if (classes.length !== ids.length) throw new NotFoundError('Class');
  for (const cls of classes) assertOwnsOrg(req, cls, 'school');

  if (status === 'active') {
    const invalid = classes.filter((cls) => cls.status !== 'completed');
    if (invalid.length) throw new BadRequestError('Make Active can only be used on completed classes.');
  }

  // Make Active is deliberately status-only. It must never change the
  // academic year, student placement, or promotion markers.
  const result = await ClassModel.updateMany({ _id: { $in: ids } }, { $set: { status } });
  return ApiResponse.success(res, { updated: result.modifiedCount, status }, `${result.modifiedCount} class(es) updated to ${status}.`);
};

export const rollbackPromotion = async (req: Request, res: Response): Promise<Response> => {
  const ids = parseClassIds(req.body?.classIds);
  const classes = await ClassModel.find({ _id: { $in: ids } });
  if (classes.length !== ids.length) throw new NotFoundError('Class');
  for (const cls of classes) assertOwnsOrg(req, cls, 'school');

  const schoolIds = new Set(classes.map((cls) => String(cls.school)));
  if (schoolIds.size !== 1) throw new BadRequestError('Undo Promotion can only process classes from one organization at a time.');

  const originalYears = new Map<string, string>();
  const rollbackYears = new Map<string, string>();
  for (const cls of classes) {
    if (cls.status !== 'completed') throw new BadRequestError(`${cls.title} is not a completed class.`);
    if (!cls.promotedAt) throw new BadRequestError(`${cls.title} was not completed by the promotion workflow. Use Make Active instead.`);
    if (typeof cls.gradeLevel !== 'number') throw new BadRequestError(`${cls.title} has no Grade Level and cannot be safely rolled back.`);
    const originalYear = String(cls.academicYear || '');
    const previousYear = previousAcademicYear(originalYear);
    if (!previousYear || !nextAcademicYear(originalYear)) throw new BadRequestError(`${cls.title} has an invalid academic year and cannot be safely rolled back.`);
    originalYears.set(String(cls._id), originalYear);
    rollbackYears.set(String(cls._id), previousYear);
  }

  const schoolId = classes[0].school;
  const targetIdsBySource = new Map<string, Set<string>>();
  const allTargetIds = new Set<string>();

  // Each source class is evaluated independently. Mixed academic years are
  // valid: a 2028-2029 class looks only at 2029-2030 targets, while a
  // 2030-2031 class looks only at 2031-2032 targets in the same request.
  for (const source of classes) {
    const originalYear = originalYears.get(String(source._id))!;
    const targetAcademicYear = nextAcademicYear(originalYear)!;
    const targetIds = new Set<string>();

    if (source.promotedTo) targetIds.add(String(source.promotedTo));

    const targetQuery: Record<string, unknown> = {
      school: source.school,
      department: source.department,
      academicYear: targetAcademicYear,
      batch: source.batch || '',
      gradeLevel: { $in: [source.gradeLevel, source.gradeLevel! + 1] },
    };
    if (String(source.section || '').trim()) targetQuery.section = String(source.section).trim();

    const candidates = await ClassModel.find(targetQuery).select('_id status promotedAt');
    for (const target of candidates) {
      if (target.status === 'completed' || target.promotedAt) {
        throw new BadRequestError(`Undo Promotion is blocked because a next-year class linked to ${source.title} has already progressed. Roll back the newest academic year first.`);
      }
      targetIds.add(String(target._id));
    }

    targetIdsBySource.set(String(source._id), targetIds);
    targetIds.forEach((id) => allTargetIds.add(id));
  }

  const sourceIds = classes.map((cls) => cls._id);
  const candidateIds = [...sourceIds.map(String), ...allTargetIds];
  const students = await Student.find({
    school: schoolId,
    $or: [
      { class: { $in: candidateIds } },
      { 'enrollmentHistory.class': { $in: candidateIds } },
    ],
  })
    .setOptions({ skipCourseNormalization: true })
    .select('_id class status enrollmentHistory');

  type PlannedMove = { studentId: mongoose.Types.ObjectId; sourceId: mongoose.Types.ObjectId; currentClassId: mongoose.Types.ObjectId; kind: 'move' };
  type PlannedGraduate = { studentId: mongoose.Types.ObjectId; sourceId: mongoose.Types.ObjectId; kind: 'graduate' };
  const plans: Array<PlannedMove | PlannedGraduate> = [];
  const plannedStudentIds = new Set<string>();
  const conflicts = new Set<string>();

  const hasSelectedSourceEvidence = (history: any[]) => classes.some((source) => {
    const promotedAt = new Date(source.promotedAt!);
    return history.some((entry: any) =>
      sameId(entry.class, source._id)
      && entry.status !== 'active'
      && withinPromotionWindow(entry.endedAt, promotedAt),
    );
  });

  for (const source of classes) {
    const sourceId = String(source._id);
    const promotedAt = new Date(source.promotedAt!);
    const targetIds = targetIdsBySource.get(sourceId) || new Set<string>();

    for (const student of students) {
      const studentId = String(student._id);
      if (plannedStudentIds.has(studentId)) continue;
      const history = Array.isArray(student.enrollmentHistory) ? student.enrollmentHistory : [];
      const sourceEntries = history
        .filter((entry: any) => sameId(entry.class, source._id) && entry.status !== 'active' && withinPromotionWindow(entry.endedAt, promotedAt))
        .sort((a: any, b: any) => new Date(b.endedAt || 0).getTime() - new Date(a.endedAt || 0).getTime());
      const sourceEntry: any = sourceEntries[0];

      const targetEntries = history
        .filter((entry: any) => targetIds.has(String(entry.class)) && withinPromotionWindow(entry.startedAt, promotedAt))
        .sort((a: any, b: any) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());

      if (targetEntries.length) {
        const entry: any = targetEntries[0];
        if (!sourceEntry) {
          if (!hasSelectedSourceEvidence(history)) conflicts.add(studentId);
          continue;
        }
        if (student.status !== 'active' || entry.status !== 'active' || !student.class || !sameId(student.class, entry.class)) {
          conflicts.add(studentId);
          continue;
        }
        plans.push({ studentId: student._id, sourceId: source._id as mongoose.Types.ObjectId, currentClassId: student.class as mongoose.Types.ObjectId, kind: 'move' });
        plannedStudentIds.add(studentId);
        continue;
      }

      if (student.status === 'graduated' && student.class && sameId(student.class, source._id)) {
        if (!sourceEntry || sourceEntry.status !== 'graduated') {
          conflicts.add(studentId);
          continue;
        }
        plans.push({ studentId: student._id, sourceId: source._id as mongoose.Types.ObjectId, kind: 'graduate' });
        plannedStudentIds.add(studentId);
      }
    }
  }

  if (conflicts.size) {
    throw new BadRequestError(`Undo Promotion cannot continue for ${conflicts.size} student(s) because their source enrollment history is missing or they have progressed after this promotion. Roll back the newest promotion first, or correct those student records before retrying.`);
  }

  // The requested rollback semantics are a one-year rewind per selected
  // class, not a shared batch year. A mixed-year selection therefore keeps
  // each class independent: 2028-2029 -> 2027-2028, 2030-2031 -> 2029-2030.
  const yearChanges: Array<{ classId: string; from: string; to: string }> = [];
  for (const source of classes) {
    const from = originalYears.get(String(source._id))!;
    const to = rollbackYears.get(String(source._id))!;
    source.status = 'active';
    source.academicYear = to;
    source.promotedAt = undefined;
    source.promotedTo = undefined;
    await source.save();
    yearChanges.push({ classId: String(source._id), from, to });
  }

  let studentsRestored = 0;
  let graduatesRestored = 0;

  for (const plan of plans) {
    if (plan.kind === 'move') {
      await reassignStudentClassCourses(plan.studentId, plan.currentClassId, plan.sourceId);
      studentsRestored += 1;
    } else {
      await Student.updateOne({ _id: plan.studentId, status: 'graduated' }, { $set: { status: 'active' } });
      await refreshStudentCoursesForCurrentClass(plan.studentId);
      graduatesRestored += 1;
    }
  }

  return ApiResponse.success(res, {
    classesRestored: classes.length,
    studentsRestored,
    graduatesRestored,
    yearChanges,
  }, `Promotion undone for ${classes.length} class(es). Each class was moved back one academic year and reactivated.`);
};
