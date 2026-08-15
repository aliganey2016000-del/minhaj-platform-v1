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
  if (!doc) return;
  if (req.user?.role !== 'org_admin') return;

  const docOrgId = doc[field]?._id ? doc[field]._id.toString() : doc[field]?.toString();
  if (!docOrgId) return;
  if (!req.user.organizationId || docOrgId !== req.user.organizationId) {
    throw new ForbiddenError("You do not have permission to access another organization's data.");
  }
}

// Backward-compatible alias used by the Excel seating import controller.
export const assertOwnOrg = assertOwnsOrg;

export function resolveOrgIdForCreate(req: Request, clientProvidedValue?: unknown): unknown {
  if (req.user?.role === 'org_admin') {
    return req.user.organizationId;
  }
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
  const teacher = await getOwnTeacherRecord(req);
  const courseId = (exam.course as any)?._id ? (exam.course as any)._id.toString() : (exam.course as any)?.toString();
  const course = courseId ? await Course.findById(courseId).select('teacher').lean() : null;
  const courseTeacherId = (course as any)?.teacher?.toString();
  if (!teacher || !course || courseTeacherId !== teacher._id.toString()) {
    throw new ForbiddenError('You can only manage exams for your own courses.');
  }
}
