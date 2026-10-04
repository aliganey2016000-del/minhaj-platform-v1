/**
 * Backup encryption and restore-path helpers (used by scripts/backup.ts).
 *
 * New backups are AES-256-GCM, streamed from disk, so a tampered or
 * truncated file is detected instead of silently decrypting to garbage and
 * a multi-gigabyte dump does not have to fit in memory. Files written by the
 * previous version (AES-256-CBC, "ENCRYPTED" header) can still be restored.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const MAGIC_V2 = Buffer.from('MNHJBKP2');
const LEGACY_MAGIC = Buffer.from('ENCRYPTED');
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC_V2.length + SALT_LENGTH + IV_LENGTH;
const PBKDF2_ITERATIONS = 210_000;

function deriveKey(password: string, salt: Buffer, iterations = PBKDF2_ITERATIONS): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}

export async function encryptFile(inputFile: string, outputFile: string, password: string): Promise<void> {
  if (!password) throw new Error('An encryption password is required');
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);

  const out = fs.createWriteStream(outputFile, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC_V2, salt, iv]));
  await pipeline(fs.createReadStream(inputFile), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) => {
    out.end(cipher.getAuthTag(), (error?: Error | null) => (error ? reject(error) : resolve()));
  });
}

/** Decrypts to `outputFile`; throws (and removes the partial file) if the data was altered or the password is wrong. */
export async function decryptFile(inputFile: string, outputFile: string, password: string): Promise<void> {
  if (!password) throw new Error('An encryption password is required');
  const size = fs.statSync(inputFile).size;
  const fd = fs.openSync(inputFile, 'r');
  try {
    const head = Buffer.alloc(Math.min(size, HEADER_LENGTH));
    fs.readSync(fd, head, 0, head.length, 0);

    if (head.subarray(0, LEGACY_MAGIC.length).equals(LEGACY_MAGIC)) {
      // Previous format: AES-256-CBC, 100k PBKDF2 rounds, no authentication.
      const data = fs.readFileSync(inputFile);
      const salt = data.subarray(9, 25);
      const iv = data.subarray(25, 41);
      const decipher = crypto.createDecipheriv('aes-256-cbc', deriveKey(password, salt, 100_000), iv);
      fs.writeFileSync(outputFile, Buffer.concat([decipher.update(data.subarray(41)), decipher.final()]), { mode: 0o600 });
      return;
    }

    if (size < HEADER_LENGTH + TAG_LENGTH || !head.subarray(0, MAGIC_V2.length).equals(MAGIC_V2)) {
      throw new Error('Invalid encrypted backup file');
    }
    const salt = head.subarray(MAGIC_V2.length, MAGIC_V2.length + SALT_LENGTH);
    const iv = head.subarray(MAGIC_V2.length + SALT_LENGTH, HEADER_LENGTH);
    const tag = Buffer.alloc(TAG_LENGTH);
    fs.readSync(fd, tag, 0, TAG_LENGTH, size - TAG_LENGTH);

    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, salt), iv);
    decipher.setAuthTag(tag);
    try {
      await pipeline(
        fs.createReadStream(inputFile, { start: HEADER_LENGTH, end: size - TAG_LENGTH - 1 }),
        decipher,
        fs.createWriteStream(outputFile, { mode: 0o600 }),
      );
    } catch {
      fs.rmSync(outputFile, { force: true });
      throw new Error('Backup could not be decrypted: wrong password or the file was altered or truncated');
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Finds the directory to pass to mongorestore: the one that contains
 * `<dbName>/`. A dump made by this script extracts as `<tmp>/<dbName>`;
 * the previous version's archives extracted under a `.temp-*` folder.
 */
export function findDumpRoot(extractedDir: string, dbName: string): string {
  const candidates = [extractedDir, path.join(extractedDir, 'dump')];
  for (const entry of fs.readdirSync(extractedDir, { withFileTypes: true })) {
    if (entry.isDirectory()) candidates.push(path.join(extractedDir, entry.name));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, dbName)) && fs.statSync(path.join(candidate, dbName)).isDirectory()) return candidate;
  }
  throw new Error(`The backup does not contain a dump of database "${dbName}"`);
}

/** Database name from a MongoDB URI; refuses a URI without one (restore would be ambiguous). */
export function databaseNameFromUri(uri: string): string {
  const name = decodeURIComponent(new URL(uri).pathname.replace(/^\//, '').split('/')[0] || '');
  if (!name) throw new Error('MONGODB_URI must include the database name, e.g. mongodb://host:27017/sahal');
  return name;
}

/** Which backups to delete: older than the retention window, but always keeping the newest `minKeep`. */
export function selectBackupsToDelete(
  backups: { name: string; mtimeMs: number }[],
  retentionDays: number,
  minKeep: number,
  nowMs = Date.now(),
): string[] {
  const newestFirst = [...backups].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const cutoff = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  return newestFirst.slice(Math.max(0, minKeep)).filter((backup) => backup.mtimeMs < cutoff).map((backup) => backup.name);
}
