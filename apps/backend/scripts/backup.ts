#!/usr/bin/env node

/**
 * Database Backup Automation Script
 *
 * Creates encrypted MongoDB backups and manages retention.
 * Can be run manually or scheduled via cron job.
 *
 * Usage:
 *   node backup.js                 # Create backup
 *   node backup.js --restore backup_file.tar.gz  # Restore backup
 *   node backup.js --list         # List all backups
 *   node backup.js --cleanup      # Remove old backups
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');
const MONGODB_URI = process.env.MONGODB_URI || '';
const ENCRYPTION_PASSWORD = process.env.BACKUP_ENCRYPTION_PASSWORD || '';

/**
 * Ensure backup directory exists
 */
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`✅ Created backup directory: ${BACKUP_DIR}`);
  }
}

/**
 * Generate backup filename with timestamp
 */
function getBackupFilename(): string {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `backup-${timestamp}.tar.gz`;
}

/**
 * Encrypt file using AES-256
 */
function encryptBackup(inputFile: string, outputFile: string, password: string): void {
  if (!password) {
    console.warn('⚠️  WARNING: No encryption password set. Backup will not be encrypted.');
    return;
  }

  const data = fs.readFileSync(inputFile);
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  const encryptedData = Buffer.concat([
    Buffer.from('ENCRYPTED'), // Magic bytes
    salt,
    iv,
    cipher.update(data),
    cipher.final(),
  ]);

  fs.writeFileSync(outputFile, encryptedData);
  console.log(`✅ Encrypted backup: ${path.basename(outputFile)}`);
}

/**
 * Decrypt backup file
 */
