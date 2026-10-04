/**
 * Round 11 audit finding — createInstallmentPlan() validated a plan's total
 * against the invoice's GROSS `amount`, ignoring any discount already
 * applied to it (e.g. via POST /fee-adjustments -> applyInvoiceDiscount, or
 * a DiscountGrant applied at generation time). That meant an admin who,
 * correctly, built a plan summing to the invoice's real remaining balance
 * (amount - discount) got a "must total <gross>" rejection; and a plan that
 * WAS accepted (summed to the gross amount) could never be fully collected,
 * because applyInvoicePayment's own atomic guard caps total collection at
 * amount - discount — the final installment would sit partially paid
 * forever.
 *
 * Fixed in invoice.controller.ts's createInstallmentPlan: the required total
 * is now `invoice.amount - (invoice.discount || 0)`.
 *
 * NOTE: applyInvoiceDiscount/applyInvoicePayment (billing.service.ts) use an
 * aggregation-pipeline-style findOneAndUpdate for their atomic balance guard,
 * which this sandbox's FerretDB does not support ("Aggregation pipelines are
 * not supported yet") — a known gap, not a bug. So this test applies the
 * discount directly on the Invoice document (exactly the state a real
 * MongoDB deployment reaches after a real POST /fee-adjustments call) and
 * exercises the actual endpoint under test, POST /invoices/:id/installments,
 * against that state. The collect-payment follow-through that would also
 * depend on the aggregation-pipeline update is skipped with a note below.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import mongoose from 'mongoose';
import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function skip(label: string) { console.log(`  SKIP ${label}`); }
function section(title: string) { console.log(`\n=== ${title} ===`); }
function messageOf(response: any): string {
  return String(response.body?.message || response.body?.error?.message || response.text || '');
}

async function main() {
  const db = await startTestDb('installment-plan-discount-mismatch');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Invoice } = await import('../models/invoice.model');

    const admin = await User.create({ email: 'inst-discount-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Installment Discount School', institutionType: 'school', organizationType: 'school',
      ownershipType: 'private', attendanceType: 'class_based', country: 'Somalia', city: 'Mogadishu',
      address: '1 Discount Rd', phone: '+252610000055', email: 'inst-discount-school@test.local',
      principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const studentUser = await User.create({ email: 'inst-discount-student@test.local', password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: studentUser._id, firstName: 'Discount', lastName: 'Student', gender: 'male' });
    const student = await Student.create({
      user: studentUser._id, profile: profile._id, studentId: 'DISC-001', school: school._id,
      status: 'active', approvalStatus: 'approved',
    });
    const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [], organizationId: school._id.toString() });

    // -----------------------------------------------------------------------
    section('Invoice already carries a $200 discount (as a real POST /fee-adjustments call would leave it)');
    // -----------------------------------------------------------------------
    const invoice = await Invoice.create({
      student: student._id, school: school._id, title: 'Tuition - Term 1', period: 'Term 1, 2026-2027',
      lineItems: [{ description: 'Tuition', amount: 1000 }],
      amount: 1000, amountPaid: 0, discount: 200, status: 'partial', paymentType: 'tuition',
      dueDate: new Date('2027-01-31T00:00:00.000Z'), issueDate: new Date(), generatedBy: admin._id,
    });
    const netPayable = invoice.amount - invoice.discount;
    assert(netPayable === 800, `real remaining balance is $800 (got ${netPayable})`);

    // -----------------------------------------------------------------------
    section('A plan correctly summing to the real $800 balance must be ACCEPTED');
    // -----------------------------------------------------------------------
    const correctPlan = await request(app)
      .post(`/api/v1/invoices/${invoice._id}/installments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        installments: [
          { amount: 400, dueDate: '2026-11-01' },
          { amount: 400, dueDate: '2026-12-01' },
        ],
      });
    assert(
      correctPlan.status === 200,
      `a plan totaling the net $800 balance is accepted (status ${correctPlan.status}: ${messageOf(correctPlan)})`
    );
    const planTotal = (correctPlan.body?.data?.installments || []).reduce((sum: number, i: any) => sum + i.amount, 0);
    assert(Math.abs(planTotal - 800) < 0.01, `stored plan totals the net $800 balance (got ${planTotal})`);

    // -----------------------------------------------------------------------
    section('A plan summing to the GROSS amount (ignoring the discount) is rejected');
    // -----------------------------------------------------------------------
    const invoice2 = await Invoice.create({
      student: student._id, school: school._id, title: 'Tuition - Term 2', period: 'Term 2, 2026-2027',
      lineItems: [{ description: 'Tuition', amount: 1000 }],
      amount: 1000, amountPaid: 0, discount: 300, status: 'partial', paymentType: 'tuition',
      dueDate: new Date('2027-06-30T00:00:00.000Z'), issueDate: new Date(), generatedBy: admin._id,
    });

    const grossPlan = await request(app)
      .post(`/api/v1/invoices/${invoice2._id}/installments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        installments: [
          { amount: 500, dueDate: '2027-02-01' },
          { amount: 500, dueDate: '2027-04-01' },
        ],
      });
    assert(
      grossPlan.status === 400,
      `a plan totaling the GROSS $1000 amount (overstating the real $700 balance) is rejected (status ${grossPlan.status}: ${messageOf(grossPlan)})`
    );
    assert(/700/.test(messageOf(grossPlan)), `the rejection names the real $700 net balance, not the gross amount (${messageOf(grossPlan)})`);

    // -----------------------------------------------------------------------
    section('Collecting payment against the accepted net-balance plan (full round trip)');
    // -----------------------------------------------------------------------
    // applyInvoicePayment's atomic balance guard uses an aggregation-pipeline
    // findOneAndUpdate, which this sandbox's FerretDB rejects outright
    // ("Aggregation pipelines are not supported yet") regardless of this
    // fix — a known FerretDB gap (see file header), not exercised here.
    skip('full collect-payment round trip against FerretDB (aggregation-pipeline findOneAndUpdate unsupported — known FerretDB gap)');
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll installment-plan/discount checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
