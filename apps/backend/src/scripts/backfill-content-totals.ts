/**
 * Migration: Recompute totalLessons/totalQuizzes/totalAssignments/totalExams
 * on every existing CourseContent document.
 *
 * Usage: npx ts-node src/scripts/backfill-content-totals.ts
 *
 * saveContent (course-content.controller.ts) used to upsert via
 * findOneAndUpdate, which never runs the model's pre('save') hook that
 * computes these totals — so any course whose content was ever saved
 * through the Course Builder was left with stale totals (often 0), while
 * Progress.completedLessons/etc. kept incrementing normally. That produced
 * nonsensical displays like "2/0 Completed Lessons". The controller is now
 * fixed to compute totals inline on every save; this one-off script repairs
 * documents that were already saved before that fix.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Same local-vs-production .env resolution as server.ts — without this,
// process.env.MONGODB_URI is empty here and mongoose silently falls back to
// a local/empty database instead of the one the app actually runs against.
const localEnvPath = path.resolve(__dirname, '../../.env');
const prodEnvPath = path.resolve(__dirname, '../../.env.production');
dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : prodEnvPath });

import mongoose from 'mongoose';
import CourseContent, { computeContentTotals } from '../models/course-content.model';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/masjid-al-rahma';

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const docs = await CourseContent.find({});
  console.log(`Found ${docs.length} course content document(s).`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const doc of docs) {
    const totals = computeContentTotals(doc.chapters);
    const changed =
      doc.totalLessons !== totals.totalLessons ||
      doc.totalQuizzes !== totals.totalQuizzes ||
      doc.totalAssignments !== totals.totalAssignments ||
      doc.totalExams !== totals.totalExams ||
      doc.totalDuration !== totals.totalDuration;

    if (changed) {
      console.log(
        `  Course ${doc.course}: lessons ${doc.totalLessons}->${totals.totalLessons}, ` +
        `quizzes ${doc.totalQuizzes}->${totals.totalQuizzes}, ` +
        `assignments ${doc.totalAssignments}->${totals.totalAssignments}, ` +
        `exams ${doc.totalExams}->${totals.totalExams}`
      );
      await CourseContent.updateOne({ _id: doc._id }, { $set: totals });
      updatedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log('\n--- Migration Complete ---');
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped (already correct): ${skippedCount}`);

  await mongoose.disconnect();
  console.log('Disconnected.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