function decryptBackup(inputFile: string, password: string): Buffer {
  const data = fs.readFileSync(inputFile);

  if (data.toString('utf-8', 0, 9) !== 'ENCRYPTED') {
    throw new Error('Invalid encrypted backup file');
  }

  const salt = data.slice(9, 25);
  const iv = data.slice(25, 41);
  const encryptedData = data.slice(41);

  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

/**
 * Create database backup
 */
async function createBackup(): Promise<void> {
  ensureBackupDir();

  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable not set');
    }

    const tempDir = path.join(BACKUP_DIR, `.temp-${Date.now()}`);
    const backupFile = path.join(BACKUP_DIR, getBackupFilename());
    const encryptedFile = `${backupFile}.enc`;

    console.log('📦 Creating database backup...');

    // Extract database name from URI
    const dbName = new URL(MONGODB_URI).pathname.split('/')[1];

    // Run mongodump
    try {
      execFileSync('mongodump', ['--uri', MONGODB_URI, '--out', tempDir], { stdio: 'inherit' });
    } catch (error) {
      throw new Error('mongodump command failed. Ensure MongoDB tools are installed.');
    }

    // Compress backup
    console.log('🗜️  Compressing backup...');
    try {
      execFileSync('tar', ['-czf', backupFile, '-C', path.dirname(tempDir), path.basename(tempDir)], { stdio: 'inherit' });
    } catch (error) {
      throw new Error('tar compression failed');
    }

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Encrypt backup if password is set
    if (ENCRYPTION_PASSWORD) {
      encryptBackup(backupFile, encryptedFile, ENCRYPTION_PASSWORD);
      fs.unlinkSync(backupFile); // Remove unencrypted backup
      console.log(`✅ Backup created: ${path.basename(encryptedFile)}`);
    } else {
      console.log(`✅ Backup created: ${path.basename(backupFile)}`);
    }

    // Log backup info
    const backupInfo = {
      filename: ENCRYPTION_PASSWORD ? path.basename(encryptedFile) : path.basename(backupFile),
      size: fs.statSync(ENCRYPTION_PASSWORD ? encryptedFile : backupFile).size,
      timestamp: new Date().toISOString(),
      database: dbName,
      encrypted: !!ENCRYPTION_PASSWORD,
    };

    console.log('\n📋 Backup Info:');
    console.log(JSON.stringify(backupInfo, null, 2));

    // Log to file
    const logFile = path.join(BACKUP_DIR, 'backups.log');
    fs.appendFileSync(logFile, JSON.stringify(backupInfo) + '\n');
  } catch (error) {
    // Logged here for a friendlier message, then re-thrown so callers (the
    // CLI entrypoint, or a test importing this module) can handle/observe
    // the failure instead of the whole process being killed out from under
    // them by a `process.exit` buried inside a library function.
    console.error('❌ Backup failed:', error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Recursively search `root` for a directory named exactly `dbName` — this is
 * what `mongodump --out <dir>` produces (`<dir>/<dbName>/*.bson`). We cannot
 * assume a fixed path for it: `createBackup` tars up a timestamped temp
 * directory (`.temp-<created-at>/<dbName>`), so the folder name inside the
 * archive is different on every single backup. Searching for it by name,
 * rather than hardcoding a path, is what makes restore work regardless of
 * when/how the archive was produced.
 */
function findDumpDir(root: string, dbName: string, depth = 0): string | null {
  if (depth > 6) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    if (entry.name === dbName) return full;
    const nested = findDumpDir(full, dbName, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * Restore database from backup
 */
async function restoreBackup(backupFile: string): Promise<void> {
  const tempDir = path.join(BACKUP_DIR, `.temp-restore-${Date.now()}`);
  let decryptedTempFile: string | null = null;

  try {
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file not found: ${backupFile}`);
    }

    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable not set');
    }

    console.log('🔄 Restoring database from backup...');

    // Decrypt if needed
    let dataToExtract = backupFile;
    if (backupFile.endsWith('.enc')) {
      if (!ENCRYPTION_PASSWORD) {
        throw new Error('Backup is encrypted but BACKUP_ENCRYPTION_PASSWORD is not set');
      }

      console.log('🔓 Decrypting backup...');
      const decrypted = decryptBackup(backupFile, ENCRYPTION_PASSWORD);
      decryptedTempFile = path.join(BACKUP_DIR, `.temp-backup-${Date.now()}.tar.gz`);
      fs.writeFileSync(decryptedTempFile, decrypted);
      dataToExtract = decryptedTempFile;
    }

    // Extract into a dedicated, disposable temp directory — never directly
    // into BACKUP_DIR, which would otherwise permanently litter it with
    // every restore's extracted dump.
    fs.mkdirSync(tempDir, { recursive: true });
    console.log('📂 Extracting backup...');
    try {
      execFileSync('tar', ['-xzf', dataToExtract, '-C', tempDir], { stdio: 'inherit' });
    } catch (error) {
      throw new Error('tar extraction failed');
    }

    // Locate the extracted dump directory by database name rather than
    // assuming a fixed path (see findDumpDir above).
    const dbName = new URL(MONGODB_URI).pathname.split('/')[1];
    if (!dbName) {
      throw new Error('Could not determine database name from MONGODB_URI');
    }
    const dumpDir = findDumpDir(tempDir, dbName);
    if (!dumpDir) {
      throw new Error(`Could not locate a "${dbName}" dump directory inside the extracted backup`);
    }

    console.log('📥 Restoring to MongoDB...');
    try {
      execFileSync('mongorestore', ['--uri', MONGODB_URI, '--drop', dumpDir], { stdio: 'inherit' });
    } catch (error) {
      throw new Error('mongorestore command failed');
    }

    console.log('✅ Database restored successfully');
  } catch (error) {
    console.error('❌ Restore failed:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    // Cleanup always runs, success or failure, so a failed restore doesn't
    // leave temp files behind either.
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (decryptedTempFile) {
      fs.rmSync(decryptedTempFile, { force: true });
    }
  }
}

/**
 * List all backups
 */
function listBackups(): void {
  ensureBackupDir();

  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('backup-') && (f.endsWith('.tar.gz') || f.endsWith('.tar.gz.enc')))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('No backups found');
    return;
  }

  console.log('\n📋 Available Backups:\n');
  console.log('Filename'.padEnd(50) + 'Size'.padEnd(15) + 'Date');
  console.log('-'.repeat(80));

  files.forEach((file) => {
    const stat = fs.statSync(path.join(BACKUP_DIR, file));
    const size = (stat.size / 1024 / 1024).toFixed(2) + ' MB';
    const date = stat.mtime.toISOString().split('T')[0];

    console.log(file.padEnd(50) + size.padEnd(15) + date);
  });
}

/**
 * Clean up old backups
 */
function cleanupOldBackups(): void {
  ensureBackupDir();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - BACKUP_RETENTION_DAYS);

  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('backup-') && (f.endsWith('.tar.gz') || f.endsWith('.tar.gz.enc')));

  let deletedCount = 0;

  files.forEach((file) => {
    const filePath = path.join(BACKUP_DIR, file);
    const stat = fs.statSync(filePath);

    if (stat.mtime < cutoffDate) {
      fs.unlinkSync(filePath);
      deletedCount++;
      console.log(`🗑️  Deleted old backup: ${file}`);
    }
  });

  console.log(`✅ Cleanup complete. Deleted ${deletedCount} old backup(s).`);
}

/**
 * Main CLI
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case '--restore':
      if (!args[1]) {
        console.error('Usage: node backup.js --restore <backup_file>');
        process.exit(1);
      }
      await restoreBackup(args[1]);
      break;

    case '--list':
      listBackups();
      break;

    case '--cleanup':
      cleanupOldBackups();
      break;

    case '--help':
      console.log(`
Database Backup Script

Usage:
  node backup.js                                    Create new backup
  node backup.js --restore <backup_file>           Restore from backup
  node backup.js --list                            List all backups
  node backup.js --cleanup                         Remove old backups

Environment Variables:
  BACKUP_DIR                      Directory to store backups (default: ./backups)
  BACKUP_RETENTION_DAYS          How long to keep backups (default: 30)
  MONGODB_URI                    MongoDB connection string
  BACKUP_ENCRYPTION_PASSWORD     Password for encryption (optional)

Examples:
  # Create encrypted backup
  BACKUP_ENCRYPTION_PASSWORD=secret node backup.js

  # Restore from backup
  BACKUP_ENCRYPTION_PASSWORD=secret node backup.js --restore backups/backup-2026-01-15.tar.gz.enc

  # List all backups
  node backup.js --list

  # Schedule with cron (daily at 2 AM)
  0 2 * * * cd /app && node backup.js
      `);
      break;

    default:
      await createBackup();
  }
}

// Only run as a CLI when executed directly (`ts-node scripts/backup.ts ...`
// or the compiled equivalent) — not when a test imports this module to
// exercise its functions directly.
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export {
  createBackup,
  restoreBackup,
  listBackups,
  cleanupOldBackups,
  findDumpDir,
  encryptBackup,
  decryptBackup,
  getBackupFilename,
  ensureBackupDir,
};
