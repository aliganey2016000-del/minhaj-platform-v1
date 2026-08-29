/**
 * POST /payments — reference field + real receiptNumber.
 *
 * Backs the Record Payment page redesign: admins recording a mobile-money
 * or bank-transfer payment need somewhere to put the transaction/slip
 * number, and the receipt shown after recording must use the app's own
 * server-generated receiptNumber (RCT-YYYY-<id>, unique) rather than a
 * client-fabricated id that could collide or drift from what's actually
 * stored.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:payment-reference`.
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
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Payment } = await import('../models/payment.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });
  const orgAdminToken = tokenFor(
    (await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id }))._id.toString(),
    'org_admin', school._id.toString()
  );

  const studentUser = await User.create({ email: 'leyla@test.local', password: 'Password123!', role: 'student' });
  const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'Leyla', lastName: 'Isaaq', gender: 'female' });
  const student = await Student.create({ user: studentUser._id, profile: studentProfile._id, school: school._id });

  // -------------------------------------------------------------------
  section('RECORD PAYMENT WITH REFERENCE — mobile money transaction code is accepted and persisted');
  // -------------------------------------------------------------------
  const res = await request(app)
    .post('/api/v1/payments')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ studentId: student._id.toString(), amount: 50, type: 'tuition', method: 'mobile_money', reference: 'EVC-2026-88213', notes: 'Walk-in payment' });
  assert(res.status === 201, `request succeeds (status ${res.status})`);
  const payment = res.body?.data?.payment;
  assert(payment?.reference === 'EVC-2026-88213', `reference is returned in the response (got "${payment?.reference}")`);
  assert(!!payment?.receiptNumber && /^RCT-\d{4}-[0-9a-f]{24}$/i.test(payment.receiptNumber), `a real, well-formed receiptNumber is returned (got "${payment?.receiptNumber}")`);

  const stored = await Payment.findById(payment._id).lean();
  assert((stored as any)?.reference === 'EVC-2026-88213', `reference is actually persisted in the DB (got "${(stored as any)?.reference}")`);
  assert((stored as any)?.receiptNumber === payment.receiptNumber, `stored receiptNumber matches what the API returned (got "${(stored as any)?.receiptNumber}")`);

  // -------------------------------------------------------------------
  section('RECORD PAYMENT WITHOUT REFERENCE — cash payment, reference is optional and defaults to empty');
  // -------------------------------------------------------------------
  const res2 = await request(app)
    .post('/api/v1/payments')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ studentId: student._id.toString(), amount: 30, type: 'tuition', method: 'cash' });
  assert(res2.status === 201, `cash payment with no reference still succeeds (status ${res2.status})`);
  assert(res2.body?.data?.payment?.reference === '', `reference defaults to an empty string, not undefined/null (got ${JSON.stringify(res2.body?.data?.payment?.reference)})`);

  // -------------------------------------------------------------------
  section('TWO PAYMENTS — receiptNumber is unique per payment, not reused');
  // -------------------------------------------------------------------
  assert(res.body?.data?.payment?.receiptNumber !== res2.body?.data?.payment?.receiptNumber, `the two payments got different receipt numbers (got "${res.body?.data?.payment?.receiptNumber}" and "${res2.body?.data?.payment?.receiptNumber}")`);

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
