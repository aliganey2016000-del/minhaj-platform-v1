/**
 * "May this user look at this student?" — one implementation for every caller
 * that answers that question about activity and analytics data.
 *
 * The rule, matching assertCanAccessStudent in tenant-scope.ts:
 *   admin      — every student
 *   org_admin  — students of their OWN organization only
 *   teacher    — students enrolled in one of their own courses
 *   everyone else — no one
 *
 * org_admin is a tenant-scoped role, but the four gatekeepers this replaces
 * each waved it through with `if (role === 'admin' || role === 'org_admin')
 * return;` and never compared organizations. Their roster list was scoped by
 * applyOrgFilter, so another organization's students could not be browsed —
 * but any of them could still be read directly by id, which is the whole
 * point of the isolation.
 *
 * Two shapes because the callers differ: controllers have an Express request
 * and want a throw; the socket layer has only a userId and role from the
 * handshake token and wants a boolean.
 */

import { Request } from 'express';
import mongoose from 'mongoose';
import Teacher from '../models/teacher.model';
import Course from '../models/course.model';
import Student from '../models/student.model';
import { ForbiddenError } from './api-error';

interface Viewer {
  userId: string;
  role?: string;
  organizationId?: string;
}

const DENIED = 'You do not have access to this student.';

async function check(viewer: Viewer, studentId: string): Promise<{ ok: boolean; reason: string }> {
  if (viewer.role === 'admin') return { ok: true, reason: '' };
  if (viewer.role !== 'org_admin' && viewer.role !== 'teacher') return { ok: false, reason: DENIED };

  // status and enrollmentHistory are what the Student model's course-link
  // normalization reads; projecting enrolledCourses without them hands back
  // an empty list and would deny a teacher their own student.
  const student = await Student.findById(studentId)
    .select('school status enrolledCourses enrollmentHistory')
    .lean();
  if (!student) return { ok: false, reason: DENIED };

  if (viewer.role === 'org_admin') {
    if (!viewer.organizationId) {
      return { ok: false, reason: 'Your account is not assigned to an organization.' };
    }
    const raw: any = (student as any).school;
    const studentOrgId = raw?._id ? String(raw._id) : raw ? String(raw) : '';
    if (studentOrgId !== String(viewer.organizationId)) {
      return { ok: false, reason: "You do not have permission to access another organization's data." };
    }
    return { ok: true, reason: '' };
  }

  const teacher = await Teacher.findOne({ user: viewer.userId }).select('_id').lean();
  if (!teacher) return { ok: false, reason: DENIED };

  const enrolledIds = ((student as any).enrolledCourses || []).map((c: any) => String(c?._id ?? c));
  if (!enrolledIds.length) return { ok: false, reason: DENIED };

  const teaches = await Course.exists({ _id: { $in: enrolledIds }, teacher: teacher._id });
  return teaches ? { ok: true, reason: '' } : { ok: false, reason: DENIED };
}

/** Throws ForbiddenError when this request may not see the student. */
export async function assertCanViewStudent(req: Request, studentId: string): Promise<void> {
  const { ok, reason } = await check(
    { userId: req.user!.userId, role: req.user?.role, organizationId: (req.user as any)?.organizationId },
    studentId,
  );
  if (!ok) throw new ForbiddenError(reason);
}

/** Course-level scope for analytics after the student-level access check. */
export async function visibleCourseIdsForStudent(
  req: Request,
  studentId: string,
): Promise<mongoose.Types.ObjectId[] | undefined> {
  if (req.user?.role !== 'teacher') return undefined;
  const teacher = await Teacher.findOne({ user: req.user.userId }).select('_id').lean();
  if (!teacher) return [];
  const student = await Student.findById(studentId).select('status enrolledCourses enrollmentHistory').lean();
  if (!student) return [];
  const enrolledIds = ((student as any).enrolledCourses || []).map((course: any) => course?._id ?? course);
  if (!enrolledIds.length) return [];
  return Course.find({ _id: { $in: enrolledIds }, teacher: teacher._id }).distinct('_id');
}

/** Boolean form for the socket layer, which has no Express request. */
export async function canUserViewStudent(
  userId: string,
  role: string | undefined,
  studentId: string,
  organizationId?: string,
): Promise<boolean> {
  const { ok } = await check({ userId, role, organizationId }, studentId);
  return ok;
}
