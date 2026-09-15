/**
 * Enrollment sync — the single place that changes a student's current class
 * and course links. It also records the academic enrollment lifecycle so
 * promotion never destroys historical class/course membership.
 */

import mongoose from 'mongoose';
import Student from '../models/student.model';
import Course from '../models/course.model';
import ClassModel from '../models/class.model';

async function recalcEnrolledStudents(courseIds: Iterable<string>): Promise<void> {
  for (const courseId of courseIds) {
    const enrolledStudents = await Student.countDocuments({ enrolledCourses: courseId, status: 'active' });
    await Course.updateOne({ _id: courseId }, { $set: { enrolledStudents } });
  }
}

async function syncEnrollmentHistory(
  student: any,
  newClassId: mongoose.Types.ObjectId | string,
  newCourseIds: string[],
  academicYearOverride?: string,
): Promise<void> {
  const newClass: any = await ClassModel.findById(newClassId)
    .select('_id title gradeLevel academicYear studyYear semesterNumber semesterInYear department shiftMode')
    .populate('department', 'name');
  // Classes are persistent (reused every year), so their own `academicYear`
  // field is not a reliable "which year is this enrollment" source once a
  // class has lived through more than one promotion. A caller that knows the
  // year it's acting for (promotion) passes it explicitly; every other
  // caller (ordinary class assignment) keeps reading it off the class as
  // before, which is fine for a class that has only ever had one cohort.
  const academicYear = academicYearOverride || newClass?.academicYear;
  if (!newClass || !academicYear) return;

  // Keep all denormalized placement fields synchronized with Class. Manage
  // Students and reporting read these directly, so changing only `class`
  // during promotion otherwise leaves the student showing the old shift or
  // department until somebody manually edits them later.
  if (newClass.gradeLevel !== null && newClass.gradeLevel !== undefined) {
    student.grade = String(newClass.gradeLevel);
  } else {
    student.grade = String(newClass.title || '').trim() || undefined;
  }
  const department = newClass.department;
  student.department = typeof department === 'string' ? department : department?.name || undefined;
  student.shiftMode = newClass.shiftMode || undefined;

  const history = Array.isArray(student.enrollmentHistory) ? student.enrollmentHistory : [];
  const sameCurrent = history.find(
    (entry: any) => String(entry.class) === String(newClass._id)
      && entry.academicYear === academicYear
      && entry.semesterNumber === (newClass.semesterNumber ?? null)
      && entry.studyYear === (newClass.studyYear ?? null)
      && entry.status === 'active',
  );

  if (sameCurrent) {
    sameCurrent.courses = newCourseIds.map((id) => new mongoose.Types.ObjectId(id));
    sameCurrent.semesterInYear = newClass.semesterInYear ?? null;
    return;
  }

  const now = new Date();
  for (const entry of history) {
    if (entry.status === 'active') {
      entry.status = 'completed';
      entry.endedAt = now;
    }
  }

  history.push({
    academicYear,
    class: newClass._id,
    grade: newClass.title,
    studyYear: newClass.studyYear ?? undefined,
    semesterNumber: newClass.semesterNumber ?? undefined,
    semesterInYear: newClass.semesterInYear ?? undefined,
    courses: newCourseIds.map((id) => new mongoose.Types.ObjectId(id)),
    status: 'active',
    startedAt: now,
  });
  student.enrollmentHistory = history;
}

/**
 * Refreshes a student's course links after the class itself has progressed
 * in place (for example S1 -> S2). Historical course membership is retained
 * in enrollmentHistory while the current enrolledCourses set becomes the
 * published courses attached to the progressed class.
 *
 * Enrollment synchronization is intentionally active-student-only. This
 * function is also callable outside semester advancement, so the status
 * guard belongs here rather than only in the caller.
 */
