process.env.JWT_ACCESS_SECRET = 'sms-test-access';
process.env.JWT_REFRESH_SECRET = 'sms-test-refresh';
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('global-subscription-sms');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Subscription } = await import('../models/global-subscription.model');
    const { default: PaymentSms } = await import('../models/payment-sms.model');
    const { generateAccessToken } = await import('../utils/jwt');
    const { parseSms, phoneCore, referenceKey, merchantCore } = await import('../services/guuldoon-sms-payment.service');

    // Pure parsing.
    assert.equal(phoneCore('0615 123 456'), '615123456');
    assert.equal(phoneCore('+252615123456'), '615123456');
    assert.equal(phoneCore('252-615-123-456'), '615123456');
    assert.equal(referenceKey('tx-12 34ab'), 'TX1234AB');
    const evc = parseSms('[-EVCPlus-] Waxaad $5.00 ka heshay 252615123456, Tix: TX123456 Haraaga $20.50');
    assert.equal(evc.amountUsd, 20.5, 'largest marked amount');
    assert.ok(evc.refTokens.includes('TX123456') && evc.phones.includes('615123456'));
    assert.equal(parseSms('Waxaad ka heshay 5 SLSH 30,000 TX123456').amountUsd, null, 'no dollar marker, no amount');
    assert.equal(parseSms('You received USD 5 from 0615123456').amountUsd, 5);

    const admin = await User.create({ email: 'sms-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({ name: 'Sms School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252000000000', email: 'sms-school@test.local', principalName: 'P', establishedYear: 2020, createdBy: admin._id });
    const headers = (u: any) => ({ Authorization: `Bearer ${generateAccessToken({ userId: String(u._id), role: u.role, organizationId: u.organizationId?.toString(), permissions: [] })}` });
    let n = 0;
    const mkStudent = async () => {
      n += 1;
      const user = await User.create({ email: `sms-s${n}@test.local`, password: 'Password123!', role: 'student', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: `S${n}`, lastName: 'Tester', gender: 'male' });
      await Student.create({ user: user._id, profile: profile._id, studentId: `SMS-${n}`, school: school._id, approvalStatus: 'approved' });
      return user;
    };
    const root = '/api/v1/global-subscriptions';
    const hook = `${root}/sms-webhook`;
    const secret = 'webhook-secret-for-tests';
    const sendSms = (body: string, extra: Record<string, unknown> = {}) => request(app).post(hook).set('X-Webhook-Secret', secret).send({ from: 'EVCPlus', body, ...extra });
    const register = (u: any, phone: string, extra: Record<string, unknown> = {}) => request(app).post(`${root}/requests`).set(headers(u)).send({ grade: 12, payerPhone: phone, ...extra });

    // The webhook is off until a secret is configured, then rejects wrong secrets.
    delete process.env.GUULDOON_SMS_WEBHOOK_SECRET;
    await request(app).post(hook).set('X-Webhook-Secret', secret).send({ body: 'x' }).expect(404);
    process.env.GUULDOON_SMS_WEBHOOK_SECRET = secret;
    process.env.GUULDOON_MERCHANT_NUMBER = '0619000000';
    assert.equal(merchantCore(), '619000000');
    await request(app).post(hook).send({ body: 'x' }).expect(401);
    await request(app).post(hook).set('X-Webhook-Secret', 'wrong').send({ body: 'x' }).expect(401);
    // Apps that cannot set headers can pass the secret in the URL or the JSON body.
    await request(app).post(`${hook}?secret=${secret}`).send({ body: 'ping' }).expect(200);
    await request(app).post(hook).send({ body: 'ping', secret }).expect(200);
    await request(app).post(`${hook}?secret=wrong`).send({ body: 'ping' }).expect(401);
    const config = await request(app).get(`${root}/pay/config`).set(headers(await mkStudent())).expect(200);
    assert.deepEqual(config.body.data, { enabled: false, smsEnabled: true, merchantNumber: '0619000000' });

    // 1. The student registers their wallet number (no reference), then sends $5 -> activated by the SMS.
    const s1 = await mkStudent();
    let res = await register(s1, '0615123456').expect(201);
    assert.equal(res.body.data.status, 'pending');
    assert.match(res.body.data.paymentReference, /^AUTO-/);
    res = await sendSms('[-EVCPlus-] Waxaad $5.00 ka heshay 252615123456, Haraaga 0619000000 waa $120').expect(200);
    assert.deepEqual(res.body.data, { stored: true, matched: true });
    const mine = await request(app).get(`${root}/mine`).set(headers(s1)).expect(200);
    assert.equal(mine.body.data[0].status, 'approved');
    assert.equal(mine.body.data[0].autoVerified, true);
    assert.match(mine.body.data[0].verifiedReference, /^SMS-/);
    assert.equal(Math.round((new Date(mine.body.data[0].expiresAt).getTime() - new Date(mine.body.data[0].startsAt).getTime()) / 86400000), 365);

    // The same SMS delivered again is ignored; it cannot activate anything twice.
    await sendSms('[-EVCPlus-] Waxaad $5.00 ka heshay 252615123456, Haraaga 0619000000 waa $120').expect(200);
    assert.equal(await Subscription.countDocuments({ status: 'approved' }), 1);

    // 2. The money arrives first, the student registers within 30 minutes -> activated on registration.
    const s2 = await mkStudent();
    await sendSms('Waxaad $5 ka heshay 0615777888.').expect(200);
    res = await register(s2, '+252 615 777 888').expect(201);
    assert.equal(res.body.data.status, 'approved');
    assert.equal(res.body.message, 'Payment verified automatically');

    // 3. Not enough, wrong number, no dollar marker: stays pending for manual review.
    const s3 = await mkStudent();
    await register(s3, '0615000001').expect(201);
    assert.equal((await sendSms('Waxaad $3.00 ka heshay 0615000001.').expect(200)).body.data.matched, false, 'less than $5');
    assert.equal((await sendSms('Waxaad $5.00 ka heshay 0615999999.').expect(200)).body.data.matched, false, 'a different wallet number');
    assert.equal((await sendSms('Waxaad ka heshay SLSH 30000 0615000001.').expect(200)).body.data.matched, false, 'amount without a dollar marker');
    assert.equal((await Subscription.findOne({ user: s3._id }) as any).status, 'pending');

    // 4. An old payment cannot be claimed by registering the number later.
    const s4 = await mkStudent();
    await sendSms('Waxaad $5.00 ka heshay 0615000004.', { receivedAt: new Date(Date.now() - 3 * 3600000).toISOString() }).expect(200);
    res = await register(s4, '0615000004').expect(201);
    assert.equal(res.body.data.status, 'pending');

    // 5. The merchant's own number can never be registered, and never identifies a payer.
    const s5 = await mkStudent();
    await register(s5, '0619000000').expect(400);
    await register(s5, '123').expect(400);
    await request(app).post(`${root}/requests`).set(headers(s5)).send({ grade: 12 }).expect(400);

    // 6. Two open requests for the same number cannot be told apart: left for review.
    const s6 = await mkStudent();
    const s7 = await mkStudent();
    await register(s6, '0615000006').expect(201);
    await register(s7, '0615000006').expect(201);
    res = await sendSms('Waxaad $5.00 ka heshay 0615000006.').expect(200);
    assert.deepEqual(res.body.data, { stored: true, matched: false, ambiguous: true });
    assert.equal(await Subscription.countDocuments({ status: 'approved' }), 2);

    // 7. A reference-only request (no wallet number) still goes to the administrator as before.
    const s8 = await mkStudent();
    res = await request(app).post(`${root}/requests`).set(headers(s8)).send({ grade: 12, paymentReference: 'TX-MANUAL-1' }).expect(201);
    assert.equal(res.body.data.status, 'pending');

    // 8. Garbage input is harmless.
    await request(app).post(hook).set('X-Webhook-Secret', secret).send({}).expect(200);
    await request(app).post(hook).set('X-Webhook-Secret', secret).send({ body: '   ' }).expect(200);

    console.log('Global subscription SMS auto-verify e2e passed');
  } finally {
    delete process.env.GUULDOON_MERCHANT_NUMBER;
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
