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
    const { parseSms, phoneCore, referenceKey } = await import('../services/guuldoon-sms-payment.service');

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

    // The webhook is off until a secret is configured, then rejects wrong secrets.
    delete process.env.GUULDOON_SMS_WEBHOOK_SECRET;
    await request(app).post(hook).set('X-Webhook-Secret', secret).send({ body: 'x' }).expect(404);
    process.env.GUULDOON_SMS_WEBHOOK_SECRET = secret;
    await request(app).post(hook).send({ body: 'x' }).expect(401);
    await request(app).post(hook).set('X-Webhook-Secret', 'wrong').send({ body: 'x' }).expect(401);

    // 1. Student submits first, SMS arrives later -> activated by the SMS.
    const s1 = await mkStudent();
    let res = await request(app).post(`${root}/requests`).set(headers(s1)).send({ grade: 12, paymentReference: 'TX123456', payerPhone: '0615123456' }).expect(201);
    assert.equal(res.body.data.status, 'pending');
    res = await sendSms('[-EVCPlus-] Waxaad $5.00 ka heshay 252615123456, Tix: TX123456').expect(200);
    assert.deepEqual(res.body.data, { stored: true, matched: true });
    const mine = await request(app).get(`${root}/mine`).set(headers(s1)).expect(200);
    assert.equal(mine.body.data[0].status, 'approved');
    assert.equal(mine.body.data[0].autoVerified, true);
    assert.equal(mine.body.data[0].verifiedReference, 'TX123456');
    const days = (new Date(mine.body.data[0].expiresAt).getTime() - new Date(mine.body.data[0].startsAt).getTime()) / 86400000;
    assert.equal(Math.round(days), 365);

    // The same SMS delivered twice is stored once and does not break anything.
    res = await sendSms('[-EVCPlus-] Waxaad $5.00 ka heshay 252615123456, Tix: TX123456', { receivedAt: undefined }).expect(200);
    assert.equal(await PaymentSms.countDocuments(), 2, 'a re-sent SMS with a new timestamp is a separate record, but never double-approves');
    assert.equal(await Subscription.countDocuments({ status: 'approved' }), 1);

    // 2. SMS arrives first, student submits afterwards -> activated on submit.
    const s2 = await mkStudent();
    await sendSms('Waxaad $5 ka heshay 0615777888. Tix: ZA987654').expect(200);
    res = await request(app).post(`${root}/requests`).set(headers(s2)).send({ grade: 12, paymentReference: 'za987654', payerPhone: '+252 615 777 888' }).expect(201);
    assert.equal(res.body.data.status, 'approved');
    assert.equal(res.body.message, 'Payment verified automatically');

    // 3. Wrong amount, wrong phone, missing phone, missing dollar marker: stay pending for manual review.
    const s3 = await mkStudent();
    await request(app).post(`${root}/requests`).set(headers(s3)).send({ grade: 12, paymentReference: 'LOW00001', payerPhone: '0615000001' }).expect(201);
    res = await sendSms('Waxaad $3.00 ka heshay 0615000001. Tix: LOW00001').expect(200);
    assert.equal(res.body.data.matched, false, 'less than $5');
    const s4 = await mkStudent();
    await request(app).post(`${root}/requests`).set(headers(s4)).send({ grade: 12, paymentReference: 'PHN00002', payerPhone: '0615000002' }).expect(201);
    res = await sendSms('Waxaad $5.00 ka heshay 0615999999. Tix: PHN00002').expect(200);
    assert.equal(res.body.data.matched, false, 'SMS is from a different wallet number');
    const s5 = await mkStudent();
    await request(app).post(`${root}/requests`).set(headers(s5)).send({ grade: 12, paymentReference: 'NOP00003' }).expect(201);
    res = await sendSms('Waxaad $5.00 ka heshay 0615000003. Tix: NOP00003').expect(200);
    assert.equal(res.body.data.matched, false, 'no payer phone given: manual review only');
    const s6 = await mkStudent();
    await request(app).post(`${root}/requests`).set(headers(s6)).send({ grade: 12, paymentReference: 'SLS00004', payerPhone: '0615000004' }).expect(201);
    res = await sendSms('Waxaad ka heshay SLSH 30000 0615000004. Tix: SLS00004').expect(200);
    assert.equal(res.body.data.matched, false, 'amount without a dollar marker');
    assert.equal(await Subscription.countDocuments({ status: 'pending' }), 4);

    // 4. A paid reference cannot activate a second subscription.
    const s7 = await mkStudent();
    res = await request(app).post(`${root}/requests`).set(headers(s7)).send({ grade: 12, paymentReference: 'TX123456', payerPhone: '0615123456' }).expect(201);
    assert.equal(res.body.data.status, 'pending', 'reference already verified for s1');
    assert.equal(await Subscription.countDocuments({ status: 'approved' }), 2);

    // 5. Garbage input is harmless.
    await request(app).post(hook).set('X-Webhook-Secret', secret).send({}).expect(200);
    await request(app).post(hook).set('X-Webhook-Secret', secret).send({ body: '   ' }).expect(200);

    console.log('Global subscription SMS auto-verify e2e passed');
  } finally {
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
