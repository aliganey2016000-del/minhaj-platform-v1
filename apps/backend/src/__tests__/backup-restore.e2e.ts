/**
 * Round 4 (2026-10-04): backup/restore correctness.
 *
 * `scripts/backup.ts` was wired up to npm scripts in round 2, but never
 * actually exercised end-to-end. Doing that here surfaced a real bug:
 *
 *   - `createBackup` tars up a *timestamped* temp directory
 *     (`.temp-<created-at>/<dbName>/*.bson`, mongodump's own layout under
 *     whatever `--out` dir it's given).
 *   - `restoreBackup` extracted straight into `BACKUP_DIR` (ignoring its own
 *     `tempDir` variable, which was dead code) and then looked for the dump
 *     at the hardcoded path `BACKUP_DIR/dump/<dbName>` — a path that only
 *     exists if mongodump was run with no `--out` at all. Since
 *     `createBackup` always passes `--out`, that hardcoded "dump" directory
 *     name never matches reality, so restore could never find the data it
 *     had just extracted. A restore of *any* real backup produced by this
 *     script's own `createBackup` would fail outright.
 *
 * `mongodump`/`mongorestore` are not installed in this (or most CI)
 * environments — see BACKUP.md. To actually exercise the script's own
 * packaging/unpacking logic (tar, AES-256 encryption, and — the actual bug —
 * locating the extracted dump directory) without them, this test puts tiny
 * stand-in `mongodump`/`mongorestore` executables on PATH that mimic just
 * enough of the real tools' I/O contract: `mongodump --uri <uri> --out <dir>`
 * writes `<dir>/<dbName>/<collection>.bson`, and `mongorestore --uri <uri>
 * --drop <dumpDir>` records which directory and files it was pointed at.
 * That is sufithe test to prove the glue is correct: a backup created by
 * `createBackup` round-trips through `restoreBackup`, which must locate and
 * pass mongorestore the actual dump directory inside the extracted
 * archive, carrying the same bytes mongodump wrote — which is enough to
 * prove the glue logic (and the fix) is correct.
 *
 * `scripts/backup.ts` reads BACKUP_DIR/MONGODB_URI/etc. into module-level
 * constants at import time, so this test reloads the module (clearing
 * `require.cache`) every time it needs a different BACKUP_DIR/env
 * combination, rather than mutating `process.env` after the fact and
 * expecting it to take effect.
 */

process.env.NODE_ENV = 'test';

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

