/**
 * Migration: seed the 8 built-in course categories (Quran, Fiqh, Aqeedah,
 * Seerah, Arabic, Tajweed, Hadith, Akhlaq) for every existing School, now
 * that categories are managed per-organization instead of a hardcoded enum.
 *
 * Without this, every existing course's `category` string (e.g. "quran")
 * would point at a category that doesn't exist yet in CourseCategory for
 * that course's school — the Manage Categories UI would show an empty
 * list, and re-saving any of those courses would fail the new "category
 * must exist for this organization" check.
 *
 * Usage: npx ts-node src/scripts/backfill-course-categories.ts
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const localEnvPath = path.resolve(__dirname, '../../.env');
const prodEnvPath = path.resolve(__dirname, '../../.env.production');
dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : prodEnvPath });

import mongoose from 'mongoose';
import School from '../models/school.model';
import CourseCategory from '../models/course-category.model';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/masjid-al-rahma';

const DEFAULT_CATEGORIES: { name: string; slug: string }[] = [
  { name: 'Quran', slug: 'quran' },
  { name: 'Fiqh', slug: 'fiqh' },
  { name: 'Aqeedah', slug: 'aqeedah' },
  { name: 'Seerah', slug: 'seerah' },
  { name: 'Arabic', slug: 'arabic' },
  { name: 'Tajweed', slug: 'tajweed' },
  { name: 'Hadith', slug: 'hadith' },
  { name: 'Akhlaq', slug: 'akhlaq' },
];

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const schools = await School.find({}).lean();
  console.log(`Found ${schools.length} school(s).`);

  let created = 0;
  let skipped = 0;

  for (const school of schools) {
    for (const cat of DEFAULT_CATEGORIES) {
      const exists = await CourseCategory.findOne({ school: school._id, slug: cat.slug }).lean();
      if (exists) {
        skipped++;
        continue;
      }
      await CourseCategory.create({ name: cat.name, slug: cat.slug, school: school._id });
      created++;
      console.log(`  Created "${cat.name}" for ${(school as any).name}`);
    }
  }

  console.log('\n--- Migration Complete ---');
  console.log(`Created: ${created}`);
  console.log(`Skipped (already existed): ${skipped}`);

  await mongoose.disconnect();
  console.log('Disconnected.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
