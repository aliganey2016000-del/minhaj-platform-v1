process.env.JWT_ACCESS_SECRET = 'device-test-secret';
process.env.JWT_REFRESH_SECRET = 'device-test-refresh';
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';
async function main() {
  const db = await startTestDb('guuldoon-device');
  try {
    const email = await import('../services/email.service');
    let delivered = '';
    (email as any).sendGuuldoonOtp = async (_to: string, code: string) => { delivered = code; };
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Course } = await import('../models/course.model');
    const { generateAccessToken } = await import('../utils/jwt');
    const admin = await User.create({ email: 'global-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({ name: 'Global Test', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252000000000', email: 'global-school@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id });
    const headers = (u: any) => ({ Authorization: `Bearer ${generateAccessToken({ userId: String(u._id), role: u.role, organizationId: u.organizationId?.toString(), permissions: [] })}` });
    const org = await User.create({ email: 'global-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const student = await User.create({ email: 'global-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
    const profile = await Profile.create({ user: student._id, firstName: 'Global', lastName: 'Student', gender: 'male' });
    // Student auth resolves the effective tenant from the approved Student record.
    await Student.create({ user: student._id, profile: profile._id, studentId: 'GLOBAL-001', school: school._id, approvalStatus: 'approved' });

    const { default: Device } = await import('../models/guuldoon-device.model');
    const root = '/api/v1/guuldoon/devices';
    assert.equal((await request(app).get(root)).status, 401);
    assert.equal((await request(app).post(`${root}/request`).set(headers(org))).status, 403);
    const send = async () => {
      await Device.updateOne({ user: student._id }, { $unset: { sentAt: 1 } });
      const response = await request(app).post(`${root}/request`).set(headers(student));
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(JSON.stringify(response.body).includes(delivered), false);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      assert.ok(cookies[0].includes('HttpOnly'));
      return cookies[0].split(';')[0];
    };
    const verify = (cookie: string, code = delivered) => request(app).post(`${root}/verify`).set(headers(student)).set('Cookie', cookie).send({ code });
    const access = (cookie: string) => request(app).get(`${root}/access`).set(headers(student)).set('Cookie', cookie);
    const first = await send();
    assert.equal((await request(app).post(`${root}/request`).set(headers(student))).status, 429);
    assert.equal((await verify(first, '000000')).status, 400);
    assert.equal((await verify(first)).status, 200);
    assert.equal((await verify(first)).status, 400); // consumed once
    assert.equal((await access(first)).status, 200);
    const second = await send();
    assert.equal((await verify(second)).status, 200);
    assert.equal((await access(first)).status, 403);
    assert.equal((await access(second)).status, 200);
    const third = await send();
    assert.equal((await verify(third)).status, 423);
    assert.equal((await access(second)).status, 403);
    assert.equal((await request(app).post(`${root}/request`).set(headers(student))).status, 423);
    const blocked = await Device.findOne({ user: student._id });
    assert.ok(blocked!.blockedUntil!.getTime() > Date.now() + 86300000);
    assert.equal(blocked!.otpHash, undefined);
    // School account and ordinary catalog stay available while Guuldoon is blocked.
    assert.equal((await request(app).get('/api/v1/courses/global').set(headers(student))).status, 200);
    await Device.updateOne({ user: student._id }, { $set: { blockedUntil: new Date(0), history: [], sends: 0 }, $unset: { sendWindow: 1, sentAt: 1 } });
    const expiry = await send();
    await Device.updateOne({ user: student._id }, { $set: { otpExpiresAt: new Date(0) } });
    assert.equal((await verify(expiry)).status, 400);
    const guesses = await send();
    for (let i = 0; i < 5; i++) assert.equal((await verify(guesses, '000000')).status, 400);
    assert.equal((await verify(guesses)).status, 400);
    await Device.updateOne({ user: student._id }, { $set: { sends: 0 }, $unset: { sentAt: 1 } });
    const raced = await send();
    const results = await Promise.all([verify(raced), verify(raced)]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    await Device.updateOne({ user: student._id }, { $set: { sends: 0 }, $unset: { sentAt: 1 } });
    (email as any).sendGuuldoonOtp = async () => { throw new Error('SMTP unavailable'); };
    assert.equal((await request(app).post(`${root}/request`).set(headers(student))).status, 503);
    assert.equal((await Device.findOne({ user: student._id }))!.otpHash, undefined);

    // Schools often provision student accounts without a deliverable mailbox.
    // The student can verify the current browser using the password of the
    // already authenticated account; the account identifier never comes from
    // the request body.
    const passwordStudent = await User.create({ email: 'school-user-002@balcad.com', password: 'SchoolPassword123!', role: 'student', organizationId: school._id });
    const passwordProfile = await Profile.create({ user: passwordStudent._id, firstName: 'School', lastName: 'User', gender: 'male' });
    await Student.create({ user: passwordStudent._id, profile: passwordProfile._id, studentId: 'GLOBAL-002', school: school._id, approvalStatus: 'approved' });

    const passwordVerify = (password: string, deviceCookie?: string) => {
      const call = request(app).post(`${root}/verify-password`).set(headers(passwordStudent));
      if (deviceCookie) call.set('Cookie', deviceCookie);
      return call.send({ password });
    };
    assert.equal((await passwordVerify('WrongPassword!')).status, 400);
    const passwordFirst = await passwordVerify('SchoolPassword123!');
    assert.equal(passwordFirst.status, 200, JSON.stringify(passwordFirst.body));
    const passwordFirstCookies = passwordFirst.headers['set-cookie'] as unknown as string[];
    assert.ok(passwordFirstCookies?.[0]?.includes('HttpOnly'));
    const passwordFirstCookie = passwordFirstCookies[0].split(';')[0];
    assert.equal((await request(app).get(`${root}/access`).set(headers(passwordStudent)).set('Cookie', passwordFirstCookie)).status, 200);

    const passwordSecond = await passwordVerify('SchoolPassword123!');
    assert.equal(passwordSecond.status, 200, JSON.stringify(passwordSecond.body));
    const passwordSecondCookies = passwordSecond.headers['set-cookie'] as unknown as string[];
    const passwordSecondCookie = passwordSecondCookies[0].split(';')[0];
    assert.equal((await request(app).get(`${root}/access`).set(headers(passwordStudent)).set('Cookie', passwordFirstCookie)).status, 403);
    assert.equal((await request(app).get(`${root}/access`).set(headers(passwordStudent)).set('Cookie', passwordSecondCookie)).status, 200);

    console.log('Guuldoon OTP and account-password device verification, transfer, lockout and school independence passed.');
  } finally { await db.stop(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