export async function refreshStudentCoursesForCurrentClass(
  studentId: mongoose.Types.ObjectId | string,
): Promise<void> {
  const student = await Student.findById(studentId)
    .setOptions({ skipCourseNormalization: true })
    .select('class status enrolledCourses enrollmentHistory grade department shiftMode');
  if (!student?.class || student.status !== 'active') return;

  const [oldCourses, newCourses] = await Promise.all([
    Course.find({ class: student.class }).select('_id'),
    Course.find({ class: student.class, status: 'published' }).select('_id'),
  ]);

  const previousIds = (student.enrolledCourses || []).map((id) => id.toString());
  const currentClassCourseIds = new Set(oldCourses.map((course) => course._id.toString()));
  const retainedIds = previousIds.filter((id) => !currentClassCourseIds.has(id));
  const newCourseIds = newCourses.map((course) => course._id.toString());
  const nextIds = Array.from(new Set([...retainedIds, ...newCourseIds]));

  await syncEnrollmentHistory(student, student.class, newCourseIds);
  student.enrolledCourses = nextIds.map((id) => new mongoose.Types.ObjectId(id));
  await student.save();

  await recalcEnrolledStudents(new Set([...currentClassCourseIds, ...newCourseIds]));
}

/**
 * Closes the student's current academic enrollment without deleting it.
 * Course.enrolledStudents is a cached count of ACTIVE students, so closing a
 * student's enrollment after graduation must refresh those course counters.
 */
export async function completeStudentEnrollmentHistory(
  studentId: mongoose.Types.ObjectId | string,
  status: 'completed' | 'graduated' = 'completed',
): Promise<void> {
  const student = await Student.findById(studentId)
    .setOptions({ skipCourseNormalization: true })
    .select('enrollmentHistory enrolledCourses');
  if (!student) return;

  const affectedCourseIds = new Set((student.enrolledCourses || []).map((id) => id.toString()));
  const now = new Date();
  let changed = false;
  for (const entry of student.enrollmentHistory || []) {
    if (entry.status === 'active') {
      entry.status = status;
      entry.endedAt = now;
      changed = true;
    }
  }
  if (changed) await student.save();
  if (affectedCourseIds.size > 0) await recalcEnrolledStudents(affectedCourseIds);
}

export async function reassignStudentClassCourses(
  studentId: mongoose.Types.ObjectId | string,
  oldClassId: mongoose.Types.ObjectId | string | null | undefined,
  newClassId: mongoose.Types.ObjectId | string | null | undefined,
  academicYearOverride?: string,
): Promise<void> {
  const sameClass = String(oldClassId || '') === String(newClassId || '');
  // A caller passing academicYearOverride means "record a new enrollment
  // period" (promotion's repeat case: same persistent class, new year) —
  // that must still open a fresh history entry even though the class
  // pointer itself isn't changing. Every other caller never passes it, so
  // "nothing to do when the class is unchanged" still holds for them.
  if (sameClass && !academicYearOverride) return;

  const student = await Student.findById(studentId)
    .setOptions({ skipCourseNormalization: true })
    .select('class status enrolledCourses enrollmentHistory grade department shiftMode');
  if (!student || student.status !== 'active') return;

  const oldCourses = oldClassId ? await Course.find({ class: oldClassId }).select('_id') : [];
  const oldCourseIds = new Set(oldCourses.map((c) => c._id.toString()));

  // A deliberate unassignment should not leave the student enrolled in all
  // courses from the old class. Preserve individually assigned courses,
  // close the active history entry, and clear denormalized placement fields.
  if (!newClassId) {
    const keptIds = (student.enrolledCourses || [])
      .map((id) => id.toString())
      .filter((id) => !oldCourseIds.has(id));
    const now = new Date();
    for (const entry of student.enrollmentHistory || []) {
      if (entry.status === 'active') {
        entry.status = 'completed';
        entry.endedAt = now;
      }
    }
    student.class = undefined;
    student.grade = undefined;
    student.department = undefined;
    student.shiftMode = undefined;
    student.enrolledCourses = keptIds.map((id) => new mongoose.Types.ObjectId(id));
    await student.save();
    await recalcEnrolledStudents(oldCourseIds);
    return;
  }

  const newCourses = await Course.find({ class: newClassId, status: 'published' }).select('_id');
  const keptIds = (student.enrolledCourses || []).map((id) => id.toString()).filter((id) => !oldCourseIds.has(id));
  const newCourseIds = newCourses.map((c) => c._id.toString());
  const nextIds = Array.from(new Set([...keptIds, ...newCourseIds]));

  // Classes are persistent, so the target's schedule and courses already
  // exist — nothing to copy or create here, promotion or otherwise.
  await syncEnrollmentHistory(student, newClassId, newCourseIds, academicYearOverride);
  student.class = new mongoose.Types.ObjectId(String(newClassId));
  student.enrolledCourses = nextIds.map((id) => new mongoose.Types.ObjectId(id));
  await student.save();

  await recalcEnrolledStudents(new Set([...oldCourseIds, ...newCourseIds]));
}

