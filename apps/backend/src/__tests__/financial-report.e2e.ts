/**
 * Financial reports (P&L, balance sheet) — replaces the old
 * financial-report.service.test.ts, which mocked JournalEntry/Account/
 * Invoice and never actually ran (this repo has no jest installed or
 * configured; that file couldn't execute at all). This version builds the
 * ledger for real through the normal billing flow (generate an invoice with
 * a discount baked in, collect a payment) and asserts on what the reports
 * compute from real posted journal entries — which also exercises
 * recalcStudentBalance's ledger-posting path end to end, including its
 * idempotency (a repeated recalc must not double-post or double-count).
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:financial-report`.
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
  const { default: FeeStructure } = await import('../models/fee-structure.model');
  const { default: JournalEntry } = await import('../models/journal-entry.model');

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
  const cashier = await User.create({ email: 'cashier@test.local', password: 'Password123!', role: 'cashier', organizationId: school._id });
  const cashierToken = tokenFor(cashier._id.toString(), 'cashier', school._id.toString());

  const studentUser = await User.create({ email: 'student@test.local', password: 'Password123!', role: 'student' });
  const profile = await Profile.create({ user: studentUser._id, firstName: 'Amina', lastName: 'Test', gender: 'female' });
  const student = await Student.create({ user: studentUser._id, profile: profile._id, studentId: 'TUSMO-701', school: school._id, status: 'active', approvalStatus: 'approved' });

  const structure = await FeeStructure.create({
    school: school._id, title: 'Tuition Fee', feeType: 'tuition', scopeType: 'school',
    amount: 500, billingCycle: 'annual', dueDayOffset: 14, createdBy: adminUser._id, isActive: true,
  });

  // -------------------------------------------------------------------
  section('BUILD REAL LEDGER — a discounted invoice, then a payment against it');
  // -------------------------------------------------------------------
  const grantRes = await request(app)
    .post('/api/v1/discount-grants')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ studentId: student._id.toString(), label: 'Sibling Discount', type: 'discount', durationType: 'standing', valueType: 'fixed', value: 50, reason: 'Second child enrolled' });
  assert(grantRes.status === 201, `discount grant created (status ${grantRes.status})`);

  const genRes = await request(app)
    .post('/api/v1/invoices/generate-bulk')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ feeStructureId: structure._id.toString(), period: 'Term 1' });
  assert(genRes.status === 201 && genRes.body?.data?.created === 1, `invoice generated for the student (status ${genRes.status}, ${JSON.stringify(genRes.body?.data)})`);

  const { default: Invoice } = await import('../models/invoice.model');
  const invoice: any = await Invoice.findOne({ student: student._id, period: 'Term 1' }).lean();
  assert(invoice?.amount === 500 && invoice?.discount === 50, `invoice is $500 gross with a $50 discount baked in (got amount=${invoice?.amount}, discount=${invoice?.discount})`);

  const payRes = await request(app)
    .post(`/api/v1/invoices/${invoice._id}/collect-payment`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ amount: 450, method: 'cash' });
  assert(payRes.status === 201, `payment of $450 (the remaining balance) collected (status ${payRes.status})`);

  // -------------------------------------------------------------------
  section('LEDGER IDEMPOTENCY — recalcStudentBalance runs again (e.g. a second payment attempt path) without double-posting');
  // -------------------------------------------------------------------
  const { recalcStudentBalance } = await import('../services/billing.service');
  await recalcStudentBalance(student._id as any);
  await recalcStudentBalance(student._id as any);
  const invoiceEntries = await JournalEntry.countDocuments({ school: school._id, sourceType: 'invoice', sourceId: invoice._id });
  assert(invoiceEntries === 1, `exactly 1 journal entry exists for the invoice after 3 total recalcs, not 3 (got ${invoiceEntries})`);

  // -------------------------------------------------------------------
  section('PROFIT & LOSS — revenue is the invoice gross, the discount is an expense, net income nets them out');
  // -------------------------------------------------------------------
  const plRes = await request(app)
    .get('/api/v1/finance/reports/profit-and-loss')
    .set('Authorization', `Bearer ${orgAdminToken}`);
  assert(plRes.status === 200, `P&L request succeeds (status ${plRes.status}, ${JSON.stringify(plRes.body)})`);
  assert(plRes.body?.data?.totalRevenue === 500, `totalRevenue is the invoice's gross $500 (got ${plRes.body?.data?.totalRevenue})`);
  assert(plRes.body?.data?.totalExpenses === 50, `totalExpenses is the $50 discount posted as "Discounts Allowed" (got ${plRes.body?.data?.totalExpenses})`);
  assert(plRes.body?.data?.netIncome === 450, `netIncome = 500 - 50 = 450 (got ${plRes.body?.data?.netIncome})`);

  // -------------------------------------------------------------------
  section('BALANCE SHEET — assets ($450 cash + $0 remaining receivable) balance against net income');
  // -------------------------------------------------------------------
  const bsRes = await request(app)
    .get('/api/v1/finance/reports/balance-sheet')
    .set('Authorization', `Bearer ${orgAdminToken}`);
  assert(bsRes.status === 200, `balance sheet request succeeds (status ${bsRes.status}, ${JSON.stringify(bsRes.body)})`);
  assert(bsRes.body?.data?.totalAssets === 450, `totalAssets is $450 cash (AR is fully settled at $0) (got ${bsRes.body?.data?.totalAssets})`);
  assert(bsRes.body?.data?.netIncome === 450, `balance sheet netIncome matches P&L's $450 (got ${bsRes.body?.data?.netIncome})`);
  assert(bsRes.body?.data?.balanced === true, `assets = liabilities + equity + net income (got balanced=${bsRes.body?.data?.balanced})`);

  // -------------------------------------------------------------------
  section('ROLE GATING — reports require financial read access, not just any authenticated user');
  // -------------------------------------------------------------------
  const noAuthRes = await request(app).get('/api/v1/finance/reports/profit-and-loss');
  assert(noAuthRes.status === 401, `no token -> 401 (got ${noAuthRes.status})`);

  const studentToken = tokenFor(studentUser._id.toString(), 'student');
  const studentRes = await request(app).get('/api/v1/finance/reports/profit-and-loss').set('Authorization', `Bearer ${studentToken}`);
  assert(studentRes.status === 403, `student role -> 403, reports are finance-staff only (got ${studentRes.status})`);

  const cashierRes = await request(app).get('/api/v1/finance/reports/profit-and-loss').set('Authorization', `Bearer ${cashierToken}`);
  assert(cashierRes.status === 200, `cashier CAN read reports (financialRead includes cashier) (got ${cashierRes.status})`);

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
