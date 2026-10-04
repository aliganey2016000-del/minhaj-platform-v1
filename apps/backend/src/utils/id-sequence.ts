/**
 * Shared helper for minting the next number in a human-readable ID
 * sequence (parent/teacher/employee/certificate/spreadsheet row IDs, …)
 * without the `count + 1` race every one of those generators used to have:
 * two concurrent creates reading the same count both mint the same ID (one
 * then fails its unique-index insert), and a deleted row shifts the count
 * back down so the next create reissues a retired ID.
 *
 * Backed by models/id-sequence.model.ts — one counter document per `key`,
 * advanced with an atomic `$inc`. Mirrors the battle-tested pattern
 * models/student.model.ts already uses for Student IDs (via
 * student-sequence.model.ts); this is that same pattern made reusable.
 */
import IdSequence from '../models/id-sequence.model';

/**
 * Seeds the counter for `key` the first time it's used, from whatever the
 * caller's `seed()` reports as the current highest number in use (e.g. the
 * highest existing suffix already in the DB) — never from a doc count,
 * so numbering never jumps backwards relative to IDs that already exist.
 * Safe to call concurrently: a duplicate-key create on the race loses
 * harmlessly, because every caller then continues via the atomic $inc
 * below regardless of who actually created the counter doc.
 */
async function ensureSeeded(key: string, seed: () => Promise<number>): Promise<void> {
  const existing = await IdSequence.findOne({ key }).select('_id').lean();
  if (existing) return;
  const initial = await seed();
  // A plain findOne-then-create race relies on the schema's unique index on
  // `key` to reject a concurrent duplicate insert — but that index is built
  // asynchronously after the model first connects, so a brand-new key's
  // very first few concurrent callers (most likely right after a fresh
  // deploy introduces this collection) could land before it exists and both
  // "win" the create, producing two counter documents for one key. $setOnInsert
  // via findOneAndUpdate is atomic per document at the storage-engine level
  // regardless of any secondary index, so it can't double-create either way.
  try {
    await IdSequence.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, seq: initial } },
      { upsert: true },
    );
  } catch (error: any) {
    // A genuinely concurrent upsert losing a duplicate-key race (the index
    // this relies on existing) is the expected, harmless outcome here —
    // whoever won already seeded the counter, which is all this call needed.
    if (error?.code !== 11000) throw error;
  }
}

/** Atomically reserves and returns the next number for `key` (seeding first if this is the first use). */
export async function nextSequenceNumber(key: string, seed: () => Promise<number> = async () => 0): Promise<number> {
  await ensureSeeded(key, seed);
  const counter: any = await IdSequence.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return Number(counter?.seq || 0);
}

/**
 * Full "format a unique ID string" convenience on top of
 * `nextSequenceNumber`: keeps drawing the next number and formatting it
 * until `exists()` says that candidate isn't already taken (an explicit/
 * imported ID may have already claimed a future number), same retry
 * shape as generateAutomaticStudentId.
 */
export async function nextFormattedId(
  key: string,
  format: (n: number) => string,
  exists: (candidate: string) => Promise<boolean>,
  seed: () => Promise<number> = async () => 0,
  maxAttempts = 10000,
): Promise<string> {
  await ensureSeeded(key, seed);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const n = await nextSequenceNumber(key);
    const candidate = format(n);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not allocate a unique id for "${key}". Please retry.`);
}
