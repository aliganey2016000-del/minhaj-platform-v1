import mongoose from 'mongoose';
import ClassModel from '../models/class.model';
import Course from '../models/course.model';
import Student from '../models/student.model';

export interface WholeSchoolUndoResult {
  movedBack: number;
  unGraduated: number;
  skipped: number;
  totalReverted: number;
  repairedLegacyHistory: number;
}

const BULK_WRITE_CHUNK = 250;

function idOf(value: any): string {
  return String(value?._id || value || '');
}

function uniqueObjectIds(values: Iterable<string>): mongoose.Types.ObjectId[] {
  const seen = new Set<string>();
  const result: mongoose.Types.ObjectId[] = [];
  for (const value of values) {
    const key = String(value || '');
    if (!mongoose.isValidObjectId(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(new mongoose.Types.ObjectId(key));
  }
  return result;
}

function departmentName(cls: any): string | undefined {
  const department = cls?.department;
  if (!department) return undefined;
  if (typeof department === 'string') return department;
  return String(department?.name || '').trim() || undefined;
}

function placementFromClass(cls: any) {
  return {
    grade: cls?.gradeLevel !== null && cls?.gradeLevel !== undefined
      ? String(cls.gradeLevel)
      : (String(cls?.title || '').trim() || undefined),
    department: departmentName(cls),
    shiftMode: cls?.shiftMode || undefined,
  };
}

async function recalcCourseEnrollmentCounts(courseIds: Set<string>): Promise<void> {
  const ids = uniqueObjectIds(courseIds);
  if (!ids.length) return;

  const counts = await Student.aggregate([
    { $match: { status: 'active', enrolledCourses: { $in: ids } } },
    { $unwind: '$enrolledCourses' },
    { $match: { enrolledCourses: { $in: ids } } },
    { $group: { _id: '$enrolledCourses', count: { $sum: 1 } } },
  ]);
  const countByCourse = new Map(counts.map((row: any) => [String(row._id), Number(row.count || 0)]));

  await Course.bulkWrite(ids.map((courseId) => ({
    updateOne: {
      filter: { _id: courseId },
      update: { $set: { enrolledStudents: countByCourse.get(String(courseId)) || 0 } },
    },
  })), { ordered: false });
}

async function runBulkStudentWrites(operations: any[]): Promise<void> {
  for (let index = 0; index < operations.length; index += BULK_WRITE_CHUNK) {
    await Student.bulkWrite(operations.slice(index, index + BULK_WRITE_CHUNK), { ordered: false });
  }
}

/**
 * Reverts a whole-school promotion in bulk.
 *
 * The active-student candidate condition deliberately matches the preview:
 * the student must be active in the target year AND have a prior history
 * entry. A student added/imported directly into the target year has only the
 * genesis history entry and must never be fabricated into a lower grade by
 * Undo Promotion.
 *
 * Unlike the old per-student rollback, this loads candidates/classes once,
 * updates students with bulkWrite, and recalculates each affected course only
 * once. This keeps a genuine large promotion rollback below proxy timeouts.
 */
export async function undoWholeSchoolPromotion(
  schoolId: string,
  targetAcademicYear: string,
  sourceAcademicYear: string,
): Promise<WholeSchoolUndoResult> {
  const students: any[] = await Student.find({
    school: schoolId,
    $or: [
      {
        status: 'active',
        enrollmentHistory: { $elemMatch: { status: 'active', academicYear: targetAcademicYear } },
        'enrollmentHistory.1': { $exists: true },
      },
      {
        status: 'graduated',
        enrollmentHistory: { $elemMatch: { status: 'graduated', academicYear: sourceAcademicYear } },
      },
    ],
  })
    .setOptions({ skipCourseNormalization: true })
    .select('_id class school status grade department shiftMode enrolledCourses enrollmentHistory')
    .lean();

  if (!students.length) {
    return { movedBack: 0, unGraduated: 0, skipped: 0, totalReverted: 0, repairedLegacyHistory: 0 };
  }

  const classes: any[] = await ClassModel.find({ school: schoolId })
    .populate('department', 'name')
    .lean();
  const classById = new Map(classes.map((cls: any) => [String(cls._id), cls]));

  const operations: any[] = [];
  const affectedCourseIds = new Set<string>();
  const touchedClassIds = new Set<string>();
  let movedBack = 0;
  let unGraduated = 0;
  let skipped = 0;

  for (const student of students) {
    const history: any[] = Array.isArray(student.enrollmentHistory)
      ? student.enrollmentHistory.map((entry: any) => ({ ...entry }))
      : [];
    const last: any = history[history.length - 1];

    if (student.status === 'active' && last?.status === 'active' && last?.academicYear === targetAcademicYear) {
      const previous: any = history[history.length - 2];
      const previousClass = previous ? classById.get(idOf(previous.class)) : null;
      if (!previous || !previousClass) {
        // Defensive only. The query already requires prior history; if the
        // prior class was deleted, leaving the student unchanged is safer
        // than inventing a destination.
        skipped += 1;
        continue;
      }

      const targetClass = classById.get(idOf(last.class || student.class));
      history.pop();
      previous.status = 'active';
      delete previous.endedAt;

      if (targetClass?._id) touchedClassIds.add(String(targetClass._id));
      touchedClassIds.add(String(previousClass._id));

      const currentClassGranted = new Set<string>(
        (last.courses || []).map((id: any) => idOf(id)).filter((id: string) => Boolean(id)),
      );
      const retainedIndividual: string[] = (student.enrolledCourses || [])
        .map((id: any) => idOf(id))
        .filter((id: string) => id && !currentClassGranted.has(id));
      const restoredClassCourses: string[] = (previous.courses || [])
        .map((id: any) => idOf(id))
        .filter((id: string) => Boolean(id));
      const nextEnrolledCourses = uniqueObjectIds([...retainedIndividual, ...restoredClassCourses]);
      for (const id of currentClassGranted) affectedCourseIds.add(id);
      for (const id of restoredClassCourses) affectedCourseIds.add(id);

      const placement = placementFromClass(previousClass);
      operations.push({
        updateOne: {
          filter: { _id: student._id, status: 'active' },
          update: {
            $set: {
              class: previousClass._id,
              grade: placement.grade ?? null,
              department: placement.department ?? null,
              shiftMode: placement.shiftMode ?? null,
              enrolledCourses: nextEnrolledCourses,
              enrollmentHistory: history,
            },
          },
        },
      });
      movedBack += 1;
      continue;
    }

    if (student.status === 'graduated' && last?.status === 'graduated' && last?.academicYear === sourceAcademicYear) {
      last.status = 'active';
      delete last.endedAt;
      const classId = idOf(last.class || student.class);
      if (classId) touchedClassIds.add(classId);
      const courses: string[] = (last.courses || [])
        .map((courseId: any) => idOf(courseId))
        .filter((id: string) => Boolean(id));
      for (const id of courses) affectedCourseIds.add(id);

      operations.push({
        updateOne: {
          filter: { _id: student._id, status: 'graduated' },
          update: { $set: { status: 'active', enrollmentHistory: history } },
        },
      });
      unGraduated += 1;
      continue;
    }

    skipped += 1;
  }

  await runBulkStudentWrites(operations);

  // Rewind display metadata only on touched classes that no longer contain an
  // active target-year student. This matters when a class also contains a
  // student imported directly into the target year: Undo must leave that
  // student's current class/year intact rather than making the shared class
  // metadata contradict their real active enrollment.
  const touchedIds = uniqueObjectIds(touchedClassIds);
  if (touchedIds.length) {
    const stillTargetClassIds = await Student.distinct('class', {
      school: schoolId,
      status: 'active',
      class: { $in: touchedIds },
      enrollmentHistory: { $elemMatch: { status: 'active', academicYear: targetAcademicYear } },
    });
    const stillTarget = new Set(stillTargetClassIds.map((id: any) => String(id)));
    const rewindIds = touchedIds.filter((id) => !stillTarget.has(String(id)));
    if (rewindIds.length) {
      await ClassModel.updateMany(
        { _id: { $in: rewindIds }, school: schoolId },
        { $set: { academicYear: sourceAcademicYear } },
      );
    }
  }

  await recalcCourseEnrollmentCounts(affectedCourseIds);

  return {
    movedBack,
    unGraduated,
    skipped,
    totalReverted: movedBack + unGraduated,
    repairedLegacyHistory: 0,
  };
}
