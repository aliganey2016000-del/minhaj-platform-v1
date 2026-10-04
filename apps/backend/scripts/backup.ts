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
import dotenv from 'dotenv';
import { encryptFile, decryptFile, findDumpRoot, databaseNameFromUri, selectBackupsToDelete } from '../src/utils/backup-crypto';

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
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
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
    const dbName = databaseNameFromUri(MONGODB_URI);

    // Dump only this database so a restore can never touch another one.
    try {
      execFileSync('mongodump', ['--uri', MONGODB_URI, '--out', tempDir], { stdio: 'inherit' });
    } catch (error) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw new Error('mongodump command failed. Ensure MongoDB tools are installed.');
    }

    // The archive holds `<dbName>/...` directly (not the temp folder name).
    console.log('🗜️  Compressing backup...');
    try {
      execFileSync('tar', ['-czf', backupFile, '-C', tempDir, dbName], { stdio: 'inherit' });
    } catch (error) {
      throw new Error('tar compression failed');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.chmodSync(backupFile, 0o600);

    let finalFile = backupFile;
    if (ENCRYPTION_PASSWORD) {
      await encryptFile(backupFile, encryptedFile, ENCRYPTION_PASSWORD);
      fs.unlinkSync(backupFile); // Remove unencrypted backup
      finalFile = encryptedFile;
    } else {
      console.warn('⚠️  WARNING: BACKUP_ENCRYPTION_PASSWORD is not set. This backup contains personal data and password hashes and is NOT encrypted.');
    }
    console.log(`✅ Backup created: ${path.basename(finalFile)}`);

    const backupInfo = {
      filename: path.basename(finalFile),
      size: fs.statSync(finalFile).size,
      timestamp: new Date().toISOString(),
      database: dbName,
      encrypted: !!ENCRYPTION_PASSWORD,
    };

    console.log('\n📋 Backup Info:');
    console.log(JSON.stringify(backupInfo, null, 2));
    fs.appendFileSync(path.join(BACKUP_DIR, 'backups.log'), JSON.stringify(backupInfo) + '\n');
  } catch (error) {
    console.error('❌ Backup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Restore database from backup
 */
async function restoreBackup(backupFile: string, confirmed: boolean): Promise<void> {
  let workDir = '';
  try {
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file not found: ${backupFile}`);
    }
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable not set');
    }
    const dbName = databaseNameFromUri(MONGODB_URI);
    // mongorestore --drop replaces every collection in the backup. Never do
    // that by accident (wrong terminal, wrong MONGODB_URI).
    if (!confirmed) {
      throw new Error(`This replaces the data in database "${dbName}" with the backup. Run again with --yes to confirm.`);
    }

    console.log(`🔄 Restoring database "${dbName}" from backup...`);
    ensureBackupDir();
    workDir = fs.mkdtempSync(path.join(BACKUP_DIR, '.restore-'));

    let archive = backupFile;
    if (backupFile.endsWith('.enc')) {
      if (!ENCRYPTION_PASSWORD) {
        throw new Error('Backup is encrypted but BACKUP_ENCRYPTION_PASSWORD is not set');
      }
      console.log('🔓 Decrypting backup...');
      archive = path.join(workDir, 'backup.tar.gz');
      await decryptFile(backupFile, archive, ENCRYPTION_PASSWORD);
    }

    console.log('📂 Extracting backup...');
    const extracted = path.join(workDir, 'extracted');
    fs.mkdirSync(extracted);
    try {
      execFileSync('tar', ['-xzf', archive, '-C', extracted], { stdio: 'inherit' });
    } catch (error) {
      throw new Error('tar extraction failed');
    }

    const dumpRoot = findDumpRoot(extracted, dbName);
    console.log('📥 Restoring to MongoDB...');
    try {
      execFileSync('mongorestore', ['--uri', MONGODB_URI, '--drop', '--nsInclude', `${dbName}.*`, dumpRoot], { stdio: 'inherit' });
    } catch (error) {
      throw new Error('mongorestore command failed');
    }

    console.log('✅ Database restored successfully');
  } catch (error) {
    console.error('❌ Restore failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
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

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('backup-') && (f.endsWith('.tar.gz') || f.endsWith('.tar.gz.enc')))
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }));

  // The newest BACKUP_MIN_KEEP backups survive whatever their age, so a
  // stopped backup job can never let cleanup delete the last good copies.
  const minKeep = parseInt(process.env.BACKUP_MIN_KEEP || '3');
  const toDelete = selectBackupsToDelete(backups, BACKUP_RETENTION_DAYS, minKeep);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(BACKUP_DIR, file));
    console.log(`🗑️  Deleted old backup: ${file}`);
  }
  console.log(`✅ Cleanup complete. Deleted ${toDelete.length} old backup(s).`);
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
        console.error('Usage: node backup.js --restore <backup_file> --yes');
        process.exit(1);
      }
      await restoreBackup(args[1], args.includes('--yes'));
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
  node backup.js --restore <backup_file> --yes     Restore from backup (replaces the database)
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

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
