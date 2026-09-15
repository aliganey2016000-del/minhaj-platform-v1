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

function classKey(gradeLevel: number, section?: string | null): string {
  return `${gradeLevel}|${String(section || '').trim().toLowerCase()}`;
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
 * Older students may have been promoted before enrollmentHistory was fully
 * backfilled. In that legacy case the promotion created the target-year entry
 * but there is no preceding source-year entry to pop back to. For those rows
 * we reconstruct the immediately previous persistent class (same section,
 * one grade lower), restore its published courses, and create the missing
 * source-year history entry. This is deliberately limited to the legacy
 * one-entry shape; normal students always restore from their recorded history.
 *
 * The old implementation reverted students one by one and recalculated course
 * counts after every student. Hundreds of students therefore caused thousands
 * of sequential database round-trips and routinely exceeded the reverse proxy
 * timeout. This implementation loads once, uses bulkWrite, and recalculates
 * each affected course only once.
 */
export async function undoWholeSchoolPromotion(
  schoolId: string,
  targetAcademicYear: string,
  sourceAcademicYear: string,
): Promise<WholeSchoolUndoResult> {
  const students: any[] = await Student.find({
    school: schoolId,
    $or: [
      { status: 'active', enrollmentHistory: { $elemMatch: { status: 'active', academicYear: targetAcademicYear } } },
      { status: 'graduated', enrollmentHistory: { $elemMatch: { status: 'graduated', academicYear: sourceAcademicYear } } },
    ],
  })
    .setOptions({ skipCourseNormalization: true })
    .select('_id class school status enrollmentDate grade department shiftMode enrolledCourses enrollmentHistory')
    .lean();

  if (!students.length) {
    // A previous attempt can finish the student rollback but lose its HTTP
    // response. Still repair class display metadata on the retry.
    await ClassModel.updateMany(
      { school: schoolId, status: 'active', gradeLevel: { $ne: null }, academicYear: targetAcademicYear },
      { $set: { academicYear: sourceAcademicYear } },
    );
    return { movedBack: 0, unGraduated: 0, skipped: 0, totalReverted: 0, repairedLegacyHistory: 0 };
  }

  const classes: any[] = await ClassModel.find({ school: schoolId })
    .sort({ createdAt: 1 })
    .populate('department', 'name')
    .lean();
  const classById = new Map(classes.map((cls: any) => [String(cls._id), cls]));
  const activeClassByGradeSection = new Map<string, any>();
  for (const cls of classes) {
    if (cls.status !== 'active' || cls.gradeLevel === null || cls.gradeLevel === undefined) continue;
    const key = classKey(Number(cls.gradeLevel), cls.section);
    if (!activeClassByGradeSection.has(key)) activeClassByGradeSection.set(key, cls);
  }

  const classIds = classes.map((cls: any) => cls._id);
  const publishedCourses: any[] = classIds.length
    ? await Course.find({ class: { $in: classIds }, status: 'published' }).select('_id class').lean()
    : [];
  const courseIdsByClass = new Map<string, mongoose.Types.ObjectId[]>();
  for (const course of publishedCourses) {
    const key = String(course.class);
    const list = courseIdsByClass.get(key) || [];
    list.push(new mongoose.Types.ObjectId(String(course._id)));
    courseIdsByClass.set(key, list);
  }

  const operations: any[] = [];
  const affectedCourseIds = new Set<string>();
  const touchedClassIds = new Set<string>();
  let movedBack = 0;
  let unGraduated = 0;
  let skipped = 0;
  let repairedLegacyHistory = 0;

  for (const student of students) {
    const history: any[] = Array.isArray(student.enrollmentHistory)
      ? student.enrollmentHistory.map((entry: any) => ({ ...entry }))
      : [];
    const last: any = history[history.length - 1];

    if (student.status === 'active' && last?.status === 'active' && last?.academicYear === targetAcademicYear) {
      const targetClass = classById.get(idOf(last.class || student.class));
      let previous: any = history[history.length - 2];
      let previousClass = previous ? classById.get(idOf(previous.class)) : null;

      if (!previous) {
        // Legacy recovery: promotion created the target-year history entry on
        // a student whose old current class was never written to history.
        if (!targetClass || targetClass.gradeLevel === null || targetClass.gradeLevel === undefined || Number(targetClass.gradeLevel) <= 0) {
          skipped += 1;
          continue;
        }
        const sourceClass = activeClassByGradeSection.get(classKey(Number(targetClass.gradeLevel) - 1, targetClass.section));
        if (!sourceClass) {
          skipped += 1;
          continue;
        }
        const sourceCourses = courseIdsByClass.get(String(sourceClass._id)) || [];
        const startedAt = student.enrollmentDate || last.startedAt || new Date();
        previous = {
          academicYear: sourceAcademicYear,
          class: sourceClass._id,
          grade: sourceClass.title,
          studyYear: sourceClass.studyYear ?? undefined,
          semesterNumber: sourceClass.semesterNumber ?? undefined,
          semesterInYear: sourceClass.semesterInYear ?? undefined,
          courses: sourceCourses,
          status: 'active',
          startedAt,
        };
        previousClass = sourceClass;
        history.pop();
        history.push(previous);
        repairedLegacyHistory += 1;
      } else {
        if (!previousClass) {
          skipped += 1;
          continue;
        }
        history.pop();
        previous.status = 'active';
        delete previous.endedAt;
      }

      if (targetClass?._id) touchedClassIds.add(String(targetClass._id));
      if (previousClass?._id) touchedClassIds.add(String(previousClass._id));

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
      const graduatedClassId = idOf(last.class || student.class);
      if (graduatedClassId) touchedClassIds.add(graduatedClassId);
      const graduatedCourses: string[] = (last.courses || [])
        .map((courseId: any) => idOf(courseId))
        .filter((id: string) => Boolean(id));
      for (const id of graduatedCourses) affectedCourseIds.add(id);
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

  // Restore every class actually touched by the rollback, even when an older
  // timeout already left its display year one step ahead of the students.
  // Also include classes still explicitly marked with targetAcademicYear so a
  // retry after a lost HTTP response can finish metadata repair idempotently.
  const touchedIds = uniqueObjectIds(touchedClassIds);
  const classYearFilter: Record<string, unknown> = {
    school: schoolId,
    status: 'active',
    gradeLevel: { $ne: null },
  };
  classYearFilter.$or = touchedIds.length
    ? [{ _id: { $in: touchedIds } }, { academicYear: targetAcademicYear }]
    : [{ academicYear: targetAcademicYear }];
  await ClassModel.updateMany(classYearFilter, { $set: { academicYear: sourceAcademicYear } });

  await recalcCourseEnrollmentCounts(affectedCourseIds);

  return {
    movedBack,
    unGraduated,
    skipped,
    totalReverted: movedBack + unGraduated,
    repairedLegacyHistory,
  };
}
