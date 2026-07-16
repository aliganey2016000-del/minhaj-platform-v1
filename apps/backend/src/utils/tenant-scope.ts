/**
 * Tenant Scope Helpers — multi-tenant data isolation for org_admin.
 *
 * Super admin (`admin`) and `teacher` see everything, unscoped. `org_admin`
 * must only ever see/modify records belonging to their own organization
 * (`req.user.organizationId`, embedded in the JWT at login).
 *
 * Usage:
 *   const filter = applyOrgFilter(req, { status: 'active' }, 'school');
 *   const students = await Student.find(filter);
 *
 *   const doc = await Student.findById(id);
 *   assertOwnsOrg(req, doc, 'school'); // throws ForbiddenError if mismatched
 */

import { Request } from 'express';
import { ForbiddenError } from './api-error';
import Teacher from '../models/teacher.model';
import Parent from '../models/parent.model';
import Course from '../models/course.model';

/**
 * Returns a copy of `filter` with the tenant field constrained to the
 * caller's own organization when they are `org_admin`. Admin/teacher get
 * the filter back unchanged (full cross-tenant visibility).
 *
 * Matches the org_admin's own org OR records with no org assigned yet
 * (e.g. a self-registered student pending approval) — those aren't another
 * tenant's data, they're unclaimed, and an org_admin must still be able to
 * see and claim them into their own organization.
 */
export function applyOrgFilter<T extends Record<string, unknown>>(
  req: Request,
  filter: T,
  field = 'school'
): T {
  if (req.user?.role === 'org_admin') {
    if (!req.user.organizationId) {
      // org_admin with no organization bound to their account — show nothing
      // rather than accidentally leaking cross-tenant data.
      return { ...filter, [field]: null } as T;
    }
    return { ...filter, [field]: { $in: [req.user.organizationId, null] } } as T;
  }
  return filter;
}

/**
 * Throws ForbiddenError if the caller is `org_admin` and the given document
 * belongs to a DIFFERENT organization. A document with no org assigned yet
 * is treated as unclaimed, not another tenant's — org_admin may act on it
 * (e.g. approving a pending student into their own org). No-op for
 * admin/teacher, and for a null/undefined document (let the caller's own
 * NotFoundError handle that).
 */
export function assertOwnsOrg(req: Request, doc: any, field = 'school'): void {
  if (!doc) return;
  if (req.user?.role !== 'org_admin') return;

  const docOrgId = doc[field]?._id ? doc[field]._id.toString() : doc[field]?.toString();
  if (!docOrgId) return; // unclaimed — allowed
  if (!req.user.organizationId || docOrgId !== req.user.organizationId) {
    throw new ForbiddenError("You do not have permission to access another organization's data.");
  }
}

/**
 * For create endpoints: returns the organizationId an org_admin's new
 * record must be stamped with, overriding anything the client sent.
 * Returns the client-provided value unchanged for admin/teacher.
 */
export function resolveOrgIdForCreate(req: Request, clientProvidedValue?: unknown): unknown {
  if (req.user?.role === 'org_admin') {
    return req.user.organizationId;
  }
  return clientProvidedValue;
}

/**
 * Returns the Teacher document linked to the authenticated user, or null if
 * the caller isn't a teacher (or has no Teacher record yet). Unlike
 * org_admin, a teacher's org/scope isn't in the JWT — it lives on their own
 * Teacher document — so this always requires a DB lookup.
 */
export async function getOwnTeacherRecord(req: Request) {
  if (req.user?.role !== 'teacher') return null;
  return Teacher.findOne({ user: req.user.userId });
}

/**
 * Returns the Parent document linked to the authenticated user, or null if
 * the caller isn't a parent (or has no Parent record yet).
 */
export async function getOwnParentRecord(req: Request) {
  if (req.user?.role !== 'parent') return null;
  return Parent.findOne({ user: req.user.userId });
}

/**
 * Throws ForbiddenError unless the caller may view this student's data:
 *   - admin: always allowed (full global access)
 *   - org_admin: only their own organization (via assertOwnsOrg)
 *   - teacher: only students enrolled in one of the teacher's own courses
 *   - student: only their own record
 *   - parent: only their own linked children
 *
 * `student` should have `user` and `enrolledCourses` available (populated
 * or raw ObjectIds are both fine — only `.toString()` is used).
 */
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
