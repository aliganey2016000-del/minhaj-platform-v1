/**
 * Exam Seating — bulk delete (checkbox-selected rows).
 *
 * Backs the Exam Seating Center's new checkbox column + "Delete Selected"
 * toolbar: DELETE /exams/seating-plan with a JSON body of { ids }. Org-scoped
 * via applyOrgFilter rather than a per-row assertOwnOrg loop, so ids that
 * don't belong to the caller's own school are silently excluded from the
 * delete instead of failing the whole batch — verified here by mixing in an
 * id from a different school and confirming it survives.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:seating-bulk-delete`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to in-memory MongoDB:', process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Student } = await import('../models/student.model');
  const { default: ExamRoom } = await import('../models/exam-room.model');
  const { default: ExamSeatingPlan } = await import('../models/exam-seating-plan.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });

  const schoolA = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });
  const schoolB = await School.create({
    name: 'Other School', organizationType: 'private', country: 'Somalia', city: 'Hargeisa',
    address: '2 St', phone: '+001', email: 'b@test.local', principalName: 'Principal B', establishedYear: 2021, createdBy: adminUser._id,
  });

  const orgAdminA = await User.create({ email: 'orgadminA@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
  const orgAdminAToken = tokenFor(orgAdminA._id.toString(), 'org_admin', schoolA._id.toString());

  const roomA = await ExamRoom.create({ name: 'Room 1', building: 'Main Campus', capacity: 30, school: schoolA._id, createdBy: adminUser._id });
  const roomB = await ExamRoom.create({ name: 'Room 1', building: 'Main Campus', capacity: 30, school: schoolB._id, createdBy: adminUser._id });

  const deptA = await Department.create({ name: 'Grade 9', tenantId: schoolA._id });
  const clsA = await ClassModel.create({ school: schoolA._id, department: deptA._id, title: 'Grade 9', section: 'A', room: 'Classroom 1', gradeLevel: 9, academicYear: '2026/27', status: 'active' });
  const deptB = await Department.create({ name: 'Grade 9', tenantId: schoolB._id });
  const clsB = await ClassModel.create({ school: schoolB._id, department: deptB._id, title: 'Grade 9', section: 'A', room: 'Classroom 1', gradeLevel: 9, academicYear: '2026/27', status: 'active' });

  async function makeStudent(studentId: string, firstName: string, school: any, cls: any) {
    const u = await User.create({ email: `${studentId.toLowerCase()}@test.local`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: u._id, firstName, lastName: 'Test', gender: 'female' });
    return Student.create({ user: u._id, profile: profile._id, studentId, school: school._id, class: cls._id, department: 'Middle School' });
  }

  const s1 = await makeStudent('TUSMO-401', 'Leyla', schoolA, clsA);
  const s2 = await makeStudent('TUSMO-402', 'Xasan', schoolA, clsA);
  const s3 = await makeStudent('TUSMO-901', 'Faarax', schoolB, clsB);

  const seat1 = await ExamSeatingPlan.create({ student: s1._id, room: roomA._id, deskNumber: '1', academicYear: '2026/27', examType: 'final', school: schoolA._id });
  const seat2 = await ExamSeatingPlan.create({ student: s2._id, room: roomA._id, deskNumber: '2', academicYear: '2026/27', examType: 'final', school: schoolA._id });
  const seatOther = await ExamSeatingPlan.create({ student: s3._id, room: roomB._id, deskNumber: '1', academicYear: '2026/27', examType: 'final', school: schoolB._id });

  // -------------------------------------------------------------------
  section('BULK DELETE — org_admin deletes 2 of their own rows, a 3rd id from another school is ignored');
  // -------------------------------------------------------------------
  const res = await request(app)
    .delete('/api/v1/exams/seating-plan')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ ids: [seat1._id.toString(), seat2._id.toString(), seatOther._id.toString()] });
  assert(res.status === 200, `bulk delete succeeds (status ${res.status})`);
  assert(res.body?.data?.deleted === 2, `reports exactly 2 deleted, not 3 (got ${JSON.stringify(res.body?.data)})`);

  const remaining = await ExamSeatingPlan.find({}).lean();
  assert(remaining.length === 1, `only 1 row remains in the whole DB (got ${remaining.length})`);
  assert(remaining[0]?._id.toString() === seatOther._id.toString(), `the surviving row is the other school's — untouched by the cross-org id in the request`);

  // -------------------------------------------------------------------
  section('EMPTY/MISSING ids — rejected with a clear error, nothing deleted');
  // -------------------------------------------------------------------
  const emptyRes = await request(app)
    .delete('/api/v1/exams/seating-plan')
    .set('Authorization', `Bearer ${orgAdminAToken}`)
    .send({ ids: [] });
  assert(emptyRes.status === 400, `empty ids array is rejected (status ${emptyRes.status})`);
  const stillOne = await ExamSeatingPlan.countDocuments({});
  assert(stillOne === 1, `nothing further was deleted (got ${stillOne} remaining)`);

  // -------------------------------------------------------------------
  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) {
    console.log('ALL CHECKS PASSED (0 failures)');
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
  }
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
