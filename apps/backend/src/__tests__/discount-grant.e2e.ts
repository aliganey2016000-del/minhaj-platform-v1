/**
 * DiscountGrant — recurring/standing discount policies tied to a student
 * (not a specific invoice), auto-applied by invoice generation for as long
 * as they're within their validity window. Complements FeeAdjustment (a
 * one-time, invoice-scoped reduction granted by hand): a grant answers
 * "does this student get X% off every bill for some period," and both
 * generateBulk and the manual POST /invoices path look grants up and bake
 * the discount straight into the invoice at creation time.
 *
 * Covers all three durationType shapes described by the product ask:
 *  - 'standing'      — no expiry, applies until revoked (e.g. staff-child).
 *  - 'academic_year' — tied to one year, requires explicit re-grant next
 *                       year (e.g. a merit scholarship).
 *  - 'fixed_period'  — an explicit window that expires on its own (e.g. a
 *                       one-month hardship discount).
 * Also covers stacking (percent + fixed, summed and capped at the invoice's
 * gross amount) and that a revoked/expired grant stops applying going
 * forward without touching invoices already issued under it.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:discount-grant`.
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
  const { default: Invoice } = await import('../models/invoice.model');
  const { default: DiscountGrant } = await import('../models/discount-grant.model');

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

  const student1 = await makeStudent('TUSMO-401', 'Amina');
  const student2 = await makeStudent('TUSMO-402', 'Yusuf');

  const structure = await FeeStructure.create({
    school: schoolA._id, title: 'Tuition Fee', feeType: 'tuition', scopeType: 'school',
    amount: 1000, billingCycle: 'annual', dueDayOffset: 14, createdBy: adminUser._id, isActive: true,
  });

  // -------------------------------------------------------------------
  section('VALIDATION — durationType shapes are enforced');
  // -------------------------------------------------------------------
  const missingValidUntilRes = await request(app)
    .post('/api/v1/discount-grants')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ studentId: student1._id.toString(), label: 'Bad', type: 'discount', durationType: 'fixed_period', valueType: 'fixed', value: 50, reason: 'test' });
  assert(missingValidUntilRes.status === 400, `fixed_period without validUntil is rejected (status ${missingValidUntilRes.status})`);

  const missingAcademicYearRes = await request(app)
    .post('/api/v1/discount-grants')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ studentId: student1._id.toString(), label: 'Bad', type: 'scholarship', durationType: 'academic_year', valueType: 'percent', value: 20, validUntil: new Date(Date.now() + 86400000), reason: 'test' });
  assert(missingAcademicYearRes.status === 400, `academic_year without academicYear is rejected (status ${missingAcademicYearRes.status})`);

  const overPercentRes = await request(app)
    .post('/api/v1/discount-grants')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ studentId: student1._id.toString(), label: 'Bad', type: 'discount', durationType: 'standing', valueType: 'percent', value: 150, reason: 'test' });
  assert(overPercentRes.status === 400, `percent > 100 is rejected (status ${overPercentRes.status})`);

  // -------------------------------------------------------------------
  section('STANDING GRANT — no expiry, applies to bulk-generated invoices immediately');
  // -------------------------------------------------------------------
  const standingRes = await request(app)
    .post('/api/v1/discount-grants')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ studentId: student1._id.toString(), label: 'Staff Child Discount', type: 'discount', durationType: 'standing', valueType: 'percent', value: 10, reason: 'Parent is faculty' });
  assert(standingRes.status === 201, `standing grant created (status ${standingRes.status}, ${JSON.stringify(standingRes.body)})`);
  assert(standingRes.body?.data?.validUntil === null, `standing grant has no validUntil (got ${standingRes.body?.data?.validUntil})`);
  const standingGrantId = standingRes.body?.data?._id;

  const genRes1 = await request(app)
    .post('/api/v1/invoices/generate-bulk')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ feeStructureId: structure._id.toString(), period: 'Term 1' });
  assert(genRes1.status === 201, `generate-bulk succeeds (status ${genRes1.status})`);

  const invoice1: any = await Invoice.findOne({ student: student1._id, period: 'Term 1' }).lean();
  assert(invoice1?.discount === 100, `10% of 1000 is auto-applied as a 100 discount (got ${invoice1?.discount})`);
  assert(invoice1?.status === 'partial', `invoice status reflects the partial discount (got ${invoice1?.status})`);
  assert((invoice1?.appliedDiscountGrants || []).length === 1 && invoice1.appliedDiscountGrants[0].toString() === standingGrantId, `invoice records provenance back to the grant`);

  const invoice1ForStudent2: any = await Invoice.findOne({ student: student2._id, period: 'Term 1' }).lean();
  assert(invoice1ForStudent2?.discount === 0, `student2 (no grant) gets a full-price invoice (got ${invoice1ForStudent2?.discount})`);

  // -------------------------------------------------------------------
  section('STACKING — a second (fixed) grant stacks on top of the standing percent grant');
  // -------------------------------------------------------------------
  const fixedRes = await request(app)
    .post('/api/v1/discount-grants')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ studentId: student1._id.toString(), label: 'Sibling Discount', type: 'discount', durationType: 'standing', valueType: 'fixed', value: 50, reason: 'Second child enrolled' });
  assert(fixedRes.status === 201, `second standing grant created (status ${fixedRes.status})`);

  const genRes2 = await request(app)
    .post('/api/v1/invoices/generate-bulk')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ feeStructureId: structure._id.toString(), period: 'Term 2' });
  assert(genRes2.status === 201, `second generate-bulk succeeds (status ${genRes2.status})`);
  const invoice2: any = await Invoice.findOne({ student: student1._id, period: 'Term 2' }).lean();
  assert(invoice2?.discount === 150, `10% (100) + fixed 50 stack to a 150 discount (got ${invoice2?.discount})`);
  assert((invoice2?.appliedDiscountGrants || []).length === 2, `invoice records provenance back to both grants (got ${invoice2?.appliedDiscountGrants?.length})`);

  // -------------------------------------------------------------------
  section('FIXED-PERIOD GRANT — an already-expired window never applies');
  // -------------------------------------------------------------------
  const expiredRes = await request(app)
    .post('/api/v1/discount-grants')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({
      studentId: student2._id.toString(), label: 'Ramadan Hardship Relief', type: 'waiver', durationType: 'fixed_period', valueType: 'percent', value: 25,
      validFrom: new Date(Date.now() - 60 * 86400000), validUntil: new Date(Date.now() - 30 * 86400000), reason: 'Temporary hardship',
    });
  assert(expiredRes.status === 201, `fixed_period grant with a past window is still created (status ${expiredRes.status})`);

  const genRes3 = await request(app)
    .post('/api/v1/invoices/generate-bulk')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ feeStructureId: structure._id.toString(), period: 'Term 3' });
  assert(genRes3.status === 201, `third generate-bulk succeeds (status ${genRes3.status})`);
  const invoice3ForStudent2: any = await Invoice.findOne({ student: student2._id, period: 'Term 3' }).lean();
  assert(invoice3ForStudent2?.discount === 0, `an already-expired grant is never applied (got ${invoice3ForStudent2?.discount})`);

  // -------------------------------------------------------------------
  section('MANUAL INVOICE CREATE — POST /invoices also picks up active grants');
  // -------------------------------------------------------------------
  const manualRes = await request(app)
    .post('/api/v1/invoices')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({
      studentId: student1._id.toString(), title: 'Registration Fee', period: 'Ad-hoc',
      lineItems: [{ description: 'Registration', amount: 200 }], dueDate: new Date(),
    });
  assert(manualRes.status === 201, `manual invoice create succeeds (status ${manualRes.status})`);
  assert(manualRes.body?.data?.discount === 70, `manual invoice also gets the 10% + 50 fixed stack (20 + 50 = 70) applied (got ${manualRes.body?.data?.discount})`);

  // -------------------------------------------------------------------
  section('REVOKE — a revoked grant stops applying going forward, but leaves past invoices alone');
  // -------------------------------------------------------------------
  const revokeRes = await request(app)
    .patch(`/api/v1/discount-grants/${standingGrantId}/revoke`)
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ reason: 'Parent no longer on staff' });
  assert(revokeRes.status === 200, `revoke succeeds (status ${revokeRes.status})`);

  const invoice2AfterRevoke: any = await Invoice.findOne({ student: student1._id, period: 'Term 2' }).lean();
  assert(invoice2AfterRevoke?.discount === 150, `invoice already issued under the grant is untouched by revoke (got ${invoice2AfterRevoke?.discount})`);

  const genRes4 = await request(app)
    .post('/api/v1/invoices/generate-bulk')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ feeStructureId: structure._id.toString(), period: 'Term 4' });
  assert(genRes4.status === 201, `fourth generate-bulk succeeds (status ${genRes4.status})`);
  const invoice4: any = await Invoice.findOne({ student: student1._id, period: 'Term 4' }).lean();
  assert(invoice4?.discount === 50, `only the still-active fixed grant (50) applies after the percent grant was revoked (got ${invoice4?.discount})`);

  const revokeAgainRes = await request(app)
    .patch(`/api/v1/discount-grants/${standingGrantId}/revoke`)
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ reason: 'Duplicate attempt' });
  assert(revokeAgainRes.status === 400, `revoking an already-revoked grant is rejected (status ${revokeAgainRes.status})`);

  // -------------------------------------------------------------------
  section('CROSS-ORG ACCESS — a different org_admin cannot grant against or revoke this student\'s grant');
  // -------------------------------------------------------------------
  const crossOrgCreateRes = await request(app)
    .post('/api/v1/discount-grants')
    .set('Authorization', `Bearer ${orgAdminBToken}`)
    .send({ studentId: student1._id.toString(), label: 'Cross-org attempt', type: 'discount', durationType: 'standing', valueType: 'fixed', value: 10, reason: 'Should fail' });
  assert(crossOrgCreateRes.status === 403 || crossOrgCreateRes.status === 404, `cross-org grant creation is rejected (status ${crossOrgCreateRes.status})`);

  const crossOrgRevokeRes = await request(app)
    .patch(`/api/v1/discount-grants/${standingGrantId}/revoke`)
    .set('Authorization', `Bearer ${orgAdminBToken}`)
    .send({ reason: 'Should fail' });
  assert(crossOrgRevokeRes.status === 403, `cross-org revoke attempt is rejected (status ${crossOrgRevokeRes.status})`);

  // -------------------------------------------------------------------
  section('HISTORY — GET /discount-grants lists grants, org-scoped, with a derived effectiveStatus');
  // -------------------------------------------------------------------
  const historyRes = await request(app).get('/api/v1/discount-grants').set('Authorization', `Bearer ${orgAdminAToken}`);
  assert(historyRes.status === 200, `history list succeeds (status ${historyRes.status})`);
  const historyRows = historyRes.body?.data || [];
  assert(historyRows.length === 3, `3 grants recorded for org A (got ${historyRows.length})`);
  const revokedRow = historyRows.find((g: any) => g._id === standingGrantId);
  assert(revokedRow?.effectiveStatus === 'revoked', `revoked grant reports effectiveStatus 'revoked' (got ${revokedRow?.effectiveStatus})`);

  const otherOrgHistoryRes = await request(app).get('/api/v1/discount-grants').set('Authorization', `Bearer ${orgAdminBToken}`);
  assert(otherOrgHistoryRes.status === 200 && (otherOrgHistoryRes.body?.data || []).length === 0, `a different org_admin sees 0 grants — no cross-org leak (got ${otherOrgHistoryRes.body?.data?.length})`);

  const dbCount = await DiscountGrant.countDocuments({});
  assert(dbCount === 3, `exactly 3 DiscountGrant documents exist in total (got ${dbCount})`);

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
