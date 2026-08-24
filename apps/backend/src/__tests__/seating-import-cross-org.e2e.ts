/**
 * Exam Seating bulk import — cross-organization room-name collision.
 *
 * Reproduces the reported bug exactly: an org_admin importing a seating
 * spreadsheet for their OWN school's students gets "You do not have
 * permission to access another organization's data" on every single row.
 *
 * Root cause found in exam-seating-plan.controller.ts's parse() (shared by
 * previewImport and importExcel): ExamRoom.findOne({name: row.room}) had NO
 * school filter, unlike the sibling add() endpoint which correctly scopes
 * it. With a generic room name ("Room 10") reused across schools, the
 * unscoped lookup can match a DIFFERENT school's room, and the subsequent
 * assertOwnOrg() then correctly (but confusingly) rejects it as belonging
 * to another org. Two more bugs found in the same file while investigating:
 * list() and rooms() filtered by req.user.schoolId, a field that doesn't
 * exist anywhere in this codebase (always undefined) — for list() this
 * silently disabled the org filter entirely (a data leak: any org_admin
 * saw every school's seating assignments), and for rooms() it meant the
 * unfiltered full room list was iterated with a per-row assertOwnOrg check
 * that throws on the first room belonging to a different org.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:seating-import`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import * as XLSX from 'xlsx';

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

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });

  // Two schools that BOTH name a room "Room 10" — the exact collision that
  // triggered the bug.
  const schoolA = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });
  const schoolB = await School.create({
    name: 'Other School', organizationType: 'private', country: 'Somalia', city: 'Hargeisa',
    address: '2 St', phone: '+001', email: 'b@test.local', principalName: 'Principal B', establishedYear: 2021, createdBy: adminUser._id,
  });

  // School B's "Room 10" was created FIRST, so an unscoped findOne({name})
  // would match it before School A's own "Room 10" — this ordering is what
  // makes the bug reproducible rather than accidentally passing.
  await ExamRoom.create({ name: 'Room 10', building: 'Main Campus', capacity: 15, school: schoolB._id, createdBy: adminUser._id });
  const roomA = await ExamRoom.create({ name: 'Room 10', building: 'Main Campus', capacity: 15, school: schoolA._id, createdBy: adminUser._id });

  const orgAdminUser = await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
  const orgAdminToken = tokenFor(orgAdminUser._id.toString(), 'org_admin', schoolA._id.toString());

  const otherOrgAdminUser = await User.create({ email: 'orgadmin2@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });
  const otherOrgAdminToken = tokenFor(otherOrgAdminUser._id.toString(), 'org_admin', schoolB._id.toString());

  const dept = await Department.create({ name: 'Grade 9', tenantId: schoolA._id });
  const cls = await ClassModel.create({
    school: schoolA._id, department: dept._id, title: 'Grade 9', section: 'A', room: 'Classroom 1',
    gradeLevel: 9, academicYear: '2026/27', status: 'active',
  });

  const studentUser = await User.create({ email: 'leyla@test.local', password: 'Password123!', role: 'student' });
  const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'Leyla', lastName: 'Isaaq', gender: 'female' });
  const student = await Student.create({
    user: studentUser._id, profile: studentProfile._id, studentId: 'TUSMO-089',
    school: schoolA._id, class: cls._id, department: 'Middle School',
  });

  function buildSeatingFile(rows: any[][]) {
    const headers = ['Organization', 'Department', 'Class', 'Shift', 'Student ID', 'Student Name', 'Academic Year', 'Exam Type', 'Room', 'Seat'];
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  const seatingRow = [[schoolA.name, 'Grade 9', 'Grade 9 A', 'Morning', student.studentId, 'Leyla Isaaq', '2026/27', 'Final Exam', 'Room 10', '1']];

  // -------------------------------------------------------------------
  section('PREVIEW IMPORT — org_admin importing their OWN school\'s seating, room name collides with another school');
  // -------------------------------------------------------------------
  const previewRes = await request(app)
    .post('/api/v1/exams/seating-plan/import-preview')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .attach('file', buildSeatingFile(seatingRow), 'seating.xlsx');
  assert(previewRes.status === 200, `preview request succeeds (status ${previewRes.status})`);
  const previewRow = previewRes.body?.data?.[0];
  assert(previewRow?.status === 'valid', `row is valid, NOT rejected as "another organization's data" (got status="${previewRow?.status}", message="${previewRow?.message}")`);

  // -------------------------------------------------------------------
  section('ACTUAL IMPORT — same file, should create the seating assignment');
  // -------------------------------------------------------------------
  const importRes = await request(app)
    .post('/api/v1/exams/seating-plan/import')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .attach('file', buildSeatingFile(seatingRow), 'seating.xlsx');
  assert(importRes.status === 200, `import succeeds (status ${importRes.status})`);
  assert(importRes.body?.data?.imported === 1, `1 seating assignment imported (got ${JSON.stringify(importRes.body?.data)})`);

  // -------------------------------------------------------------------
  section('LIST — org_admin sees only their own school\'s seating (not a cross-org data leak)');
  // -------------------------------------------------------------------
  const listRes = await request(app).get('/api/v1/exams/seating-plan').set('Authorization', `Bearer ${orgAdminToken}`);
  assert(listRes.status === 200, `list request succeeds (status ${listRes.status})`);
  assert(listRes.body?.data?.length === 1, `org_admin sees exactly the 1 seating row for their own school (got ${listRes.body?.data?.length})`);

  const otherListRes = await request(app).get('/api/v1/exams/seating-plan').set('Authorization', `Bearer ${otherOrgAdminToken}`);
  assert(otherListRes.status === 200 && otherListRes.body?.data?.length === 0, `a DIFFERENT org_admin sees 0 rows — no cross-org data leak (got ${otherListRes.body?.data?.length})`);

  // -------------------------------------------------------------------
  section('ROOMS — org_admin sees only their own school\'s rooms, not blocked by the other school\'s "Room 10"');
  // -------------------------------------------------------------------
  const roomsRes = await request(app).get('/api/v1/exams/seating-plan/rooms').set('Authorization', `Bearer ${orgAdminToken}`);
  assert(roomsRes.status === 200, `rooms request succeeds, doesn't throw on the other school's same-named room (status ${roomsRes.status})`);
  const roomIds = (roomsRes.body?.data || []).map((r: any) => r._id);
  assert(roomIds.length === 1 && roomIds[0] === roomA._id.toString(), `org_admin sees exactly their own school's "Room 10" (got ${JSON.stringify(roomsRes.body?.data?.map((r: any) => r.school))})`);

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
