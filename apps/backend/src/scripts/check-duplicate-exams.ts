/**
 * Read-only diagnostic: finds duplicate Exam documents (same course + title
 * + examDate + startTime) — the shape of duplicate bulkImport left behind
 * before exam.controller.ts's import/create endpoints gained a duplicate
 * guard. Never modifies anything; safe to re-run anytime.
 *
 * Usage: npx ts-node src/scripts/check-duplicate-exams.ts
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const localEnvPath = path.resolve(__dirname, '../../.env');
const prodEnvPath = path.resolve(__dirname, '../../.env.production');
dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : prodEnvPath });

import mongoose from 'mongoose';
import Exam from '../models/exam.model';
import '../models/course.model'; // registers 'Course' for the populate() below

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set — check .env / .env.production');
  await mongoose.connect(uri);
  console.log(`Connected to: ${uri.replace(/:\/\/[^@]*@/, '://***@')}\n`);

  const exams = await Exam.find({})
    .populate('course', 'title.en')
    .select('title course examDate startTime endTime createdAt')
    .lean();

  // Auto-scheduled exams have no fixed examDate/startTime at all (each
  // student gets their own personal window) — group those separately by
  // course+title only, rather than crashing on an invalid Date.
  function dateKey(e: any): string {
    const d = new Date(e.examDate as any);
    return isNaN(d.getTime()) ? 'auto-scheduled' : d.toISOString().slice(0, 10);
  }

  const groups = new Map<string, any[]>();
  for (const e of exams) {
    const key = `${e.course?._id || e.course}|||${String(e.title).trim().toLowerCase()}|||${dateKey(e)}|||${e.startTime || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const dupGroups = [...groups.entries()].filter(([, list]) => list.length > 1);

  console.log(`Total Exam documents: ${exams.length}`);
  console.log(`Duplicate groups (same course+title+date+start time): ${dupGroups.length}`);
  let totalExtra = 0;
  for (const [, list] of dupGroups) {
    const courseName = (list[0].course as any)?.title?.en || list[0].course;
    console.log(`\n  "${list[0].title}" — ${courseName} — ${dateKey(list[0])} ${list[0].startTime || '(auto-scheduled)'}  (${list.length} copies)`);
    for (const e of list) {
      console.log(`    - _id: ${e._id}  createdAt: ${e.createdAt}`);
    }
    totalExtra += list.length - 1;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(dupGroups.length === 0
    ? 'NO DUPLICATE EXAMS FOUND.'
    : `${dupGroups.length} DUPLICATE GROUP(S) FOUND — ${totalExtra} extra document(s) beyond the first copy of each. Nothing was deleted (read-only).`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
