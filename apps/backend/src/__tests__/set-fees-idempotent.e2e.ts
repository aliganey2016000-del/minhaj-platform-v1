/**
 * PUT /payments/set-fees/:studentId — "Edit Fees" on the Student Balances
 * page. Regression test for a live bug: every save unconditionally created a
 * brand-new "Manual Fee Assignment" Invoice, and recalcStudentBalance sums
 * ALL non-void invoices for totalFees — so editing the SAME student's fees
 * twice didn't replace the first value, it ADDED another invoice on top,
 * making totalFees grow with every edit instead of reflecting the number
 * the admin just typed.
 *
 * The fix: an edit voids any earlier "Manual Fee Assignment" invoice that
 * hasn't been paid against yet (superseded) before creating the new one, so
 * repeated edits converge on the latest value instead of compounding. An
 * earlier manual invoice that already has a payment collected is left
 * alone — same "can't void what's been paid" rule as voidInvoice elsewhere.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:set-fees-idempotent`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to in-memory MongoDB:', process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: School } = await import('../models/school.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: Invoice } = await import('../models/invoice.model');
  const { collectPaymentService } = await import('../services/billing.service');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });
  const orgAdmin = await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
  const orgAdminToken = tokenFor(orgAdmin._id.toString(), 'org_admin', school._id.toString());

  const studentUser = await User.create({ email: 'student@test.local', password: 'Password123!', role: 'student' });
  const profile = await Profile.create({ user: studentUser._id, firstName: 'Naciimo', lastName: 'Ducaale', gender: 'female' });
  const student = await Student.create({ user: studentUser._id, profile: profile._id, studentId: 'TUSMO-017', school: school._id, status: 'active', approvalStatus: 'approved' });

  // -------------------------------------------------------------------
  section('REPEATED EDIT WITH THE SAME VALUES — must NOT compound');
  // -------------------------------------------------------------------
  const first = await request(app)
    .put(`/api/v1/payments/set-fees/${student._id}`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ totalFees: 1600, discount: 30 });
  assert(first.status === 200, `first edit succeeds (status ${first.status})`);
  assert(first.body?.data?.totalFeesDue === 1570, `totalFeesDue is 1600 - 30 = 1570 after the first edit (got ${first.body?.data?.totalFeesDue})`);

  const second = await request(app)
    .put(`/api/v1/payments/set-fees/${student._id}`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ totalFees: 1600, discount: 30 });
  assert(second.status === 200, `second identical edit succeeds (status ${second.status})`);
  assert(second.body?.data?.totalFeesDue === 1570, `totalFeesDue is STILL 1570 after re-saving the same values — no compounding (got ${second.body?.data?.totalFeesDue})`);

  const third = await request(app)
    .put(`/api/v1/payments/set-fees/${student._id}`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ totalFees: 1600, discount: 30 });
  assert(third.status === 200, `third identical edit succeeds (status ${third.status})`);
  assert(third.body?.data?.totalFeesDue === 1570, `totalFeesDue is STILL 1570 after a third re-save (got ${third.body?.data?.totalFeesDue})`);

  const manualInvoicesAfterRepeats = await Invoice.find({ student: student._id, title: 'Manual Fee Assignment', status: { $ne: 'void' } }).lean();
  assert(manualInvoicesAfterRepeats.length === 1, `exactly 1 active "Manual Fee Assignment" invoice exists after 3 identical edits, not 3 (got ${manualInvoicesAfterRepeats.length})`);

  const voidedManualInvoices = await Invoice.find({ student: student._id, title: 'Manual Fee Assignment', status: 'void' }).lean();
  assert(voidedManualInvoices.length === 2, `the 2 superseded invoices were voided, not deleted — audit trail intact (got ${voidedManualInvoices.length})`);

  // -------------------------------------------------------------------
  section('EDIT TO A NEW VALUE — replaces, doesn\'t add to, the previous one');
  // -------------------------------------------------------------------
  const changed = await request(app)
    .put(`/api/v1/payments/set-fees/${student._id}`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ totalFees: 2000, discount: 0 });
  assert(changed.status === 200, `edit to a new value succeeds (status ${changed.status})`);
  assert(changed.body?.data?.totalFeesDue === 2000, `totalFeesDue reflects the NEW value (2000), not 1570 + 2000 (got ${changed.body?.data?.totalFeesDue})`);

  const activeManualAfterChange = await Invoice.find({ student: student._id, title: 'Manual Fee Assignment', status: { $ne: 'void' } }).lean();
  assert(activeManualAfterChange.length === 1 && activeManualAfterChange[0].amount === 2000, `exactly 1 active manual invoice for the new amount 2000 (got ${JSON.stringify(activeManualAfterChange.map((i: any) => i.amount))})`);

  // -------------------------------------------------------------------
  section('A MANUAL INVOICE ALREADY PAID AGAINST IS NEVER VOIDED BY A LATER EDIT');
  // -------------------------------------------------------------------
  const activeInvoiceId = activeManualAfterChange[0]._id;
  await collectPaymentService({ studentId: student._id as any, schoolId: school._id, invoiceId: activeInvoiceId, amount: 500, method: 'cash', recordedBy: adminUser._id as any });

  const afterPayment = await request(app)
    .put(`/api/v1/payments/set-fees/${student._id}`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ totalFees: 3000, discount: 0 });
  assert(afterPayment.status === 200, `edit after a partial payment succeeds (status ${afterPayment.status})`);

  const paidInvoiceStillActive = await Invoice.findById(activeInvoiceId).lean();
  assert((paidInvoiceStillActive as any)?.status !== 'void', `the invoice with a payment collected against it is left un-voided (got status "${(paidInvoiceStillActive as any)?.status}")`);
  assert((paidInvoiceStillActive as any)?.amountPaid === 500, `its collected payment is untouched (got ${(paidInvoiceStillActive as any)?.amountPaid})`);

  const activeManualAfterPayment = await Invoice.find({ student: student._id, title: 'Manual Fee Assignment', status: { $ne: 'void' } }).lean();
  assert(activeManualAfterPayment.length === 2, `the paid invoice (2000, unvoidable) plus a fresh one for the new edit (3000) both remain active (got ${activeManualAfterPayment.length})`);
  // Can't void the already-paid 2000 invoice, so this edit adds a new 3000
  // invoice alongside it rather than replacing it — the $500 already
  // collected is preserved (not lost, not double-counted), which is the
  // property this test guards; it does NOT make totalFeesDue a clean 3000
  // "absolute total" once a payment already exists on the prior one.
  assert(afterPayment.body?.data?.totalFeesDue === 1500 + 3000, `totalFeesDue = old invoice's remaining 1500 (2000 - 500 paid) + the new 3000 (got ${afterPayment.body?.data?.totalFeesDue})`);

  // -------------------------------------------------------------------
  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) {
    console.log('ALL CHECKS PASSED (0 failures)');
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
  }
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
