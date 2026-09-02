/**
 * Telegram Bot integration — the free alternative to WhatsApp's paid Cloud
 * API. A parent generates a one-time deep link from their dashboard
 * (POST /telegram/link/generate), opens it in Telegram and hits Start;
 * Telegram calls our public webhook (POST /telegram/webhook) with that
 * update, which is how a parent's chat id gets linked to their Parent
 * record — Telegram requires the user to initiate contact before a bot can
 * message them, unlike WhatsApp's phone-number recipient.
 *
 * Covers: link-token generation requires TELEGRAM_BOT_USERNAME (not the
 * bot token — no live Telegram network call is needed to link), the webhook
 * linking a parent by token and rejecting a bad workflow secret, org-scoped
 * admin send/history, and unlink clearing the chat id.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:telegram`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_BOT_USERNAME = 'SahalEduTestBot';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';

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
  const { default: Profile } = await import('../models/profile.model');
  const { default: Parent } = await import('../models/parent.model');
  const { default: TelegramMessage } = await import('../models/telegram-message.model');

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

  const parentUser = await User.create({ email: 'parent@test.local', password: 'Password123!', role: 'parent' });
  const parentToken = tokenFor(parentUser._id.toString(), 'parent');
  const parentProfile = await Profile.create({ user: parentUser._id, firstName: 'Xasan', lastName: 'Guardian', gender: 'male' });
  const parent = await Parent.create({ user: parentUser._id, profile: parentProfile._id, parentId: 'PAR-001', school: schoolA._id, phone: '+2526000000' });

  // -------------------------------------------------------------------
  section('ADMIN STATUS — reflects unconfigured (no TELEGRAM_BOT_TOKEN in test env)');
  // -------------------------------------------------------------------
  const statusRes = await request(app).get('/api/v1/telegram/status').set('Authorization', `Bearer ${orgAdminAToken}`);
  assert(statusRes.status === 200, `status succeeds (status ${statusRes.status})`);
  assert(statusRes.body?.data?.configured === false, `configured is false without TELEGRAM_BOT_TOKEN (got ${statusRes.body?.data?.configured})`);
  assert(statusRes.body?.data?.botUsername === 'SahalEduTestBot', `botUsername reflects TELEGRAM_BOT_USERNAME (got ${statusRes.body?.data?.botUsername})`);

  // -------------------------------------------------------------------
  section('PARENT LINK FLOW — generate a deep link, then Telegram\'s webhook links the chat');
  // -------------------------------------------------------------------
  const genRes = await request(app).post('/api/v1/telegram/link/generate').set('Authorization', `Bearer ${parentToken}`);
  assert(genRes.status === 200, `link generation succeeds (status ${genRes.status}, ${JSON.stringify(genRes.body)})`);
  const deepLink: string = genRes.body?.data?.deepLink || '';
  assert(deepLink.startsWith('https://t.me/SahalEduTestBot?start='), `deep link points at the configured bot (got ${deepLink})`);
  const token = deepLink.split('start=')[1];
  assert(!!token, `a link token was embedded in the deep link`);

  const linkStatusBefore = await request(app).get('/api/v1/telegram/link/status').set('Authorization', `Bearer ${parentToken}`);
  assert(linkStatusBefore.body?.data?.linked === false, `parent is not linked yet (got ${linkStatusBefore.body?.data?.linked})`);

  const badSecretRes = await request(app)
    .post('/api/v1/telegram/webhook')
    .set('X-Telegram-Bot-Api-Secret-Token', 'wrong-secret')
    .send({ message: { chat: { id: 555111 }, text: `/start ${token}` } });
  assert(badSecretRes.status === 401, `webhook rejects a request with the wrong secret token (status ${badSecretRes.status})`);

  const webhookRes = await request(app)
    .post('/api/v1/telegram/webhook')
    .set('X-Telegram-Bot-Api-Secret-Token', 'test-webhook-secret')
    .send({ message: { chat: { id: 555111 }, text: `/start ${token}` } });
  assert(webhookRes.status === 200, `webhook accepts the correctly-secreted /start update (status ${webhookRes.status})`);

  const parentAfterLink: any = await Parent.findById(parent._id).lean();
  assert(parentAfterLink?.telegramChatId === '555111', `parent's telegramChatId is now set from the webhook (got ${parentAfterLink?.telegramChatId})`);
  assert(!parentAfterLink?.telegramLinkToken, `the one-time link token is cleared after use (got ${parentAfterLink?.telegramLinkToken})`);

  const linkStatusAfter = await request(app).get('/api/v1/telegram/link/status').set('Authorization', `Bearer ${parentToken}`);
  assert(linkStatusAfter.body?.data?.linked === true, `parent dashboard now reports linked=true (got ${linkStatusAfter.body?.data?.linked})`);

  // -------------------------------------------------------------------
  section('WEBHOOK — a stale/already-used token is silently ignored, not linked to a random chat');
  // -------------------------------------------------------------------
  const staleWebhookRes = await request(app)
    .post('/api/v1/telegram/webhook')
    .set('X-Telegram-Bot-Api-Secret-Token', 'test-webhook-secret')
    .send({ message: { chat: { id: 999888 }, text: `/start ${token}` } });
  assert(staleWebhookRes.status === 200, `Telegram still gets a 200 ack for a stale token, so it never retries (status ${staleWebhookRes.status})`);
  const parentUnaffected: any = await Parent.findById(parent._id).lean();
  assert(parentUnaffected?.telegramChatId === '555111', `the already-linked chat id is untouched by the stale replay (got ${parentUnaffected?.telegramChatId})`);

  // -------------------------------------------------------------------
  section('ADMIN SEND — fails cleanly without TELEGRAM_BOT_TOKEN, records the attempt');
  // -------------------------------------------------------------------
  const sendRes = await request(app)
    .post('/api/v1/telegram/send')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ parentId: parent._id.toString(), text: 'Reminder: PTA meeting tomorrow at 4pm.' });
  assert(sendRes.status === 400, `send fails cleanly since TELEGRAM_BOT_TOKEN isn't set in this test env (status ${sendRes.status})`);
  const failedMessage = await TelegramMessage.findOne({ parent: parent._id }).lean();
  assert((failedMessage as any)?.status === 'failed', `the attempt is still recorded with status 'failed' for audit (got ${(failedMessage as any)?.status})`);
  assert((failedMessage as any)?.chatId === '555111', `it resolved the parent's linked chat id automatically (got ${(failedMessage as any)?.chatId})`);

  const noChatRes = await request(app)
    .post('/api/v1/telegram/send')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ chatId: '', text: 'no recipient' });
  assert(noChatRes.status === 400, `send with neither parentId nor chatId is rejected (status ${noChatRes.status})`);

  // -------------------------------------------------------------------
  section('CROSS-ORG ACCESS — a different org_admin cannot send to this parent or read this history');
  // -------------------------------------------------------------------
  const crossOrgSendRes = await request(app)
    .post('/api/v1/telegram/send')
    .set('Authorization', `Bearer ${orgAdminBToken}`)
    .send({ parentId: parent._id.toString(), text: 'Should fail' });
  assert(crossOrgSendRes.status === 403 || crossOrgSendRes.status === 404, `cross-org send attempt is rejected (status ${crossOrgSendRes.status})`);

  const historyResA = await request(app).get('/api/v1/telegram/history').set('Authorization', `Bearer ${orgAdminAToken}`);
  assert(historyResA.status === 200 && (historyResA.body?.data || []).length === 1, `org A sees its own 1 message (got ${historyResA.body?.data?.length})`);
  const historyResB = await request(app).get('/api/v1/telegram/history').set('Authorization', `Bearer ${orgAdminBToken}`);
  assert(historyResB.status === 200 && (historyResB.body?.data || []).length === 0, `org B sees 0 — no cross-org leak (got ${historyResB.body?.data?.length})`);

  // -------------------------------------------------------------------
  section('UNLINK — parent can disconnect Telegram themselves');
  // -------------------------------------------------------------------
  const unlinkRes = await request(app).post('/api/v1/telegram/unlink').set('Authorization', `Bearer ${parentToken}`);
  assert(unlinkRes.status === 200, `unlink succeeds (status ${unlinkRes.status})`);
  const parentAfterUnlink: any = await Parent.findById(parent._id).lean();
  assert(!parentAfterUnlink?.telegramChatId, `telegramChatId is cleared (got ${parentAfterUnlink?.telegramChatId})`);

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
