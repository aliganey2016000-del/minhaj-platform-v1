import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassModel from '../models/class.model';
import Student from '../models/student.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

async function findTargetClass(req: Request, classId: unknown) {
  const normalized = String(classId || '').trim();
  if (!normalized || !mongoose.isValidObjectId(normalized)) {
    throw new BadRequestError('A valid class is required.');
  }

  const cls = await ClassModel.findById(normalized).select('_id school status title section');
  if (!cls) throw new NotFoundError('Class');
  assertOwnsOrg(req, cls, 'school');
  return cls;
}

function assertSameOrganization(classSchool: unknown, schoolId: unknown) {
  if (!schoolId || String(classSchool || '') !== String(schoolId)) {
    throw new BadRequestError('Selected class does not belong to the selected organization.');
  }
}

function assertAssignableStatus(status: string | undefined) {
  if (status !== 'active') {
    throw new BadRequestError('Students can only be assigned to an active class.');
  }
}

/**
 * Runs before student creation so an invalid/cross-tenant/completed class is
 * rejected before the controller creates the student's User and Profile.
 */
export async function validateStudentCreateClass(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.body?.classId) {
    next();
    return;
  }

  const schoolId = resolveOrgIdForCreate(req, req.body?.school);
  if (!schoolId) throw new BadRequestError('An organization is required before assigning a class.');

  const cls = await findTargetClass(req, req.body.classId);
  assertSameOrganization(cls.school, schoolId);
  assertAssignableStatus(cls.status);
  next();
}

/**
 * Ordinary edits may preserve the student's existing class even after that
 * class becomes completed (for example a graduate's historical final class).
 * Moving to a DIFFERENT class is a live enrollment operation: the target class
 * and the student's resulting status must both be active. This prevents a
 * graduated/inactive student from silently ending up attached to an active
 * class while enrollment history and course access remain closed.
 */
export async function validateStudentUpdateClass(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (req.body?.classId === undefined || req.body?.classId === null || req.body?.classId === '') {
    next();
    return;
  }

  const student = await Student.findById(req.params.id).select('_id school class status');
  if (!student) throw new NotFoundError('Student');
  assertOwnsOrg(req, student, 'school');

  const cls = await findTargetClass(req, req.body.classId);
  assertSameOrganization(cls.school, student.school);

  const preservingCurrentClass = String(student.class || '') === String(cls._id);
  const resultingStatus = req.body?.status === undefined ? student.status : String(req.body.status);

  if (!preservingCurrentClass) {
    assertAssignableStatus(cls.status);
    if (resultingStatus !== 'active') {
      throw new BadRequestError('Reactivate the student before moving them to a different active class.');
    }
  }

  // A graduated/inactive student may keep their completed historical class
  // for profile edits, but cannot be reactivated into that completed class.
  if (preservingCurrentClass && student.status !== 'active' && resultingStatus === 'active') {
    assertAssignableStatus(cls.status);
  }

  next();
}

/** Approval is a new academic placement, so the selected class must be active. */
export async function validateStudentApprovalClass(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.body?.classId) {
    next();
    return;
  }

  const schoolId = resolveOrgIdForCreate(req, req.body?.school);
  if (!schoolId) throw new BadRequestError('School is required for approval.');

  const cls = await findTargetClass(req, req.body.classId);
  assertSameOrganization(cls.school, schoolId);
  assertAssignableStatus(cls.status);
  next();
}
