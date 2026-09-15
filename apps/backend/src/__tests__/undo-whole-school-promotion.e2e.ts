/**
 * Undo Whole-School Promotion — the preview count must match what undo can
 * actually revert.
 *
 * Reported directly: an admin bulk-imported 722 students straight into
 * classes already labeled with the current academic year (no promotion ever
 * ran), then tried "Undo Whole-School Promotion" out of curiosity. The
 * preview said "722 student(s) will be moved back" — but clicking through
 * reverted 0 and reported all 722 as "skipped: no prior enrollment record
 * to restore".
 *
 * Root cause: findPromotedStudents() (the query behind both the preview and
 * the actual undo) only checked "is this student currently active in the
 * target academic year", the same thing true of any student ever placed in
 * a class carrying that year, promoted or not. revertStudentPromotion()
 * additionally requires a *prior* enrollmentHistory entry to restore — a
 * student created directly into a target-year class (never promoted) has
 * only that one entry, so it always returns null (skip) for them. The
 * preview and the real outcome disagreed because they used different
 * conditions to count "affected" students.
 *
 * The fix adds the same requirement to the preview/undo query: an active
 * match only counts if a second (prior) enrollmentHistory entry also
 * exists. This test proves both halves:
 *  - a student who really was promoted (created in an earlier year, then
 *    actually moved forward by promote-all) is counted AND reverted;
 *  - a student created directly into a class already labeled with the
 *    target year (never promoted) is correctly excluded from the count,
 *    matching what undo would actually do to them.
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
function section(title: string) {
  console.log(`\n=== ${title} ===`);
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
  const { syncStudentCourseEnrollment } = await import('../services/enrollment.service');

  const admin = await User.create({ email: 'undo-promo-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
  const school = await School.create({
    name: 'Undo Promotion School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Road', phone: '+252611222222', email: 'undo-promo-school@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: admin._id,
  });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });

  async function makeClass(gradeLevel: number, academicYear: string) {
    return ClassModel.create({
      school: school._id, department: department._id, title: `Grade ${gradeLevel}`, section: 'A',
      room: `Room ${gradeLevel}-${academicYear}`, gradeLevel, academicYear, status: 'active', shiftMode: 'Morning',
    });
  }
  // Mirrors the real student-registration-io.controller.ts creation path:
  // an empty enrollmentHistory, then syncStudentCourseEnrollment() opens
  // the student's first (genesis) history entry against their class's own
  // academicYear — exactly what happens on a real Add/Import.
  async function makeStudent(name: string, cls: any) {
    const user = await User.create({ email: `${name.toLowerCase()}@undo-promo.test`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: user._id, firstName: name, lastName: 'Student', gender: 'male' });
    const student = await Student.create({
      user: user._id, profile: profile._id, school: school._id, class: cls._id,
      status: 'active', approvalStatus: 'approved', enrolledCourses: [], enrollmentHistory: [],
    });
    await syncStudentCourseEnrollment(student._id as mongoose.Types.ObjectId, cls._id);
    return student;
  }

  section('SETUP — one genuinely promoted student, one imported straight into the target year');
  const grade5_2026 = await makeClass(5, '2026-2027');
  const grade6_2027 = await makeClass(6, '2027-2028');

  const promotedStudent = await makeStudent('Promoted', grade5_2026);
  const promote = await request(app).post('/api/v1/classes/promote-all').set('Authorization', `Bearer ${token}`).send({ schoolId: school._id.toString(), targetAcademicYear: '2027-2028' });
  assert(promote.status === 200 && promote.body?.data?.studentsMoved === 1, `the promoted student actually moves via promote-all (got ${JSON.stringify(promote.body?.data)})`);

  // Simulates the reported scenario: a student bulk-imported directly into
  // a class that already carries the target year — never promoted.
  const importedStudent = await makeStudent('ImportedDirect', grade6_2027);

  section('PREVIEW — only counts the student who was actually promoted');
  const preview = await request(app)
    .get('/api/v1/classes/undo-promotion-preview')
    .set('Authorization', `Bearer ${token}`)
    .query({ schoolId: school._id.toString(), targetAcademicYear: '2027-2028' });
  assert(preview.status === 200, `preview request succeeds (status ${preview.status})`);
  assert(preview.body?.data?.affectedStudentCount === 1, `preview counts exactly the 1 genuinely promoted student, not both (got ${preview.body?.data?.affectedStudentCount})`);

  section('UNDO — reverts the genuinely promoted student, leaves the directly-imported one alone');
  const undo = await request(app)
    .post('/api/v1/classes/undo-promotion')
    .set('Authorization', `Bearer ${token}`)
    .send({ schoolId: school._id.toString(), targetAcademicYear: '2027-2028' });
  assert(undo.status === 200, `undo request succeeds (status ${undo.status})`);
  assert(undo.body?.data?.movedBack === 1, `exactly 1 student is moved back (got ${undo.body?.data?.movedBack})`);
  assert(undo.body?.data?.skipped === 0, `nothing is reported as skipped — the query no longer claims a student it can't actually revert (got ${undo.body?.data?.skipped})`);

  const revertedPromoted: any = await Student.findById(promotedStudent._id).lean();
  assert(String(revertedPromoted?.class) === String(grade5_2026._id), 'the genuinely promoted student is back in Grade 5 / 2026-2027');

  const untouchedImported: any = await Student.findById(importedStudent._id).lean();
  assert(String(untouchedImported?.class) === String(grade6_2027._id), 'the directly-imported student is untouched, still in Grade 6 / 2027-2028 — there was never a "before" to restore');

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL UNDO WHOLE-SCHOOL PROMOTION CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
