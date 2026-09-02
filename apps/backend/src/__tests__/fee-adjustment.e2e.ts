/**
 * POST /fee-adjustments — one-time discount/waiver/scholarship grants against
 * a specific invoice (the "Discounts & Scholarships" admin page).
 *
 * A grant reduces the target invoice's `discount` field (fixed $ or % of the
 * invoice's gross amount), never touches amountPaid, is rejected once it
 * would exceed the invoice's remaining balance or hit a void invoice, and
 * immediately syncs Student.totalFees/totalFeesDue via recalcStudentBalance
 * — the same balance-sync gap fixed for invoice creation/void.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:fee-adjustment`.
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
  const { default: FeeAdjustment } = await import('../models/fee-adjustment.model');
  const { collectPaymentService } = await import('../services/billing.service');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });

  const schoolA = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });
  const schoolB = await School.create({
    name: 'Other School', organizationType: 'private', country: 'Somalia', city: 'Hargeisa',
    address: '2 St', phone: '+001', email: 'b@test.local', principalName: 'Principal B', establishedYear: 2021, createdBy: adminUser._id,
  });

  const orgAdminA = await User.create({ email: 'orgadminA@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
  const orgAdminAToken = tokenFor(orgAdminA._id.toString(), 'org_admin', schoolA._id.toString());
  const orgAdminB = await User.create({ email: 'orgadminB@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });
  const orgAdminBToken = tokenFor(orgAdminB._id.toString(), 'org_admin', schoolB._id.toString());

  async function makeStudent(studentId: string, firstName: string) {
    const u = await User.create({ email: `${studentId.toLowerCase()}@test.local`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: u._id, firstName, lastName: 'Test', gender: 'female' });
    return Student.create({ user: u._id, profile: profile._id, studentId, school: schoolA._id, status: 'active', approvalStatus: 'approved' });
  }

  const student1 = await makeStudent('TUSMO-301', 'Hodan');

  async function makeInvoice(amount: number, period: string) {
    return Invoice.create({
      student: student1._id, school: schoolA._id, title: 'Tuition Fee', period,
      lineItems: [{ description: 'Tuition', amount }], amount, status: 'pending',
      paymentType: 'tuition', dueDate: new Date(), issueDate: new Date(), generatedBy: adminUser._id,
    });
  }

  // -------------------------------------------------------------------
  section('FIXED DISCOUNT — reduces the invoice and syncs Student.totalFeesDue');
  // -------------------------------------------------------------------
  const invoice1 = await makeInvoice(500, 'Term 1');

  const discountRes = await request(app)
    .post('/api/v1/fee-adjustments')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ invoiceId: invoice1._id.toString(), type: 'discount', valueType: 'fixed', value: 100, reason: 'Sibling discount' });
  assert(discountRes.status === 201, `fixed discount succeeds (status ${discountRes.status}, ${JSON.stringify(discountRes.body)})`);
  assert(discountRes.body?.data?.adjustment?.amount === 100, `adjustment amount recorded as 100 (got ${discountRes.body?.data?.adjustment?.amount})`);
  assert(discountRes.body?.data?.invoice?.discount === 100, `invoice.discount is now 100 (got ${discountRes.body?.data?.invoice?.discount})`);

  const student1AfterDiscount: any = await Student.findById(student1._id).select('totalFees totalFeesDue').lean();
  assert(student1AfterDiscount?.totalFees === 500 && student1AfterDiscount?.totalFeesDue === 400, `student balance reflects the discount immediately (got ${JSON.stringify(student1AfterDiscount)})`);

  // -------------------------------------------------------------------
  section('PERCENT SCHOLARSHIP — computed off the invoice gross amount');
  // -------------------------------------------------------------------
  const invoice2 = await makeInvoice(1000, 'Term 2');
  const scholarshipRes = await request(app)
    .post('/api/v1/fee-adjustments')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ invoiceId: invoice2._id.toString(), type: 'scholarship', valueType: 'percent', value: 20, reason: 'Merit scholarship' });
  assert(scholarshipRes.status === 201, `percent scholarship succeeds (status ${scholarshipRes.status})`);
  assert(scholarshipRes.body?.data?.adjustment?.amount === 200, `20% of 1000 is applied as 200 (got ${scholarshipRes.body?.data?.adjustment?.amount})`);

  // -------------------------------------------------------------------
  section('OVER-APPLY — a discount exceeding the remaining balance is rejected');
  // -------------------------------------------------------------------
  const overRes = await request(app)
    .post('/api/v1/fee-adjustments')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ invoiceId: invoice1._id.toString(), type: 'waiver', valueType: 'fixed', value: 1000, reason: 'Too generous' });
  assert(overRes.status === 400, `over-apply is rejected (status ${overRes.status})`);
  const invoice1Unchanged = await Invoice.findById(invoice1._id).lean();
  assert((invoice1Unchanged as any)?.discount === 100, `invoice1 discount is untouched by the rejected attempt (got ${(invoice1Unchanged as any)?.discount})`);

  // -------------------------------------------------------------------
  section('VOIDED INVOICE — cannot grant a discount against it');
  // -------------------------------------------------------------------
  const invoice3 = await makeInvoice(300, 'Term 3');
  await Invoice.findByIdAndUpdate(invoice3._id, { status: 'void', voidedAt: new Date(), voidedBy: adminUser._id });
  const voidedRes = await request(app)
    .post('/api/v1/fee-adjustments')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ invoiceId: invoice3._id.toString(), type: 'waiver', valueType: 'fixed', value: 50, reason: 'Should fail' });
  assert(voidedRes.status === 400, `granting against a voided invoice is rejected (status ${voidedRes.status})`);

  // -------------------------------------------------------------------
  section('ALREADY-PAID PORTION IS SAFE — discount cannot eat into cash already collected');
  // -------------------------------------------------------------------
  const invoice4 = await makeInvoice(200, 'Term 4');
  await collectPaymentService({
    studentId: student1._id as any, schoolId: schoolA._id, invoiceId: invoice4._id,
    amount: 150, method: 'cash', recordedBy: adminUser._id as any,
  });
  const exceedsPaidRes = await request(app)
    .post('/api/v1/fee-adjustments')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ invoiceId: invoice4._id.toString(), type: 'discount', valueType: 'fixed', value: 60, reason: 'Exceeds remaining 50' });
  assert(exceedsPaidRes.status === 400, `discount exceeding the unpaid remainder (50) is rejected (status ${exceedsPaidRes.status})`);
  const okDiscountRes = await request(app)
    .post('/api/v1/fee-adjustments')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ invoiceId: invoice4._id.toString(), type: 'discount', valueType: 'fixed', value: 50, reason: 'Exactly the remainder' });
  assert(okDiscountRes.status === 201, `discount matching the exact unpaid remainder (50) succeeds (status ${okDiscountRes.status})`);

  // -------------------------------------------------------------------
  section('CROSS-ORG ACCESS — a different org_admin cannot grant against this student\'s invoice');
  // -------------------------------------------------------------------
  const invoice5 = await makeInvoice(400, 'Term 5');
  const crossOrgRes = await request(app)
    .post('/api/v1/fee-adjustments')
    .set('Authorization', `Bearer ${orgAdminBToken}`)
    .send({ invoiceId: invoice5._id.toString(), type: 'discount', valueType: 'fixed', value: 10, reason: 'Cross-org attempt' });
  assert(crossOrgRes.status === 403 || crossOrgRes.status === 404, `cross-org grant attempt is rejected (status ${crossOrgRes.status})`);

  // -------------------------------------------------------------------
  section('HISTORY — GET /fee-adjustments lists grants, org-scoped');
  // -------------------------------------------------------------------
  const historyRes = await request(app).get('/api/v1/fee-adjustments').set('Authorization', `Bearer ${orgAdminAToken}`);
  assert(historyRes.status === 200, `history list succeeds (status ${historyRes.status})`);
  assert((historyRes.body?.data || []).length === 3, `3 successful adjustments recorded for org A (got ${historyRes.body?.data?.length})`);

  const otherOrgHistoryRes = await request(app).get('/api/v1/fee-adjustments').set('Authorization', `Bearer ${orgAdminBToken}`);
  assert(otherOrgHistoryRes.status === 200 && (otherOrgHistoryRes.body?.data || []).length === 0, `a different org_admin sees 0 adjustments — no cross-org leak (got ${otherOrgHistoryRes.body?.data?.length})`);

  const dbCount = await FeeAdjustment.countDocuments({});
  assert(dbCount === 3, `exactly 3 FeeAdjustment documents exist in total (got ${dbCount})`);

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
