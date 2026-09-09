process.env.JWT_ACCESS_SECRET = 'installment-test-access-secret';
process.env.JWT_REFRESH_SECRET = 'installment-test-refresh-secret';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: School } = await import('../models/school.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: Invoice } = await import('../models/invoice.model');

  const admin = await User.create({ email: 'installment-admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Installment Test School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 Test St', phone: '+000', email: 'installment@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: admin._id,
  });
  const studentUser = await User.create({ email: 'installment-student@test.local', password: 'Password123!', role: 'student' });
  const profile = await Profile.create({ user: studentUser._id, firstName: 'Installment', lastName: 'Student', gender: 'male' });
  const student = await Student.create({ user: studentUser._id, profile: profile._id, studentId: 'INST-001', school: school._id, status: 'active', approvalStatus: 'approved' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });

  const invoice = await Invoice.create({
    student: student._id, school: school._id, title: 'MATH - Semester 1', period: 'Semester 1, 2026-2027',
    lineItems: [{ description: 'Tuition', amount: 240 }, { description: 'Other charges', amount: 29.99 }],
    amount: 269.99, amountPaid: 0, discount: 0, status: 'pending', paymentType: 'tuition',
    dueDate: new Date('2027-08-31T00:00:00.000Z'), issueDate: new Date(), generatedBy: admin._id,
  });

  const plan = [
    { amount: 90, dueDate: '2026-10-01' },
    { amount: 90, dueDate: '2026-11-01' },
    { amount: 89.99, dueDate: '2026-12-01' },
  ];

  const createPlan = await request(app)
    .post(`/api/v1/invoices/${invoice._id}/installments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ installments: plan });
  assert(createPlan.status === 200, `pending invoice accepts a payment plan (status ${createPlan.status})`);
  assert(createPlan.body?.data?.installments?.length === 3, 'plan stores all three installments');
  assert(Math.abs(createPlan.body.data.installments.reduce((sum: number, item: any) => sum + item.amount, 0) - 269.99) < 0.01, 'installments total equals invoice amount');

  const duplicate = await request(app)
    .post(`/api/v1/invoices/${invoice._id}/installments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ installments: plan });
  assert(duplicate.status === 400, 'duplicate payment plan is rejected');

  const payment = await request(app)
    .post(`/api/v1/invoices/${invoice._id}/collect-payment`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 30, method: 'cash', paymentDate: '2026-09-09' });
  assert(payment.status === 201, `partial payment against planned invoice succeeds (status ${payment.status})`);

  const afterPayment: any = await Invoice.findById(invoice._id).lean();
  assert(afterPayment?.status === 'partial', 'invoice becomes partial after first installment payment');
  assert(afterPayment?.amountPaid === 30, 'invoice records the $30 payment');
  assert(afterPayment?.installments?.[0]?.paidAmount === 30, 'existing payment is allocated to installment one');
  assert(afterPayment?.installments?.[0]?.status === 'partial', 'installment one becomes partial');
  assert(afterPayment?.installments?.[1]?.paidAmount === 0 && afterPayment?.installments?.[1]?.status === 'pending', 'later installments remain pending');

  const invalidTotal = await Invoice.create({
    student: student._id, school: school._id, title: 'Invalid Plan Invoice', period: 'Invalid Period',
    lineItems: [{ description: 'Tuition', amount: 100 }], amount: 100, amountPaid: 0, discount: 0, status: 'pending', paymentType: 'tuition',
    dueDate: new Date(), issueDate: new Date(), generatedBy: admin._id,
  });
  const invalid = await request(app)
    .post(`/api/v1/invoices/${invalidTotal._id}/installments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ installments: [{ amount: 50, dueDate: '2026-10-01' }, { amount: 40, dueDate: '2026-11-01' }] });
  assert(invalid.status === 400, 'plan with a mismatched total is rejected');

  await mongoose.disconnect();
  await mongod.stop();
  console.log(`\nInstallment plan checks: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
