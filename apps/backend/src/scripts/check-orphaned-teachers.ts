/**
 * Read-only diagnostic: finds orphaned Teacher/User/Profile records.
 *
 * bulkImport (teacher.controller.ts) creates each row's User, then Profile,
 * then Teacher as plain sequential writes — no multi-document transaction,
 * since this deployment's MongoDB is a standalone instance (no replica set)
 * and doesn't support them. If Teacher.create() fails partway through a row
 * (after its User/Profile already succeeded), that row's User+Profile are
 * left behind with no matching Teacher — an orphan. This script only reads;
 * it never modifies anything. Safe to re-run anytime.
 *
 * Usage: npx ts-node src/scripts/check-orphaned-teachers.ts
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const localEnvPath = path.resolve(__dirname, '../../.env');
const prodEnvPath = path.resolve(__dirname, '../../.env.production');
dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : prodEnvPath });

import mongoose from 'mongoose';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import Teacher from '../models/teacher.model';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set — check .env / .env.production');
  await mongoose.connect(uri);
  console.log(`Connected to: ${uri.replace(/:\/\/[^@]*@/, '://***@')}\n`);

  // 1. Teacher-role Users with no matching Teacher document.
  const teacherUsers = await User.find({ role: 'teacher' }).select('_id email createdAt').lean();
  const teacherUserIds = teacherUsers.map((u) => u._id);
  const teachers = await Teacher.find({ user: { $in: teacherUserIds } }).select('user profile').lean();
  const teacherUserIdSet = new Set(teachers.map((t) => t.user.toString()));
  const orphanedUsers = teacherUsers.filter((u) => !teacherUserIdSet.has(u._id.toString()));

  console.log(`=== Teacher-role Users with NO matching Teacher document ===`);
  console.log(`Total teacher-role Users: ${teacherUsers.length}`);
  console.log(`Orphaned (no Teacher doc): ${orphanedUsers.length}`);
  for (const u of orphanedUsers) {
    console.log(`  - ${u.email}  (User _id: ${u._id}, created: ${(u as any).createdAt})`);
  }

  // 2. Teacher documents whose `user` reference doesn't resolve to a real User.
  const allTeachers = await Teacher.find({}).select('_id user profile teacherId').lean();
  const allUserIds = new Set((await User.find({}).select('_id').lean()).map((u) => u._id.toString()));
  const allProfileIds = new Set((await Profile.find({}).select('_id').lean()).map((p) => p._id.toString()));

  const teachersWithMissingUser = allTeachers.filter((t) => !t.user || !allUserIds.has(t.user.toString()));
  const teachersWithMissingProfile = allTeachers.filter((t) => !t.profile || !allProfileIds.has(t.profile.toString()));

  console.log(`\n=== Teacher documents with a DANGLING reference ===`);
  console.log(`Total Teacher documents: ${allTeachers.length}`);
  console.log(`Missing/broken user ref: ${teachersWithMissingUser.length}`);
  for (const t of teachersWithMissingUser) console.log(`  - Teacher ${t._id} (teacherId: ${t.teacherId}) -> user ${t.user}`);
  console.log(`Missing/broken profile ref: ${teachersWithMissingProfile.length}`);
  for (const t of teachersWithMissingProfile) console.log(`  - Teacher ${t._id} (teacherId: ${t.teacherId}) -> profile ${t.profile}`);

  // 3. Profiles belonging to a teacher-role User but with no Teacher pointing at them.
  const teacherProfileIds = new Set(teachers.map((t) => (t as any).profile?.toString()).filter(Boolean));
  const profilesForTeacherUsers = await Profile.find({ user: { $in: teacherUserIds } }).select('_id user firstName lastName').lean();
  const orphanedProfiles = profilesForTeacherUsers.filter((p) => !teacherProfileIds.has(p._id.toString()));

  console.log(`\n=== Profiles for a teacher-role User with NO Teacher pointing at them ===`);
  console.log(`Orphaned: ${orphanedProfiles.length}`);
  for (const p of orphanedProfiles) console.log(`  - ${p.firstName} ${p.lastName} (Profile _id: ${p._id}, user: ${p.user})`);

  // 4. Duplicate teacherId values (sanity-check the recent fix).
  const idCounts = new Map<string, number>();
  for (const t of allTeachers) idCounts.set(t.teacherId, (idCounts.get(t.teacherId) || 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1);

  console.log(`\n=== Duplicate teacherId values ===`);
  console.log(`Duplicates found: ${duplicateIds.length}`);
  for (const [id, count] of duplicateIds) console.log(`  - ${id} appears ${count} times`);

  console.log(`\n${'='.repeat(60)}`);
  const totalIssues = orphanedUsers.length + teachersWithMissingUser.length + teachersWithMissingProfile.length + orphanedProfiles.length + duplicateIds.length;
  console.log(totalIssues === 0 ? 'NO ORPHANS OR DUPLICATES FOUND — data is clean.' : `${totalIssues} TOTAL ISSUE(S) FOUND — see above.`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
