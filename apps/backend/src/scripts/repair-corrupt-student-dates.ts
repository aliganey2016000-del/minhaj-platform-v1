/**
 * One-time repair for student enrollment dates corrupted by the legacy import.
 *
 * The old student import did `new Date(String(cell))`. Excel hands date cells
 * over as serial day numbers, so a cell showing 15/01/2026 (serial 46037) was
 * stored as 1 January of the YEAR 46037. MongoDB's $dateToString cannot render
 * years past 9999, which crashed /students/stats and the dashboard trends.
 *
 * For every student whose enrollmentDate is in the future or before 1900:
 *   1. "serial"   - the value is 1 January of a year that is really an Excel
 *                   serial for a plausible date; restore that exact date.
 *   2. "createdAt"- otherwise use the date the student record was created,
 *                   which is when the student was registered in the system.
 *   3. "manual"   - neither is usable; reported and left untouched.
 *
 * Writes are guarded on the original bad value, so re-running is safe.
 *
 * Usage, in the production container (Coolify → backend → Terminal):
 *   node dist/scripts/repair-corrupt-student-dates.js              # dry run
 *   node dist/scripts/repair-corrupt-student-dates.js --apply      # write
 * Locally (from apps/backend):
 *   npm run repair:student-dates -- [--apply]
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Student from '../models/student.model';
import { recoverSerialParsedAsYear } from '../utils/spreadsheet-date';

const EARLIEST_PLAUSIBLE = new Date(Date.UTC(1990, 0, 1));

export interface DateRepair {
  id: string;
  studentId: string;
  school: string;
  badValue: string;
  method: 'serial' | 'createdAt' | 'manual';
  fixedValue: Date | null;
}

function describe(value: Date): string {
  const year = value.getUTCFullYear();
  return year >= 0 && year <= 9999 ? value.toISOString() : `year ${year} (raw ${value.getTime()} ms)`;
}

export async function repairCorruptStudentDates(apply: boolean, now = new Date()): Promise<DateRepair[]> {
  const latest = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const students = await Student.collection
    .find(
      { $or: [{ enrollmentDate: { $gt: latest } }, { enrollmentDate: { $lt: new Date(Date.UTC(1900, 0, 1)) } }] },
      { projection: { studentId: 1, school: 1, enrollmentDate: 1, createdAt: 1 } },
    )
    .toArray();

  const repairs: DateRepair[] = [];
  for (const student of students) {
    const bad = student.enrollmentDate as Date;
    const created = student.createdAt instanceof Date ? student.createdAt : null;
    let method: DateRepair['method'] = 'manual';
    let fixedValue: Date | null = recoverSerialParsedAsYear(bad, EARLIEST_PLAUSIBLE, latest) || null;
    if (fixedValue) method = 'serial';
    else if (created && created >= EARLIEST_PLAUSIBLE && created <= latest) {
      method = 'createdAt';
      fixedValue = created;
    }

    repairs.push({
      id: String(student._id),
      studentId: String(student.studentId || ''),
      school: String(student.school || ''),
      badValue: describe(bad),
      method,
      fixedValue,
    });

    if (apply && fixedValue) {
      await Student.collection.updateOne(
        { _id: student._id, enrollmentDate: bad },
        { $set: { enrollmentDate: fixedValue } },
      );
    }
  }
  return repairs;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  // Production injects MONGODB_URI directly; these files only matter locally.
  const backendRoot = path.resolve(__dirname, '../..');
  const localEnvPath = path.join(backendRoot, '.env');
  const prodEnvPath = path.join(backendRoot, '.env.production');
  dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : prodEnvPath });
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Add it to backend/.env or backend/.env.production.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

  const repairs = await repairCorruptStudentDates(apply);
  if (!repairs.length) {
    console.log('No students with an impossible enrollment date. Nothing to do.');
  } else {
    console.table(repairs.map((item) => ({
      studentId: item.studentId,
      school: item.school,
      badValue: item.badValue,
      method: item.method,
      fixedValue: item.fixedValue ? item.fixedValue.toISOString().slice(0, 10) : 'NOT FIXED - edit manually',
    })));
    const fixable = repairs.filter((item) => item.fixedValue).length;
    console.log(`\n${repairs.length} found, ${fixable} ${apply ? 'repaired' : 'repairable'}, ${repairs.length - fixable} need manual review.`);
    if (!apply && fixable) console.log('Re-run with --apply to write these changes.');
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
}
