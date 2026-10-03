/**
 * Runs the content school backfill by hand (it also runs on every API
 * startup; see utils/content-school-backfill.ts):
 *
 *   MONGODB_URI=... npx ts-node src/scripts/backfill-content-school.ts
 */

import mongoose from 'mongoose';
import { backfillContentSchools } from '../utils/content-school-backfill';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI env var is required to run this script.');
  await mongoose.connect(uri);
  console.log(JSON.stringify(await backfillContentSchools(), null, 2));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
