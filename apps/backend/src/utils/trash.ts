/**
 * Generic soft-delete/restore helpers backing the app-wide Trash system.
 * A controller captures a snapshot of every document a delete action would
 * remove, hands it to `moveToTrash`, then performs the deletes exactly as
 * before — the Trash record is the only thing standing between "deleted"
 * and "gone forever" until an admin restores or permanently purges it.
 */
import { Request } from 'express';
import mongoose from 'mongoose';
import Trash, { ITrashSnapshot } from '../models/trash.model';
import Student from '../models/student.model';
import Parent from '../models/parent.model';
import Teacher from '../models/teacher.model';
import ClassModel from '../models/class.model';
import Course from '../models/course.model';
import School from '../models/school.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import ActivityLog from '../models/activity-log.model';
import { NotFoundError, ForbiddenError } from './api-error';

const MODEL_REGISTRY: Record<string, mongoose.Model<any>> = {
  Student, Parent, Teacher, Class: ClassModel, Course, School, User, Profile,
};

// Fire-and-forget, never throws — the Trash action it's attached to must
// always complete even if writing the log entry fails for some reason.
// Mirrors the existing learning-activity-logger.ts pattern. `ActivityLog`
// has no 'restore' value in its action enum, so restores are logged as
// 'update' (closest fit — nothing new is created, an existing record's
// deleted state is reversed) and purges/empties as 'delete'.
export async function logTrashActivity(
  req: Request,
  action: 'restore' | 'purge' | 'empty',
  resource: string,
  resourceId: string,
  details: string
): Promise<void> {
  try {
    if (!req.user?.userId) return;
    await ActivityLog.create({
      user: req.user.userId,
      action: action === 'restore' ? 'update' : 'delete',
      resource,
      resourceId,
      details,
      ip: req.ip || '',
    });
  } catch {
    // Logging is best-effort — never let it fail the actual operation.
  }
}

export async function moveToTrash(opts: {
  entityType: 'Parent' | 'Teacher' | 'Class' | 'Course' | 'School' | 'Student';
  label: string;
  school?: unknown;
  snapshots: ITrashSnapshot[];
  restoreMeta?: Record<string, unknown>;
  req: Request;
}): Promise<void> {
  await Trash.create({
    entityType: opts.entityType,
    label: opts.label,
    school: opts.school || null,
    snapshots: opts.snapshots,
    restoreMeta: opts.restoreMeta || null,
    deletedBy: opts.req.user?.userId || null,
  });
}

// Batch version of moveToTrash — one insertMany instead of N sequential
// creates. Needed for bulk-delete flows (e.g. Students) where looping the
// single-item version one row at a time made a few-hundred-row batch slow
// enough to hit the browser/proxy request timeout.
export async function moveManyToTrash(
  entries: {
    entityType: 'Parent' | 'Teacher' | 'Class' | 'Course' | 'School' | 'Student';
    label: string;
    school?: unknown;
    snapshots: ITrashSnapshot[];
    restoreMeta?: Record<string, unknown>;
  }[],
  req: Request
): Promise<void> {
  if (entries.length === 0) return;
  await Trash.insertMany(entries.map((e) => ({
    entityType: e.entityType,
    label: e.label,
    school: e.school || null,
    snapshots: e.snapshots,
    restoreMeta: e.restoreMeta || null,
    deletedBy: req.user?.userId || null,
  })));
}

export async function restoreFromTrash(trashId: string, req: Request): Promise<{ entityType: string; label: string; entityId: string | null }> {
  const trash = await Trash.findById(trashId);
  if (!trash) throw new NotFoundError('Trash item');

  if (trash.entityType === 'School' && req.user?.role !== 'admin') {
    throw new ForbiddenError('Only a super admin can restore an organization.');
  }
  if (req.user?.role === 'org_admin') {
    const trashSchoolId = trash.school ? trash.school.toString() : null;
    if (trashSchoolId && trashSchoolId !== req.user.organizationId) {
      throw new ForbiddenError("You do not have permission to restore another organization's data.");
    }
  }

  // Re-insert every snapshot under its original _id — if something with
  // that ID already exists (e.g. a repeat restore attempt), leave it alone
  // rather than erroring or duplicating. This goes through the raw driver
  // (`.collection.insertOne`), NOT `Model.create()` — a snapshot already
  // holds fully-processed data (e.g. an already-bcrypt-hashed User
  // password), and `.create()` would re-run save hooks like the password
  // hasher against it a second time, corrupting it.
  for (const snap of trash.snapshots) {
    const Model = MODEL_REGISTRY[snap.modelName];
    if (!Model) continue;
    const existing = await Model.findById((snap.data as any)._id).lean();
    if (existing) continue;
    await Model.collection.insertOne(snap.data);
  }

  // Reverse whatever side-effects the original delete made beyond removing
  // documents outright.
  if (trash.entityType === 'Parent' && Array.isArray((trash.restoreMeta as any)?.childrenIds)) {
    const parentSnap = trash.snapshots.find((s) => s.modelName === 'Parent');
    const parentId = parentSnap ? (parentSnap.data as any)._id : null;
    if (parentId) {
      await Student.updateMany(
        { _id: { $in: (trash.restoreMeta as any).childrenIds } },
        { $set: { parent: parentId } }
      );
    }
  }
  if (trash.entityType === 'Course' && Array.isArray((trash.restoreMeta as any)?.enrolledStudentIds)) {
    const courseSnap = trash.snapshots.find((s) => s.modelName === 'Course');
    const courseId = courseSnap ? (courseSnap.data as any)._id : null;
    if (courseId) {
      await Student.updateMany(
        { _id: { $in: (trash.restoreMeta as any).enrolledStudentIds } },
        { $addToSet: { enrolledCourses: courseId } }
      );
    }
  }
  if (trash.entityType === 'Student' && (trash.restoreMeta as any)?.parentId) {
    const studentSnap = trash.snapshots.find((s) => s.modelName === 'Student');
    const studentId = studentSnap ? (studentSnap.data as any)._id : null;
    if (studentId) {
      await Parent.updateMany(
        { _id: (trash.restoreMeta as any).parentId },
        { $addToSet: { children: studentId } }
      );
    }
  }

  // The "primary" snapshot — the one matching entityType — is the record
  // Undo needs to know how to re-delete (e.g. which /parents/:id to call).
  const primarySnap = trash.snapshots.find((s) => s.modelName === trash.entityType);
  const entityId = primarySnap ? String((primarySnap.data as any)._id) : null;

  const result = { entityType: trash.entityType, label: trash.label, entityId };
  await Trash.findByIdAndDelete(trashId);
  return result;
}
