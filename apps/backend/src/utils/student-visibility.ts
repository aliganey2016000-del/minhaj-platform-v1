/**
 * "May this user look at this student?" — the request-free form of the check
 * the activity controllers already run via `assertCanViewStudent`. The socket
 * layer has a userId and a role from the handshake token but no Express
 * request, so it cannot reuse the req-based tenant-scope helpers.
 *
 * Same rule as everywhere else: admin and org_admin see every student; a
 * teacher sees only students enrolled in one of their own courses; nobody
 * else sees anyone.
 */

import Teacher from '../models/teacher.model';
import Course from '../models/course.model';
import Student from '../models/student.model';

export async function canUserViewStudent(userId: string, role: string | undefined, studentId: string): Promise<boolean> {
  if (role === 'admin' || role === 'org_admin') return true;
  if (role !== 'teacher') return false;

  const teacher = await Teacher.findOne({ user: userId }).select('_id').lean();
  if (!teacher) return false;

  const courseIds = await Course.find({ teacher: teacher._id }).distinct('_id');
  if (!courseIds.length) return false;

  const visible = await Student.findOne({ _id: studentId, enrolledCourses: { $in: courseIds } }).select('_id').lean();
  return Boolean(visible);
}
