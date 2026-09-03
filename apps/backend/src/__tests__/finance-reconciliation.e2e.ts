/**
 * Finance reconciliation (bank/cash statement vs. ledger) — replaces the old
 * finance-reconciliation.contract.test.ts, which only grepped route/model/
 * service source files for literal substrings (e.g. asserting the string
 * "router.post('/', financialManager" appears) and used vitest, which isn't
 * installed in this repo — it never actually ran. This version drives the
 * real HTTP routes against a real posted ledger instead, so it verifies the
 * actual behavior (role gating, the "only reconcile at zero difference"
 * guard, tenant isolation) rather than the literal wording of the source.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:finance-reconciliation`.
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
  const { collectPaymentService } = await import('../services/billing.service');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });
  const schoolB = await School.create({
    name: 'Other School', organizationType: 'private', country: 'Somalia', city: 'Hargeisa',
    address: '2 St', phone: '+001', email: 'b@test.local', principalName: 'Principal B', establishedYear: 2021, createdBy: adminUser._id,
  });
  const orgAdmin = await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
  const orgAdminToken = tokenFor(orgAdmin._id.toString(), 'org_admin', school._id.toString());
  const orgAdminB = await User.create({ email: 'orgadminB@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });
  const orgAdminBToken = tokenFor(orgAdminB._id.toString(), 'org_admin', schoolB._id.toString());
  const cashier = await User.create({ email: 'cashier@test.local', password: 'Password123!', role: 'cashier', organizationId: school._id });
  const cashierToken = tokenFor(cashier._id.toString(), 'cashier', school._id.toString());

  const studentUser = await User.create({ email: 'student@test.local', password: 'Password123!', role: 'student' });
  const profile = await Profile.create({ user: studentUser._id, firstName: 'Hodan', lastName: 'Test', gender: 'female' });
  const student = await Student.create({ user: studentUser._id, profile: profile._id, studentId: 'TUSMO-702', school: school._id, status: 'active', approvalStatus: 'approved' });

  // Real cash collected against an ad-hoc invoice, so the Cash (1100) ledger
  // account carries a genuine $200 balance to reconcile against.
  await collectPaymentService({ studentId: student._id as any, schoolId: school._id, amount: 200, method: 'cash', recordedBy: adminUser._id as any });

  // -------------------------------------------------------------------
  section('RECONCILIABLE ACCOUNTS — only cash/bank/mobile-money/online show up');
  // -------------------------------------------------------------------
  const accountsRes = await request(app).get('/api/v1/finance/reconciliations/accounts').set('Authorization', `Bearer ${orgAdminToken}`);
  assert(accountsRes.status === 200, `accounts list succeeds (status ${accountsRes.status})`);
  const codes = (accountsRes.body?.data || []).map((a: any) => a.code).sort();
  assert(JSON.stringify(codes) === JSON.stringify(['1100', '1110', '1120', '1130']), `exactly the 4 cash-equivalent accounts, no AR/revenue accounts (got ${JSON.stringify(codes)})`);
  const cashAccount = (accountsRes.body?.data || []).find((a: any) => a.code === '1100');

  // -------------------------------------------------------------------
  section('PREVIEW — ledger balance for Cash matches the $200 actually collected');
  // -------------------------------------------------------------------
  const asOf = new Date(Date.now() + 60000).toISOString();
  const previewRes = await request(app)
    .get(`/api/v1/finance/reconciliations/preview/${cashAccount._id}`)
    .query({ asOf })
    .set('Authorization', `Bearer ${orgAdminToken}`);
  assert(previewRes.status === 200, `preview succeeds (status ${previewRes.status}, ${JSON.stringify(previewRes.body)})`);
  assert(previewRes.body?.data?.ledgerBalance === 200, `ledger balance is $200 (got ${previewRes.body?.data?.ledgerBalance})`);

  // -------------------------------------------------------------------
  section('ROLE GATING — cashier can read/preview but cannot create or complete a reconciliation');
  // -------------------------------------------------------------------
  const cashierPreviewRes = await request(app).get(`/api/v1/finance/reconciliations/preview/${cashAccount._id}`).query({ asOf }).set('Authorization', `Bearer ${cashierToken}`);
  assert(cashierPreviewRes.status === 200, `cashier can preview (financialRead) (got ${cashierPreviewRes.status})`);
  const cashierCreateRes = await request(app).post('/api/v1/finance/reconciliations').set('Authorization', `Bearer ${cashierToken}`).send({ accountId: cashAccount._id, asOf, statementBalance: 200 });
  assert(cashierCreateRes.status === 403, `cashier CANNOT create a reconciliation (financialManager only) (got ${cashierCreateRes.status})`);

  // -------------------------------------------------------------------
  section('MATCHING STATEMENT BALANCE — auto-reconciled with zero difference');
  // -------------------------------------------------------------------
  const matchRes = await request(app)
    .post('/api/v1/finance/reconciliations')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ accountId: cashAccount._id, asOf, statementBalance: 200, notes: 'Matches bank statement' });
  assert(matchRes.status === 201, `create with matching balance succeeds (status ${matchRes.status})`);
  assert(matchRes.body?.data?.difference === 0, `difference is 0 (got ${matchRes.body?.data?.difference})`);
  assert(matchRes.body?.data?.status === 'reconciled', `status is auto-set to reconciled (got ${matchRes.body?.data?.status})`);

  // -------------------------------------------------------------------
  section('MISMATCHED STATEMENT BALANCE — stays open, cannot be force-reconciled while a difference remains');
  // -------------------------------------------------------------------
  const mismatchRes = await request(app)
    .post('/api/v1/finance/reconciliations')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ accountId: cashAccount._id, asOf, statementBalance: 250, notes: 'Bank shows more than the ledger' });
  assert(mismatchRes.status === 201, `create with a mismatched balance still succeeds (status ${mismatchRes.status})`);
  assert(mismatchRes.body?.data?.difference === 50, `difference is 250 - 200 = 50 (got ${mismatchRes.body?.data?.difference})`);
  assert(mismatchRes.body?.data?.status === 'open', `status stays open, not auto-reconciled (got ${mismatchRes.body?.data?.status})`);

  const forceReconcileRes = await request(app)
    .post(`/api/v1/finance/reconciliations/${mismatchRes.body.data._id}/reconcile`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({});
  assert(forceReconcileRes.status === 400, `reconciling while the difference is nonzero is rejected (status ${forceReconcileRes.status})`);

  // -------------------------------------------------------------------
  section('LEDGER CATCHES UP — a further $50 collected brings the ledger to $250, now it reconciles');
  // -------------------------------------------------------------------
  await collectPaymentService({ studentId: student._id as any, schoolId: school._id, amount: 50, method: 'cash', recordedBy: adminUser._id as any });
  const reconcileRes = await request(app)
    .post(`/api/v1/finance/reconciliations/${mismatchRes.body.data._id}/reconcile`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ notes: 'Bank fee was a timing difference, resolved' });
  assert(reconcileRes.status === 200, `reconciling now that the ledger caught up to $250 succeeds (status ${reconcileRes.status}, ${JSON.stringify(reconcileRes.body)})`);
  assert(reconcileRes.body?.data?.difference === 0, `difference is now 0 (got ${reconcileRes.body?.data?.difference})`);
  assert(reconcileRes.body?.data?.status === 'reconciled', `status is now reconciled (got ${reconcileRes.body?.data?.status})`);

  // -------------------------------------------------------------------
  section('CROSS-ORG ISOLATION — a different school\'s org_admin sees none of this and cannot act on it');
  // -------------------------------------------------------------------
  const crossOrgListRes = await request(app).get('/api/v1/finance/reconciliations').set('Authorization', `Bearer ${orgAdminBToken}`);
  assert(crossOrgListRes.status === 200 && (crossOrgListRes.body?.data || []).length === 0, `a different org sees 0 reconciliations — no cross-org leak (got ${crossOrgListRes.body?.data?.length})`);

  const crossOrgReconcileRes = await request(app)
    .post(`/api/v1/finance/reconciliations/${matchRes.body.data._id}/reconcile`)
    .set('Authorization', `Bearer ${orgAdminBToken}`)
    .send({});
  assert(crossOrgReconcileRes.status === 404, `a different org cannot act on this org's reconciliation (got ${crossOrgReconcileRes.status})`);

  // -------------------------------------------------------------------
  section('LIST — both reconciliations show up for the owning org, newest first');
  // -------------------------------------------------------------------
  const listRes = await request(app).get('/api/v1/finance/reconciliations').set('Authorization', `Bearer ${orgAdminToken}`);
  assert(listRes.status === 200 && (listRes.body?.data || []).length === 2, `both reconciliations are listed (got ${listRes.body?.data?.length})`);

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
