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
  const newClass = await ClassModel.findById(newClassId).select('_id title academicYear');
  if (!newClass || !newClass.academicYear) return;

  const history = Array.isArray(student.enrollmentHistory) ? student.enrollmentHistory : [];
  const now = new Date();
  const sameCurrent = history.find(
    (entry: any) => String(entry.class) === String(newClass._id) && entry.academicYear === newClass.academicYear && entry.status === 'active',
  );

  if (sameCurrent) {
    sameCurrent.courses = newCourseIds.map((id) => new mongoose.Types.ObjectId(id));
    return;
  }

  for (const entry of history) {
    if (entry.status === 'active' && String(entry.class) !== String(newClass._id)) {
      entry.status = 'completed';
      entry.endedAt = now;
    }
  }

  history.push({
    academicYear: newClass.academicYear,
    class: newClass._id,
    grade: newClass.title,
    courses: newCourseIds.map((id) => new mongoose.Types.ObjectId(id)),
    status: 'active',
    startedAt: now,
  });
  student.enrollmentHistory = history;
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

  // `class` is the source of truth for the student's current placement.
  // Keep it loaded here because this service is also used by promotion.
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
