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

    // Wrong password cannot register a browser.
    assert.equal((await verify('WrongPassword!')).status, 400);
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
    const firstCookie = firstSetCookies[0].split(';')[0];
    assert.equal((await access(firstCookie)).status, 200);

    const firstState = await request(app).get(root).set(headers(student)).set('Cookie', firstCookie);
    assert.equal(firstState.status, 200);
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
