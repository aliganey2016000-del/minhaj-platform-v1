/**
 * Payment/invoice "paymentDate must be today (or within 30 days)" boundary —
 * school-local (Africa/Mogadishu) day, not the server's UTC day.
 *
 * The backend container runs with no TZ set (UTC). `recordPayment` and
 * `collectPayment` used to compute "today" as:
 *
 *   const today = new Date();
 *   today.setHours(0, 0, 0, 0);
 *
 * `setHours` truncates in the *server's* local timezone (UTC here), not the
 * school's (Africa/Mogadishu, UTC+3). Mogadishu is ahead of UTC, so for the
 * ~21:00-23:59:59 UTC window every day, Mogadishu's wall clock has already
 * rolled over to the next calendar day while the server's UTC "today" has
 * not. A school admin recording a payment with paymentDate = their own
 * today's date (Mogadishu-local) during that window would get
 * `parsedPaymentDate > today` (server's stale UTC "today") and the
 * perfectly valid, same-day payment was rejected as "future-dated".
 *
 * Fixed by anchoring "today" to the school's local calendar day via
 * utils/school-date.ts#todaySchoolDateOnly(), computed from the same
 * system clock but read through the Africa/Mogadishu timezone instead of
 * the server's own (UTC) one.
 *
 * This test freezes the system clock at 23:30 UTC (02:30 the next day in
 * Africa/Mogadishu) and confirms a payment dated "today" in Mogadishu is
 * accepted by both POST /payments and POST /invoices/:id/collect-payment.
 *
 * Runs against the shared test-db helper (MongoMemoryServer, or
 * TEST_MONGODB_URI/FerretDB for local verification).
 * Repeatable: `npm run test:payment-date-timezone-boundary`.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';

import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

/**
 * Known FerretDB-only gap (confirmed elsewhere in this test suite, not
 * re-litigated here): an aggregation-pipeline `findOneAndUpdate` — which
 * billing.service.ts's `applyInvoicePayment` uses — isn't supported by
 * FerretDB. Real MongoDB (CI) applies the payment and returns 2xx; against
 * local FerretDB this call fails *after* the date-boundary guard we're
 * actually testing, with this specific error. Treat it as a skip, not a
 * failure, of the "payment is actually applied" half of the assertion —
 * the half that matters here (the boundary guard did not reject it as
 * future-dated) is checked unconditionally below.
 */
function isKnownFerretDbAggregationGap(res: request.Response): boolean {
  return res.status === 500 && /Aggregation pipelines are not supported/i.test(JSON.stringify(res.body));
}

/**
 * Freezes `Date` (both `new Date()`/`new Date(x)` and `Date.now()`) at
 * `fixedNow` for the duration of `fn`, then restores the real Date class —
 * even if `fn` throws. Everything that reads the clock during `fn`
 * (JWT iat/exp, the controller's own `new Date()`, mongoose timestamps)
 * sees the same frozen instant, so the whole request is internally
 * consistent.
 */
async function withFrozenClock<T>(fixedNow: Date, fn: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(fixedNow.getTime());
      } else {
        // @ts-expect-error - spreading a variable-length constructor arg list
        super(...args);
      }
    }
    static now() { return fixedNow.getTime(); }
  }
  (global as any).Date = FrozenDate;
  try {
    return await fn();
  } finally {
    (global as any).Date = RealDate;
  }
}