/**
 * Reverts one student's move into `targetAcademicYear` (or the graduation
 * that closed out `sourceAcademicYear`, the year right before it), putting
 * them back exactly where their own enrollment history says they were
 * before that promotion touched them. Used to undo an entire year-end
 * promotion run across a school — not part of the ordinary promotion flow.
 *
 * Returns what changed, or null if this student was never touched by that
 * promotion (nothing to revert) or has no prior entry to restore to.
 */
export async function revertStudentPromotion(
  studentId: mongoose.Types.ObjectId | string,
  targetAcademicYear: string,
  sourceAcademicYear: string,
): Promise<'moved-back' | 'un-graduated' | null> {
  const student = await Student.findById(studentId).setOptions({ skipCourseNormalization: true });
  if (!student) return null;
  const history = student.enrollmentHistory as any[];
  if (!history.length) return null;
  const last: any = history[history.length - 1];

  if (student.status === 'active' && last.status === 'active' && last.academicYear === targetAcademicYear) {
    const previous: any = history[history.length - 2];
    if (!previous) return null;

    const affectedCourseIds = new Set<string>([
      ...(last.courses || []).map((id: any) => id.toString()),
      ...(previous.courses || []).map((id: any) => id.toString()),
    ]);

    const previousClass: any = await ClassModel.findById(previous.class).populate('department', 'name');
    history.pop();
    previous.status = 'active';
    previous.endedAt = undefined;

    student.class = previous.class;
    if (previousClass) {
      student.grade = previousClass.gradeLevel !== null && previousClass.gradeLevel !== undefined
        ? String(previousClass.gradeLevel)
        : (String(previousClass.title || '').trim() || undefined);
      const department = previousClass.department;
      student.department = typeof department === 'string' ? department : department?.name || undefined;
      student.shiftMode = previousClass.shiftMode || undefined;
    }
    student.enrolledCourses = (previous.courses || []).map((id: any) => new mongoose.Types.ObjectId(String(id)));
    student.markModified('enrollmentHistory');
    await student.save();
    await recalcEnrolledStudents(affectedCourseIds);
    return 'moved-back';
  }

  if (student.status === 'graduated' && last.status === 'graduated' && last.academicYear === sourceAcademicYear) {
    const affectedCourseIds = new Set<string>((last.courses || []).map((id: any) => id.toString()));
    last.status = 'active';
    last.endedAt = undefined;
    student.status = 'active';
    student.markModified('enrollmentHistory');
    await student.save();
    await recalcEnrolledStudents(affectedCourseIds);
    return 'un-graduated';
  }

  return null;
}

/** New student (no prior class) — assigns existing published courses and opens the first history entry. */
export async function syncStudentCourseEnrollment(
  studentId: mongoose.Types.ObjectId | string,
  classId: mongoose.Types.ObjectId | string | null | undefined,
): Promise<void> {
  await reassignStudentClassCourses(studentId, null, classId);
}
