/**
 * Exam Seating import — capacity is advisory, duplicate-seat is still
 * auto-fixable.
 *
 * The admin asked for room capacity to never block an import — whatever
 * seat number they enter must be accepted, even past the room's configured
 * capacity (capacity is a soft planning number, not a hard limit here). A
 * TRUE conflict — two rows in the same file claiming the exact same
 * room+seat — is still flagged, and still comes with a
 * `suggestion: { room, seat }` pointing at the next free numeric seat
 * across the school's rooms (advisory only — nothing changes until the
 * admin accepts it via "Apply Fix").
 *
 * The frontend's "Apply Fix" button re-validates the corrected row via
 * POST /exams/seating-plan/validate-rows (JSON body, no file needed), and
 * once every row is clean, Import runs from those in-memory rows via
 * POST /exams/seating-plan/import-rows — no re-upload needed.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:seating-smart-fix`.
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
  const { default: ExamSeatingPlan } = await import('../models/exam-seating-plan.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });

  const school = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });

  // Room 1 has only 1 seat — the second student's row will overflow it.
  // Room 2 exists as the only place a suggestion can point to.
  await ExamRoom.create({ name: 'Room 1', building: 'Main Campus', capacity: 1, school: school._id, createdBy: adminUser._id });
  await ExamRoom.create({ name: 'Room 2', building: 'Main Campus', capacity: 5, school: school._id, createdBy: adminUser._id });

  const orgAdminUser = await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
  const orgAdminToken = tokenFor(orgAdminUser._id.toString(), 'org_admin', school._id.toString());

  const dept = await Department.create({ name: 'Grade 9', tenantId: school._id });
  const cls = await ClassModel.create({
    school: school._id, department: dept._id, title: 'Grade 9', section: 'A', room: 'Classroom 1',
    gradeLevel: 9, academicYear: '2026/27', status: 'active',
  });

  async function makeStudent(studentId: string, firstName: string) {
    const u = await User.create({ email: `${studentId.toLowerCase()}@test.local`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: u._id, firstName, lastName: 'Test', gender: 'female' });
    return Student.create({ user: u._id, profile: profile._id, studentId, school: school._id, class: cls._id, department: 'Middle School' });
  }

  const student1 = await makeStudent('TUSMO-301', 'Leyla');
  const student2 = await makeStudent('TUSMO-302', 'Xasan');
  const student3 = await makeStudent('TUSMO-303', 'Cali');

  function buildSeatingFile(rows: any[][]) {
    const headers = ['Organization', 'Department', 'Class', 'Shift', 'Student ID', 'Student Name', 'Academic Year', 'Exam Type', 'Room', 'Seat'];
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  const rows = [
    [school.name, 'Grade 9', 'Grade 9 A', 'Morning', student1.studentId, 'Leyla Test', '2026/27', 'Final Exam', 'Room 1', '1'],
    // Same room+seat as row 1 — a genuine within-file conflict, still flagged.
    [school.name, 'Grade 9', 'Grade 9 A', 'Morning', student2.studentId, 'Xasan Test', '2026/27', 'Final Exam', 'Room 1', '1'],
    // Room 1's capacity is 1 — seat 99 is far past it, but must be ACCEPTED, not blocked.
    [school.name, 'Grade 9', 'Grade 9 A', 'Morning', student3.studentId, 'Cali Test', '2026/27', 'Final Exam', 'Room 1', '99'],
  ];

  // -------------------------------------------------------------------
  section('PREVIEW IMPORT — row 3 exceeds Room 1 capacity but is accepted; row 2 is a true duplicate-seat conflict');
  // -------------------------------------------------------------------
  const previewRes = await request(app)
    .post('/api/v1/exams/seating-plan/import-preview')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .attach('file', buildSeatingFile(rows), 'seating.xlsx');
  assert(previewRes.status === 200, `preview succeeds (status ${previewRes.status})`);
  const preview = previewRes.body?.data || [];
  assert(preview[0]?.status === 'valid', `row 1 is valid (got status="${preview[0]?.status}")`);
  assert(preview[2]?.status === 'valid', `row 3 (seat 99 in a 1-seat room) is ACCEPTED, capacity is no longer a blocking error (got status="${preview[2]?.status}", message="${preview[2]?.message}")`);
  assert(preview[1]?.status === 'error', `row 2 is an error — genuine duplicate seat within the file (got status="${preview[1]?.status}")`);
  assert(preview[1]?.message?.includes('Duplicate seat'), `row 2 error message is about the duplicate seat (got "${preview[1]?.message}")`);
  assert(preview[1]?.suggestion?.room === 'Room 2' && preview[1]?.suggestion?.seat === '1', `row 2 suggests the next free seat, Room 2 seat 1 (got ${JSON.stringify(preview[1]?.suggestion)})`);

  // -------------------------------------------------------------------
  section('APPLY FIX — re-validate with the suggestion applied to row 2');
  // -------------------------------------------------------------------
  const asJsonRows = (rs: any[]) => rs.map((r: any) => ({ organization: r.organization, department: r.department, className: r.className, shift: r.shift, studentId: r.studentId, studentName: r.studentName, academicYear: r.academicYear, examType: r.examType, room: r.room, seat: r.seat }));
  const fixedRows = preview.map((r: any, i: number) => (i === 1 ? { ...r, room: r.suggestion.room, seat: r.suggestion.seat } : r));
  const revalidateRes = await request(app)
    .post('/api/v1/exams/seating-plan/validate-rows')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ rows: asJsonRows(fixedRows) });
  assert(revalidateRes.status === 200, `re-validate succeeds (status ${revalidateRes.status})`);
  const revalidated = revalidateRes.body?.data || [];
  assert(revalidated.every((r: any) => r.status === 'valid'), `all 3 rows are now valid after applying the fix (got statuses ${JSON.stringify(revalidated.map((r: any) => r.status))})`);
  assert(revalidated[1]?.room === 'Room 2' && revalidated[1]?.seat === '1', `row 2 now targets Room 2 seat 1 (got room="${revalidated[1]?.room}", seat="${revalidated[1]?.seat}")`);

  // -------------------------------------------------------------------
  section('IMPORT FROM JSON ROWS — no re-upload, imports directly from the fixed rows');
  // -------------------------------------------------------------------
  const importRes = await request(app)
    .post('/api/v1/exams/seating-plan/import-rows')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ rows: asJsonRows(revalidated) });
  assert(importRes.status === 200, `import-rows succeeds (status ${importRes.status})`);
  assert(importRes.body?.data?.imported === 3, `3 seating assignments imported (got ${JSON.stringify(importRes.body?.data)})`);

  const saved = await ExamSeatingPlan.find({ school: school._id }).populate('room', 'name').lean();
  const forStudent2: any = saved.find((s: any) => s.student.toString() === (student2._id as any).toString());
  assert((forStudent2?.room as any)?.name === 'Room 2' && forStudent2?.deskNumber === '1', `student2 actually landed in Room 2 seat 1 in the DB (got room="${(forStudent2?.room as any)?.name}", seat="${forStudent2?.deskNumber}")`);
  const forStudent3: any = saved.find((s: any) => s.student.toString() === (student3._id as any).toString());
  assert((forStudent3?.room as any)?.name === 'Room 1' && forStudent3?.deskNumber === '99', `student3 landed in Room 1 seat 99 despite the room's capacity being 1 — accepted as requested (got room="${(forStudent3?.room as any)?.name}", seat="${forStudent3?.deskNumber}")`);

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