/** Writes a tiny Node-script "binary" (chmod +x, no extension) to `dir`. */
function writeStub(dir: string, name: string, body: string): void {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
}

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-restore-test-'));
  const stubBinDir = path.join(workDir, 'stub-bin');
  const backupDir = path.join(workDir, 'backups');
  fs.mkdirSync(stubBinDir, { recursive: true });

  const dbName = `backup_test_${Date.now()}`;
  const mongoUri = `mongodb://127.0.0.1:27017/${dbName}`;
  const marker = `MARKER-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Stand-in mongodump: writes <outDir>/<dbName>/testcollection.bson
  // containing a known marker, exactly like the real tool's layout under
  // --out, so this test can verify restore later reads the SAME bytes back.
  writeStub(stubBinDir, 'mongodump', `
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const uri = args[args.indexOf('--uri') + 1];
const outDir = args[args.indexOf('--out') + 1];
const dbName = new URL(uri).pathname.split('/')[1];
const dumpPath = path.join(outDir, dbName);
fs.mkdirSync(dumpPath, { recursive: true });
fs.writeFileSync(path.join(dumpPath, 'testcollection.bson'), ${JSON.stringify(marker)});
fs.writeFileSync(path.join(dumpPath, 'testcollection.metadata.json'), '{}');
`);

  // Stand-in mongorestore: records the dump directory and file list it was
  // actually invoked with, so the test can assert restore pointed it at the
  // real extracted dump (the bug: it pointed at a directory that never
  // existed).
  const restoreSentinel = path.join(workDir, 'restore-sentinel.json');
  writeStub(stubBinDir, 'mongorestore', `
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const dumpDirArg = args[args.length - 1];
let files = [];
let bsonContent = null;
try {
  files = fs.readdirSync(dumpDirArg);
  bsonContent = fs.readFileSync(path.join(dumpDirArg, 'testcollection.bson'), 'utf-8');
} catch (e) {}
fs.writeFileSync(${JSON.stringify(restoreSentinel)}, JSON.stringify({ dumpDirArg, files, bsonContent }));
`);

  // Stub mongodump that always fails, to exercise the error path.
  const failingBinDir = path.join(workDir, 'failing-bin');
  fs.mkdirSync(failingBinDir, { recursive: true });
  writeStub(failingBinDir, 'mongodump', `process.exit(1);`);
  writeStub(failingBinDir, 'mongorestore', `process.exit(1);`);

  const originalPath = process.env.PATH;
  process.env.PATH = `${stubBinDir}${path.delimiter}${originalPath}`;
  process.env.BACKUP_DIR = backupDir;
  process.env.MONGODB_URI = mongoUri;
  delete process.env.BACKUP_ENCRYPTION_PASSWORD;

  const modulePath = require.resolve('../../scripts/backup');
  function loadBackupModule() {
    delete (require.cache as any)[modulePath];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../scripts/backup') as typeof import('../../scripts/backup');
  }

  let { createBackup, restoreBackup, listBackups, cleanupOldBackups, findDumpDir, encryptBackup, decryptBackup } = loadBackupModule();

  try {
    section('findDumpDir locates a nested dbName directory (the actual bug)');
    {
      const root = fs.mkdtempSync(path.join(workDir, 'find-dump-'));
      const nested = path.join(root, '.temp-1700000000000', 'some_db_name');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'x.bson'), 'x');
      const found = findDumpDir(root, 'some_db_name');
      assert(found === nested, 'finds the dump dir regardless of its parent folder name');
      assert(findDumpDir(root, 'nonexistent_db') === null, 'returns null when no matching directory exists');
    }

    section('encrypt/decrypt round-trip');
    {
      const plainFile = path.join(workDir, 'plain.txt');
      const encFile = path.join(workDir, 'plain.txt.enc');
      fs.writeFileSync(plainFile, 'hello world, this is backup content');
      encryptBackup(plainFile, encFile, 'correct-password');
      assert(fs.existsSync(encFile), 'encrypted file was written');
      const decrypted = decryptBackup(encFile, 'correct-password');
      assert(decrypted.toString('utf-8') === 'hello world, this is backup content', 'decrypts back to the original bytes');
      let wrongPasswordThrew = false;
      try { decryptBackup(encFile, 'wrong-password'); } catch { wrongPasswordThrew = true; }
      assert(wrongPasswordThrew, 'decrypting with the wrong password throws instead of silently returning garbage');
      const original = fs.readFileSync(encFile);
      assert(original.subarray(0, 9).toString() === 'ENCRYP002', 'new backups use the authenticated versioned format');
      // Cover header, salt, nonce, authentication tag and ciphertext corruption.
      for (const offset of [0, 9, 25, 37, 53, original.length - 1]) {
        const damaged = Buffer.from(original);
        damaged[offset] ^= 1;
        fs.writeFileSync(encFile, damaged);
        let rejected = false;
        try { decryptBackup(encFile, 'correct-password'); } catch { rejected = true; }
        assert(rejected, `tampering at byte ${offset} is rejected`);
      }
      for (const length of [0, 9, 37, 52, original.length - 1]) {
        fs.writeFileSync(encFile, original.subarray(0, length));
        let rejected = false;
        try { decryptBackup(encFile, 'correct-password'); } catch { rejected = true; }
        assert(rejected, `truncation to ${length} bytes is rejected`);
      }
      fs.writeFileSync(encFile, original);
      const emptyFile = path.join(workDir, 'empty.txt');
      fs.writeFileSync(emptyFile, '');
      encryptBackup(emptyFile, encFile, 'correct-password');
      assert(decryptBackup(encFile, 'correct-password').length === 0, 'authenticated empty payload round-trips');

      // Preserve access to backups produced before this format change.
      const salt = Buffer.alloc(16, 7);
      const iv = Buffer.alloc(16, 8);
      const key = crypto.pbkdf2Sync('legacy-password', salt, 100000, 32, 'sha256');
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const legacy = Buffer.concat([Buffer.from('ENCRYPTED'), salt, iv, cipher.update('legacy backup bytes'), cipher.final()]);
      fs.writeFileSync(encFile, legacy);
      assert(decryptBackup(encFile, 'legacy-password').toString() === 'legacy backup bytes', 'legacy CBC backups still decrypt with their correct password');

    }

    section('createBackup produces a real, non-empty, unencrypted artifact');
    let plainBackupFile = '';
    {
      await createBackup();
      const files = fs.readdirSync(backupDir).filter((f) => f.startsWith('backup-') && f.endsWith('.tar.gz'));
      assert(files.length === 1, 'exactly one unencrypted backup artifact was created');
      plainBackupFile = path.join(backupDir, files[0]);
      const stat = fs.statSync(plainBackupFile);
      assert(stat.size > 0, 'the backup artifact is non-empty');
      const log = fs.readFileSync(path.join(backupDir, 'backups.log'), 'utf-8');
      assert(log.includes(dbName), 'backup info log records the database name');
    }

    section('restoreBackup (unencrypted) finds the real dump dir and feeds it the original bytes');
    {
      fs.rmSync(restoreSentinel, { force: true });
      await restoreBackup(plainBackupFile);
      const sentinel = JSON.parse(fs.readFileSync(restoreSentinel, 'utf-8'));
      assert(sentinel.files.includes('testcollection.bson'), 'mongorestore was pointed at a directory containing the dumped collection');
      assert(sentinel.bsonContent === marker, 'mongorestore read back exactly the bytes mongodump wrote — restore is not a silent no-op');
    }

    section('restore cleans up its temp directory, it does not litter BACKUP_DIR');
    {
      const leftoverTempDirs = fs.readdirSync(backupDir).filter((f) => f.startsWith('.temp'));
      assert(leftoverTempDirs.length === 0, 'no .temp-restore-* or .temp-backup-* directories/files remain in BACKUP_DIR after a restore');
    }

    section('createBackup with BACKUP_ENCRYPTION_PASSWORD produces an encrypted artifact and strips the plaintext one');
    let encBackupFile = '';
    {
      process.env.BACKUP_ENCRYPTION_PASSWORD = 'super-secret-passphrase';
      ({ createBackup, restoreBackup } = loadBackupModule());
      await createBackup();
      const files = fs.readdirSync(backupDir);
      const encFiles = files.filter((f) => f.endsWith('.tar.gz.enc'));
      assert(encFiles.length === 1, 'exactly one encrypted backup artifact was created');
      encBackupFile = path.join(backupDir, encFiles[0]);
      assert(!fs.existsSync(encBackupFile.replace(/\.enc$/, '')), 'the unencrypted tar.gz sibling was removed, only the .enc remains');
      const raw = fs.readFileSync(encBackupFile);
      assert(raw.toString('utf-8', 0, 9) === 'ENCRYP002', 'the artifact on disk is actually encrypted (not plaintext tar.gz renamed)');
    }

    section('restoreBackup decrypts, extracts, and restores an encrypted backup end-to-end');
    {
      fs.rmSync(restoreSentinel, { force: true });
      await restoreBackup(encBackupFile);
      const sentinel = JSON.parse(fs.readFileSync(restoreSentinel, 'utf-8'));
      assert(sentinel.bsonContent === marker, 'restoring the encrypted backup recovers the original dumped bytes');
      const stray = fs.readdirSync(backupDir).filter((f) => f.startsWith('.temp'));
      assert(stray.length === 0, 'encrypted restore also leaves no temp files behind');
      delete process.env.BACKUP_ENCRYPTION_PASSWORD;
    }

    section('restoreBackup argument/error handling');
    {
      let threw = false;
      try { await restoreBackup(path.join(backupDir, 'does-not-exist.tar.gz')); } catch { threw = true; }
      assert(threw, 'restoring a missing file throws instead of proceeding');

      delete process.env.BACKUP_ENCRYPTION_PASSWORD;
      ({ restoreBackup } = loadBackupModule());
      let threwEncWithoutPassword = false;
      try {
        await restoreBackup(encBackupFile);
      } catch { threwEncWithoutPassword = true; }
      assert(threwEncWithoutPassword, 'restoring an .enc backup without BACKUP_ENCRYPTION_PASSWORD throws rather than silently extracting garbage');
    }

    section('mongodump/mongorestore failures surface as errors, not silent success');
    {
      process.env.PATH = `${failingBinDir}${path.delimiter}${originalPath}`;
      let dumpThrew = false;
      try { await createBackup(); } catch { dumpThrew = true; }
      assert(dumpThrew, 'createBackup throws when mongodump fails');

      process.env.PATH = `${stubBinDir}${path.delimiter}${originalPath}`;
      const freshBackup = await (async () => {
        await createBackup();
        const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.tar.gz') && !f.endsWith('.enc'));
        return path.join(backupDir, files[files.length - 1]);
      })();
      process.env.PATH = `${failingBinDir}${path.delimiter}${originalPath}`;
      let restoreThrew = false;
      try { await restoreBackup(freshBackup); } catch { restoreThrew = true; }
      assert(restoreThrew, 'restoreBackup throws when mongorestore fails');
      process.env.PATH = `${stubBinDir}${path.delimiter}${originalPath}`;
    }

    section('ensureBackupDir / listBackups / cleanupOldBackups against a directory that does not yet exist');
    {
      const freshDir = path.join(workDir, 'fresh-backup-dir');
      assert(!fs.existsSync(freshDir), 'sanity: directory does not exist yet');
      process.env.BACKUP_DIR = freshDir;
      ({ listBackups, cleanupOldBackups } = loadBackupModule());
      // listBackups must create the dir and report "no backups", not throw.
      listBackups();
      assert(fs.existsSync(freshDir), 'listBackups creates BACKUP_DIR when missing instead of throwing ENOENT');
      cleanupOldBackups();
      assert(fs.existsSync(freshDir), 'cleanupOldBackups is also safe against a missing BACKUP_DIR');
      process.env.BACKUP_DIR = backupDir;
    }

    section('cleanupOldBackups respects BACKUP_RETENTION_DAYS');
    {
      const oldFile = path.join(backupDir, 'backup-old-test.tar.gz');
      fs.writeFileSync(oldFile, 'old');
      const oldTime = Date.now() - 400 * 24 * 60 * 60 * 1000; // 400 days ago
      fs.utimesSync(oldFile, new Date(oldTime), new Date(oldTime));
      const recentFile = path.join(backupDir, 'backup-recent-test.tar.gz');
      fs.writeFileSync(recentFile, 'recent');

      process.env.BACKUP_RETENTION_DAYS = '30';
      ({ cleanupOldBackups } = loadBackupModule());
      cleanupOldBackups();
      assert(!fs.existsSync(oldFile), 'a backup older than BACKUP_RETENTION_DAYS is deleted by cleanup');
      assert(fs.existsSync(recentFile), 'a recent backup is left alone by cleanup');
    }
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(workDir, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
    delete process.env.BACKUP_RETENTION_DAYS;
    delete process.env.BACKUP_ENCRYPTION_PASSWORD;
  }

  console.log(`\n${failures === 0 ? '✅ All backup/restore checks passed' : `❌ ${failures} check(s) failed`}`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Fatal error running backup-restore.e2e:', error);
  process.exit(1);
});
