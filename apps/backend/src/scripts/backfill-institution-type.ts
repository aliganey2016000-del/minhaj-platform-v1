/**
 * Backfill: institutionType / ownershipType / onboardingCompleted / usesFaculty
 *
 * Populates the new organization-classification fields (added for
 * multi-institution-type support: School/College/University/Training Center)
 * on School and AcademicStructure documents that predate them.
 *
 * Safe to run multiple times — only touches documents where the target field
 * is still missing, so a second run does nothing (idempotent). It does NOT
 * run automatically as part of any deploy or app startup; an operator runs
 * it explicitly, once, against the target database:
 *
 *   MONGODB_URI=... npx ts-node src/scripts/backfill-institution-type.ts
 *
 * What it does NOT do: it never touches the legacy `organizationType` field
 * (left in place for backward compatibility — see school.model.ts), and it
 * never overwrites a document that already has the new field set, even if
 * that value looks like a default (e.g. a document with
 * institutionType: 'school' is left alone, not re-derived).
 */

import mongoose from 'mongoose';
import School from '../models/school.model';
import AcademicStructure from '../models/academic-structure.model';
import { resolveInstitutionType, defaultAcademicConfig } from '../utils/academic-config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is required to run this script.`);
  return value;
}

const MONGODB_URI = requireEnv('MONGODB_URI');

async function backfill() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // ── Schools missing institutionType ──
  const schoolsToFix = await School.find({ institutionType: { $exists: false } })
    .select('_id name organizationType ownershipType')
    .lean();

  let schoolsUpdated = 0;
  for (const school of schoolsToFix) {
    const institutionType = resolveInstitutionType(school);
    await School.updateOne(
      { _id: school._id },
      {
        $set: {
          institutionType,
          ...(school.ownershipType ? {} : { ownershipType: 'private' }),
        },
      },
    );
    schoolsUpdated += 1;
  }
  console.log(`Schools backfilled with institutionType: ${schoolsUpdated} (of ${schoolsToFix.length} found missing it)`);

  // ── Schools missing onboardingCompleted — grandfather existing orgs as
  //    already fully set up, since they were operating successfully before
  //    this field existed. ──
  const onboardingResult = await School.updateMany(
    { onboardingCompleted: { $exists: false } },
    { $set: { onboardingCompleted: true } },
  );
  console.log(`Schools backfilled with onboardingCompleted=true: ${onboardingResult.modifiedCount}`);

  // ── AcademicStructure docs missing usesFaculty ──
  const structuresToFix = await AcademicStructure.find({ usesFaculty: { $exists: false } })
    .select('_id school')
    .lean();

  let structuresUpdated = 0;
  for (const structure of structuresToFix) {
    const school = await School.findById(structure.school).select('institutionType organizationType').lean();
    const usesFaculty = school ? defaultAcademicConfig(resolveInstitutionType(school)).usesFaculty : false;
    await AcademicStructure.updateOne({ _id: structure._id }, { $set: { usesFaculty } });
    structuresUpdated += 1;
  }
  console.log(`AcademicStructure docs backfilled with usesFaculty: ${structuresUpdated} (of ${structuresToFix.length} found missing it)`);

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0);
}

backfill().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
