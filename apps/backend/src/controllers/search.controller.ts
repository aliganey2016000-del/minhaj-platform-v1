/**
 * Global Search Controller
 *
 * GET /api/v1/search?q=... — searches Courses and Assignments in one call,
 * scoped by role/tenant the same way the dedicated list endpoints are:
 *   - student/parent: published courses (any org) + assignments for the
 *     student's enrolled courses
 *   - teacher: own courses (any status) + own assignments
 *   - org_admin: courses/assignments within their own organization
 *   - admin: everything
 *
 * Results are capped and merged into a single flat array tagged with `kind`
 * so the frontend can render one dropdown grouped by type.
 */

import { Request, Response } from 'express';
import Course from '../models/course.model';
import Assignment from '../models/assignment.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { isTenantScoped, getOwnTeacherRecord } from '../utils/tenant-scope';

const RESULT_LIMIT = 8;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const search = async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (!q) throw new BadRequestError('Query parameter "q" is required');
  if (q.length < 2) return ApiResponse.success(res, { courses: [], assignments: [] });

  const re = new RegExp(escapeRegex(q), 'i');
  const role = req.user?.role;

  const courseFilter: Record<string, unknown> = {
    $or: [{ 'title.en': re }, { 'title.so': re }, { 'title.ar': re }, { category: re }],
  };
  const assignmentFilter: Record<string, unknown> = { title: re };

  if (role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    courseFilter.teacher = teacher?._id;
    const ownCourses = teacher ? await Course.find({ teacher: teacher._id }).select('_id').lean() : [];
    assignmentFilter.course = { $in: ownCourses.map((c: any) => c._id) };
  } else if (isTenantScoped(req)) {
    // org_admin, staff and finance roles: their own school only.
    if (!req.user!.organizationId) return ApiResponse.success(res, { courses: [], assignments: [] });
    courseFilter.school = req.user!.organizationId;
    const orgCourses = await Course.find({ school: req.user!.organizationId }).select('_id').lean();
    assignmentFilter.course = { $in: orgCourses.map((c: any) => c._id) };
  } else if (role === 'student') {
    courseFilter.status = 'published';
    const student = await ensureStudentRecord(req.user!.userId);
    assignmentFilter.course = { $in: student.enrolledCourses || [] };
  } else if (role === 'parent') {
    courseFilter.status = 'published';
    assignmentFilter.course = { $in: [] }; // parents browse courses, not assignments
  } else if (role !== 'admin') {
    // Any other role gets nothing rather than the platform-wide view.
    return ApiResponse.success(res, { courses: [], assignments: [] });
  }
  // admin: no extra scoping — full visibility

  const [courses, assignments, enrolledIds] = await Promise.all([
    Course.find(courseFilter)
      .select('title slug category thumbnail status')
      .limit(RESULT_LIMIT)
      .lean(),
    Assignment.find(assignmentFilter)
      .select('title course dueDate')
      .populate('course', 'title.en slug')
      .limit(RESULT_LIMIT)
      .lean(),
    role === 'student'
      ? ensureStudentRecord(req.user!.userId).then((s) => (s.enrolledCourses || []).map((id: any) => id.toString()))
      : Promise.resolve<string[]>([]),
  ]);

  return ApiResponse.success(res, {
    courses: courses.map((c: any) => ({
      id: c._id,
      kind: 'course',
      title: c.title?.en || c.title,
      subtitle: c.category,
      slug: c.slug,
      // Only meaningful for student role — the student detail page only
      // resolves enrolled courses, so the frontend needs this to decide
      // whether to link to the detail page or the browse/enroll page.
      enrolled: role === 'student' ? enrolledIds.includes(c._id.toString()) : undefined,
    })),
    assignments: assignments.map((a: any) => ({
      id: a._id,
      kind: 'assignment',
      title: a.title,
      subtitle: a.course?.title?.en || '',
      courseId: a.course?._id,
      dueDate: a.dueDate,
    })),
  });
};
