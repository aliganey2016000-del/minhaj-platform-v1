/**
 * Enrollment sync — the single place that gives a student access to their
 * class's existing courses. Mirrors exactly what curriculum-promotion.
 * controller.ts already does when moving a promoted student to their next
 * class (same Course status filter, same enrolledStudents recompute), so a
 * brand-new student and a freshly-promoted student end up in the identical
 * state instead of only one of the two paths actually granting access.
 *
 * Never creates or clones a Course/CourseContent — only reads existing ones
 * for the given class and links the student to them.
 */

import mongoose from 'mongoose';
import Student from '../models/student.model';
import Course from '../models/course.model';

export async function syncStudentCourseEnrollment(
  studentId: mongoose.Types.ObjectId | string,
  classId: mongoose.Types.ObjectId | string | null | undefined
): Promise<void> {
  if (!classId) return;

  const courses = await Course.find({
    class: classId,
    status: { $in: ['draft', 'published'] },
  }).select('_id');

  if (courses.length === 0) return;
  const courseIds = courses.map((c) => c._id);

  // $addToSet + $each is idempotent by construction — re-running this for a
  // student who already has some/all of these courses never duplicates an
  // entry, so re-approving or re-saving a student is always safe to retry.
  await Student.findByIdAndUpdate(studentId, { $addToSet: { enrolledCourses: { $each: courseIds } } });

  for (const courseId of courseIds) {
    const enrolledStudents = await Student.countDocuments({ enrolledCourses: courseId, status: 'active' });
    await Course.updateOne({ _id: courseId }, { $set: { enrolledStudents } });
  }
}
