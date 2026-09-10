/**
 * Targeted repair for a failed Add Student submission.
 *
 * The current student-create flow writes User -> Profile -> Student without
 * a MongoDB transaction. If Student.create() fails, the User/Profile can be
 * left behind even though no Student document exists. Manage Students reads
 * from Student, so the orphan is invisible while the email remains blocked.
 *
 * This script is intentionally targeted: it requires an email argument and
 * will only delete the account when all of these are true:
 *   1. the User exists;
 *   2. the User role is `student`;
 *   3. there is NO Student document referencing that User.
 *
 * Dry run (safe):
 *   npx ts-node src/scripts/repair-orphaned-student-user.ts --email someone@example.com
 *
 * Apply:
 *   npx ts-node src/scripts/repair-orphaned-student-user.ts --email someone@example.com --apply
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
import Student from '../models/student.model';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = argValue('--email')?.trim().toLowerCase();
  const apply = process.argv.includes('--apply');

  if (!email) throw new Error('Usage: --email someone@example.com [--apply]');

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set — check .env / .env.production');

  await mongoose.connect(uri);
  console.log(`Connected to: ${uri.replace(/:\/\/[^@]*@/, '://***@')}`);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} for ${email}`);

  try {
    const user = await User.findOne({ email }).select('_id email role organizationId').lean();
    if (!user) {
      console.log('No User found for this email. Nothing to repair.');
      return;
    }

    if (user.role !== 'student') {
      throw new Error(`Refusing to modify ${email}: role is "${user.role}", not "student".`);
    }

    const student = await Student.findOne({ user: user._id }).select('_id studentId school').lean();
    if (student) {
      console.log(`A Student record already exists (${student.studentId || student._id}). Refusing to delete a valid student.`);
      return;
    }

    const profile = await Profile.findOne({ user: user._id }).select('_id firstName lastName').lean();

    console.log(`Orphan student User found: ${user._id}`);
    if (profile) console.log(`Linked orphan Profile found: ${profile._id}`);

    if (!apply) {
      console.log('DRY RUN complete. Re-run with --apply to remove this orphan User/Profile.');
      return;
    }

    if (profile) await Profile.deleteOne({ _id: profile._id, user: user._id });
    await User.deleteOne({ _id: user._id, role: 'student' });
    console.log('Orphan student User/Profile removed. The email can now be used for a fresh registration.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
