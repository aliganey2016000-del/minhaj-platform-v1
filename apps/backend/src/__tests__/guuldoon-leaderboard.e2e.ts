process.env.JWT_ACCESS_SECRET = 'board-test-access';
process.env.JWT_REFRESH_SECRET = 'board-test-refresh';
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('guuldoon-leaderboard');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Subscription } = await import('../models/global-subscription.model');
    const { default: Attempt } = await import('../models/guuldoon-attempt.model');
    const { generateAccessToken } = await import('../utils/jwt');
    const { compareEntries, periodStart, scoreDays, POINTS_PER_QUESTION, DAILY_POINT_CAP, STREAK_BONUS_PER_DAY, STREAK_BONUS_MAX_DAYS } = await import('../services/guuldoon-leaderboard.service');

    // Pure rules.
    assert.equal(POINTS_PER_QUESTION, 10);
    assert.equal(DAILY_POINT_CAP, 400);
    assert.ok(compareEntries({ points: 50, last: 5 }, { points: 30, last: 1 }) < 0, 'more points ranks first');
    assert.ok(compareEntries({ points: 50, last: 1 }, { points: 50, last: 5 }) < 0, 'earlier finisher wins a tie');
    assert.equal(STREAK_BONUS_PER_DAY, 5);
    assert.equal(STREAK_BONUS_MAX_DAYS, 10);
    assert.equal(periodStart('all'), null);

    // Streak maths on fixed days (clock pinned to 2026-10-12, Mogadishu).
    const clock = new Date('2026-10-12T09:00:00Z');
    const day = (u: string, d: string, n: number) => ({ user: u, day: d, n, last: Date.parse(`${d}T09:00:00Z`) });
    const scored = scoreDays([
      day('run', '2026-10-10', 2), day('run', '2026-10-11', 2), day('run', '2026-10-12', 2),  // 25 + 30 + 35
      day('gap', '2026-10-08', 4), day('gap', '2026-10-12', 1),                                // 45 + 15 (the gap resets the streak)
      day('big', '2026-10-12', 50),                                                            // 505 raw -> capped at 400
      day('old', '2026-09-01', 3),                                                             // outside the week
      day('stale', '2026-10-09', 1),                                                           // active in week, streak already over
    ], 'week', clock);
    const get = (u: string) => scored.find((e) => e.user === u);
    assert.equal(get('run')!.points, 90);
    assert.equal(get('run')!.streak, 3);
    assert.equal(get('gap')!.points, 60);
    assert.equal(get('gap')!.streak, 1);
    assert.equal(get('big')!.points, DAILY_POINT_CAP);
    assert.equal(get('old'), undefined);
    assert.equal(get('stale')!.streak, 0, 'a streak that ended before yesterday no longer counts');
    // A streak that began before the period still raises the bonus inside it, but earlier days do not score.
    const carried = scoreDays([day('c', '2026-10-04', 1), day('c', '2026-10-05', 1), day('c', '2026-10-06', 1), day('c', '2026-10-07', 1), day('c', '2026-10-08', 1), day('c', '2026-10-09', 1), day('c', '2026-10-10', 1), day('c', '2026-10-11', 1), day('c', '2026-10-12', 1)], 'week', clock);
    assert.equal(carried[0].streak, 9);
    assert.equal(carried[0].points, 8 * 10 + 5 * (2 + 3 + 4 + 5 + 6 + 7 + 8 + 9), 'Oct 5..12 score; the streak run still counts Oct 4');
    assert.ok(scoreDays([day('x', '2026-01-01', 100)], 'all', clock)[0].points <= DAILY_POINT_CAP);
    assert.ok(periodStart('week')!.getTime() < Date.now() - 6 * 86400000);

    const admin = await User.create({ email: 'board-admin@test.local', password: 'Password123!', role: 'admin' });
    const mkSchool = (name: string, email: string) => School.create({ name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252000000000', email, principalName: 'P', establishedYear: 2020, createdBy: admin._id });
    const schoolA = await mkSchool('Alpha School', 'board-a@test.local');
    const schoolB = await mkSchool('Beta School', 'board-b@test.local');
    const schoolC = await mkSchool('Tiny School', 'board-c@test.local');
    const headers = (u: any) => ({ Authorization: `Bearer ${generateAccessToken({ userId: String(u._id), role: u.role, organizationId: u.organizationId?.toString(), permissions: [] })}` });

    const course12 = await Course.create({ title: { en: 'Physics 12' }, slug: 'board-physics-12', scope: 'global', globalGrade: 12, status: 'published', duration: 8, maxStudents: 50 });
    const course8 = await Course.create({ title: { en: 'Maths 8' }, slug: 'board-maths-8', scope: 'global', globalGrade: 8, status: 'published', duration: 8, maxStudents: 50 });

    let n = 0;
    const now = new Date();
    const later = new Date(now.getTime() + 365 * 86400000);
    const mkStudent = async (school: any, first: string, subscribed = true) => {
      n += 1;
      const user = await User.create({ email: `board-s${n}@test.local`, password: 'Password123!', role: 'student', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: first, lastName: 'Tester', gender: 'male' });
      const student = await Student.create({ user: user._id, profile: profile._id, studentId: `BOARD-${n}`, school: school._id, approvalStatus: 'approved', status: 'active' });
      if (subscribed) {
        await Subscription.create({ user: user._id, school: school._id, grade: 12, paymentReference: `ref-${n}`, verifiedReference: `ver-${n}`, status: 'approved', startsAt: new Date(now.getTime() - 86400000), expiresAt: later });
      }
      return { user, student };
    };
    const a1 = await mkStudent(schoolA, 'Faadumo');
    const a2 = await mkStudent(schoolA, 'Cabdi');
    const a3 = await mkStudent(schoolA, 'Hodan');
    const a4 = await mkStudent(schoolA, 'Nosub', false);
    const b1 = await mkStudent(schoolB, 'Maxamed');
    const b2 = await mkStudent(schoolB, 'Sacdiya');
    const b3 = await mkStudent(schoolB, 'Axmed');
    const c1 = await mkStudent(schoolC, 'Ayaan');
    const c2 = await mkStudent(schoolC, 'Yaasiin');

    const attempt = (who: any, course: any, question: mongoose.Types.ObjectId, extra: Record<string, unknown> = {}) => ({
      user: who.user._id, student: who.student._id, course: course._id, question, chapterId: 'ch1', correct: true, retry: false, ...extra,
    });
    const qs = (count: number) => Array.from({ length: count }, () => new mongoose.Types.ObjectId());
    const a1Questions = qs(5);
    await Attempt.insertMany([
      ...a1Questions.map((q) => attempt(a1, course12, q)),
      attempt(a1, course12, a1Questions[0]),                   // same question again: no extra points
      attempt(a1, course12, qs(1)[0], { retry: true }),        // retry: no points
      attempt(a1, course12, qs(1)[0], { correct: false }),     // wrong: no points
      attempt(a1, course8, qs(1)[0]),                          // other grade: not in grade 12
    ]);
    const old = new Date(now.getTime() - 20 * 86400000);
    await Attempt.insertMany([
      ...qs(3).map((q) => attempt(a2, course12, q, { createdAt: old })), // 30 points, only outside the week
      attempt(a2, course12, qs(1)[0]),                                   // 10 points inside the week
      ...qs(10).map((q) => attempt(a4, course12, q)),                    // no subscription: never ranked
      ...qs(50).map((q) => attempt(b1, course12, q)),                    // 500 raw in one day: capped at 400
    ]);
    // a3: two new answers on each of three consecutive days -> streak 3.
    const dayAgo = (days: number) => new Date(now.getTime() - days * 86400000);
    await Attempt.insertMany([2, 1, 0].flatMap((d) => qs(2).map((q) => attempt(a3, course12, q, { createdAt: dayAgo(d) }))));

    // Access control.
    await request(app).get('/api/v1/guuldoon-leaderboard/students').expect(401);
    await request(app).get('/api/v1/guuldoon-leaderboard/students?grade=9').set(headers(a1.user)).expect(400);
    await request(app).get('/api/v1/guuldoon-leaderboard/students?period=year').set(headers(a1.user)).expect(400);

    // Weekly student board: b1 400 (daily cap), a1 50, a2 10; a4 is not subscribed.
    let res = await request(app).get('/api/v1/guuldoon-leaderboard/students?grade=12&period=week').set(headers(a1.user)).expect(200);
    let entries = res.body.data.entries;
    assert.deepEqual(entries.map((e: any) => e.points), [400, 90, 55, 15]);
    assert.deepEqual(entries.map((e: any) => e.rank), [1, 2, 3, 4]);
    assert.deepEqual(entries.map((e: any) => e.streak), [1, 3, 1, 1]);
    assert.equal(res.body.data.totalRanked, 4);
    assert.deepEqual(res.body.data.scoring, { perQuestion: 10, streakPerDay: 5, streakMaxDays: 10, dailyCap: 400 });
    // Privacy: nobody opted in, so names and schools are hidden.
    assert.ok(entries.every((e: any) => /^Arday #\d{4}$/.test(e.name) && e.school === null), 'anonymous by default');
    assert.ok(!JSON.stringify(res.body).includes('Faadumo') && !JSON.stringify(res.body).includes('Alpha'), 'no personal data leaks');
    assert.equal(entries[2].isMe, true);
    assert.deepEqual(res.body.data.me, { rank: 3, points: 55, streak: 1, behind: 35, showName: false });

    // All time: a2's older answers count (40 points).
    res = await request(app).get('/api/v1/guuldoon-leaderboard/students?grade=12&period=all').set(headers(a1.user)).expect(200);
    assert.deepEqual(res.body.data.entries.map((e: any) => e.points), [400, 90, 55, 50]);

    // A subscribed student with no points still sees their own place; grade 8 has no subscribers.
    res = await request(app).get('/api/v1/guuldoon-leaderboard/students?grade=12&period=week').set(headers(b3.user)).expect(200);
    assert.deepEqual(res.body.data.me, { rank: 0, points: 0, streak: 0, behind: 0, showName: false });
    res = await request(app).get('/api/v1/guuldoon-leaderboard/students?grade=8&period=all').set(headers(a1.user)).expect(200);
    assert.deepEqual(res.body.data.entries, []);

    // Visibility: only students may change it, and only with a boolean.
    await request(app).patch('/api/v1/guuldoon-leaderboard/me/visibility').set(headers(admin)).send({ showName: true }).expect(403);
    await request(app).patch('/api/v1/guuldoon-leaderboard/me/visibility').set(headers(a1.user)).send({ showName: 'yes' }).expect(400);
    await request(app).patch('/api/v1/guuldoon-leaderboard/me/visibility').set(headers(a1.user)).send({ showName: true }).expect(200);
    res = await request(app).get('/api/v1/guuldoon-leaderboard/students?grade=12&period=week').set(headers(b2.user)).expect(200);
    entries = res.body.data.entries;
    assert.equal(entries[2].name, 'Faadumo T.');
    assert.equal(entries[2].school, 'Alpha School');
    assert.match(entries[0].name, /^Arday #/, 'others stay anonymous');
    assert.equal(entries[2].isMe, false, 'isMe is only set for the requesting student');

    // Staff roles can read the boards.
    const orgA = await User.create({ email: 'board-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    res = await request(app).get('/api/v1/guuldoon-leaderboard/students?grade=12&period=week').set(headers(orgA)).expect(200);
    assert.equal(res.body.data.me, null);

    // School board: average per subscribed student; Tiny School (2 students) is not ranked.
    res = await request(app).get('/api/v1/guuldoon-leaderboard/schools?grade=12&period=week').set(headers(a1.user)).expect(200);
    assert.deepEqual(res.body.data.entries.map((e: any) => [e.rank, e.school, e.students, e.score]), [[1, 'Beta School', 3, 133], [2, 'Alpha School', 3, 53]]);
    assert.equal(res.body.data.minStudents, 3);
    void c1; void c2;

    console.log('Guuldoon leaderboard e2e passed');
  } finally {
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
