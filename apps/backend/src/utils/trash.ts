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
import { NotFoundError, ForbiddenError } from './api-error';

const MODEL_REGISTRY: Record<string, mongoose.Model<any>> = {
  Student, Parent, Teacher, Class: ClassModel, Course, School, User, Profile,
};

export async function moveToTrash(opts: {
  entityType: 'Parent' | 'Teacher' | 'Class' | 'Course' | 'School';
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

export async function restoreFromTrash(trashId: string, req: Request): Promise<{ entityType: string; label: string }> {
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
  // rather than erroring or duplicating.
  for (const snap of trash.snapshots) {
    const Model = MODEL_REGISTRY[snap.modelName];
    if (!Model) continue;
    const existing = await Model.findById((snap.data as any)._id).lean();
    if (existing) continue;
    await Model.create(snap.data);
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

  const result = { entityType: trash.entityType, label: trash.label };
  await Trash.findByIdAndDelete(trashId);
  return result;
}
