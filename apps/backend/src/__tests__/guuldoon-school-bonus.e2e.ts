process.env.JWT_ACCESS_SECRET = 'bonus-test-access';
process.env.JWT_REFRESH_SECRET = 'bonus-test-refresh';
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('guuldoon-school-bonus');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Subscription } = await import('../models/global-subscription.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { generateAccessToken } = await import('../utils/jwt');
    const { bonusAmount, effectiveBonusRate, DEFAULT_SCHOOL_BONUS_RATE } = await import('../utils/global-subscription');

    // Pure maths: 33% of $5 per verified subscription, rounded to cents.
    assert.equal(DEFAULT_SCHOOL_BONUS_RATE, 33);
    assert.equal(effectiveBonusRate(undefined), 33);
    assert.equal(effectiveBonusRate(null), 33);
    assert.equal(effectiveBonusRate(0), 0);
    assert.equal(bonusAmount(100), 165);
    assert.equal(bonusAmount(318), 524.7);
    assert.equal(bonusAmount(10, 25), 12.5);
    assert.equal(bonusAmount(0), 0);

    const admin = await User.create({ email: 'bonus-admin@test.local', password: 'Password123!', role: 'admin' });
    const mkSchool = (name: string, email: string) => School.create({ name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252000000000', email, principalName: 'Principal', establishedYear: 2020, createdBy: admin._id });
    const schoolA = await mkSchool('Bonus School A', 'bonus-a@test.local');
    const schoolB = await mkSchool('Bonus School B', 'bonus-b@test.local');
    const headers = (u: any) => ({ Authorization: `Bearer ${generateAccessToken({ userId: String(u._id), role: u.role, organizationId: u.organizationId?.toString(), permissions: [] })}` });
    const orgA = await User.create({ email: 'bonus-org-a@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    const orgB = await User.create({ email: 'bonus-org-b@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });
    const mkClass = (school: any, gradeLevel: number) => ClassModel.create({ school: school._id, title: `Grade ${gradeLevel}`, room: String(gradeLevel), gradeLevel });
    const class12A = await mkClass(schoolA, 12);
    const class8A = await mkClass(schoolA, 8);
    const class10A = await mkClass(schoolA, 10);
    const class12B = await mkClass(schoolB, 12);
    const makeStudent = async (n: number, school: any, classroom?: any, status = 'active') => {
      const user = await User.create({ email: `bonus-student-${n}@test.local`, password: 'Password123!', role: 'student', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: `Student${n}`, lastName: 'Test', gender: 'male' });
      await Student.create({ user: user._id, profile: profile._id, studentId: `BONUS-${n}`, school: school._id, approvalStatus: 'approved', status, ...(classroom ? { class: classroom._id } : {}) });
      return user;
    };
    // School A target group (active, Grade 8 or 12): a1 (G12), a2 (G8), a3 (G12).
    // Not counted: a4 (Grade 10), an inactive Grade 12 student and a student with no class.
    const a1 = await makeStudent(1, schoolA, class12A);
    const a2 = await makeStudent(2, schoolA, class8A);
    const a3 = await makeStudent(3, schoolA, class12A);
    const a4 = await makeStudent(4, schoolA, class10A);
    await makeStudent(6, schoolA, class12A, 'inactive');
    await makeStudent(7, schoolA);
    const b1 = await makeStudent(5, schoolB, class12B);
    const now = new Date();
    const later = new Date(now.getTime() + 365 * 86400000);
    const sub = (user: any, school: any, grade: number, status: string, ref: string) => Subscription.create({ user: user._id, school: school._id, grade, status, paymentReference: ref, verifiedReference: status === 'approved' ? ref : undefined, startsAt: status === 'approved' ? now : undefined, expiresAt: status === 'approved' ? later : undefined });
    await sub(a1, schoolA, 12, 'approved', 'B-1');
    await sub(a1, schoolA, 8, 'approved', 'B-2');
    await sub(a2, schoolA, 12, 'approved', 'B-3');
    await sub(a3, schoolA, 12, 'approved', 'B-4');
    await sub(a4, schoolA, 12, 'pending', 'B-5');
    await sub(a4, schoolA, 8, 'revoked', 'B-6');
    await sub(b1, schoolB, 12, 'approved', 'B-7');

    const root = '/api/v1/guuldoon-school-bonus';
    // ── Access control ──
    assert.equal((await request(app).get(`${root}/schools`)).status, 401);
    assert.equal((await request(app).get(`${root}/schools`).set(headers(orgA))).status, 403);
    assert.equal((await request(app).get(`${root}/schools`).set(headers(a1))).status, 403);
    assert.equal((await request(app).get(`${root}/mine`).set(headers(admin))).status, 403);
    assert.equal((await request(app).get(`${root}/mine`).set(headers(a1))).status, 403);
    assert.equal((await request(app).patch(`${root}/schools/${schoolA._id}/rate`).set(headers(orgA)).send({ rate: 50 })).status, 403);
    assert.equal((await request(app).post(`${root}/payouts`).set(headers(orgA)).send({ schoolId: String(schoolA._id), amount: 1 })).status, 403);
    assert.equal((await request(app).get(`${root}/payouts`).set(headers(orgA))).status, 403);

    // ── Super Admin overview: only approved rows count, default rate 33% ──
    const overview = await request(app).get(`${root}/schools`).set(headers(admin));
    assert.equal(overview.status, 200, JSON.stringify(overview.body));
    const rowA = overview.body.data.schools.find((s: any) => s.name === 'Bonus School A');
    assert.equal(rowA.verifiedSubscriptions, 4);
    assert.equal(rowA.subscribers, 3);
    assert.equal(rowA.students, 3);
    assert.equal(rowA.grade8Students, 1);
    assert.equal(rowA.grade12Students, 2);
    assert.equal(rowA.grossUsd, 20);
    assert.equal(rowA.rate, 33);
    assert.equal(rowA.usesDefaultRate, true);
    assert.equal(rowA.bonusUsd, 6.6);
    assert.equal(rowA.pendingUsd, 6.6);
    assert.equal(overview.body.data.price, 5);
    assert.equal(overview.body.data.defaultRate, 33);

    // ── Rate management ──
    for (const bad of [-1, 61, 'abc', undefined]) {
      assert.equal((await request(app).patch(`${root}/schools/${schoolA._id}/rate`).set(headers(admin)).send({ rate: bad })).status, 400, `rate ${String(bad)}`);
    }
    assert.equal((await request(app).patch(`${root}/schools/not-an-id/rate`).set(headers(admin)).send({ rate: 10 })).status, 400);
    assert.equal((await request(app).patch(`${root}/schools/${new mongoose.Types.ObjectId()}/rate`).set(headers(admin)).send({ rate: 10 })).status, 404);
    const setRate = await request(app).patch(`${root}/schools/${schoolA._id}/rate`).set(headers(admin)).send({ rate: 25 });
    assert.equal(setRate.status, 200, JSON.stringify(setRate.body));
    assert.equal(setRate.body.data.rate, 25);
    assert.equal(setRate.body.data.usesDefaultRate, false);
    assert.equal(setRate.body.data.bonusUsd, 5);
    const zero = await request(app).patch(`${root}/schools/${schoolA._id}/rate`).set(headers(admin)).send({ rate: 0 });
    assert.equal(zero.body.data.bonusUsd, 0);
    const reset = await request(app).patch(`${root}/schools/${schoolA._id}/rate`).set(headers(admin)).send({ rate: null });
    assert.equal(reset.body.data.usesDefaultRate, true);
    assert.equal(reset.body.data.bonusUsd, 6.6);

    // ── Grades: a school can be limited to Grade 8 or Grade 12 ──
    const setGrades = (grades: unknown, user: any = admin) => request(app).patch(`${root}/schools/${schoolA._id}/grades`).set(headers(user)).send({ grades });
    assert.equal((await setGrades([12], orgA)).status, 403);
    for (const bad of [[], [10], [8, 12, 8], [8, 8], 'abc', 12, undefined, [null]]) {
      assert.equal((await setGrades(bad)).status, 400, `grades ${JSON.stringify(bad)}`);
    }
    assert.equal((await request(app).patch(`${root}/schools/bad/grades`).set(headers(admin)).send({ grades: [12] })).status, 400);
    assert.equal((await request(app).patch(`${root}/schools/${new mongoose.Types.ObjectId()}/grades`).set(headers(admin)).send({ grades: [12] })).status, 404);
    const only12 = await setGrades([12]);
    assert.equal(only12.status, 200, JSON.stringify(only12.body));
    assert.deepEqual(only12.body.data.grades, [12]);
    assert.equal(only12.body.data.students, 2); // a1 and a3; the Grade 8 student a2 is out
    assert.equal(only12.body.data.grade8Students, 0);
    assert.equal(only12.body.data.grade12Students, 2);
    assert.equal(only12.body.data.verifiedSubscriptions, 3); // a1, a2 and a3 Grade 12 rows; a1's Grade 8 row is out
    assert.equal(only12.body.data.bonusUsd, 4.95);
    const mine12 = await request(app).get(`${root}/mine`).set(headers(orgA));
    assert.equal(mine12.body.data.studentsTotal, 4); // 3 approved + the pending Grade 12 request
    const only8 = await setGrades([8]);
    assert.deepEqual(only8.body.data.grades, [8]);
    assert.equal(only8.body.data.students, 1);
    assert.equal(only8.body.data.verifiedSubscriptions, 1);
    assert.equal(only8.body.data.bonusUsd, 1.65);
    assert.equal((await request(app).get(`${root}/mine`).set(headers(orgA))).body.data.studentsTotal, 1);
    // The other school is untouched, and the order of the list does not matter.
    const sibling = (await request(app).get(`${root}/schools`).set(headers(admin))).body.data.schools.find((s: any) => s.name === 'Bonus School B');
    assert.deepEqual(sibling.grades, [8, 12]);
    assert.equal(sibling.verifiedSubscriptions, 1);
    const both = await setGrades([12, 8]);
    assert.deepEqual(both.body.data.grades, [8, 12]);
    assert.equal(both.body.data.verifiedSubscriptions, 4);
    await setGrades([12]);
    const cleared = await setGrades(null);
    assert.deepEqual(cleared.body.data.grades, [8, 12]);
    assert.equal(cleared.body.data.students, 3);
    assert.equal(cleared.body.data.bonusUsd, 6.6);

    // ── Payouts: validated, capped at what is owed ──
    const pay = (body: any) => request(app).post(`${root}/payouts`).set(headers(admin)).send(body);
    assert.equal((await pay({ schoolId: String(schoolA._id), amount: 0 })).status, 400);
    assert.equal((await pay({ schoolId: String(schoolA._id), amount: -5 })).status, 400);
    assert.equal((await pay({ schoolId: String(schoolA._id), amount: 'x' })).status, 400);
    assert.equal((await pay({ schoolId: 'bad', amount: 1 })).status, 400);
    assert.equal((await pay({ schoolId: String(schoolA._id), amount: 6.61 })).status, 400);
    const first = await pay({ schoolId: String(schoolA._id), amount: 4, note: 'EVC Plus bil 1' });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal((await pay({ schoolId: String(schoolA._id), amount: 2.61 })).status, 400);
    assert.equal((await pay({ schoolId: String(schoolA._id), amount: 2.6 })).status, 201);
    const after = (await request(app).get(`${root}/schools`).set(headers(admin))).body.data.schools.find((s: any) => s.name === 'Bonus School A');
    assert.equal(after.paidOutUsd, 6.6);
    assert.equal(after.pendingUsd, 0);
    const history = await request(app).get(`${root}/payouts`).set(headers(admin));
    assert.equal(history.status, 200);
    assert.equal(history.body.data.length, 2);
    assert.equal((await request(app).get(`${root}/payouts?schoolId=${schoolB._id}`).set(headers(admin))).body.data.length, 0);
    assert.equal((await request(app).get(`${root}/payouts?schoolId=bad`).set(headers(admin))).status, 400);

    // ── School administrator sees only their own school ──
    const mineA = await request(app).get(`${root}/mine`).set(headers(orgA));
    assert.equal(mineA.status, 200, JSON.stringify(mineA.body));
    assert.equal(mineA.body.data.summary.name, 'Bonus School A');
    assert.equal(mineA.body.data.summary.verifiedSubscriptions, 4);
    assert.equal(mineA.body.data.summary.students, 3);
    assert.equal(mineA.body.data.summary.pendingUsd, 0);
    assert.equal(mineA.body.data.payouts.length, 2);
    assert.equal(mineA.body.data.studentsTotal, 5); // 4 approved + 1 pending; revoked is hidden
    assert.ok(mineA.body.data.students.some((s: any) => s.name === 'Student1 Test' && s.studentId === 'BONUS-1'));
    assert.ok(!JSON.stringify(mineA.body).includes('Student5'), 'must not leak another school\'s student');
    const mineB = await request(app).get(`${root}/mine`).set(headers(orgB));
    assert.equal(mineB.body.data.summary.name, 'Bonus School B');
    assert.equal(mineB.body.data.summary.verifiedSubscriptions, 1);
    assert.equal(mineB.body.data.summary.students, 1);
    assert.equal(mineB.body.data.summary.bonusUsd, 1.65);
    assert.equal(mineB.body.data.payouts.length, 0);
    assert.ok(!JSON.stringify(mineB.body).includes('Student1'), 'must not leak another school\'s student');

    // ── Revoking a subscription lowers the bonus but never below what was paid out ──
    await Subscription.updateOne({ paymentReference: 'B-1' }, { $set: { status: 'revoked' } });
    const revoked = (await request(app).get(`${root}/schools`).set(headers(admin))).body.data.schools.find((s: any) => s.name === 'Bonus School A');
    assert.equal(revoked.verifiedSubscriptions, 3);
    assert.equal(revoked.bonusUsd, 4.95);
    assert.equal(revoked.paidOutUsd, 6.6);
    assert.equal(revoked.pendingUsd, 0);

    console.log('Guuldoon school bonus authorization, maths, rate and payout regressions passed.');
  } finally {
    await db.stop();
  }
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
