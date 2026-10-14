process.env.JWT_ACCESS_SECRET = 'device-test-secret';
process.env.JWT_REFRESH_SECRET = 'device-test-refresh';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('guuldoon-device');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Device } = await import('../models/guuldoon-device.model');
    const { generateAccessToken } = await import('../utils/jwt');

    const admin = await User.create({ email: 'global-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Global Test',
      organizationType: 'private',
      country: 'Somalia',
      city: 'Mogadishu',
      address: 'Test',
      phone: '+252000000000',
      email: 'global-school@test.local',
      principalName: 'Principal',
      establishedYear: 2020,
      createdBy: admin._id,
    });

    const headers = (u: any) => ({
      Authorization: `Bearer ${generateAccessToken({
        userId: String(u._id),
        role: u.role,
        organizationId: u.organizationId?.toString(),
        permissions: [],
      })}`,
    });

    const org = await User.create({
      email: 'global-org@test.local',
      password: 'Password123!',
      role: 'org_admin',
      organizationId: school._id,
    });

    const student = await User.create({
      email: 'school-user-002@balcad.com',
      password: 'SchoolPassword123!',
      role: 'student',
      organizationId: school._id,
    });
    const profile = await Profile.create({
      user: student._id,
      firstName: 'School',
      lastName: 'User',
      gender: 'male',
    });
    await Student.create({
      user: student._id,
      profile: profile._id,
      studentId: 'GLOBAL-002',
      school: school._id,
      approvalStatus: 'approved',
    });

    const root = '/api/v1/guuldoon/devices';
    const verify = (password: string, deviceCookie?: string, extraBody: Record<string, unknown> = {}) => {
      const call = request(app).post(`${root}/verify-password`).set(headers(student));
      if (deviceCookie) call.set('Cookie', deviceCookie);
      return call.send({ password, ...extraBody });
    };
    const access = (deviceCookie: string) =>
      request(app).get(`${root}/access`).set(headers(student)).set('Cookie', deviceCookie);

    assert.equal((await request(app).get(root)).status, 401);
    assert.equal(
      (await request(app).post(`${root}/verify-password`).set(headers(org)).send({ password: 'Password123!' })).status,
      403,
    );

    // Wrong password cannot register a browser or plant a device cookie.
    const wrongPassword = await verify('WrongPassword!');
    assert.equal(wrongPassword.status, 400);
    assert.equal(wrongPassword.headers['set-cookie'], undefined);
    let row = await Device.findOne({ user: student._id });
    assert.equal(row?.activeHash || '', '');

    // The backend always verifies the currently authenticated user. Any
    // account identifier submitted by a client is ignored.
    const firstResponse = await verify('SchoolPassword123!', undefined, {
      email: 'another-user@example.com',
      userId: String(admin._id),
    });
    assert.equal(firstResponse.status, 200, JSON.stringify(firstResponse.body));
    const firstSetCookies = firstResponse.headers['set-cookie'] as unknown as string[];
    assert.ok(firstSetCookies?.[0]?.includes('HttpOnly'));
    assert.ok(firstSetCookies?.[0]?.includes('Path=/api/v1'));
    const firstCookie = firstSetCookies[0].split(';')[0];
    assert.equal((await access(firstCookie)).status, 200);

    const firstState = await request(app).get(root).set(headers(student)).set('Cookie', firstCookie);
    assert.equal(firstState.status, 200);
    assert.match(String(firstState.headers['cache-control'] || ''), /no-store/);
    assert.equal(firstState.body?.data?.verified, true);
    assert.equal(firstState.body?.data?.registered, true);

    // Verifying a second browser transfers Guuldoon access away from the first.
    const secondResponse = await verify('SchoolPassword123!');
    assert.equal(secondResponse.status, 200, JSON.stringify(secondResponse.body));
    const secondSetCookies = secondResponse.headers['set-cookie'] as unknown as string[];
    const secondCookie = secondSetCookies[0].split(';')[0];
    assert.equal((await access(firstCookie)).status, 403);
    assert.equal((await access(secondCookie)).status, 200);

    // A third distinct browser in 24 hours blocks Guuldoon, without blocking
    // the student's ordinary school account or catalog access.
    const thirdResponse = await verify('SchoolPassword123!');
    assert.equal(thirdResponse.status, 423);
    assert.equal((await access(secondCookie)).status, 403);
    assert.equal((await verify('SchoolPassword123!')).status, 423);
    row = await Device.findOne({ user: student._id });
    assert.ok(row!.blockedUntil!.getTime() > Date.now() + 86300000);
    assert.equal((await request(app).get('/api/v1/courses/global').set(headers(student))).status, 200);

    // Reset the block to exercise password-attempt throttling separately.
    await Device.updateOne(
      { user: student._id },
      {
        $set: { blockedUntil: new Date(0), history: [], activeHash: '', passwordAttempts: 0 },
        $unset: { passwordAttemptWindow: 1 },
      },
    );

    for (let i = 0; i < 5; i++) {
      assert.equal((await verify('WrongPassword!')).status, 400);
    }
    assert.equal((await verify('WrongPassword!')).status, 429);
    assert.equal((await verify('SchoolPassword123!')).status, 429);

    await Device.updateOne(
      { user: student._id },
      { $set: { passwordAttempts: 0 }, $unset: { passwordAttemptWindow: 1 } },
    );
    assert.equal((await verify('SchoolPassword123!')).status, 200);

    // Admin-managed device rule: who can read/change it, validation, and that
    // a saved rule actually changes when an account is blocked.
    const policyRoot = '/api/v1/guuldoon/admin/device-policy';
    assert.equal((await request(app).get(policyRoot)).status, 401);
    assert.equal((await request(app).get(policyRoot).set(headers(student))).status, 403);
    assert.equal((await request(app).get(policyRoot).set(headers(org))).status, 403);
    assert.equal((await request(app).put(policyRoot).set(headers(org)).send({ deviceLimit: 5, windowHours: 24, blockHours: 24 })).status, 403);

    const defaults = await request(app).get(policyRoot).set(headers(admin));
    assert.equal(defaults.status, 200, JSON.stringify(defaults.body));
    assert.deepEqual(
      [defaults.body.data.deviceLimit, defaults.body.data.windowHours, defaults.body.data.blockHours],
      [3, 24, 24],
    );
    for (const bad of [
      { deviceLimit: 1, windowHours: 24, blockHours: 24 },
      { deviceLimit: 11, windowHours: 24, blockHours: 24 },
      { deviceLimit: 3, windowHours: 0, blockHours: 24 },
      { deviceLimit: 3, windowHours: 24, blockHours: 169 },
      { deviceLimit: 2.5, windowHours: 24, blockHours: 24 },
      { windowHours: 24, blockHours: 24 },
    ]) {
      assert.equal((await request(app).put(policyRoot).set(headers(admin)).send(bad)).status, 400, JSON.stringify(bad));
    }

    // Allow four devices and a 6 hour block: three browsers pass, the fourth blocks for ~6 hours.
    const saved = await request(app).put(policyRoot).set(headers(admin)).send({ deviceLimit: 4, windowHours: 12, blockHours: 6 });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    await Device.updateOne(
      { user: student._id },
      { $set: { blockedUntil: new Date(0), history: [], activeHash: '', passwordAttempts: 0 }, $unset: { passwordAttemptWindow: 1 } },
    );
    for (let i = 0; i < 3; i++) {
      assert.equal((await verify('SchoolPassword123!')).status, 200, `device ${i + 1} should be allowed`);
    }
    const fourth = await verify('SchoolPassword123!');
    assert.equal(fourth.status, 423);
    assert.match(String(fourth.body.message), /4 devices verified within 12 hours.*6 hours/);
    row = await Device.findOne({ user: student._id });
    const blockedFor = row!.blockedUntil!.getTime() - Date.now();
    assert.ok(blockedFor > 5.9 * 3600000 && blockedFor < 6.1 * 3600000, `block length ${blockedFor}`);

    // Several devices at once: with 2 active devices (block after 4), two
    // browsers work together and a third pushes out the oldest one.
    const reset = () => Device.updateOne(
      { user: student._id },
      {
        $set: { blockedUntil: new Date(0), history: [], activeHash: '', activeHashes: [], passwordAttempts: 0 },
        $unset: { passwordAttemptWindow: 1 },
      },
    );
    const bad = await request(app).put(policyRoot).set(headers(admin)).send({ deviceLimit: 3, activeDevices: 3, windowHours: 24, blockHours: 24 });
    assert.equal(bad.status, 400, 'block threshold must exceed the devices usable together');
    assert.equal((await request(app).put(policyRoot).set(headers(admin)).send({ deviceLimit: 4, activeDevices: 6, windowHours: 24, blockHours: 24 })).status, 400);
    const multi = await request(app).put(policyRoot).set(headers(admin)).send({ deviceLimit: 4, activeDevices: 2, windowHours: 24, blockHours: 24 });
    assert.equal(multi.status, 200, JSON.stringify(multi.body));
    assert.equal(multi.body.data.activeDevices, 2);
    await reset();
    const cookieOf = (response: any) => (response.headers['set-cookie'] as string[])[0].split(';')[0];
    const phone = await verify('SchoolPassword123!');
    assert.equal(phone.status, 200);
    const laptop = await verify('SchoolPassword123!');
    assert.equal(laptop.status, 200);
    const phoneCookie = cookieOf(phone);
    const laptopCookie = cookieOf(laptop);
    assert.equal((await access(phoneCookie)).status, 200, 'first device stays active');
    assert.equal((await access(laptopCookie)).status, 200, 'second device is active too');
    const tablet = await verify('SchoolPassword123!');
    assert.equal(tablet.status, 200);
    assert.equal((await access(phoneCookie)).status, 403, 'oldest device is disconnected');
    assert.equal((await access(laptopCookie)).status, 200);
    assert.equal((await access(cookieOf(tablet))).status, 200);
    const multiState = await request(app).get(root).set(headers(student)).set('Cookie', laptopCookie);
    assert.equal(multiState.body.data.verified, true);

    // Lowering it back to 1 leaves only the newest device working.
    assert.equal((await request(app).put(policyRoot).set(headers(admin)).send({ deviceLimit: 4, activeDevices: 1, windowHours: 24, blockHours: 24 })).status, 200);
    assert.equal((await access(cookieOf(tablet))).status, 200);
    assert.equal((await access(laptopCookie)).status, 403);

    console.log('Guuldoon account-password device verification, transfer, lockout, throttling and school independence passed.');
  } finally {
    await db.stop();
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
