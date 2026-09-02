/**
 * Tenant Scope Helpers — strict multi-tenant isolation for organization and
 * finance staff resources.
 */

import { Request } from 'express';
import { ForbiddenError } from './api-error';
import Teacher from '../models/teacher.model';
import Parent from '../models/parent.model';
import Course from '../models/course.model';
import AssignmentSubmission from '../models/assignment-submission.model';

const TENANT_SCOPED_ROLES = new Set(['org_admin', 'finance_manager', 'cashier', 'auditor']);

function isTenantScoped(req: Request): boolean {
  return TENANT_SCOPED_ROLES.has(req.user?.role || '');
}

export function applyOrgFilter<T extends Record<string, unknown>>(
  req: Request,
  filter: T,
  field = 'school'
): T {
  if (!isTenantScoped(req)) return filter;
  if (!req.user?.organizationId) {
    // Never expose unscoped financial records to tenant-bound staff.
    return { ...filter, [field]: '__NO_TENANT__' } as T;
  }
  return { ...filter, [field]: req.user.organizationId } as T;
}

export function assertOwnsOrg(req: Request, doc: any, field = 'school'): void {
  if (!doc || !isTenantScoped(req)) return;
  if (!req.user?.organizationId) {
    throw new ForbiddenError('Your account is not assigned to an organization.');
  }
  const raw = doc[field];
  const docOrgId = raw?._id ? raw._id.toString() : raw?.toString();
  if (!docOrgId || docOrgId !== req.user.organizationId) {
    throw new ForbiddenError("You do not have permission to access another organization's data.");
  }
}

export const assertOwnOrg = assertOwnsOrg;

export function resolveOrgIdForCreate(req: Request, clientProvidedValue?: unknown): unknown {
  if (isTenantScoped(req)) return req.user?.organizationId;
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

export async function assertTeacherOwnsCourse(req: Request, courseId: unknown): Promise<void> {
  if (req.user?.role !== 'teacher') return;
  const teacher = await getOwnTeacherRecord(req);
  const id = courseId?.toString();
  const ownsCourse = teacher && id
    ? await Course.exists({ _id: id, teacher: teacher._id })
    : null;
  if (!ownsCourse) throw new ForbiddenError('You can only manage courses assigned to you.');
}

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
  if (TENANT_SCOPED_ROLES.has(role || '')) {
    assertOwnsOrg(req, student, 'school');
    return;
  }

  if (role === 'org_admin') {
    assertOwnsOrg(req, student, 'school');
    return;
  }

  if (role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const enrolledIds = (student.enrolledCourses || []).map((c: any) => (c?._id ?? c).toString());
    const teachesThisStudent = teacher && enrolledIds.length > 0
      ? await Course.exists({ _id: { $in: enrolledIds }, teacher: teacher._id })
      : null;
    if (!teachesThisStudent) throw new ForbiddenError('You can only access students enrolled in your own courses.');
    return;
  }

  if (role === 'student') {
    const studentUserId = student.user?._id ? student.user._id.toString() : student.user?.toString();
    if (studentUserId !== req.user?.userId) throw new ForbiddenError('You can only access your own data.');
    return;
  }

  if (role === 'parent') {
    const parent = await getOwnParentRecord(req);
    const isMyChild = parent?.children?.some((c: any) => c.toString() === student._id.toString());
    if (!isMyChild) throw new ForbiddenError("You can only access your own children's data.");
    return;
  }

  throw new ForbiddenError('You do not have permission to access this data.');
}

export async function assertOwnsExamIfTeacher(req: Request, exam: { course: any }): Promise<void> {
  if (req.user?.role !== 'teacher') return;
  await assertTeacherOwnsCourse(req, exam.course?._id ?? exam.course);
}

export async function assertTeacherCanAccessSubmission(req: Request, submissionId: unknown): Promise<void> {
  if (req.user?.role !== 'teacher') return;
  const submission = await AssignmentSubmission.findById(submissionId).select('course').lean();
  await assertTeacherOwnsSubmission(req, submission);
}
