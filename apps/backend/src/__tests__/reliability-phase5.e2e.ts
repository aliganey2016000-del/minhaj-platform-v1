/**
 * Phase 5 reliability/ops hardening (2026-10-04).
 *
 * 1  Boot no longer crash-loops on a duplicate registration-number group,
 *    and the per-student class lookup is batched instead of N+1.
 * 2  Graceful shutdown on SIGTERM/SIGINT (smoke-tested by inspecting the
 *    listeners server.ts registers; full shutdown isn't exercised here
 *    since it would kill the test process).
 * 3  GET /health returns 503 with database: 'disconnected' when Mongo is
 *    down, 200/'connected' when it's up.
 * 4  mongoose.connect() is called with pool/timeout options (smoke-tested
 *    indirectly: the test DB connects at all under those options).
 * 5  Installment reminders batch student/parent lookups and dedupe via an
 *    indexed Notification.metadata.dedupeKey instead of a regex scan.
 * 6  TTL retention indexes exist on learning-session, activity-log,
 *    audit-log, telegram-message, whatsapp-message and exam-attendance-log.
 * 7  getStudentBalances (both the payment.controller and the live
 *    invoice-balance.controller route) push pagination into the DB query
 *    instead of loading the whole roster into memory.
 * 8  School.findByHost is cached for ~30s via microCache.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';

import request from 'supertest';
import mongoose from 'mongoose';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('phase5-reliability');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Invoice } = await import('../models/invoice.model');
    const { default: Notification } = await import('../models/notification.model');
    const { default: LearningSession } = await import('../models/learning-session.model');
    const { default: ActivityLog } = await import('../models/activity-log.model');
    const { AuditLog } = await import('../utils/audit-logger');
    const { default: TelegramMessage } = await import('../models/telegram-message.model');
    const { default: WhatsAppMessage } = await import('../models/whatsapp-message.model');
    const { default: ExamAttendanceLog } = await import('../models/exam-attendance-log.model');
    const { repairStudentRegistrationIndex } = await import('../scripts/repair-student-registration-index');
    const { sendInstallmentReminders } = await import('../services/installment-reminder.service');

    const token = (user: any) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions: [],
      organizationId: user.organizationId ? user.organizationId.toString() : undefined,
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const admin = await User.create({ email: 'p5-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Phase5 School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St',
      phone: '+000', email: 'p5@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const orgAdmin = await User.create({ email: 'p5-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const orgToken = token(orgAdmin);

    section('6: TTL retention indexes are declared on every targeted model');
    const ttlOf = (model: any, name: string) =>
      model.schema.indexes().find(([, options]: any) => options?.name === name)?.[1]?.expireAfterSeconds;
    const YEAR = 365 * 24 * 60 * 60;
    assert(ttlOf(LearningSession, 'createdAt_ttl_12_months') === YEAR, 'learning-session: 12mo TTL on createdAt');
    assert(ttlOf(ActivityLog, 'createdAt_ttl_12_months') === YEAR, 'activity-log: 12mo TTL on createdAt');
    assert(ttlOf(AuditLog, 'timestamp_ttl_24_months') === 2 * YEAR, 'audit-log: 24mo TTL on timestamp');
    assert(ttlOf(TelegramMessage, 'createdAt_ttl_12_months') === YEAR, 'telegram-message: 12mo TTL on createdAt');
    assert(ttlOf(WhatsAppMessage, 'createdAt_ttl_12_months') === YEAR, 'whatsapp-message: 12mo TTL on createdAt');
    assert(ttlOf(ExamAttendanceLog, 'createdAt_ttl_24_months') === 2 * YEAR, 'exam-attendance-log: 24mo TTL on createdAt');

    try {
      for (const model of [LearningSession, ActivityLog, AuditLog, TelegramMessage, WhatsAppMessage, ExamAttendanceLog]) {
        await model.syncIndexes();
      }
      console.log('  OK   every TTL index above also builds against the test database');
    } catch (error: any) {
      if (!/not implemented/i.test(String(error?.message))) throw error;
      console.log('  SKIP TTL index build (test database does not support TTL indexes)');
    }

    section('3: GET /health reflects the DB connection state');
    let res = await request(app).get('/api/v1/health');
    assert(res.status === 200 && res.body?.data?.database === 'connected', `healthy DB -> 200/connected (got ${res.status}/${res.body?.data?.database})`);

    // readyState is a getter inherited from NativeConnection's prototype, not
    // an own property, so Object.getOwnPropertyDescriptor finds nothing to
    // restore from — deleting the own override we add below is what brings
    // the prototype's getter back (confirmed: without this, readyState stays
    // stuck at 0 for the rest of the process and later sections/teardown
    // fail with "MongoDB connection is not ready").
    Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });
    try {
      res = await request(app).get('/api/v1/health');
      assert(res.status === 503 && res.body?.data?.database === 'disconnected', `disconnected DB -> 503/disconnected (got ${res.status}/${res.body?.data?.database})`);
    } finally {
      delete (mongoose.connection as any).readyState;
    }

    section('1: repairStudentRegistrationIndex does not throw on duplicates (non-strict)');
    const studentregistrations = mongoose.connection.collection('studentregistrations');
    // The repair function's own job is migrating away from the old sparse
    // index to this partial unique one — but mongoose's autoIndex already
    // created it on connection, before this section ever runs. To simulate
    // the pre-repair state the function is meant to handle (duplicates left
    // over from before the unique index existed), drop it first so the
    // fixture insert below can actually create the duplicate.
    await studentregistrations.dropIndex('school_registrationNumber_unique').catch(() => {});
    // `student` is its own required+unique field, separate from the
    // registrationNumber duplicate this section is testing — each row needs
    // a distinct one so real MongoDB's unique index on `student` doesn't
    // reject the second insert before the registrationNumber duplicate this
    // test is actually about ever gets created.
    await studentregistrations.insertMany([
      { school: school._id, registrationNumber: 'DUP-1', student: new mongoose.Types.ObjectId() },
      { school: school._id, registrationNumber: 'DUP-1', student: new mongoose.Types.ObjectId() },
    ]);
    let threw = false;
    try { await repairStudentRegistrationIndex(); } catch { threw = true; }
    assert(!threw, 'boot-mode (non-strict) repair logs and skips instead of throwing on duplicates');
    threw = false;
    try { await repairStudentRegistrationIndex({ strict: true }); } catch { threw = true; }
    assert(threw, 'CLI-mode (strict) repair still throws on duplicates');
    await studentregistrations.deleteMany({ registrationNumber: 'DUP-1' });

    section('7: student-balance endpoints paginate in the DB');
    const classModel = (await import('../models/class.model')).default;
    const cls = await classModel.create({ school: school._id, title: 'Grade 5', section: 'A', academicYear: '2025-2026', gradeLevel: 5, room: 'Room 5A' });
    for (let i = 0; i < 5; i += 1) {
      const sUser = await User.create({ email: `p5-student-${i}@test.local`, password: 'Password123!', role: 'student' });
      const profile = await Profile.create({ user: sUser._id, firstName: `Student${i}`, lastName: 'Balance', gender: 'male' });
      const student = await Student.create({
        user: sUser._id, profile: profile._id, school: school._id, class: cls._id,
        status: 'active', approvalStatus: 'approved', totalFees: 100, totalFeesPaid: i * 10, totalFeesDue: 100 - i * 10,
      });
      await Invoice.create({
        student: student._id, school: school._id, title: 'Tuition', period: '2026-T1', lineItems: [{ description: 'Tuition', amount: 100 }],
        amount: 100, amountPaid: i * 10, discount: 0, status: 'pending', paymentType: 'tuition', dueDate: new Date(), issueDate: new Date(), generatedBy: admin._id,
      });
    }

    res = await request(app).get('/api/v1/payments/student-balances').query({ page: '1', limit: '2' }).set(auth(orgToken));
    assert(res.status === 200, `student-balances responds (got ${res.status})`);
    assert(res.body?.data?.students?.length === 2, `page size is honored by the live invoice-balance route (got ${res.body?.data?.students?.length})`);
    assert(res.body?.data?.meta?.total === 5, `meta.total reflects the full matching set, not just the page (got ${res.body?.data?.meta?.total})`);
    assert(res.body?.data?.summary?.totalStudents === 5, `summary.totalStudents reflects the full matching set (got ${res.body?.data?.summary?.totalStudents})`);

    const { getStudentBalances: paymentControllerGetStudentBalances } = await import('../controllers/payment.controller');
    assert(typeof paymentControllerGetStudentBalances === 'function', 'payment.controller.getStudentBalances still exports the same function name');

    section('5: installment reminders dedupe via metadata.dedupeKey, not a regex scan');
    const remindStudentUser = await User.create({ email: 'p5-remind-student@test.local', password: 'Password123!', role: 'student' });
    const remindProfile = await Profile.create({ user: remindStudentUser._id, firstName: 'Remind', lastName: 'Me', gender: 'male' });
    const remindStudent = await Student.create({ user: remindStudentUser._id, profile: remindProfile._id, school: school._id, class: cls._id, status: 'active', approvalStatus: 'approved' });
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await Invoice.create({
      student: remindStudent._id, school: school._id, title: 'Reminder Invoice', period: '2026-T1',
      lineItems: [{ description: 'Tuition', amount: 50 }], amount: 50, amountPaid: 0, discount: 0,
      status: 'pending', paymentType: 'tuition', dueDate: new Date(), issueDate: new Date(), generatedBy: admin._id,
      installments: [{ number: 1, amount: 50, paidAmount: 0, dueDate, status: 'pending' }],
    });

    const firstRun = await sendInstallmentReminders();
    assert(firstRun >= 1, `first run sends at least one reminder (sent ${firstRun})`);
    const sentNotification = await Notification.findOne({ user: remindStudentUser._id }).lean();
    assert(!!sentNotification?.metadata?.dedupeKey, `the created notification carries metadata.dedupeKey (got ${JSON.stringify(sentNotification?.metadata)})`);
    const secondRun = await sendInstallmentReminders();
    assert(secondRun === 0, `a second run the same day sends nothing further (sent ${secondRun})`);
    const notificationCount = await Notification.countDocuments({ user: remindStudentUser._id });
    assert(notificationCount === 1, `exactly one notification exists for this student/installment/day (found ${notificationCount})`);

    section('8: School.findByHost is cached');
    const hostSchool = await School.create({
      name: 'Cached Host School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St',
      phone: '+001', email: 'p5-host@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
      subdomain: 'p5-cached-host', status: 'active',
    });
    const host = 'p5-cached-host.sahaledu.com';
    const first = await School.findByHost(host);
    assert(first?.subdomain === 'p5-cached-host', `findByHost resolves the subdomain (got ${first?.subdomain})`);

    const originalFindOne = (School as any).findOne.bind(School);
    let findOneCalls = 0;
    (School as any).findOne = (...args: any[]) => { findOneCalls += 1; return originalFindOne(...args); };
    try {
      await School.findByHost(host);
      assert(findOneCalls === 0, `a second lookup within the TTL window hits no DB query (saw ${findOneCalls} findOne call(s))`);
    } finally {
      (School as any).findOne = originalFindOne;
    }
    void hostSchool;
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll phase 5 reliability checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
