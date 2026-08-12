/**
 * Migration: Backfill legacy Student.totalFeesPaid/totalFeesDue balances as
 * real Invoice documents, so Invoice becomes the single source of truth for
 * every student's balance (billing.service.ts recalcStudentBalance derives
 * totalFeesPaid/totalFeesDue purely from Invoices going forward).
 *
 * For each student with a nonzero legacy balance, creates:
 *   - one 'paid'    ad-hoc invoice for totalFeesPaid (if > 0)
 *   - one 'pending' ad-hoc invoice for totalFeesDue  (if > 0)
 * Both use period: 'legacy-migration' (feeStructure: null, so they're exempt
 * from the student/feeStructure/period unique index) — re-running this
 * script is a no-op for any student who already has one (idempotent).
 * Pre-existing invoice-less completed Payments are best-effort linked to the
 * new paid invoice for traceability; Payment.amount is never altered.
 *
 * Usage:
 *   npx ts-node src/scripts/migrate-legacy-balances-to-invoices.ts             (dry run — prints a table, writes nothing)
 *   npx ts-node src/scripts/migrate-legacy-balances-to-invoices.ts --apply     (writes)
 *   npx ts-node src/scripts/migrate-legacy-balances-to-invoices.ts --apply --generatedBy=<userId>
 *
 * Recommended workflow: run without --apply against a copy of production
 * first, check that "old paid/due" equals "new paid/due" for every row and
 * that the summary totals match, then run --apply during a maintenance
 * window.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Same local-vs-production .env resolution as server.ts — without this,
// process.env.MONGODB_URI is empty here and mongoose silently falls back to
// a local/empty database instead of the one the app actually runs against.
const localEnvPath = path.resolve(__dirname, '../../.env');
const prodEnvPath = path.resolve(__dirname, '../../.env.production');
dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : prodEnvPath });

import mongoose from 'mongoose';
import Student from '../models/student.model';
import Invoice from '../models/invoice.model';
import Payment from '../models/payment.model';
import User from '../models/user.model';
import { recalcStudentBalance } from '../services/billing.service';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/masjid-al-rahma';
const APPLY = process.argv.includes('--apply');
const generatedByArg = process.argv.find((a) => a.startsWith('--generatedBy='))?.split('=')[1];

async function resolveGeneratedBy(): Promise<mongoose.Types.ObjectId> {
  if (generatedByArg) return new mongoose.Types.ObjectId(generatedByArg);
  const admin = await User.findOne({ role: 'admin' }).select('_id').lean();
  if (!admin) {
    throw new Error('No admin user found to attribute migrated invoices to. Pass --generatedBy=<userId> explicitly.');
  }
  return admin._id as mongoose.Types.ObjectId;
}

async function migrate() {
  console.log(`Connecting to MongoDB... (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const generatedBy = await resolveGeneratedBy();

  const students = await Student.find({
    $or: [{ totalFeesPaid: { $gt: 0 } }, { totalFeesDue: { $gt: 0 } }],
  }).select('_id studentId school totalFeesPaid totalFeesDue');

  console.log(`Found ${students.length} student(s) with a nonzero legacy balance.\n`);

  let migrated = 0;
  let skipped = 0;
  let mismatches = 0;
  const sums = { oldPaid: 0, oldDue: 0, newPaid: 0, newDue: 0 };

  const rows: string[] = [];
  rows.push('studentId          | old paid  | old due   | invoices created | new paid  | new due   | status');
  rows.push('-'.repeat(100));

  for (const student of students) {
    const oldPaid = student.totalFeesPaid || 0;
    const oldDue = student.totalFeesDue || 0;
    sums.oldPaid += oldPaid;
    sums.oldDue += oldDue;

    const already = await Invoice.exists({ student: student._id, period: 'legacy-migration' });
    if (already) {
      skipped++;
      rows.push(`${student.studentId.padEnd(19)} | ${oldPaid.toFixed(2).padStart(9)} | ${oldDue.toFixed(2).padStart(9)} | (already migrated) | -         | -         | SKIPPED`);
      continue;
    }

    const invoicesToCreate: string[] = [];
    let paidInvoiceId: mongoose.Types.ObjectId | null = null;

    if (APPLY) {
      if (oldPaid > 0) {
        const inv = await Invoice.create({
          student: student._id,
          school: student.school || null,
          feeStructure: null,
          title: 'Legacy Balance — Paid (Migrated)',
          period: 'legacy-migration',
          lineItems: [{ description: 'Migrated from pre-invoice balance', amount: oldPaid }],
          amount: oldPaid,
          amountPaid: oldPaid,
          status: 'paid',
          paymentType: 'other',
          dueDate: new Date(),
          issueDate: new Date(),
          batchId: `legacy-migration-${Date.now().toString(36)}`,
          generatedBy,
        });
        paidInvoiceId = inv._id as mongoose.Types.ObjectId;
        invoicesToCreate.push('paid');
      }
      if (oldDue > 0) {
        await Invoice.create({
          student: student._id,
          school: student.school || null,
          feeStructure: null,
          title: 'Legacy Balance — Due (Migrated)',
          period: 'legacy-migration',
          lineItems: [{ description: 'Migrated from pre-invoice balance', amount: oldDue }],
          amount: oldDue,
          amountPaid: 0,
          status: 'pending',
          paymentType: 'other',
          dueDate: new Date(),
          issueDate: new Date(),
          batchId: `legacy-migration-${Date.now().toString(36)}`,
          generatedBy,
        });
        invoicesToCreate.push('pending');
      }

      if (paidInvoiceId) {
        await Payment.updateMany(
          { student: student._id, invoice: null, status: 'completed' },
          { $set: { invoice: paidInvoiceId } }
        );
      }

      await recalcStudentBalance(student._id as mongoose.Types.ObjectId);
      const updated = await Student.findById(student._id).select('totalFeesPaid totalFeesDue').lean();
      const newPaid = (updated as any)?.totalFeesPaid || 0;
      const newDue = (updated as any)?.totalFeesDue || 0;
      sums.newPaid += newPaid;
      sums.newDue += newDue;

      const matches = Math.abs(newPaid - oldPaid) < 0.01 && Math.abs(newDue - oldDue) < 0.01;
      if (!matches) {
        mismatches++;
        console.error(`  MISMATCH for ${student.studentId}: old(${oldPaid}, ${oldDue}) != new(${newPaid}, ${newDue})`);
      }
      migrated++;
      rows.push(
        `${student.studentId.padEnd(19)} | ${oldPaid.toFixed(2).padStart(9)} | ${oldDue.toFixed(2).padStart(9)} | ${invoicesToCreate.join('+').padEnd(17)} | ${newPaid.toFixed(2).padStart(9)} | ${newDue.toFixed(2).padStart(9)} | ${matches ? 'OK' : 'MISMATCH'}`
      );
    } else {
      if (oldPaid > 0) invoicesToCreate.push('paid');
      if (oldDue > 0) invoicesToCreate.push('pending');
      sums.newPaid += oldPaid; // dry-run: by construction, would reproduce exactly
      sums.newDue += oldDue;
      rows.push(
        `${student.studentId.padEnd(19)} | ${oldPaid.toFixed(2).padStart(9)} | ${oldDue.toFixed(2).padStart(9)} | ${invoicesToCreate.join('+').padEnd(17)} | (dry run) | (dry run) | PLANNED`
      );
    }
  }

  console.log(rows.join('\n'));
  console.log('\n--- Summary ---');
  console.log(`Students with legacy balance: ${students.length}`);
  console.log(`Migrated: ${migrated}, Skipped (already migrated): ${skipped}, Mismatches: ${mismatches}`);
  console.log(`Totals — old paid: ${sums.oldPaid.toFixed(2)}, old due: ${sums.oldDue.toFixed(2)}`);
  console.log(`Totals — new paid: ${sums.newPaid.toFixed(2)}, new due: ${sums.newDue.toFixed(2)}`);
  if (!APPLY) {
    console.log('\nThis was a DRY RUN — nothing was written. Re-run with --apply to write changes.');
  }

  await mongoose.disconnect();
  console.log('Disconnected.');
  process.exit(mismatches > 0 ? 1 : 0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
