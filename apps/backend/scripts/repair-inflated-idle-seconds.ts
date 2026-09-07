/**
 * One-time repair for learning sessions inflated by the unbounded-idle bug.
 *
 * Until the fix in learning-session.controller.ts, a heartbeat arriving after
 * a gap longer than the idle threshold added that entire gap to idleSeconds
 * instead of the usual 60-second cap. A phone that slept with a lesson tab
 * open and woke the next morning therefore booked ~14 hours as time spent on
 * that lesson, which then flowed into "Total duration" everywhere on the
 * Student Activity page.
 *
 * The real idle time inside those sessions is not recoverable — it was never
 * recorded separately from the fabricated jump. activeSeconds is trustworthy
 * (it was always capped), so this script keeps it and drops the rest:
 *
 *   idleSeconds -> 0
 *   endedAt     -> startedAt + activeSeconds   (only when that is earlier)
 *   status      -> 'expired' if still 'active'
 *
 * That deliberately understates rather than overstates: a session repaired
 * this way reports exactly the study time that was measured, and nothing
 * more.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/repair-inflated-idle-seconds.ts            # dry run
 *   npx ts-node scripts/repair-inflated-idle-seconds.ts --apply    # write
 *   npx ts-node scripts/repair-inflated-idle-seconds.ts --threshold=7200
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const localEnvPath = path.resolve(__dirname, '../.env');
const prodEnvPath = path.resolve(__dirname, '../.env.production');
dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : prodEnvPath });

// No legitimate session accrues this much idle: with the fix in place a
// single heartbeat can add at most 60 seconds, and a tab that stops sending
// heartbeats gets closed by the stale-session sweep within ~2 minutes.
const DEFAULT_THRESHOLD_SECONDS = 60 * 60;

function parseArgs() {
  const apply = process.argv.includes('--apply');
  const thresholdArg = process.argv.find((a) => a.startsWith('--threshold='));
  const parsed = thresholdArg ? parseInt(thresholdArg.split('=')[1], 10) : NaN;
  const threshold = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD_SECONDS;
  return { apply, threshold };
}

const fmt = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

async function main(): Promise<void> {
  const { apply, threshold } = parseArgs();

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Add it to backend/.env or backend/.env.production.');
    process.exit(1);
  }

  const mongoose = (await import('mongoose')).default;
  const LearningSession = (await import('../src/models/learning-session.model')).default;

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
  console.log(`Repairing sessions with idleSeconds > ${threshold}s (${fmt(threshold)}).\n`);

  const affected = await LearningSession.find({ idleSeconds: { $gt: threshold } })
    .select('_id student lessonTitle resourceName startedAt endedAt activeSeconds idleSeconds status')
    .sort({ idleSeconds: -1 })
    .lean();

  if (!affected.length) {
    console.log('No inflated sessions found — nothing to repair.');
    await mongoose.disconnect();
    return;
  }

  const totalIdle = affected.reduce((sum, s: any) => sum + (s.idleSeconds || 0), 0);
  console.log(`Found ${affected.length} session(s) holding ${fmt(totalIdle)} of fabricated idle time.\n`);

  for (const s of affected.slice(0, 20) as any[]) {
    const label = s.lessonTitle || s.resourceName || '(untitled)';
    console.log(`  ${label} — idle ${fmt(s.idleSeconds)}, active ${fmt(s.activeSeconds || 0)}, started ${new Date(s.startedAt).toISOString()}`);
  }
  if (affected.length > 20) console.log(`  … and ${affected.length - 20} more`);

  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to write these repairs.');
    await mongoose.disconnect();
    return;
  }

  const writes = (affected as any[]).map((s) => {
    const set: Record<string, unknown> = { idleSeconds: 0 };
    const trackedEnd = new Date(new Date(s.startedAt).getTime() + (s.activeSeconds || 0) * 1000);
    if (!s.endedAt || trackedEnd < new Date(s.endedAt)) set.endedAt = trackedEnd;
    if (s.status === 'active') set.status = 'expired';
    return { updateOne: { filter: { _id: s._id }, update: { $set: set } } };
  });

  const result = await LearningSession.bulkWrite(writes);
  console.log(`\nRepaired ${result.modifiedCount} session(s); reclaimed ${fmt(totalIdle)} of fabricated study time.`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Repair failed:', error);
  process.exit(1);
});
