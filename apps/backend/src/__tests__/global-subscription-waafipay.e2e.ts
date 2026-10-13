process.env.JWT_ACCESS_SECRET = 'waafi-test-access';
process.env.JWT_REFRESH_SECRET = 'waafi-test-refresh';
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('global-subscription-waafipay');
  const realFetch = globalThis.fetch;
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Subscription } = await import('../models/global-subscription.model');
    const { generateAccessToken } = await import('../utils/jwt');
    await Subscription.init(); // wait for the unique indexes before relying on them
    const { toWalletAccount, waafiConfig } = await import('../services/waafipay.service');

    assert.equal(toWalletAccount('0615 123 456'), '252615123456');
    assert.equal(toWalletAccount('+252 61 5123456'), '252615123456');
    assert.equal(toWalletAccount('12345'), null);
    assert.equal(waafiConfig({} as NodeJS.ProcessEnv), null);
    assert.equal(waafiConfig({ WAAFIPAY_MERCHANT_UID: 'M', WAAFIPAY_API_USER_ID: 'U', WAAFIPAY_API_KEY: 'K' } as NodeJS.ProcessEnv)!.url, 'https://api.waafipay.net/asm');

    const admin = await User.create({ email: 'waafi-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({ name: 'Waafi School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252000000000', email: 'waafi-school@test.local', principalName: 'P', establishedYear: 2020, createdBy: admin._id });
    const headers = (u: any) => ({ Authorization: `Bearer ${generateAccessToken({ userId: String(u._id), role: u.role, organizationId: u.organizationId?.toString(), permissions: [] })}` });
    let n = 0;
    const mkStudent = async () => {
      n += 1;
      const user = await User.create({ email: `waafi-s${n}@test.local`, password: 'Password123!', role: 'student', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: `W${n}`, lastName: 'Tester', gender: 'male' });
      await Student.create({ user: user._id, profile: profile._id, studentId: `WAAFI-${n}`, school: school._id, approvalStatus: 'approved' });
      return user;
    };
    const root = '/api/v1/global-subscriptions';
    const s1 = await mkStudent();

    // Not configured: the wallet option is off.
    for (const key of ['WAAFIPAY_MERCHANT_UID', 'WAAFIPAY_API_USER_ID', 'WAAFIPAY_API_KEY', 'WAAFIPAY_API_URL']) delete process.env[key];
    let res = await request(app).get(`${root}/pay/config`).set(headers(s1)).expect(200);
    assert.equal(res.body.data.enabled, false);
    await request(app).post(`${root}/pay`).set(headers(s1)).send({ grade: 12, phone: '0615123456' }).expect(503);
    assert.equal(await Subscription.countDocuments(), 0, 'nothing is created when the gateway is off');

    process.env.WAAFIPAY_MERCHANT_UID = 'M000001';
    process.env.WAAFIPAY_API_USER_ID = '1000001';
    process.env.WAAFIPAY_API_KEY = 'API-SECRET-KEY';
    process.env.WAAFIPAY_API_URL = 'https://gateway.test/asm';
    res = await request(app).get(`${root}/pay/config`).set(headers(s1)).expect(200);
    assert.equal(res.body.data.enabled, true);

    // Fake gateway; records what the server sends.
    let sent: any;
    let reply: () => Promise<any> = async () => ({ responseCode: '2001', responseMsg: 'RCS_SUCCESS', params: { transactionId: 'T-1001', state: 'APPROVED' } });
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url) !== 'https://gateway.test/asm') return realFetch(url, init);
      sent = JSON.parse(init.body);
      const body = await reply();
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    await request(app).post(`${root}/pay`).set(headers(admin)).send({ grade: 12, phone: '0615123456' }).expect(403);
    await request(app).post(`${root}/pay`).set(headers(s1)).send({ grade: 9, phone: '0615123456' }).expect(400);
    await request(app).post(`${root}/pay`).set(headers(s1)).send({ grade: 12, phone: '123' }).expect(400);

    // 1. Success: the wallet is charged $5 and the subscription activates for 365 days.
    res = await request(app).post(`${root}/pay`).set(headers(s1)).send({ grade: 12, phone: '0615 123 456' }).expect(200);
    assert.equal(res.body.data.status, 'approved');
    assert.equal(sent.serviceName, 'API_PURCHASE');
    assert.equal(sent.serviceParams.merchantUid, 'M000001');
    assert.equal(sent.serviceParams.apiUserId, '1000001');
    assert.equal(sent.serviceParams.paymentMethod, 'MWALLET_ACCOUNT');
    assert.equal(sent.serviceParams.payerInfo.accountNo, '252615123456');
    assert.equal(sent.serviceParams.transactionInfo.amount, '5.00');
    assert.equal(sent.serviceParams.transactionInfo.currency, 'USD');
    const row: any = await Subscription.findOne({ user: s1._id });
    assert.equal(row.status, 'approved');
    assert.equal(row.autoVerified, true);
    assert.equal(row.verifiedReference, 'WAAFI-T-1001');
    assert.equal(row.gatewayTransactionId, 'T-1001');
    assert.equal(Math.round((row.expiresAt - row.startsAt) / 86400000), 365);
    assert.equal(sent.serviceParams.transactionInfo.referenceId, String(row._id), 'gateway reference is the subscription id');
    assert.ok(!JSON.stringify(res.body).includes('API-SECRET-KEY'), 'the API key is never returned');
    await request(app).post(`${root}/pay`).set(headers(s1)).send({ grade: 12, phone: '0615123456' }).expect(409);

    // 2. Declined (PIN refused / low balance): rejected, the student can try again.
    const s2 = await mkStudent();
    reply = async () => ({ responseCode: '5206', responseMsg: 'RCS_USER_REJECTED' });
    res = await request(app).post(`${root}/pay`).set(headers(s2)).send({ grade: 12, phone: '0615222222' }).expect(402);
    assert.equal((await Subscription.findOne({ user: s2._id }) as any).status, 'rejected');
    reply = async () => ({ responseCode: '2001', responseMsg: 'RCS_SUCCESS', params: { transactionId: 'T-1002' } });
    await request(app).post(`${root}/pay`).set(headers(s2)).send({ grade: 12, phone: '0615222222' }).expect(200);
    assert.equal(await Subscription.countDocuments({ user: s2._id, status: 'approved' }), 1);

    // 3. No answer from the gateway: money may have moved, so never reject; keep it pending for an administrator.
    const s3 = await mkStudent();
    globalThis.fetch = (async (url: any, init: any) => { if (String(url) === 'https://gateway.test/asm') throw new Error('socket hang up'); return realFetch(url, init); }) as typeof fetch;
    res = await request(app).post(`${root}/pay`).set(headers(s3)).send({ grade: 12, phone: '0615333333' }).expect(200);
    assert.equal(res.body.data.status, 'pending');
    assert.equal((await Subscription.findOne({ user: s3._id }) as any).status, 'pending');
    await request(app).post(`${root}/pay`).set(headers(s3)).send({ grade: 12, phone: '0615333333' }).expect(409);
    // The administrator can still approve it by hand.
    const review = await request(app).post(`${root}/${(await Subscription.findOne({ user: s3._id }) as any)._id}/review`).set(headers(admin)).send({ action: 'approve', paymentReceived: true });
    assert.equal(review.status, 200, JSON.stringify(review.body));

    // 4. The same gateway transaction can never activate two subscriptions.
    const s4 = await mkStudent();
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url) !== 'https://gateway.test/asm') return realFetch(url, init);
      return new Response(JSON.stringify({ responseCode: '2001', params: { transactionId: 'T-1001' } }), { status: 200 });
    }) as typeof fetch;
    res = await request(app).post(`${root}/pay`).set(headers(s4)).send({ grade: 12, phone: '0615444444' }).expect(200);
    assert.equal(res.body.data.status, 'pending', 'duplicate transaction id waits for review');
    assert.equal(await Subscription.countDocuments({ verifiedReference: 'WAAFI-T-1001' }), 1);

    // 5. Success without a transaction id cannot be proven: manual review.
    const s5 = await mkStudent();
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url) !== 'https://gateway.test/asm') return realFetch(url, init);
      return new Response(JSON.stringify({ responseCode: '2001', params: {} }), { status: 200 });
    }) as typeof fetch;
    res = await request(app).post(`${root}/pay`).set(headers(s5)).send({ grade: 12, phone: '0615555555' }).expect(200);
    assert.equal(res.body.data.status, 'pending');

    console.log('Global subscription WaafiPay wallet payment e2e passed');
  } finally {
    globalThis.fetch = realFetch;
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
