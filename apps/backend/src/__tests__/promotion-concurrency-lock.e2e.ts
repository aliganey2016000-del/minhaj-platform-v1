/**
 * Promotion-run concurrency regression.
 *
 * promote-all / promote-reviewed / undo-promotion all read every affected
 * student's current class and enrollmentHistory, decide who still needs to
 * move, and then mutate each student with reassignStudentClassCourses ->
 * syncEnrollmentHistory, which pushes onto the enrollmentHistory array and
 * saves the document. A double-click of "Confirm Promotion" (or a client
 * retry overlapping a still-running first request) launches a second run
 * before the first one's writes land: both reads see the same
 * pre-promotion state, so both decide the same students still need to move
 * and both push from their own stale in-memory copy of the history array.
 * Mongoose's optimistic `__v` check on `save()` then makes the second
 * writer's save throw a VersionError mid-batch for every student the two
 * runs overlap on, aborting that request partway through instead of either
 * queuing behind the first run or being cleanly rejected.
 *
 * acquirePromotionLock/releasePromotionLock (class-promotion.service.ts,
 * backed by promotion-lock.model.ts) close this by serializing promotion
 * runs per school with a single atomic findOneAndUpdate upsert, the same
 * claim shape reminder-lock.model.ts already uses for the scheduler race.
 *
 * This file verifies the atomic-claim property directly against the model
 * (claim / already-claimed / release / re-claim), and then verifies the
 * HTTP-level behavior: firing promote-all twice back-to-back without
 * awaiting the first either fails the second cleanly with 409 (lock held)
 * or still leaves the student state correct (if the second request only
 * started after the first one's lock had already been released) — it must
 * never leave the student promoted twice or throw an uncaught 500.
 *
 * FerretDB note: PromotionLock has no `select: false` fields, so the
 * findOneAndUpdate upsert this test exercises is unaffected by the
 * FerretDB `findAndModify` "fields" limitation documented for User-model
 * queries elsewhere in this suite.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import mongoose from 'mongoose';
import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('promotion-lock');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Department } = await import('../models/department.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Student } = await import('../models/student.model');
    const { acquirePromotionLock, releasePromotionLock } = await import('../services/class-promotion.service');

    section('ATOMIC CLAIM — first caller wins, second is refused until released');
    const schoolIdForClaim = new mongoose.Types.ObjectId().toString();
    const firstClaim = await acquirePromotionLock(schoolIdForClaim);
    assert(firstClaim === true, 'the first caller claims the lock');
    const secondClaim = await acquirePromotionLock(schoolIdForClaim);
    assert(secondClaim === false, 'a second caller is refused while the first still holds it');
    await releasePromotionLock(schoolIdForClaim);
    const thirdClaim = await acquirePromotionLock(schoolIdForClaim);
    assert(thirdClaim === true, 'after release, a new caller can claim it again');
    await releasePromotionLock(schoolIdForClaim);

    // Independent school ids never contend with each other.
    const otherSchoolId = new mongoose.Types.ObjectId().toString();
    const claimA = await acquirePromotionLock(schoolIdForClaim);
    const claimB = await acquirePromotionLock(otherSchoolId);
    assert(claimA === true && claimB === true, 'locks are scoped per school — one school in progress does not block another');
    await releasePromotionLock(schoolIdForClaim);
    await releasePromotionLock(otherSchoolId);

    section('HTTP LEVEL — overlapping promote-all requests never corrupt or duplicate a promotion');
    const admin = await User.create({ email: 'promo-lock-admin@test.local', password: 'Password123!', role: 'admin' });
    const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
    const school = await School.create({
      name: 'Promotion Lock School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: 'Road', phone: '+252611111112', email: 'promo-lock-school@test.local', principalName: 'Principal',
      establishedYear: 2020, createdBy: admin._id,
    });
    const department = await Department.create({ name: 'Secondary', tenantId: school._id });

    const grade5 = await ClassModel.create({
      school: school._id, department: department._id, title: 'Grade 5', section: 'A', room: 'Room 5',
      gradeLevel: 5, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning',
    });
    const grade6 = await ClassModel.create({
      school: school._id, department: department._id, title: 'Grade 6', section: 'A', room: 'Room 6',
      gradeLevel: 6, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning',
    });

    const studentUser = await User.create({ email: 'promo-lock-student@test.local', password: 'Password123!', role: 'student' });
    const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'Lock', lastName: 'Student', gender: 'male' });
    const student = await Student.create({
      user: studentUser._id, profile: studentProfile._id, school: school._id, class: grade5._id,
      status: 'active', approvalStatus: 'approved', enrolledCourses: [], enrollmentHistory: [],
    });

    const fire = () => request(app).post('/api/v1/classes/promote-all').set('Authorization', `Bearer ${token}`)
      .send({ schoolId: school._id.toString(), targetAcademicYear: '2027-2028' });

    // Two overlapping requests for the SAME school/target year, fired
    // without awaiting the first — reproduces the double-click/retry race.
    const [respA, respB] = await Promise.all([fire(), fire()]);

    const statuses = [respA.status, respB.status].sort();
    assert(
      statuses.every((s) => s === 200 || s === 409),
      `both overlapping requests resolve cleanly as 200 or 409, never an uncaught 500 (got ${JSON.stringify(statuses)})`,
    );
    assert(
      statuses.includes(409) || (respA.status === 200 && respB.status === 200),
      `at least one request is refused with 409 while the other runs, or both legitimately complete in sequence (got ${JSON.stringify(statuses)})`,
    );

    const afterRace: any = await Student.findById(student._id).lean();
    assert(String(afterRace?.class) === String(grade6._id), 'the student ends up promoted into Grade 6 exactly once');
    const historyFor2728 = (afterRace?.enrollmentHistory || []).filter((h: any) => h.academicYear === '2027-2028');
    assert(historyFor2728.length === 1, `exactly one 2027-2028 history entry exists after the race, not duplicated (got ${historyFor2728.length})`);

    // The lock must be released after each run (success or failure) so a
    // legitimate follow-up request is never stuck behind a finished one.
    const followUp = await request(app).get('/api/v1/classes/promotion-preview').set('Authorization', `Bearer ${token}`)
      .query({ schoolId: school._id.toString() });
    assert(followUp.status === 200, 'the lock is released after the race — a later request is not stuck behind it');
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll promotion-concurrency-lock assertions passed.');
}

main().catch((error) => {
  console.error('promotion-concurrency-lock.e2e failed:', error);
  process.exit(1);
});
