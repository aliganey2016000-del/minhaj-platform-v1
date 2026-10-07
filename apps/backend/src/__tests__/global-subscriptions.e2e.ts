process.env.JWT_ACCESS_SECRET = 'global-test-access';
process.env.JWT_REFRESH_SECRET = 'global-test-refresh';
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('global-subscriptions');
  try {
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
    const { default: Subscription } = await import('../models/global-subscription.model');
    const { subscriptionActive, subscriptionExpiry } = await import('../utils/global-subscription');
    const root = '/api/v1/global-subscriptions';
    const created = await request(app).post(`${root}/requests`).set(headers(student)).send({ grade: 12, paymentReference: 'TX-001', amount: 0, status: 'approved' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data._id;
    assert.equal(created.body.data.amount, 5);
    assert.equal(created.body.data.status, 'pending');
    assert.equal((await request(app).post(`${root}/requests`).set(headers(student)).send({ grade: 12, paymentReference: 'TX-002' })).status, 409);
    assert.equal((await request(app).post(`${root}/${id}/review`).set(headers(student)).send({ action: 'approve', paymentReceived: true })).status, 403);
    assert.equal((await request(app).post(`${root}/${id}/review`).set(headers(org)).send({ action: 'approve', paymentReceived: true })).status, 403);
    assert.equal((await request(app).post(`${root}/${id}/review`).set(headers(admin)).send({ action: 'approve' })).status, 400);
    const approved = await request(app).post(`${root}/${id}/review`).set(headers(admin)).send({ action: 'approve', paymentReceived: true });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const row = await Subscription.findById(id);
    assert.equal(subscriptionActive(row!), true);
    assert.equal(row!.expiresAt!.getTime() - row!.startsAt!.getTime(), 365 * 86400000);
    assert.equal(subscriptionActive(row!, row!.expiresAt!), false);
    const repeat = await request(app).post(`${root}/${id}/review`).set(headers(admin)).send({ action: 'approve', paymentReceived: true });
    assert.equal(repeat.body.data.expiresAt, approved.body.data.expiresAt);
    assert.equal((await request(app).post(`${root}/requests`).set(headers(student)).send({ grade: 12, paymentReference: 'TX-003' })).status, 409);
    assert.equal((await request(app).post(`${root}/${id}/review`).set(headers(admin)).send({ action: 'revoke' })).status, 200);
    assert.equal(subscriptionActive((await Subscription.findById(id))!), false);
    const reused = await request(app).post(`${root}/requests`).set(headers(student)).send({ grade: 8, paymentReference: 'tx-001' });
    assert.equal(reused.status, 201);
    assert.equal((await request(app).post(`${root}/${reused.body.data._id}/review`).set(headers(admin)).send({ action: 'approve', paymentReceived: true })).status, 409);
    const otherSchool = await School.create({ name: 'Other Global School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252000000000', email: 'other-sub@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id });
    const otherOrg = await User.create({ email: 'other-org-sub@test.local', password: 'Password123!', role: 'org_admin', organizationId: otherSchool._id });
    const otherRows = await request(app).get(`${root}/admin?school=${school._id}`).set(headers(otherOrg));
    assert.equal(otherRows.status, 200);
    assert.deepEqual(otherRows.body.data, []);
    assert.equal((await request(app).get(`${root}/mine`).set(headers(student))).body.data.length, 2);
    assert.equal((await request(app).get(`${root}/admin`).set(headers(student))).status, 403);
    assert.equal(subscriptionExpiry(new Date('2026-01-01T00:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z');
    console.log('Global subscription authorization, payment and expiry regressions passed.');
  } finally { await db.stop(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
