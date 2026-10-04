/**
 * Exam Room — capacity shrink below existing occupancy (Audit round 5).
 *
 * PATCH /exam-rooms/:id let an admin lower a room's `capacity` to any
 * positive number with no check against the ExamSeatingPlan rows already
 * seated in that room for an exam session. Nothing re-validates existing
 * seating after the edit (the per-row capacity check in
 * exam-seating-plan.controller.ts only runs when a seat is added/updated),
 * so the room silently went over capacity: e.g. 30 students seated in a
 * room, then the admin edits its capacity down to 10, and the room is left
 * "full" at 30/10 with no error anywhere. The same gap existed in the bulk
 * Excel import path (POST /exam-rooms/import).
 *
 * Fixed in exam-room.controller.ts: both `update` and `importRooms` now
 * compute the largest number of students already seated in the room for any
 * single (academicYear, examType) session and reject a new capacity below
 * that count.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:exam-room-capacity-shrink`.
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

  const school = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });

  const orgAdmin = await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
  const orgAdminToken = tokenFor(orgAdmin._id.toString(), 'org_admin', school._id.toString());

  const room = await ExamRoom.create({ name: 'Hall 1', building: 'Main Campus', capacity: 30, school: school._id, createdBy: adminUser._id });

  const dept = await Department.create({ name: 'Grade 9', tenantId: school._id });
  const cls = await ClassModel.create({ school: school._id, department: dept._id, title: 'Grade 9', section: 'A', room: 'Classroom 1', gradeLevel: 9, academicYear: '2026/27', status: 'active' });

  async function makeStudent(studentId: string, firstName: string) {
    const u = await User.create({ email: `${studentId.toLowerCase()}@test.local`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: u._id, firstName, lastName: 'Test', gender: 'female' });
    return Student.create({ user: u._id, profile: profile._id, studentId, school: school._id, class: cls._id, department: 'Middle School' });
  }

  // Seat 3 students in the room for the same exam session.
  const seated: any[] = [];
  for (let i = 1; i <= 3; i += 1) {
    seated.push(await makeStudent(`TUSMO-${500 + i}`, `Student${i}`));
  }
  for (let i = 0; i < seated.length; i += 1) {
    await ExamSeatingPlan.create({
      student: seated[i]._id, room: room._id, deskNumber: String(i + 1),
      academicYear: '2026/27', examType: 'final', school: school._id,
    });
  }

  // -------------------------------------------------------------------
  section('PATCH /exam-rooms/:id — shrinking capacity below seated students is rejected');
  // -------------------------------------------------------------------
  const shrinkRes = await request(app)
    .patch(`/api/v1/exam-rooms/${room._id}`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ capacity: 2 });
  assert(shrinkRes.status === 400, `capacity below occupied seats is rejected (status ${shrinkRes.status})`);

  const unchanged = await ExamRoom.findById(room._id).lean() as any;
  assert(Number(unchanged?.capacity) === 30, `room capacity is untouched after the rejected edit (got ${unchanged?.capacity})`);

  // -------------------------------------------------------------------
  section('PATCH /exam-rooms/:id — shrinking to exactly the seated count still succeeds');
  // -------------------------------------------------------------------
  const exactRes = await request(app)
    .patch(`/api/v1/exam-rooms/${room._id}`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ capacity: 3 });
  assert(exactRes.status === 200, `capacity equal to occupied seats succeeds (status ${exactRes.status})`);
  assert(Number(exactRes.body?.data?.capacity) === 3, `room capacity updated to 3 (got ${exactRes.body?.data?.capacity})`);

  // -------------------------------------------------------------------
  section('PATCH /exam-rooms/:id — raising capacity back up is unaffected');
  // -------------------------------------------------------------------
  const raiseRes = await request(app)
    .patch(`/api/v1/exam-rooms/${room._id}`)
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ capacity: 50 });
  assert(raiseRes.status === 200, `raising capacity succeeds (status ${raiseRes.status})`);
  assert(Number(raiseRes.body?.data?.capacity) === 50, `room capacity updated to 50 (got ${raiseRes.body?.data?.capacity})`);

  // -------------------------------------------------------------------
  section('POST /exam-rooms/import — same guard applies to the bulk Excel path');
  // -------------------------------------------------------------------
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.json_to_sheet([
    { Room: 'Hall 1', Building: 'Main Campus', Capacity: 1, Status: 'Active' },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Rooms');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const importRes = await request(app)
    .post('/api/v1/exam-rooms/import')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .attach('file', buffer, 'rooms.xlsx');
  assert(importRes.status === 200, `import call completes (status ${importRes.status})`);
  assert(importRes.body?.data?.updated === 0, `the over-shrinking row was not applied (updated=${importRes.body?.data?.updated})`);
  assert(
    Array.isArray(importRes.body?.data?.errors) && importRes.body.data.errors.some((e: string) => e.includes('Cannot reduce')),
    `the import reports a capacity error for that row (errors: ${JSON.stringify(importRes.body?.data?.errors)})`
  );

  const afterImport = await ExamRoom.findById(room._id).lean() as any;
  assert(Number(afterImport?.capacity) === 50, `room capacity is still 50 after the rejected import row (got ${afterImport?.capacity})`);

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
