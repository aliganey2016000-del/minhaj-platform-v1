/**
 * Attendance notification automation — duplicate-send race (2026-10-04).
 *
 * services/attendance-notification-automation.ts used to dedupe its
 * WhatsApp/Telegram attendance alerts with a plain
 * `Model.exists({...})` check before `Model.create(...)` — a classic
 * check-then-act race, the same class of bug already fixed for
 * sendInstallmentReminders (see utils/reminder-lock.ts and
 * scheduler-socket-pwa-phase6.e2e.ts). Attendance.bulkWrite is wrapped to
 * fire this automation on every call, and a double-submitted "mark
 * attendance" request (a retried request after a timeout, or a
 * double-click) calls bulkWrite twice with the same ops — two concurrent
 * calls could both pass the `exists` check before either had inserted a
 * message document, sending the same alert to a parent twice.
 *
 * This suite calls the exported `sendForAttendance` automation directly
 * (the module's default export) twice concurrently with the identical
 * attendance-change ops, and asserts exactly one Telegram message document
 * is created and exactly one outbound send attempt is made — not two.
 *
 * Runs against a real, ephemeral in-memory MongoDB (mongodb-memory-server),
 * or TEST_MONGODB_URI when set. Repeatable via ts-node (wired into CI).
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
// Enables the Telegram attendance-alert path without a real network call:
// isTelegramConfigured() only checks that a token string is present, and
// axios.post is stubbed below before any attendance ops run.
process.env.TELEGRAM_ATTENDANCE_ALERTS_ENABLED = 'true';
process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-token';

import { startTestDb } from './support/test-db';
import '../middleware/auth.middleware';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('attendance-notification-race');
  try {
    // Stub the outbound Telegram HTTP call before the automation module
    // (which imports utils/telegram.ts, which imports axios) is loaded, so
    // every axios.post call in this process — regardless of which module
    // imported axios — goes through this stub. No real network call is
    // made.
    const axios = (await import('axios')).default;
    let telegramSendCalls = 0;
    (axios as any).post = async (url: string) => {
      if (String(url).includes('api.telegram.org')) {
        telegramSendCalls += 1;
        return { data: { result: { message_id: 42 } } };
      }
      throw new Error(`Unexpected axios.post call in test: ${url}`);
    };

    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Parent } = await import('../models/parent.model');
    const { default: TelegramMessage } = await import('../models/telegram-message.model');
    const { default: ReminderLock } = await import('../models/reminder-lock.model');
    const { default: sendForAttendance } = await import('../services/attendance-notification-automation');

    const admin = await User.create({ email: 'atn-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Attendance Race School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: 'atn@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });

    const parentUser = await User.create({ email: 'atn-parent@test.local', password: 'Password123!', role: 'parent' });
    const parentProfile = await Profile.create({ user: parentUser._id, firstName: 'Guardian', lastName: 'One', gender: 'male' });
    const parent = await Parent.create({
      user: parentUser._id, profile: parentProfile._id, parentId: 'ATN-PAR-1', school: school._id,
      telegramChatId: '777111',
    });

    const studentUser = await User.create({ email: 'atn-student@test.local', password: 'Password123!', role: 'student' });
    const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'Learner', lastName: 'One', gender: 'female' });
    const student = await Student.create({
      user: studentUser._id, profile: studentProfile._id, school: school._id, parent: parent._id,
      status: 'active', approvalStatus: 'approved',
    });

    const courseId = new (await import('mongoose')).default.Types.ObjectId();
    const attendanceDate = new Date();
    const ops = [{
      updateOne: {
        filter: { student: student._id, course: courseId, date: attendanceDate },
        update: { $set: { status: 'absent' } },
      },
    }];

    section('1: two concurrent calls with identical ops send exactly one Telegram alert');
    await Promise.all([sendForAttendance(ops as any), sendForAttendance(ops as any)]);

    const messageCount = await TelegramMessage.countDocuments({ chatId: '777111' });
    assert(messageCount === 1, `exactly one TelegramMessage document was created (found ${messageCount})`);
    assert(telegramSendCalls === 1, `exactly one outbound Telegram API call was made (found ${telegramSendCalls})`);

    const message: any = await TelegramMessage.findOne({ chatId: '777111' }).lean();
    assert(message?.status === 'sent', `the single message ended up 'sent' (got ${message?.status})`);

    section('2: a THIRD call with the same ops (e.g. a retried request) still sends nothing new');
    await sendForAttendance(ops as any);
    const messageCountAfterThird = await TelegramMessage.countDocuments({ chatId: '777111' });
    assert(messageCountAfterThird === 1, `a later retry of the same attendance change creates no further message (found ${messageCountAfterThird})`);
    assert(telegramSendCalls === 1, `no additional outbound call was made on the retry (found ${telegramSendCalls})`);

    section('3: the dedupe is backed by a durable claim, not just an in-process guard');
    const lockCount = await ReminderLock.countDocuments({ key: { $regex: '^attendance-alert:telegram:' } });
    assert(lockCount === 1, `exactly one ReminderLock claim exists for this event (found ${lockCount})`);

    section('4: a genuinely different event (different day/status) is not suppressed by the same key');
    const nextDay = new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000);
    const differentOps = [{
      updateOne: {
        filter: { student: student._id, course: courseId, date: nextDay },
        update: { $set: { status: 'absent' } },
      },
    }];
    await sendForAttendance(differentOps as any);
    const messageCountAfterDifferentDay = await TelegramMessage.countDocuments({ chatId: '777111' });
    assert(messageCountAfterDifferentDay === 2, `a different day's absence still sends its own alert (found ${messageCountAfterDifferentDay})`);
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll attendance-notification race checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
