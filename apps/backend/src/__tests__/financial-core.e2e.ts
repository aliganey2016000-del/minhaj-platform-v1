process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Invoice } = await import('../models/invoice.model');
  const { default: Payment } = await import('../models/payment.model');
  const { collectPaymentService, recalcStudentBalance } = await import('../services/billing.service');

  const admin = await User.create({ email: 'finance@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Financial Core Test School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 Test St', phone: '+000', email: 'finance@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: admin._id,
  });
  const studentUser = await User.create({ email: 'student-finance@test.local', password: 'Password123!', role: 'student' });
  const profile = await Profile.create({ user: studentUser._id, firstName: 'Test', lastName: 'Student', gender: 'male' });
  const student = await Student.create({ user: studentUser._id, profile: profile._id, school: school._id });

  const invoice = await Invoice.create({
    student: student._id, school: school._id, title: 'Tuition', period: '2026-T1',
    lineItems: [{ description: 'Tuition', amount: 100 }], amount: 100, amountPaid: 0,
    discount: 0, status: 'pending', paymentType: 'tuition', dueDate: new Date(), issueDate: new Date(), generatedBy: admin._id,
  });

  const first = await collectPaymentService({
    studentId: student._id, schoolId: school._id, invoiceId: invoice._id,
    amount: 100, discount: 20, method: 'cash', type: 'tuition', recordedBy: admin._id,
    idempotencyKey: 'financial-core-test-1',
  });

  assert(first.invoice.amountPaid === 80, 'cash received is stored separately from discount');
  assert(first.invoice.discount === 20, 'invoice discount is recorded explicitly');
  assert((first.invoice as any).amountDue === 0, 'discount + payment fully settles the invoice');
  assert(first.payment.effectiveAmount === 80, 'payment effective amount equals amount minus discount');

  const replay = await collectPaymentService({
    studentId: student._id, schoolId: school._id, invoiceId: invoice._id,
    amount: 100, discount: 20, method: 'cash', type: 'tuition', recordedBy: admin._id,
    idempotencyKey: 'financial-core-test-1',
  });
  assert(replay.payment._id.toString() === first.payment._id.toString(), 'idempotent retry returns the original payment');
  assert(await Payment.countDocuments({ idempotencyKey: 'financial-core-test-1' }) === 1, 'idempotent retry cannot create a duplicate payment');

  const { default: Refund } = await import('../models/refund.model');
  const { reverseInvoicePayment, recalcStudentBalance } = await import('../services/billing.service');
  const payment = await Payment.findById(first.payment._id)!;

  await reverseInvoicePayment(payment.invoice!, 30);
  await Payment.findByIdAndUpdate(payment._id, { $inc: { refundedAmount: 30 } });
  await Refund.create({ payment: payment._id, invoice: payment.invoice, student: student._id, school: school._id, amount: 30, reason: 'Test partial refund', status: 'completed', processedBy: admin._id });
  await recalcStudentBalance(student._id);

  const afterPartial = await Invoice.findById(invoice._id);
  const afterPartialPayment = await Payment.findById(payment._id);
  assert(afterPartial?.amountPaid === 50, 'partial refund reverses only the refunded cash');
  assert(afterPartial?.discount === 20, 'refund does not erase the approved discount');
  assert(afterPartialPayment?.refundedAmount === 30, 'payment tracks cumulative refunded amount');

  await reverseInvoicePayment(payment.invoice!, 50);
  await Payment.findByIdAndUpdate(payment._id, { $inc: { refundedAmount: 50 }, $set: { status: 'refunded' } });
  await Refund.create({ payment: payment._id, invoice: payment.invoice, student: student._id, school: school._id, amount: 50, reason: 'Test final refund', status: 'completed', processedBy: admin._id });
  await recalcStudentBalance(student._id);

  const finalInvoice = await Invoice.findById(invoice._id);
  const finalPayment = await Payment.findById(payment._id);
  assert(finalInvoice?.amountPaid === 0, 'full refund removes all cash paid');
  assert(finalInvoice?.discount === 20, 'full refund leaves the discount intact');
  assert((finalInvoice as any)?.amountDue === 80, 'remaining balance after full cash refund is correct');
  assert(finalPayment?.status === 'refunded' && finalPayment?.refundedAmount === 80, 'fully refunded payment is marked refunded');
  assert((await Refund.countDocuments({ payment: payment._id })) === 2, 'multiple partial refunds remain individually auditable');

  let rejected = false;
  try {
    await collectPaymentService({ studentId: student._id, schoolId: school._id, invoiceId: invoice._id, amount: 50, discount: 60, recordedBy: admin._id });
  } catch (_) { rejected = true; }
  assert(rejected, 'invalid discount greater than payment is rejected');

  await recalcStudentBalance(student._id);
  const balancedStudent = await Student.findById(student._id).select('totalFeesPaid totalFeesDue').lean();
  assert((balancedStudent as any)?.totalFeesPaid === 0, 'student paid rollup matches refunded invoice cash');
  assert((balancedStudent as any)?.totalFeesDue === 80, 'student due rollup includes gross less discount less paid');

  await mongoose.disconnect();
  await mongod.stop();
  console.log(`\nFinancial core checks: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
