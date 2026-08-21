/**
 * Tenant Scope Helpers — multi-tenant data isolation for org_admin and
 * teacher-owned resources.
 *
 * Teacher ownership is always resolved from Course.teacher, the canonical
 * assignment field. Controllers should use these helpers rather than
 * reimplementing ownership queries independently.
 */

import { Request } from 'express';
import { ForbiddenError } from './api-error';
import Teacher from '../models/teacher.model';
import Parent from '../models/parent.model';
import Course from '../models/course.model';
import AssignmentSubmission from '../models/assignment-submission.model';

export function applyOrgFilter<T extends Record<string, unknown>>(
  req: Request,
  filter: T,
  field = 'school'
): T {
  if (req.user?.role === 'org_admin') {
    if (!req.user.organizationId) {
      return { ...filter, [field]: null } as T;
    }
    return { ...filter, [field]: { $in: [req.user.organizationId, null] } } as T;
  }
  return filter;
}

export function assertOwnsOrg(req: Request, doc: any, field = 'school'): void {
  if (!doc || req.user?.role !== 'org_admin') return;
  const docOrgId = doc[field]?._id ? doc[field]._id.toString() : doc[field]?.toString();
  if (!docOrgId) return;
  if (!req.user.organizationId || docOrgId !== req.user.organizationId) {
    throw new ForbiddenError("You do not have permission to access another organization's data.");
  }
}

// Backward-compatible alias used by the Excel seating import controller.
export const assertOwnOrg = assertOwnsOrg;

export function resolveOrgIdForCreate(req: Request, clientProvidedValue?: unknown): unknown {
  if (req.user?.role === 'org_admin') return req.user.organizationId;
  return clientProvidedValue;
}

export async function getOwnTeacherRecord(req: Request) {
  if (req.user?.role !== 'teacher') return null;
  return Teacher.findOne({ user: req.user.userId });
}

export async function getOwnParentRecord(req: Request) {
  if (req.user?.role !== 'parent') return null;
  return Parent.findOne({ user: req.user.userId });
}

/**
 * Canonical teacher -> course authorization check.
 * Always resolves ownership from Course.teacher, never Teacher.courses[].
 */
export async function assertTeacherOwnsCourse(req: Request, courseId: unknown): Promise<void> {
  if (req.user?.role !== 'teacher') return;

  const teacher = await getOwnTeacherRecord(req);
  const id = courseId?.toString();
  const ownsCourse = teacher && id
    ? await Course.exists({ _id: id, teacher: teacher._id })
    : null;

  if (!ownsCourse) {
    throw new ForbiddenError('You can only manage courses assigned to you.');
  }
}

/**
 * Canonical teacher -> submission authorization check.
 * Submission access is derived through its Course.teacher relationship.
 */
export async function assertTeacherOwnsSubmission(req: Request, submission: any): Promise<void> {
  if (req.user?.role !== 'teacher') return;
  if (!submission) throw new ForbiddenError('Submission is not accessible.');

  const courseId = submission.course?._id ?? submission.course;
  await assertTeacherOwnsCourse(req, courseId);
}

export async function assertCanAccessStudent(req: Request, student: any): Promise<void> {
  if (!student) return;
  const role = req.user?.role;

  if (role === 'admin') return;

  if (role === 'org_admin') {
    assertOwnsOrg(req, student, 'school');
    return;
  }

  if (role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const enrolledIds = (student.enrolledCourses || []).map((c: any) => (c?._id ?? c).toString());
    const teachesThisStudent =
      teacher && enrolledIds.length > 0
        ? await Course.exists({ _id: { $in: enrolledIds }, teacher: teacher._id })
        : null;
    if (!teachesThisStudent) {
      throw new ForbiddenError('You can only access students enrolled in your own courses.');
    }
    return;
  }

  if (role === 'student') {
    const studentUserId = student.user?._id ? student.user._id.toString() : student.user?.toString();
    if (studentUserId !== req.user?.userId) {
      throw new ForbiddenError('You can only access your own data.');
    }
    return;
  }

  if (role === 'parent') {
    const parent = await getOwnParentRecord(req);
    const isMyChild = parent?.children?.some((c: any) => c.toString() === student._id.toString());
    if (!isMyChild) {
      throw new ForbiddenError("You can only access your own children's data.");
    }
    return;
  }

  throw new ForbiddenError('You do not have permission to access this data.');
}

export async function assertOwnsExamIfTeacher(req: Request, exam: { course: any }): Promise<void> {
  if (req.user?.role !== 'teacher') return;
  await assertTeacherOwnsCourse(req, exam.course?._id ?? exam.course);
}

/**
 * AssignmentSubmission import is intentionally retained here so consumers can
 * share a typed resource-level guard without duplicating the course lookup.
 */
export async function assertTeacherCanAccessSubmission(req: Request, submissionId: unknown): Promise<void> {
  if (req.user?.role !== 'teacher') return;
  const submission = await AssignmentSubmission.findById(submissionId).select('course').lean();
  await assertTeacherOwnsSubmission(req, submission);
}
