/**
 * Exam Seating Plan bulk import (controllers/exam-seating-plan.controller.ts,
 * mounted at /api/v1/exams/seating-plan) — room capacity must be advisory
 * for a bulk import, never a blocking error.
 *
 * validateRows() (shared by import-preview, validate-rows and import-rows)
 * was throwing "Room capacity exceeded" whenever a school had not
 * explicitly disabled roomCapacityCheck in its Scheduling Rules — and
 * DEFAULT_EXAM_SCHEDULING_RULES.roomCapacityCheck is true, so this fired
 * for every ordinary school. That silently contradicted this importer's
 * own design (see seating-import-smart-fix.e2e.ts's module comment: "The
 * admin asked for room capacity to never block an import — whatever seat
 * number they enter must be accepted ... capacity is a soft planning
 * number, not a hard limit here") and blocked rows a genuine duplicate
 * room+seat pair would still correctly reject. The regression went
 * unnoticed because seating-import-smart-fix.e2e.ts cannot run in most
 * sandboxes (it provisions its own mongodb-memory-server, which needs to
 * download a MongoDB binary over the network) and its npm script even
 * pointed at the wrong filename ("seating-smart-fix.e2e.ts", which does
 * not exist) — so it was never wired into CI and nobody could see it
 * would have failed.
 *
 * This test reproduces the same scenario against the real Express app and
 * the shared FerretDB-backed test-db helper, so it actually runs in CI.
 *
 * Fix: validateRows() no longer treats room-capacity overflow as a
 * blocking error for the bulk-import path; only a true room+seat
 * collision within the file is still flagged (with an Apply-Fix
 * suggestion). The single add/update seat endpoints are untouched and
 * still honor the school's roomCapacityCheck rule.
 *
 * Repeatable: `npm run test:seating-plan-import-capacity`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import * as XLSX from 'xlsx';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('seating-plan-import-capacity');
  try {
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

    const tokenFor = (userId: string, role: string, organizationId?: string) =>
      generateAccessToken({ userId, role, permissions: [], organizationId });

    const admin = await User.create({ email: 'spc-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Capacity Advisory School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: 'spc-school@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    // School does NOT set examSchedulingRules — the default
    // (roomCapacityCheck: true) applies, exactly the common case.
    const room1 = await ExamRoom.create({ name: 'Room 1', building: 'Main Campus', capacity: 1, school: school._id, createdBy: admin._id });
    await ExamRoom.create({ name: 'Room 2', building: 'Main Campus', capacity: 5, school: school._id, createdBy: admin._id });

    const orgAdminUser = await User.create({ email: 'spc-orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const orgAdminToken = tokenFor(orgAdminUser._id.toString(), 'org_admin', school._id.toString());

    const dept = await Department.create({ name: 'Grade 9', tenantId: school._id });
    const cls = await ClassModel.create({
      school: school._id, department: dept._id, title: 'Grade 9', section: 'A', room: 'Classroom 1',
      gradeLevel: 9, academicYear: '2026/27', status: 'active',
    });

    const makeStudent = async (studentId: string, firstName: string) => {
      const u = await User.create({ email: `${studentId.toLowerCase()}@test.local`, password: 'Password123!', role: 'student' });
      const profile = await Profile.create({ user: u._id, firstName, lastName: 'Test', gender: 'female' });
      return Student.create({ user: u._id, profile: profile._id, studentId, school: school._id, class: cls._id, department: 'Middle School' });
    };

    const student1 = await makeStudent('CAP-301', 'Leyla');
    const student2 = await makeStudent('CAP-302', 'Xasan');

    const buildSeatingFile = (rows: any[][]) => {
      const headers = ['Organization', 'Department', 'Class', 'Shift', 'Student ID', 'Student Name', 'Academic Year', 'Exam Type', 'Room', 'Seat'];
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    };

    // Room 1's capacity is 1. Both rows target Room 1 but with DIFFERENT
    // seat numbers — a legitimate two-desks-in-one-room overflow that the
    // admin explicitly wants accepted, not a room+seat collision.
    const rows = [
      [school.name, 'Grade 9', 'Grade 9 A', 'Morning', student1.studentId, 'Leyla Test', '2026/27', 'Final Exam', 'Room 1', '1'],
      [school.name, 'Grade 9', 'Grade 9 A', 'Morning', student2.studentId, 'Xasan Test', '2026/27', 'Final Exam', 'Room 1', '2'],
    ];

    section('PREVIEW IMPORT — second seat in a 1-capacity room is accepted, not blocked');
    const previewRes = await request(app)
      .post('/api/v1/exams/seating-plan/import-preview')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .attach('file', buildSeatingFile(rows), 'seating.xlsx');
    assert(previewRes.status === 200, `preview succeeds (status ${previewRes.status})`);
    const preview = previewRes.body?.data || [];
    assert(preview[0]?.status === 'valid', `row 1 is valid (got status="${preview[0]?.status}", message="${preview[0]?.message}")`);
    assert(preview[1]?.status === 'valid', `row 2 (seat 2 in a 1-seat room) is accepted — capacity never blocks a bulk import (got status="${preview[1]?.status}", message="${preview[1]?.message}")`);

    section('IMPORT — both rows actually land in Room 1, past its configured capacity');
    const importRes = await request(app)
      .post('/api/v1/exams/seating-plan/import')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .attach('file', buildSeatingFile(rows), 'seating.xlsx');
    assert(importRes.status === 200, `import succeeds (status ${importRes.status}, body=${JSON.stringify(importRes.body)})`);
    assert(importRes.body?.data?.imported === 2, `both seating assignments were imported (got ${JSON.stringify(importRes.body?.data)})`);

    const saved = await ExamSeatingPlan.find({ school: school._id }).lean();
    assert(saved.length === 2, `2 seating rows actually exist in the DB for this exam (got ${saved.length})`);
    assert(saved.filter((s: any) => String(s.room) === String(room1._id)).length === 2, 'both landed in Room 1 despite its capacity being 1');

    section('A TRUE room+seat collision is still rejected with a suggestion');
    const collidingRows = [
      [school.name, 'Grade 9', 'Grade 9 A', 'Morning', student1.studentId, 'Leyla Test', '2026/27', 'Final Exam', 'Room 1', '1'],
      [school.name, 'Grade 9', 'Grade 9 A', 'Morning', student2.studentId, 'Xasan Test', '2026/27', 'Final Exam', 'Room 1', '1'],
    ];
    const collisionRes = await request(app)
      .post('/api/v1/exams/seating-plan/import-preview')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .attach('file', buildSeatingFile(collidingRows), 'seating-collision.xlsx');
    const collisionPreview = collisionRes.body?.data || [];
    assert(collisionPreview[0]?.status === 'valid', `row 1 is valid (got "${collisionPreview[0]?.status}")`);
    assert(collisionPreview[1]?.status === 'error' && /Duplicate seat/.test(collisionPreview[1]?.message || ''), `row 2 (same room+seat as row 1) is still rejected as a genuine duplicate (got status="${collisionPreview[1]?.status}", message="${collisionPreview[1]?.message}")`);
    assert(collisionPreview[1]?.suggestion?.room === 'Room 2', `row 2 gets an Apply-Fix suggestion pointing at the other room (got ${JSON.stringify(collisionPreview[1]?.suggestion)})`);
  } finally {
    await db.stop();
  }

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) console.log('ALL CHECKS PASSED (0 failures)');
  else console.log(`${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
