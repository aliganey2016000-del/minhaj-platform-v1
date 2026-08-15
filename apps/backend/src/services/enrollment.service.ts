/**
 * Enrollment sync — the single place that changes which courses a student
 * is linked to via a class assignment (new student, admin edit moving them
 * to a different class). Mirrors what curriculum-promotion.controller.ts
 * does for bulk promotion (same swap semantics: drop the old class's
 * courses, add the new class's), so a student ends up in the identical
 * state whether they got there via bulk promotion or an individual edit.
 *
 * Never creates or clones a Course/CourseContent — only reads existing ones
 * and links/unlinks the student to them.
 *
 * Course eligibility: 'published' ONLY. Every other access-control
 * checkpoint in this codebase (course.controller.ts's admin enroll at
 * line ~491, self-enroll at ~592, and both course-listing filters) already
 * requires 'published' — a 'draft' course is still being authored and
 * isn't meant to be visible/assignable to students yet. An earlier version
 * of this file (and the promotion controller it was copied from) included
 * 'draft' in the filter; that was an inconsistency, not an intentional
 * design choice — there was no comment or requirement anywhere justifying
 * it, and every other enrollment path in the app disagreed with it.
 */

import mongoose from 'mongoose';
import Student from '../models/student.model';
import Course from '../models/course.model';

async function recalcEnrolledStudents(courseIds: Iterable<string>): Promise<void> {
  for (const courseId of courseIds) {
    const enrolledStudents = await Student.countDocuments({ enrolledCourses: courseId, status: 'active' });
    await Course.updateOne({ _id: courseId }, { $set: { enrolledStudents } });
  }
}

/**
 * Moves a student's course links from `oldClassId` to `newClassId`:
 * drops every course tied to the old class (regardless of its status —
 * the student is leaving that class outright, so no stale link should
 * remain even to an archived course), adds every *published* course tied
 * to the new class. Pass `oldClassId: null` for a student who has no prior
 * class (new student) — nothing is removed, only added.
 *
 * `enrolledCourses` reflects CURRENT class membership, not history — the
 * historical record of what a student studied in a past class lives in
 * Progress (untouched by this function) and the old Class document itself
 * (never deleted), not in this array. That's the same rule promotion
 * already follows; this keeps manual class edits consistent with it
 * instead of leaving stale course access behind that a bulk promotion
 * would have cleaned up.
 */
export async function reassignStudentClassCourses(
  studentId: mongoose.Types.ObjectId | string,
  oldClassId: mongoose.Types.ObjectId | string | null | undefined,
  newClassId: mongoose.Types.ObjectId | string | null | undefined
): Promise<void> {
  if (String(oldClassId || '') === String(newClassId || '')) return; // no actual change

  const student = await Student.findById(studentId).select('enrolledCourses');
  if (!student) return;

  const [oldCourses, newCourses] = await Promise.all([
    oldClassId ? Course.find({ class: oldClassId }).select('_id') : Promise.resolve([]),
    newClassId ? Course.find({ class: newClassId, status: 'published' }).select('_id') : Promise.resolve([]),
  ]);

  const oldCourseIds = new Set(oldCourses.map((c) => c._id.toString()));
  const keptIds = (student.enrolledCourses || []).map((id) => id.toString()).filter((id) => !oldCourseIds.has(id));
  const newCourseIds = newCourses.map((c) => c._id.toString());
  const nextIds = Array.from(new Set([...keptIds, ...newCourseIds]));

  await Student.findByIdAndUpdate(studentId, {
    enrolledCourses: nextIds.map((id) => new mongoose.Types.ObjectId(id)),
  });

  await recalcEnrolledStudents(new Set([...oldCourseIds, ...newCourseIds]));
}

/** New student (no prior class) — thin wrapper, adds only. */
export async function syncStudentCourseEnrollment(
  studentId: mongoose.Types.ObjectId | string,
  classId: mongoose.Types.ObjectId | string | null | undefined
): Promise<void> {
  await reassignStudentClassCourses(studentId, null, classId);
}
