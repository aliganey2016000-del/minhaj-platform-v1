/**
 * Invoice batch listing + bulk void — the "undo a mistaken bulk generate"
 * flow added behind the invoices-manage.tsx header's three-dot menu.
 *
 * GET /invoices/batches groups invoices by their generate-bulk batchId so an
 * admin can find a specific run (fee structure/period/count) to undo. POST
 * /invoices/batches/:batchId/void voids every invoice in that batch that has
 * NO payment collected yet, and explicitly SKIPS (never touches) any invoice
 * in the same batch that already has a payment — matching the existing
 * single-invoice voidInvoice safety rule. There is still no hard-delete for
 * Invoice; this is deliberately a bulk void, not a bulk delete.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:invoice-batch-void`.
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
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: FeeStructure } = await import('../models/fee-structure.model');
  const { default: Invoice } = await import('../models/invoice.model');
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

  const dept = await Department.create({ name: 'Grade 9', tenantId: schoolA._id });
  const cls = await ClassModel.create({
    school: schoolA._id, department: dept._id, title: 'Grade 9', section: 'A', room: 'Classroom 1',
    gradeLevel: 9, academicYear: '2026/27', status: 'active',
  });

  async function makeStudent(studentId: string, firstName: string) {
    const u = await User.create({ email: `${studentId.toLowerCase()}@test.local`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: u._id, firstName, lastName: 'Test', gender: 'female' });
    return Student.create({ user: u._id, profile: profile._id, studentId, school: schoolA._id, class: cls._id, department: 'Middle School', status: 'active', approvalStatus: 'approved' });
  }

  const student1 = await makeStudent('TUSMO-201', 'Hibo');
  const student2 = await makeStudent('TUSMO-202', 'Deeqa');

  const structure = await FeeStructure.create({
    school: schoolA._id, title: 'Tuition Fee', feeType: 'tuition', scopeType: 'school',
    amount: 120, billingCycle: 'annual', dueDayOffset: 14, createdBy: adminUser._id, isActive: true,
  });

  // -------------------------------------------------------------------
  section('GENERATE — bulk-create invoices for both students in one batch');
  // -------------------------------------------------------------------
  const genRes = await request(app)
    .post('/api/v1/invoices/generate-bulk')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ feeStructureId: structure._id.toString(), period: 'Academic Year 2026-2027' });
  assert(genRes.status === 201, `generate-bulk succeeds (status ${genRes.status})`);
  assert(genRes.body?.data?.created === 2, `2 invoices created (got ${JSON.stringify(genRes.body?.data)})`);
  const batchId = genRes.body?.data?.batchId;
  assert(!!batchId, `batchId returned (got ${batchId})`);

  // Simulate the admin realizing student1 already paid in the meantime.
  const invoices = await Invoice.find({ batchId }).lean();
  const paidInvoice: any = invoices.find((i: any) => i.student.toString() === (student1._id as any).toString());
  await collectPaymentService({
    studentId: student1._id as any, schoolId: schoolA._id, invoiceId: paidInvoice._id,
    amount: 120, method: 'cash', recordedBy: adminUser._id as any,
  });

  // -------------------------------------------------------------------
  section('BATCHES LIST — org_admin sees the batch, scoped to their own school');
  // -------------------------------------------------------------------
  const batchesRes = await request(app).get('/api/v1/invoices/batches').set('Authorization', `Bearer ${orgAdminAToken}`);
  assert(batchesRes.status === 200, `batches list succeeds (status ${batchesRes.status})`);
  const batch = (batchesRes.body?.data || []).find((b: any) => b.batchId === batchId);
  assert(!!batch, `the generated batch appears in the list`);
  assert(batch?.count === 2, `batch reports 2 total invoices (got ${batch?.count})`);
  assert(batch?.voidableCount === 1, `batch reports only 1 voidable invoice (the unpaid one) — got ${batch?.voidableCount}`);

  const otherBatchesRes = await request(app).get('/api/v1/invoices/batches').set('Authorization', `Bearer ${orgAdminBToken}`);
  assert(otherBatchesRes.status === 200 && (otherBatchesRes.body?.data || []).length === 0, `a DIFFERENT org_admin sees 0 batches — no cross-org leak (got ${otherBatchesRes.body?.data?.length})`);

  // -------------------------------------------------------------------
  section('CROSS-ORG VOID ATTEMPT — a different org_admin cannot void this batch');
  // -------------------------------------------------------------------
  const crossVoidRes = await request(app).post(`/api/v1/invoices/batches/${batchId}/void`).set('Authorization', `Bearer ${orgAdminBToken}`).send({});
  assert(crossVoidRes.status === 404, `cross-org void attempt is rejected as not found (status ${crossVoidRes.status})`);
  const stillActive = await Invoice.find({ batchId, status: { $ne: 'void' } }).countDocuments();
  assert(stillActive === 2, `nothing was voided by the cross-org attempt (got ${stillActive} still active)`);

  // -------------------------------------------------------------------
  section('BULK VOID — owning org_admin voids the batch, paid invoice is skipped');
  // -------------------------------------------------------------------
  const voidRes = await request(app).post(`/api/v1/invoices/batches/${batchId}/void`).set('Authorization', `Bearer ${orgAdminAToken}`).send({});
  assert(voidRes.status === 200, `bulk void succeeds (status ${voidRes.status})`);
  assert(voidRes.body?.data?.voided === 1, `1 invoice voided (got ${voidRes.body?.data?.voided})`);
  assert(voidRes.body?.data?.skippedWithPayments === 1, `1 invoice skipped because it already has a payment (got ${voidRes.body?.data?.skippedWithPayments})`);

  const afterInvoices = await Invoice.find({ batchId }).lean();
  const voidedOne: any = afterInvoices.find((i: any) => i.student.toString() === (student2._id as any).toString());
  const paidOne: any = afterInvoices.find((i: any) => i.student.toString() === (student1._id as any).toString());
  assert(voidedOne?.status === 'void', `the unpaid invoice is now void (got status="${voidedOne?.status}")`);
  assert(paidOne?.status === 'paid' && paidOne?.amountPaid === 120, `the paid invoice was left untouched (status="${paidOne?.status}", amountPaid=${paidOne?.amountPaid})`);

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
