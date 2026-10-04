/**
 * Backfill: owning school for announcements, news, events and gallery items.
 *
 * These four collections had no school field, so every school's admins saw
 * and could edit every other school's items. Each item now belongs to a
 * school. Existing items get their creator's school; items whose creator has
 * no school (the platform admin, or a deleted account) are set to
 * `school: null`, which only the platform admin can see, until someone
 * assigns them by hand.
 *
 * Idempotent: only items with no `school` field at all are touched, so it is
 * safe to run on every startup and a second run changes nothing.
 */

import mongoose from 'mongoose';
import User from '../models/user.model';
import Teacher from '../models/teacher.model';
import '../models/announcement.model';
import '../models/news.model';
import '../models/event.model';
import '../models/gallery.model';

const TARGETS: Array<{ model: string; creatorField: 'createdBy' | 'uploadedBy' }> = [
  { model: 'Announcement', creatorField: 'createdBy' },
  { model: 'News', creatorField: 'createdBy' },
  { model: 'Event', creatorField: 'createdBy' },
  { model: 'Gallery', creatorField: 'uploadedBy' },
];

async function schoolOfUser(userId: unknown): Promise<mongoose.Types.ObjectId | null> {
  const user: any = await User.findById(userId).select('role organizationId').lean();
  if (!user) return null;
  if (user.role === 'admin') return null;
  if (user.organizationId) return user.organizationId;
  if (user.role === 'teacher') {
    const teacher: any = await Teacher.findOne({ user: user._id }).select('school').lean();
    return teacher?.school ?? null;
  }
  return null;
}

export async function backfillContentSchools(): Promise<Record<string, { assigned: number; platformOnly: number }>> {
  const summary: Record<string, { assigned: number; platformOnly: number }> = {};
  const cache = new Map<string, mongoose.Types.ObjectId | null>();

  for (const { model, creatorField } of TARGETS) {
    const Model = mongoose.model(model);
    const missing = { school: { $exists: false } };
    const creators: unknown[] = await Model.distinct(creatorField, missing);
    let assigned = 0;

    for (const creator of creators) {
      const key = String(creator);
      if (!cache.has(key)) cache.set(key, await schoolOfUser(creator));
      const school = cache.get(key);
      if (!school) continue;
      const result = await Model.updateMany({ ...missing, [creatorField]: creator }, { $set: { school } });
      assigned += result.modifiedCount;
    }

    const rest = await Model.updateMany(missing, { $set: { school: null } });
    summary[model] = { assigned, platformOnly: rest.modifiedCount };
  }

  return summary;
}
