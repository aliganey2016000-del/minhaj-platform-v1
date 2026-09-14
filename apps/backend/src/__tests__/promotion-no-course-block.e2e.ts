/**
 * School year-end promotion regression test.
 *
 * Classes are persistent: Grade 9, Grade 10, Grade 11, Grade 12 already
 * exist as the real, ongoing classes (not per-year clones), so promoting a
 * Grade 9 student moves them into the SAME pre-existing Grade 10 document —
 * no new Class or Course is ever created, and missing courses on the target
 * are a non-issue (nothing gets copied either way). This also covers the
 * real-world case that gave this file its name: a school whose grades are
 * valid and have students but no published Course records yet — that must
 * not block promotion.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Course } = await import('../models/course.model');

  const admin = await User.create({ email: 'promotion-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });

  const school = await School.create({
    name: 'Promotion Test School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Test Road', phone: '+252000000', email: 'promotion-school@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: admin._id,
  });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });

  // Each grade's own batch label is different (the entry-cohort year for
  // THAT grade's current students) — this must NOT block Grade 9's students
  // from finding Grade 10 as their target; only gradeLevel/department/section
  // identify the persistent target class.
  async function makeClass(gradeLevel: number, isGraduatingGrade = false) {
    return ClassModel.create({
      school: school._id, department: department._id, title: `Grade ${gradeLevel}`, section: 'a',
      room: `Room ${gradeLevel}`, batch: `B${gradeLevel}`, gradeLevel, academicYear: '2026-2027',
      status: 'active', isGraduatingGrade,
    });
  }

  async function makeStudent(firstName: string, cls: any) {
    const user = await User.create({ email: `${firstName.toLowerCase()}@promotion.test`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: user._id, firstName, lastName: 'Student', gender: 'male' });
    return Student.create({
      user: user._id, profile: profile._id, school: school._id, class: cls._id,
      status: 'active', approvalStatus: 'approved', enrolledCourses: [], enrollmentHistory: [],
    });
  }

  const grade9 = await makeClass(9);
  const grade10 = await makeClass(10);
  const grade11 = await makeClass(11);
  const grade12 = await makeClass(12, true);

  const g9a = await makeStudent('G9A', grade9);
  const g9b = await makeStudent('G9B', grade9);
  const g10a = await makeStudent('G10A', grade10);
  const g12a = await makeStudent('G12A', grade12);

  assert(await Course.countDocuments({ school: school._id }) === 0, 'fixture has zero courses');
  const classCountBefore = await ClassModel.countDocuments({ school: school._id });

  console.log('\n=== PREVIEW: existing next-grade classes are the target, missing courses do not block ===');
  const preview = await request(app)
    .get('/api/v1/classes/promotion-preview')
    .set('Authorization', `Bearer ${token}`)
    .query({ schoolId: school._id.toString() });

  assert(preview.status === 200, `preview succeeds (got ${preview.status})`);

  const groupFor = (cls: any) => preview.body?.data?.groups?.find((group: any) => String(group.classId) === String(cls._id));
  assert(groupFor(grade9)?.action === 'promote' && String(groupFor(grade9)?.targetClassId) === String(grade10._id), 'Grade 9 targets the existing Grade 10 (not a new class)');
  assert(groupFor(grade10)?.action === 'promote' && String(groupFor(grade10)?.targetClassId) === String(grade11._id), 'Grade 10 targets the existing Grade 11');
  assert(groupFor(grade12)?.action === 'graduate', `explicit final grade graduates (got ${groupFor(grade12)?.action})`);
  assert(!groupFor(grade11), 'Grade 11 has no active students of its own, so it is not previewed as a source');
  assert(preview.body?.data?.missingTargetCount === 0, 'no target class is missing');

  console.log('\n=== EXECUTION ===');
  const promoted = await request(app)
    .post('/api/v1/classes/promote-all')
    .set('Authorization', `Bearer ${token}`)
    .send({ schoolId: school._id.toString(), targetAcademicYear: '2027-2028' });

  assert(promoted.status === 200, `promote-all succeeds (got ${promoted.status})`);
  assert(promoted.body?.data?.promoted === 2, `two classes progressed (Grade 9 and Grade 10; got ${promoted.body?.data?.promoted})`);
  assert(promoted.body?.data?.studentsMoved === 3, `three students promoted (got ${promoted.body?.data?.studentsMoved})`);
  assert(promoted.body?.data?.graduated === 1, `one Grade 12 student graduated (got ${promoted.body?.data?.graduated})`);
  assert((promoted.body?.data?.missingTargets || []).length === 0, 'no class was skipped for a missing target');

  const classCountAfter = await ClassModel.countDocuments({ school: school._id });
  assert(classCountAfter === classCountBefore, `no new Class documents were created (before ${classCountBefore}, after ${classCountAfter})`);
  assert(await Course.countDocuments({ school: school._id }) === 0, 'still zero courses — nothing was cloned');

  const movedG9A = await Student.findById(g9a._id).lean();
  const movedG9B = await Student.findById(g9b._id).lean();
  const movedG10A = await Student.findById(g10a._id).lean();
  const graduatedG12A = await Student.findById(g12a._id).lean();

  assert(String((movedG9A as any)?.class) === String(grade10._id), 'Grade 9 student A moved into the EXISTING Grade 10 class');
  assert(String((movedG9B as any)?.class) === String(grade10._id), 'Grade 9 student B moved into the EXISTING Grade 10 class');
  assert(String((movedG10A as any)?.class) === String(grade11._id), 'Grade 10 student moved into the EXISTING Grade 11 class, not a fresh one');
  assert((graduatedG12A as any)?.status === 'graduated', 'Grade 12 student is graduated');

  const historyG9A = ((movedG9A as any)?.enrollmentHistory || []).find((h: any) => h.status === 'active');
  assert(historyG9A?.academicYear === '2027-2028' && String(historyG9A?.class) === String(grade10._id), 'promotion is recorded in enrollmentHistory with the new academic year');

  console.log('\n=== SAME-REQUEST GUARD: one promote-all call does not cascade a student through two grades ===');
  // Grade 9's students moved into Grade 10 above; Grade 10 is itself a
  // promotable (non-final) source. A single request must not also sweep
  // those same students straight on into Grade 11 in the same run.
  assert(String((movedG9A as any)?.class) !== String(grade11._id), 'a promoted Grade 9 student does not skip ahead to Grade 11 in the same run');

  console.log('\n=== SOURCE CLASSES STAY ACTIVE — NEVER "completed" ===');
  const sourceGrade9After = await ClassModel.findById(grade9._id).lean();
  const sourceGrade10After = await ClassModel.findById(grade10._id).lean();
  assert((sourceGrade9After as any)?.status === 'active', `Grade 9 remains active, ready for new admissions (got ${(sourceGrade9After as any)?.status})`);
  assert((sourceGrade10After as any)?.status === 'active', `Grade 10 remains active (got ${(sourceGrade10After as any)?.status})`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
