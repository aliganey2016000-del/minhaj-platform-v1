/**
 * School year-end promotion regression test.
 *
 * The real-world case this protects is a school whose Grade 9-12 classes are
 * valid and have students, but no published Course records are attached yet.
 * Missing curriculum must be a warning, not a blocker: classes still progress,
 * students still move, Grade 12 graduates, and the next entry intake is opened.
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

  async function makeClass(gradeLevel: number) {
    return ClassModel.create({
      school: school._id,
      department: department._id,
      title: `Grade ${gradeLevel}`,
      section: 'a',
      room: `Room ${gradeLevel}`,
      batch: `B${gradeLevel}`,
      gradeLevel,
      academicYear: '2026-2027',
      status: 'active',
    });
  }

  async function makeStudent(firstName: string, cls: any) {
    const user = await User.create({
      email: `${firstName.toLowerCase()}@promotion.test`,
      password: 'Password123!',
      role: 'student',
    });
    const profile = await Profile.create({ user: user._id, firstName, lastName: 'Student', gender: 'male' });
    return Student.create({
      user: user._id,
      profile: profile._id,
      school: school._id,
      class: cls._id,
      status: 'active',
      approvalStatus: 'approved',
      enrolledCourses: [],
      enrollmentHistory: [],
    });
  }

  const grade9 = await makeClass(9);
  const grade10 = await makeClass(10);
  const grade11 = await makeClass(11);
  const grade12 = await makeClass(12);

  const g9a = await makeStudent('G9A', grade9);
  const g9b = await makeStudent('G9B', grade9);
  const g10a = await makeStudent('G10A', grade10);
  const g12a = await makeStudent('G12A', grade12);

  assert(await Course.countDocuments({ school: school._id }) === 0, 'fixture has zero courses');

  console.log('\n=== PREVIEW: missing courses do not block promotion ===');
  const preview = await request(app)
    .get('/api/v1/classes/promotion-preview')
    .set('Authorization', `Bearer ${token}`);

  assert(preview.status === 200, `preview succeeds (got ${preview.status})`);
  assert(preview.body?.data?.sourceAcademicYear === '2026-2027', 'source academic year is 2026-2027');
  assert(preview.body?.data?.targetAcademicYear === '2027-2028', 'target academic year is 2027-2028');
  assert(preview.body?.data?.entryIntakesToOpen === 1, `one entry intake will open (got ${preview.body?.data?.entryIntakesToOpen})`);

  const groupFor = (cls: any) => preview.body?.data?.groups?.find((group: any) => String(group.classId) === String(cls._id));
  assert(groupFor(grade9)?.action === 'promote-new', `Grade 9 is promotable without courses (got ${groupFor(grade9)?.action})`);
  assert(groupFor(grade10)?.action === 'promote-new', `Grade 10 is promotable without courses (got ${groupFor(grade10)?.action})`);
  assert(groupFor(grade11)?.action === 'promote-new', `Grade 11 is promotable without courses (got ${groupFor(grade11)?.action})`);
  assert(groupFor(grade12)?.action === 'graduate', `highest source grade is inferred as final (got ${groupFor(grade12)?.action})`);
  assert((preview.body?.data?.groups || []).filter((group: any) => group.action === 'skipped').length === 0, 'no class is skipped merely because courses are missing');

  console.log('\n=== EXECUTION ===');
  const promoted = await request(app)
    .post('/api/v1/classes/promote-all')
    .set('Authorization', `Bearer ${token}`)
    .send({ targetAcademicYear: '2027-2028' });

  assert(promoted.status === 200, `promote-all succeeds (got ${promoted.status})`);
  assert(promoted.body?.data?.promoted === 3, `three classes progressed (got ${promoted.body?.data?.promoted})`);
  assert(promoted.body?.data?.studentsMoved === 3, `three students promoted (got ${promoted.body?.data?.studentsMoved})`);
  assert(promoted.body?.data?.graduated === 1, `one Grade 12 student graduated (got ${promoted.body?.data?.graduated})`);
  assert(promoted.body?.data?.skipped === 0, `zero classes skipped (got ${promoted.body?.data?.skipped})`);
  assert(promoted.body?.data?.targetsCreated === 3, `three progression target classes prepared (got ${promoted.body?.data?.targetsCreated})`);
  assert(promoted.body?.data?.intakesOpened === 1, `one new Grade 9 intake opened (got ${promoted.body?.data?.intakesOpened})`);
  assert(promoted.body?.data?.coursesCopied === 0, 'zero courses copied because no source curriculum exists');

  const targetClasses = await ClassModel.find({ school: school._id, academicYear: '2027-2028', status: 'active' }).sort({ gradeLevel: 1 });
  assert(targetClasses.length === 4, `2027-2028 contains Grade 9-12 structure (got ${targetClasses.length} classes)`);
  assert(targetClasses.map((cls) => cls.gradeLevel).join(',') === '9,10,11,12', `target grades are 9,10,11,12 (got ${targetClasses.map((cls) => cls.gradeLevel).join(',')})`);

  const targetGrade10 = targetClasses.find((cls) => cls.gradeLevel === 10)!;
  const targetGrade11 = targetClasses.find((cls) => cls.gradeLevel === 11)!;
  const movedG9A = await Student.findById(g9a._id).lean();
  const movedG9B = await Student.findById(g9b._id).lean();
  const movedG10A = await Student.findById(g10a._id).lean();
  const graduatedG12A = await Student.findById(g12a._id).lean();

  assert(String((movedG9A as any)?.class) === String(targetGrade10._id), 'Grade 9 student A moved to next-year Grade 10');
  assert(String((movedG9B as any)?.class) === String(targetGrade10._id), 'Grade 9 student B moved to next-year Grade 10');
  assert(String((movedG10A as any)?.class) === String(targetGrade11._id), 'Grade 10 student moved to next-year Grade 11');
  assert((graduatedG12A as any)?.status === 'graduated', 'Grade 12 student is graduated');
  assert(await Course.countDocuments({ school: school._id, class: { $in: targetClasses.map((cls) => cls._id) } }) === 0, 'target classes may validly start with no courses');

  console.log('\n=== IDEMPOTENCY / COMPLETED FINAL GRADE ===');
  const runAgain = await request(app)
    .post('/api/v1/classes/promote-all')
    .set('Authorization', `Bearer ${token}`)
    .send({ targetAcademicYear: '2027-2028' });
  assert(runAgain.status === 200, 'second run succeeds safely');
  assert(runAgain.body?.data?.studentsMoved === 0, `second run moves zero students (got ${runAgain.body?.data?.studentsMoved})`);
  assert(runAgain.body?.data?.graduated === 0, `second run graduates nobody else (got ${runAgain.body?.data?.graduated})`);

  const sourceGrade11After = await ClassModel.findById(grade11._id).lean();
  assert((sourceGrade11After as any)?.status === 'completed', 'Grade 11 source is completed, not misclassified as a new final grade');

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
