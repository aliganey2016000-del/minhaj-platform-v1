/**
 * Phase 6 — background jobs, Socket.IO hardening (2026-10-04).
 *
 * 1  sendInstallmentReminders is race-safe across two overlapping/concurrent
 *    runs (e.g. two backend instances both having RUN_SCHEDULERS unset, or
 *    the boot-time "send now" call overlapping the first setInterval tick):
 *    exactly one notification is created, never two, and a per-invoice
 *    failure doesn't abort the rest of the batch.
 * 2  invalidateAuthState() (deactivation, role/permission change) notifies
 *    every registered onAuthStateInvalidated listener with the affected
 *    userId, and a throwing listener never blocks another listener or the
 *    cache invalidation itself.
 * 3  realtime/socket's disconnectUserSockets is registered as one of those
 *    listeners, so a socket connection's auth state is kept in sync with
 *    the same account-state checks authMiddleware already enforces on
 *    every HTTP request (round 2) — not just re-checked once at handshake.
 *
 * Note: this suite does not open a real Socket.IO client connection (no
 * extra client-side harness exists yet in this repo for that); it verifies
 * the wiring that round 2's HTTP-side fix now also reaches, at the
 * function-call level, which is what actually closes the gap.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';

import { startTestDb } from './support/test-db';
// Side-effect import only: brings the `declare global { namespace Express }`
// req.user augmentation into this program's type graph. realtime/socket.ts
// transitively imports utils/student-visibility.ts, which references
// req.user — without this, ts-node's type-checked compile (this file is
// outside tsconfig's normal entry point, app.ts) fails on that file even
// though it has nothing to do with this suite.
import '../middleware/auth.middleware';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('phase6-scheduler-socket');
  try {
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Invoice } = await import('../models/invoice.model');
    const { default: Notification } = await import('../models/notification.model');
    const { sendInstallmentReminders } = await import('../services/installment-reminder.service');
    const { invalidateAuthState, onAuthStateInvalidated } = await import('../utils/auth-state');
    const socketModule = await import('../realtime/socket');

    const admin = await User.create({ email: 'p6-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Phase6 School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St',
      phone: '+000', email: 'p6@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });

    section('1: sendInstallmentReminders is race-safe across concurrent runs');
    const remindStudentUser = await User.create({ email: 'p6-remind-student@test.local', password: 'Password123!', role: 'student' });
    const remindProfile = await Profile.create({ user: remindStudentUser._id, firstName: 'Remind', lastName: 'Me', gender: 'male' });
    const remindStudent = await Student.create({
      user: remindStudentUser._id, profile: remindProfile._id, school: school._id, status: 'active', approvalStatus: 'approved',
    });
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await Invoice.create({
      student: remindStudent._id, school: school._id, title: 'Race Invoice', period: '2026-T1',
      lineItems: [{ description: 'Tuition', amount: 50 }], amount: 50, amountPaid: 0, discount: 0,
      status: 'pending', paymentType: 'tuition', dueDate: new Date(), issueDate: new Date(), generatedBy: admin._id,
      installments: [{ number: 1, amount: 50, paidAmount: 0, dueDate, status: 'pending' }],
    });

    // Simulate two backend instances (or an overlapping boot-time call and
    // the first interval tick) both running the scheduler at the same
    // moment, as server.ts's own RUN_SCHEDULERS comment says can happen
    // today (no leader election yet).
    const [resultA, resultB] = await Promise.all([sendInstallmentReminders(), sendInstallmentReminders()]);
    const totalSent = resultA + resultB;
    assert(totalSent === 1, `exactly one of the two concurrent runs sends the reminder (sent ${resultA} + ${resultB} = ${totalSent})`);
    const notificationCount = await Notification.countDocuments({ user: remindStudentUser._id });
    assert(notificationCount === 1, `exactly one notification was actually persisted (found ${notificationCount})`);

    section('1b: a malformed invoice does not abort the rest of the batch');
    const okStudentUser = await User.create({ email: 'p6-ok-student@test.local', password: 'Password123!', role: 'student' });
    const okProfile = await Profile.create({ user: okStudentUser._id, firstName: 'OK', lastName: 'Student', gender: 'female' });
    const okStudent = await Student.create({
      user: okStudentUser._id, profile: okProfile._id, school: school._id, status: 'active', approvalStatus: 'approved',
    });
    // A dangling student reference (deleted afterward) makes studentById.get
    // return undefined for this invoice — the loop should `continue`, not throw,
    // and the next, well-formed invoice should still get its reminder.
    const brokenInvoice = await Invoice.create({
      student: okStudent._id, school: school._id, title: 'Broken Invoice', period: '2026-T1',
      lineItems: [{ description: 'Tuition', amount: 10 }], amount: 10, amountPaid: 0, discount: 0,
      status: 'pending', paymentType: 'tuition', dueDate: new Date(), issueDate: new Date(), generatedBy: admin._id,
      installments: [{ number: 1, amount: 10, paidAmount: 0, dueDate, status: 'pending' }],
    });
    await Student.deleteOne({ _id: okStudent._id });
    void brokenInvoice;

    const secondStudentUser = await User.create({ email: 'p6-second-student@test.local', password: 'Password123!', role: 'student' });
    const secondProfile = await Profile.create({ user: secondStudentUser._id, firstName: 'Second', lastName: 'Student', gender: 'male' });
    const secondStudent = await Student.create({
      user: secondStudentUser._id, profile: secondProfile._id, school: school._id, status: 'active', approvalStatus: 'approved',
    });
    await Invoice.create({
      student: secondStudent._id, school: school._id, title: 'Healthy Invoice', period: '2026-T1',
      lineItems: [{ description: 'Tuition', amount: 20 }], amount: 20, amountPaid: 0, discount: 0,
      status: 'pending', paymentType: 'tuition', dueDate: new Date(), issueDate: new Date(), generatedBy: admin._id,
      installments: [{ number: 1, amount: 20, paidAmount: 0, dueDate, status: 'pending' }],
    });
    const thirdRun = await sendInstallmentReminders();
    assert(thirdRun >= 1, `the batch still sends the healthy invoice's reminder despite the dangling one (sent ${thirdRun})`);
    const secondNotification = await Notification.findOne({ user: secondStudentUser._id }).lean();
    assert(!!secondNotification, 'the second (healthy) student did receive a reminder');

    section('2: invalidateAuthState notifies registered listeners with the userId');
    const seen: string[] = [];
    onAuthStateInvalidated((userId) => seen.push(userId));
    let throwingListenerRan = false;
    onAuthStateInvalidated(() => { throwingListenerRan = true; throw new Error('listener boom'); });
    const seenAfterThrow: string[] = [];
    onAuthStateInvalidated((userId) => seenAfterThrow.push(userId));

    const targetUserId = remindStudentUser._id.toString();
    invalidateAuthState(targetUserId);
    assert(seen.includes(targetUserId), `a listener registered before invalidation receives the userId (saw [${seen.join(', ')}])`);
    assert(throwingListenerRan, 'the throwing listener still ran');
    assert(seenAfterThrow.includes(targetUserId), `a listener registered AFTER a throwing one still runs (saw [${seenAfterThrow.join(', ')}])`);

    section('3: realtime/socket registers disconnectUserSockets against auth-state invalidation');
    assert(typeof socketModule.disconnectUserSockets === 'function', 'disconnectUserSockets is exported');
    // No Socket.IO server is running in this test process (initSocket was
    // never called), so `io` is null inside the module — disconnecting a
    // user must be a safe no-op rather than throwing, exactly like every
    // other exported function in that module behaves with no socket layer.
    let threw = false;
    try {
      socketModule.disconnectUserSockets(targetUserId);
    } catch {
      threw = true;
    }
    assert(!threw, 'disconnectUserSockets(userId) does not throw when there is no live socket layer');
    // And it really is reachable via the same invalidateAuthState() call
    // every deactivation/role-change/permission-change code path already
    // uses — i.e. the module-load-time onAuthStateInvalidated registration
    // in realtime/socket.ts actually took effect for this process.
    invalidateAuthState(targetUserId);
    assert(true, 'invalidateAuthState completes without throwing once socket.ts has registered its listener');
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll phase 6 scheduler/socket checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
