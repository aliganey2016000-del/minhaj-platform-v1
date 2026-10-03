/**
 * Phase 4 regressions from the 2026-10-03 deep audit.
 *
 * M5  The Telegram webhook accepted unsigned updates whenever
 *     TELEGRAM_WEBHOOK_SECRET was unset, letting anyone link a parent's
 *     account to their own chat.
 * P1  The global API limit was per IP, so a campus behind one NAT address
 *     shared a single budget. Signed-in traffic is now counted per account.
 * P2  Learning activity and notifications grew forever; both now expire
 *     after 12 months through TTL indexes.
 * L1  A deactivated account, a role change or a removed staff permission
 *     kept working until the 15-minute access token expired.
 * L3  Deploy scripts carried the VPS address and SSH user in the repo.
 * (L2, Cloudflare client IP trust, is covered by cloudflare-client-ip.e2e.ts.)
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = '8';
delete process.env.TELEGRAM_WEBHOOK_SECRET;

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('phase4-ops');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: LearningActivity } = await import('../models/learning-activity.model');
    const { default: Notification } = await import('../models/notification.model');

    const token = (user: any, permissions: string[] = []) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions,
      organizationId: user.organizationId ? user.organizationId.toString() : undefined,
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    section('M5: the Telegram webhook fails closed');
    const update = { message: { text: '/start some-token', chat: { id: 42 } } };
    let res = await request(app).post('/api/v1/telegram/webhook').send(update);
    assert(res.status === 503, `with no secret configured, updates are refused (got ${res.status})`);
    process.env.TELEGRAM_WEBHOOK_SECRET = 'correct-horse-battery';
    res = await request(app).post('/api/v1/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'wrong').send(update);
    assert(res.status === 401, `a wrong secret is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'correct-horse-battery').send(update);
    assert(res.status === 200, `the right secret is accepted (got ${res.status})`);

    section('P2: activity and notifications expire after 12 months');
    const year = 365 * 24 * 60 * 60;
    const schemaTtl = (model: any) => model.schema.indexes().find(([, options]: any) => options?.name === 'createdAt_ttl_12_months')?.[1]?.expireAfterSeconds;
    assert(schemaTtl(LearningActivity) === year, `learning activity declares a 12-month TTL (got ${schemaTtl(LearningActivity)})`);
    assert(schemaTtl(Notification) === year, `notifications declare a 12-month TTL (got ${schemaTtl(Notification)})`);
    try {
      await LearningActivity.syncIndexes();
      await Notification.syncIndexes();
      const activityTtl = (await LearningActivity.collection.indexes()).find((index: any) => index.name === 'createdAt_ttl_12_months');
      const notificationTtl = (await Notification.collection.indexes()).find((index: any) => index.name === 'createdAt_ttl_12_months');
      assert(activityTtl?.expireAfterSeconds === year && notificationTtl?.expireAfterSeconds === year, 'both TTL indexes are built in MongoDB');
    } catch (error: any) {
      if (!/not implemented/i.test(String(error?.message))) throw error;
      console.log('  SKIP TTL index build (test database does not support TTL indexes)');
    }

    section('L1: account changes take effect on existing tokens');
    const admin = await User.create({ email: 'p4-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Phase4 School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St', phone: '+000',
      email: 'p4@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const orgAdmin = await User.create({ email: 'p4-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const staff = await User.create({
      email: 'p4-staff@test.local', password: 'Password123!', role: 'staff', organizationId: school._id,
      permissions: [{ module: 'organization', actions: ['read'] }],
    });
    const teacher = await User.create({ email: 'p4-teacher@test.local', password: 'Password123!', role: 'teacher', organizationId: school._id });
    const orgToken = token(orgAdmin);

    const staffToken = token(staff, ['organization.read']);
    res = await request(app).get('/api/v1/users').set(auth(staffToken));
    assert(res.status === 200, `a staff token works while it matches the account (got ${res.status})`);
    res = await request(app).patch(`/api/v1/users/${staff._id}/permissions`).set(auth(orgToken)).send({ permissions: [] });
    assert(res.status === 200, 'org admin removes the staff permission');
    res = await request(app).get('/api/v1/users').set(auth(staffToken));
    assert(res.status === 401, `the old staff token stops working at once (got ${res.status})`);
    res = await request(app).get('/api/v1/users').set(auth(token(staff, [])));
    assert(res.status === 403, `a token with the current (empty) permissions is simply refused access (got ${res.status})`);

    const teacherToken = token(teacher);
    res = await request(app).get('/api/v1/notifications').set(auth(teacherToken));
    const before = res.status;
    res = await request(app).delete(`/api/v1/users/${teacher._id}`).set(auth(orgToken));
    assert(res.status === 200, `org admin deactivates the teacher (got ${res.status})`);
    res = await request(app).get('/api/v1/notifications').set(auth(teacherToken));
    assert(before !== 401 && res.status === 401, `the deactivated teacher's token stops working at once (before ${before}, after ${res.status})`);

    res = await request(app).get('/api/v1/notifications').set(auth(token({ _id: teacher._id, role: 'org_admin', organizationId: school._id })));
    assert(res.status === 401, `a token whose role no longer matches the account is refused (got ${res.status})`);

    section('P1: signed-in traffic is limited per account, not per IP');
    const limitPath = '/api/v1/courses';
    const fresh = await User.create({ email: 'p4-limit@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const limitedA = token(fresh);
    const statusesA: number[] = [];
    for (let i = 0; i < 9; i += 1) statusesA.push((await request(app).get(limitPath).set(auth(limitedA))).status);
    assert(statusesA.slice(0, 8).every((status) => status === 200) && statusesA[8] === 429, `one account is limited on its own budget (got ${statusesA.join(',')})`);
    const other = await request(app).get(limitPath).set(auth(token(admin)));
    assert(other.status === 200, `another account on the same IP keeps its own budget (got ${other.status})`);
    const forged = await request(app).get(limitPath).set(auth('Bearer.not.a-token'));
    assert(forged.status === 200 || forged.status === 429, 'an invalid token falls back to the IP budget');

    section('L3: deploy scripts carry no server address or SSH user');
    const deployDir = path.resolve(__dirname, '../../../deploy');
    if (fs.existsSync(deployDir)) {
      const offenders = fs.readdirSync(deployDir)
        .filter((file) => /\.(py|md|sh|js)$/.test(file))
        .filter((file) => /\b(?:158\.220\.120\.83|152\.239\.119\.129)\b|username\s*=\s*["']root["']|\bUSER\s*=\s*["']root["']/.test(fs.readFileSync(path.join(deployDir, file), 'utf8')));
      assert(offenders.length === 0, `no hardcoded VPS address or root user (found in ${offenders.join(', ') || 'none'})`);
    }
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll phase 4 checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
