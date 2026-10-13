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
    const { parseSms, phoneCore, referenceKey, merchantCore, isIncomingPayment } = await import('../services/guuldoon-sms-payment.service');

    // Pure parsing.
    assert.equal(phoneCore('0615 123 456'), '615123456');
    assert.equal(phoneCore('+252615123456'), '615123456');
    assert.equal(phoneCore('252-615-123-456'), '615123456');
    assert.equal(referenceKey('tx-12 34ab'), 'TX1234AB');
    const evc = parseSms('[-EVCPlus-] Waxaad $5.00 ka heshay 252615123456, Tix: TX123456 Haraaga $20.50');
    assert.equal(evc.amountUsd, 5, 'the first marked amount is the payment, the later one is the balance');
    assert.equal(parseSms('[-EVCPLUS-] waxaad $5 ka heshay 0615328006, Tar: 13/10/26 00:06:37 haraagagu waa $7.1.').amountUsd, 5);
    assert.ok(evc.refTokens.includes('TX123456') && evc.phones.includes('615123456'));
    assert.equal(parseSms('Waxaad ka heshay 5 SLSH 30,000 TX123456').amountUsd, null, 'no dollar marker, no amount');
    assert.equal(parseSms('You received USD 5 from 0615123456').amountUsd, 5);
    // Receipts for money the merchant phone SENT, or airtime, are never payments.
    assert.equal(parseSms('[-EVCPLUS-] $5 ayaad uwareejisay MARYAN MAXAMED MACALIN(615616937), Tar: 13/10/26 07:35:51, Haraagaagu waa $41.7.').amountUsd, null);
    assert.equal(parseSms('[-EVCPLUS-] You have successfully subscribed Airtime Recharge, $0.15 is deducted from your account,your balance is $0.15').amountUsd, null);
    assert.equal(isIncomingPayment('waxaad $5 ka heshay 0615328006'), true);
    assert.equal(isIncomingPayment('$5 ayaad uwareejisay X(615616937)'), false);

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

    // 8. A real EVC message: payment first, balance later ($7.1 must not count), with unescaped line breaks in the JSON.
    const s9 = await mkStudent();
    await register(s9, '+252615328006').expect(201);
    const lowSms = '{"from":"192","text":"[-EVCPLUS-] waxaad $1 ka heshay 0615328006, Tar: 13/10/26 00:06:37 haraagagu waa $7.1.\nLa soo deg App-ka WAAFI\nhttp://onelink.to/waafi","receivedAt":' + Date.now() + '}';
    res = await request(app).post(hook).set('X-Webhook-Secret', secret).set('Content-Type', 'application/json').send(lowSms).expect(200);
    assert.equal(res.body.data.matched, false, 'the balance is not the payment');
    const realSms = '{"from":"192","text":"[-EVCPLUS-] waxaad $5 ka heshay 0615328006, Tar: 13/10/26 00:06:37 haraagagu waa $7.1.\nLa soo deg App-ka WAAFI\nhttp://onelink.to/waafi","receivedAt":' + (Date.now() + 1000) + '}';
    res = await request(app).post(hook).set('X-Webhook-Secret', secret).set('Content-Type', 'application/json').send(realSms).expect(200);
    assert.equal(res.body.data.matched, true, 'unescaped line breaks no longer cause a 400');
    assert.equal((await Subscription.findOne({ user: s9._id }) as any).status, 'approved');
    // Plain text and form bodies are accepted too.
    await request(app).post(hook).set('X-Webhook-Secret', secret).set('Content-Type', 'text/plain').send('waxaad $5 ka heshay 0615999000').expect(200);

    // 9. Super Admin can see what was forwarded; nobody else can.
    res = await request(app).get(`${hook}/recent`).set(headers(admin)).expect(200);
    assert.ok(res.body.data.length > 0 && res.body.data[0].body);
    await request(app).get(`${hook}/recent`).set(headers(s9)).expect(403);
    await request(app).get(`${hook}/recent`).expect(401);

    // A student who registers the number the merchant SENT money to cannot claim that outgoing receipt.
    const s10 = await mkStudent();
    await register(s10, '0615616937').expect(201);
    res = await sendSms('[-EVCPLUS-] $5 ayaad uwareejisay MARYAN MAXAMED MACALIN(615616937), Tar: 13/10/26 07:35:51, Haraagaagu waa $41.7.').expect(200);
    assert.equal(res.body.data.matched, false);
    assert.equal((await Subscription.findOne({ user: s10._id }) as any).status, 'pending');

    // 9b. Money from a different wallet is classified "unlinked" and Super Admin can attach it by hand.
    const s11 = await mkStudent();
    const sub11 = await register(s11, '0615777000').expect(201);
    res = await sendSms('[-EVCPlus-] Waxaad $5.00 ka heshay 252615888000, Haraaga $9').expect(200);
    assert.equal(res.body.data.matched, false);
    res = await request(app).get(`${hook}/recent`).set(headers(admin)).expect(200);
    const unlinked = res.body.data.find((row: any) => row.body.includes('615888000'));
    assert.equal(unlinked.kind, 'unlinked');
    assert.equal(unlinked.reason, 'no-request');
    assert.ok(res.body.data.some((row: any) => row.kind === 'other' && !row.incoming), 'outgoing receipts are "other"');
    assert.ok(res.body.data.some((row: any) => row.kind === 'matched'));
    res = await request(app).get(`${hook}/pending`).set(headers(admin)).expect(200);
    assert.ok(res.body.data.some((row: any) => row._id === sub11.body.data._id));
    await request(app).post(`${hook}/${unlinked._id}/link`).set(headers(s11)).send({ subscriptionId: sub11.body.data._id }).expect(403);
    await request(app).post(`${hook}/${unlinked._id}/link`).set(headers(admin)).send({ subscriptionId: 'nope' }).expect(404);
    await request(app).post(`${hook}/${unlinked._id}/link`).set(headers(admin)).send({ subscriptionId: sub11.body.data._id }).expect(200);
    assert.equal((await Subscription.findOne({ user: s11._id }) as any).status, 'approved');
    assert.equal((await PaymentSms.findById(unlinked._id) as any).status, 'matched');
    await request(app).post(`${hook}/${unlinked._id}/link`).set(headers(admin)).send({ subscriptionId: sub11.body.data._id }).expect(404);
    // An outgoing receipt can never be used as proof.
    const outgoing = await PaymentSms.findOne({ body: /uwareejisay/ }) as any;
    const s12 = await mkStudent();
    const sub12 = await register(s12, '0615123999').expect(201);
    await request(app).post(`${hook}/${outgoing._id}/link`).set(headers(admin)).send({ subscriptionId: sub12.body.data._id }).expect(404);

    // 9c. Money from an unknown number is attached to any student account found by search, with no prior request.
    const s13 = await mkStudent();
    await sendSms('[-EVCPlus-] Waxaad $5.00 ka heshay 252615333444, Haraaga $9').expect(200);
    res = await request(app).get(`${hook}/recent`).set(headers(admin)).expect(200);
    const orphan = res.body.data.find((row: any) => row.body.includes('615333444'));
    assert.equal(orphan.kind, 'unlinked');
    await request(app).get(`${hook}/accounts?q=sms-s`).set(headers(s13)).expect(403);
    assert.deepEqual((await request(app).get(`${hook}/accounts?q=ab`).set(headers(admin)).expect(200)).body.data, [], 'short queries return nothing');
    res = await request(app).get(`${hook}/accounts?q=${encodeURIComponent(s13.email)}`).set(headers(admin)).expect(200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].userId, String(s13._id));
    await request(app).post(`${hook}/${orphan._id}/link`).set(headers(admin)).send({ userId: String(s13._id), grade: 7 }).expect(400);
    await request(app).post(`${hook}/${orphan._id}/link`).set(headers(admin)).send({ userId: String(s13._id), grade: 12 }).expect(200);
    const linked: any = await Subscription.findOne({ user: s13._id });
    assert.equal(linked.status, 'approved');
    assert.equal(String(linked.reviewedBy), String(admin._id));
    assert.equal((await PaymentSms.findById(orphan._id) as any).status, 'matched');
    // The same message cannot be used twice, and an account that is already active is refused.
    await request(app).post(`${hook}/${orphan._id}/link`).set(headers(admin)).send({ userId: String(s13._id), grade: 12 }).expect(404);
    await sendSms('[-EVCPlus-] Waxaad $5.00 ka heshay 252615333555, Haraaga $14').expect(200);
    const second = (await request(app).get(`${hook}/recent`).set(headers(admin))).body.data.find((row: any) => row.body.includes('615333555'));
    await request(app).post(`${hook}/${second._id}/link`).set(headers(admin)).send({ userId: String(s13._id), grade: 12 }).expect(409);
    // An existing pending request (paid from a different number) is approved in place, not duplicated.
    const s14 = await mkStudent();
    const sub14 = await register(s14, '0615777111').expect(201);
    await request(app).post(`${hook}/${second._id}/link`).set(headers(admin)).send({ userId: String(s14._id), grade: 12 }).expect(200);
    assert.equal(await Subscription.countDocuments({ user: s14._id }), 1);
    assert.equal((await Subscription.findById(sub14.body.data._id) as any).status, 'approved');

    // 10. Garbage input is harmless.
    await request(app).post(hook).set('X-Webhook-Secret', secret).send({}).expect(200);
    await request(app).post(hook).set('X-Webhook-Secret', secret).send({ body: '   ' }).expect(200);

    console.log('Global subscription SMS auto-verify e2e passed');
  } finally {
    delete process.env.GUULDOON_MERCHANT_NUMBER;
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
