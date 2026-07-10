/**
 * Migration: Backfill missing school, class, and teacher on existing courses.
 *
 * Usage: npx ts-node src/scripts/migrate-course-relations.ts
 *
 * This script ensures all courses have school/class/teacher fields set
 * (even if null). For courses that have a class but no school, it infers
 * the school from the class. For courses with a teacher but no school, it
 * infers from the teacher's school.
 */

import mongoose from 'mongoose';
import Course from '../models/course.model';
import ClassModel from '../models/class.model';
import Teacher from '../models/teacher.model';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/masjid-al-rahma';

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  // -----------------------------------------------------------------------
  // Find all courses
  // -----------------------------------------------------------------------
  const courses = await Course.find({}).lean();
  console.log(`Found ${courses.length} courses total.`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const course of courses) {
    const updates: Record<string, any> = {};
    let needsUpdate = false;

    // --- school ---
    if (course.school === undefined || course.school === null) {
      // Try to infer school from class
      if (course.class) {
        const classDoc = await ClassModel.findById(course.class).select('school').lean();
        if (classDoc?.school) {
          updates.school = classDoc.school;
          needsUpdate = true;
          console.log(`  Course "${(course as any).title?.en || course._id}": inferred school from class`);
        }
      }

      // If still no school, try from teacher
      if (!updates.school && course.teacher) {
        const teacherDoc = await Teacher.findById(course.teacher).select('school').lean();
        if (teacherDoc?.school) {
          updates.school = teacherDoc.school;
          needsUpdate = true;
          console.log(`  Course "${(course as any).title?.en || course._id}": inferred school from teacher`);
        }
      }

      // If still no school, explicitly set to null so the field exists
      if (!updates.school) {
        updates.school = null;
        needsUpdate = true;
      }
    }

    // --- class ---
    if (course.class === undefined) {
      updates.class = null;
      needsUpdate = true;
    }

    // --- teacher ---
    if (course.teacher === undefined) {
      updates.teacher = null;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await Course.updateOne({ _id: course._id }, { $set: updates });
      updatedCount++;
      console.log(`  Updated course ${course._id}`);
    } else {
      skippedCount++;
    }
  }

  console.log('\n--- Migration Complete ---');
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped (already OK): ${skippedCount}`);

  await mongoose.disconnect();
  console.log('Disconnected.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});