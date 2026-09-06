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
): Promise<void> {
  const newClass: any = await ClassModel.findById(newClassId).select('_id title academicYear studyYear semesterNumber semesterInYear');
  if (!newClass || !newClass.academicYear) return;

  const history = Array.isArray(student.enrollmentHistory) ? student.enrollmentHistory : [];
  const sameCurrent = history.find(
    (entry: any) => String(entry.class) === String(newClass._id)
      && entry.academicYear === newClass.academicYear
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
    academicYear: newClass.academicYear,
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
 */
export async function refreshStudentCoursesForCurrentClass(
  studentId: mongoose.Types.ObjectId | string,
): Promise<void> {
  const student = await Student.findById(studentId).select('class enrolledCourses enrollmentHistory');
  if (!student?.class) return;

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

/** Closes the student's current academic enrollment without deleting it. */
export async function completeStudentEnrollmentHistory(
  studentId: mongoose.Types.ObjectId | string,
  status: 'completed' | 'graduated' = 'completed',
): Promise<void> {
  const student = await Student.findById(studentId).select('enrollmentHistory');
  if (!student) return;
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
}

export async function reassignStudentClassCourses(
  studentId: mongoose.Types.ObjectId | string,
  oldClassId: mongoose.Types.ObjectId | string | null | undefined,
  newClassId: mongoose.Types.ObjectId | string | null | undefined,
): Promise<void> {
  if (String(oldClassId || '') === String(newClassId || '')) return;

  const student = await Student.findById(studentId).select('class enrolledCourses enrollmentHistory');
  if (!student || !newClassId) return;

  const [oldCourses, newCourses] = await Promise.all([
    oldClassId ? Course.find({ class: oldClassId }).select('_id') : Promise.resolve([]),
    Course.find({ class: newClassId, status: 'published' }).select('_id'),
  ]);

  const oldCourseIds = new Set(oldCourses.map((c) => c._id.toString()));
  const keptIds = (student.enrolledCourses || []).map((id) => id.toString()).filter((id) => !oldCourseIds.has(id));
  const newCourseIds = newCourses.map((c) => c._id.toString());
  const nextIds = Array.from(new Set([...keptIds, ...newCourseIds]));

  await syncEnrollmentHistory(student, newClassId, newCourseIds);
  student.class = new mongoose.Types.ObjectId(String(newClassId));
  student.enrolledCourses = nextIds.map((id) => new mongoose.Types.ObjectId(id));
  await student.save();

  await recalcEnrolledStudents(new Set([...oldCourseIds, ...newCourseIds]));
}

/** New student (no prior class) — assigns existing published courses and opens the first history entry. */
export async function syncStudentCourseEnrollment(
  studentId: mongoose.Types.ObjectId | string,
  classId: mongoose.Types.ObjectId | string | null | undefined,
): Promise<void> {
  await reassignStudentClassCourses(studentId, null, classId);
}
