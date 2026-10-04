/**
 * Backup / restore round trip, run through the real scripts/backup.ts CLI
 * with stand-in mongodump / mongorestore programs (no database needed).
 *
 * Found in the 2026-10-04 audit: restore looked for `dump/<db>` but the
 * archive held `.temp-<id>/<db>`, so a backup could never be restored; the
 * CBC encryption had no integrity check; restore replaced the database with
 * no confirmation; cleanup could delete every backup.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { selectBackupsToDelete, databaseNameFromUri } from '../utils/backup-crypto';

const backendDir = path.resolve(__dirname, '../..');
const script = path.join(backendDir, 'scripts', 'backup.ts');

function run(env: Record<string, string>, args: string[] = []) {
  return spawnSync(process.execPath, ['--require', 'ts-node/register', script, ...args], {
    cwd: backendDir,
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true', ...env },
    encoding: 'utf8',
  });
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  try {
    const bin = path.join(root, 'bin');
    const backups = path.join(root, 'backups');
    const restored = path.join(root, 'restored.log');
    fs.mkdirSync(bin);
    // Stand-ins: mongodump writes <out>/<db>/data.bson; mongorestore checks that
    // <root>/<db>/data.bson exists and records what it was asked to do.
    fs.writeFileSync(path.join(bin, 'mongodump'), '#!/bin/sh\nwhile [ "$1" != "--out" ]; do shift; done\nmkdir -p "$2/testdb"\nprintf "SECRET-ROWS" > "$2/testdb/data.bson"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'mongorestore'), `#!/bin/sh\nroot=""; for a in "$@"; do root="$a"; done\ncat "$root/testdb/data.bson" > "${restored}" || exit 3\necho "$@" >> "${restored}.args"\n`, { mode: 0o755 });

    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/testdb',
      BACKUP_DIR: backups,
      BACKUP_ENCRYPTION_PASSWORD: 'correct horse battery staple',
    };

    // 1. Backup is created, encrypted and not readable as plain text.
    let result = run(env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const encrypted = fs.readdirSync(backups).filter((f) => f.endsWith('.tar.gz.enc'));
    assert.equal(encrypted.length, 1, 'one encrypted backup file');
    assert.equal(fs.readdirSync(backups).filter((f) => f.endsWith('.tar.gz')).length, 0, 'the unencrypted archive is removed');
    const file = path.join(backups, encrypted[0]);
    assert.ok(!fs.readFileSync(file).includes('SECRET-ROWS'), 'the backup does not contain readable data');
    assert.equal(fs.statSync(file).mode & 0o077, 0, 'backup file is owner-only');
    console.log('  OK   an encrypted backup is created');

    // 2. Restore refuses to run without confirmation.
    result = run(env, ['--restore', file]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /--yes/);
    assert.ok(!fs.existsSync(restored), 'nothing restored without confirmation');
    console.log('  OK   restore needs --yes');

    // 3. Round trip: the data comes back through mongorestore.
    result = run(env, ['--restore', file, '--yes']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.readFileSync(restored, 'utf8'), 'SECRET-ROWS');
    assert.match(fs.readFileSync(`${restored}.args`, 'utf8'), /--drop --nsInclude testdb\.\*/);
    assert.deepEqual(fs.readdirSync(backups).filter((f) => f.startsWith('.')), [], 'temporary folders are cleaned up');
    console.log('  OK   backup -> restore round trip works');

    // 4. A wrong password and a tampered file are both refused.
    fs.rmSync(restored); fs.rmSync(`${restored}.args`);
    result = run({ ...env, BACKUP_ENCRYPTION_PASSWORD: 'wrong password' }, ['--restore', file, '--yes']);
    assert.notEqual(result.status, 0);
    assert.ok(!fs.existsSync(restored), 'a wrong password restores nothing');
    const tampered = path.join(backups, 'backup-tampered.tar.gz.enc');
    const bytes = fs.readFileSync(file);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    fs.writeFileSync(tampered, bytes);
    result = run(env, ['--restore', tampered, '--yes']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /altered|password/);
    assert.ok(!fs.existsSync(restored), 'a tampered backup restores nothing');
    const truncated = path.join(backups, 'backup-truncated.tar.gz.enc');
    fs.writeFileSync(truncated, fs.readFileSync(file).subarray(0, fs.statSync(file).size - 20));
    result = run(env, ['--restore', truncated, '--yes']);
    assert.notEqual(result.status, 0);
    assert.ok(!fs.existsSync(restored), 'a truncated backup restores nothing');
    console.log('  OK   wrong password, tampering and truncation are refused');

    // 4b. Backups made by the previous version (AES-256-CBC, `.temp-*` folder layout) still restore.
    const legacyDir = path.join(root, 'legacy');
    fs.mkdirSync(path.join(legacyDir, '.temp-123', 'testdb'), { recursive: true });
    fs.writeFileSync(path.join(legacyDir, '.temp-123', 'testdb', 'data.bson'), 'SECRET-ROWS');
    const legacyTar = path.join(root, 'legacy.tar.gz');
    execFileSync('tar', ['-czf', legacyTar, '-C', legacyDir, '.temp-123']);
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(env.BACKUP_ENCRYPTION_PASSWORD, salt, 100000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const legacyFile = path.join(backups, 'backup-legacy.tar.gz.enc');
    fs.writeFileSync(legacyFile, Buffer.concat([Buffer.from('ENCRYPTED'), salt, iv, cipher.update(fs.readFileSync(legacyTar)), cipher.final()]));
    result = run(env, ['--restore', legacyFile, '--yes']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.readFileSync(restored, 'utf8'), 'SECRET-ROWS');
    console.log('  OK   a backup from the previous version still restores');

    // 5. A URI without a database name is refused.
    assert.throws(() => databaseNameFromUri('mongodb://127.0.0.1:27017'), /database name/);
    assert.equal(databaseNameFromUri('mongodb://u:p@h:27017/sahal?authSource=admin'), 'sahal');

    // 6. Cleanup never removes the newest backups, whatever their age.
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const list = [1, 2, 40, 41, 90].map((age) => ({ name: `b${age}`, mtimeMs: now - age * day }));
    assert.deepEqual(selectBackupsToDelete(list, 30, 3, now).sort(), ['b41', 'b90']);
    assert.deepEqual(selectBackupsToDelete(list.slice(2), 30, 3, now), [], 'old backups are kept while there are only three');
    assert.deepEqual(selectBackupsToDelete([{ name: 'only', mtimeMs: now - 400 * day }], 30, 3, now), []);
    console.log('  OK   cleanup always keeps the newest backups');

    console.log('PASS: backup and restore round trip');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