async function main() {
  const db = await startTestDb('payment-date-tz-boundary');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Invoice } = await import('../models/invoice.model');
    const { todaySchoolDateOnly, dateOnlyLabelInTimezone } = await import('../utils/school-date');

    const admin = await User.create({ email: 'tzb-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Mogadishu Boundary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: 'tzb@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const studentUser = await User.create({ email: 'tzb-student@test.local', password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: studentUser._id, firstName: 'Nasra', lastName: 'Ahmed', gender: 'female' });
    const student = await Student.create({ user: studentUser._id, profile: profile._id, school: school._id });

    // ---------------------------------------------------------------------
    section('todaySchoolDateOnly: Mogadishu calendar day vs. the server\'s raw UTC day');
    // ---------------------------------------------------------------------
    // 23:30 UTC on a given date == 02:30 the NEXT day in Africa/Mogadishu (UTC+3).
    const frozenUtcNow = new Date('2026-10-04T23:30:00.000Z');
    const mogadishuLabel = dateOnlyLabelInTimezone(frozenUtcNow, 'Africa/Mogadishu');
    assert(mogadishuLabel === '2026-10-05', `Mogadishu wall-clock date for 23:30 UTC Oct 4 is Oct 5 (got ${mogadishuLabel})`);
    const schoolToday = todaySchoolDateOnly(frozenUtcNow, 'Africa/Mogadishu');
    assert(schoolToday.toISOString() === '2026-10-05T00:00:00.000Z', `todaySchoolDateOnly anchors to the Mogadishu day, not the UTC day (got ${schoolToday.toISOString()})`);
    const serverUtcToday = new Date(frozenUtcNow); serverUtcToday.setUTCHours(0, 0, 0, 0);
    assert(serverUtcToday.toISOString() === '2026-10-04T00:00:00.000Z', 'sanity: the server\'s raw UTC day is still Oct 4 at this instant');

    // ---------------------------------------------------------------------
    section('POST /payments — a Mogadishu-"today" paymentDate is accepted at the UTC day-boundary window');
    // ---------------------------------------------------------------------
    await withFrozenClock(frozenUtcNow, async () => {
      const orgAdmin = await User.create({ email: 'tzb-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
      const orgToken = generateAccessToken({ userId: orgAdmin._id.toString(), role: 'org_admin', permissions: [], organizationId: school._id.toString() });

      const invoiceForPayment = await Invoice.create({
        school: school._id, student: student._id, title: 'Term 1 Tuition (ad-hoc)', paymentType: 'tuition',
        period: 'Term 1', lineItems: [{ description: 'Tuition', amount: 40 }], generatedBy: orgAdmin._id,
        amount: 40, amountPaid: 0, dueDate: new Date('2026-10-20T00:00:00.000Z'), status: 'pending',
      });

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ studentId: student._id.toString(), invoiceId: invoiceForPayment._id.toString(), amount: 40, type: 'tuition', method: 'cash', paymentDate: '2026-10-05' });
      if (isKnownFerretDbAggregationGap(res)) {
        console.log('  SKIP payment application (known FerretDB gap: aggregation-pipeline findOneAndUpdate) — date-boundary guard already passed, checked below');
      } else {
        assert(res.status === 201, `payment dated "today" in Mogadishu (2026-10-05) is accepted at 23:30 UTC Oct 4 (got status ${res.status}, body: ${JSON.stringify(res.body?.message || res.body)})`);
      }

      // Before the fix, this same request would have failed with 400
      // "Payment date must be today or within the previous 30 days"
      // because parsedPaymentDate (Oct 5 00:00 UTC) > the server's stale
      // UTC "today" (Oct 4 00:00 UTC).
      assert(res.body?.message !== 'Payment date must be today or within the previous 30 days', 'the request was not rejected as future-dated');
    });

    // ---------------------------------------------------------------------
    section('POST /invoices/:id/collect-payment — same boundary, invoice collection path');
    // ---------------------------------------------------------------------
    await withFrozenClock(frozenUtcNow, async () => {
      const orgAdmin2 = await User.create({ email: 'tzb-org2@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
      const orgToken2 = generateAccessToken({ userId: orgAdmin2._id.toString(), role: 'org_admin', permissions: [], organizationId: school._id.toString() });

      const invoice = await Invoice.create({
        school: school._id, student: student._id, title: 'Term 1 Tuition', paymentType: 'tuition',
        period: 'Term 1', lineItems: [{ description: 'Tuition', amount: 100 }], generatedBy: orgAdmin2._id,
        amount: 100, amountPaid: 0, dueDate: new Date('2026-10-20T00:00:00.000Z'), status: 'pending',
      });

      const res = await request(app)
        .post(`/api/v1/invoices/${invoice._id}/collect-payment`)
        .set('Authorization', `Bearer ${orgToken2}`)
        .send({ amount: 25, method: 'cash', paymentDate: '2026-10-05' });
      if (isKnownFerretDbAggregationGap(res)) {
        console.log('  SKIP payment application (known FerretDB gap: aggregation-pipeline findOneAndUpdate) — date-boundary guard already passed, checked below');
      } else {
        assert(res.status === 201 || res.status === 200, `invoice payment dated "today" in Mogadishu is accepted at 23:30 UTC Oct 4 (got status ${res.status}, body: ${JSON.stringify(res.body?.message || res.body)})`);
      }
      assert(res.body?.message !== 'Payment date must be today or within the previous 30 days', 'the invoice collect-payment request was not rejected as future-dated');
    });

    // ---------------------------------------------------------------------
    section('POST /payments — a genuinely future-dated payment is still rejected');
    // ---------------------------------------------------------------------
    await withFrozenClock(frozenUtcNow, async () => {
      const orgAdmin3 = await User.create({ email: 'tzb-org3@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
      const orgToken3 = generateAccessToken({ userId: orgAdmin3._id.toString(), role: 'org_admin', permissions: [], organizationId: school._id.toString() });

      const invoiceForFuture = await Invoice.create({
        school: school._id, student: student._id, title: 'Term 1 Tuition (future check)', paymentType: 'tuition',
        period: 'Term 1', lineItems: [{ description: 'Tuition', amount: 10 }], generatedBy: orgAdmin3._id,
        amount: 10, amountPaid: 0, dueDate: new Date('2026-10-20T00:00:00.000Z'), status: 'pending',
      });

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${orgToken3}`)
        .send({ studentId: student._id.toString(), invoiceId: invoiceForFuture._id.toString(), amount: 10, type: 'tuition', method: 'cash', paymentDate: '2026-10-07' });
      assert(res.status === 400, `a payment dated two days ahead of Mogadishu "today" is still rejected (got status ${res.status})`);
    });
  } finally {
    await db.stop();
  }

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) {
    console.log('ALL CHECKS PASSED (0 failures)');
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
  }
  console.log('='.repeat(60));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
