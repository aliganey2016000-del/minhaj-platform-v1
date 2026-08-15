/**
 * Academic progression — end-to-end verification.
 *
 * Runs the REAL Express app (full middleware chain: auth, role guards,
 * tenant scoping) against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:promotion`.
 *
 * Covers: new-student curriculum access, the full Grade1->Grade2 lifecycle,
 * historical data preservation, idempotency (promotion run twice), target
 * missing/no-courses/graduating/missing-gradeLevel skip parity between
 * preview and execution, and route-level authorization (unauthenticated,
 * wrong role, cross-organization).
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
  const { default: Course } = await import('../models/course.model');
  const { default: CourseContent } = await import('../models/course-content.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Progress } = await import('../models/progress.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const adminToken = tokenFor(adminUser._id.toString(), 'admin');

  const school = await School.create({
    name: 'Test School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '123 St', phone: '+000', email: 'school@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: adminUser._id,
  });
  const dept = await Department.create({ name: 'Primary', tenantId: school._id });

  async function makeClass(opts: any) {
    return ClassModel.create({
      school: school._id, department: dept._id, title: opts.title, room: 'Room 1',
      gradeLevel: opts.gradeLevel, academicYear: opts.academicYear,
      isGraduatingGrade: !!opts.isGraduatingGrade, status: opts.status || 'active',
    });
  }
  async function makeCourse(cls: any, title: string) {
    return Course.create({
      title: { en: title }, slug: title.toLowerCase().replace(/\s+/g, '-') + '-' + new mongoose.Types.ObjectId().toString().slice(-6),
      category: 'general', level: 'beginner', duration: 10, maxStudents: 30,
      school: school._id, class: cls._id, status: 'published',
    });
  }
  async function makeStudentUser(firstName: string) {
    const u = await User.create({ email: `${new mongoose.Types.ObjectId()}@test.local`, password: 'Password123!', role: 'student' });
    const p = await Profile.create({ user: u._id, firstName, lastName: 'Student', gender: 'male' });
    return { user: u, profile: p };
  }

  // -------------------------------------------------------------------
  section('ROUTE-LEVEL AUTHORIZATION');
  // -------------------------------------------------------------------
  const noAuth = await request(app).get('/api/v1/classes/promotion-preview').query({ schoolId: school._id.toString() });
  assert(noAuth.status === 401, `no token -> 401 (got ${noAuth.status})`);

  const { user: studentUser } = await makeStudentUser('Unauthorized');
  const studentToken = tokenFor(studentUser._id.toString(), 'student');
  const wrongRole = await request(app)
    .get('/api/v1/classes/promotion-preview')
    .set('Authorization', `Bearer ${studentToken}`)
    .query({ schoolId: school._id.toString() });
  assert(wrongRole.status === 403, `student role -> 403 on admin-only route (got ${wrongRole.status})`);

  const wrongRoleExec = await request(app)
    .post('/api/v1/classes/promote-all')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ schoolId: school._id.toString(), targetAcademicYear: '2026-2027' });
  assert(wrongRoleExec.status === 403, `student role -> 403 on promote-all (got ${wrongRoleExec.status})`);

  const okAuth = await request(app)
    .get('/api/v1/classes/promotion-preview')
    .set('Authorization', `Bearer ${adminToken}`)
    .query({ schoolId: school._id.toString() });
  assert(okAuth.status === 200, `admin role -> 200 (got ${okAuth.status})`);

  // -------------------------------------------------------------------
  section('NEW STUDENT — automatic curriculum enrollment (POST /students)');
  // -------------------------------------------------------------------
  const g1 = await makeClass({ title: 'Grade 1', gradeLevel: 1, academicYear: '2025-2026' });
  const g2 = await makeClass({ title: 'Grade 2', gradeLevel: 2, academicYear: '2026-2027' });
  const g1Math = await makeCourse(g1, 'Grade 1 Math');
  const g2Math = await makeCourse(g2, 'Grade 2 Math');
  await CourseContent.create({ course: g1Math._id, chapters: [{ title: 'Ch1', order: 0 }] });
  const g2Content = await CourseContent.create({ course: g2Math._id, chapters: [{ title: 'Ch1', order: 0 }] });

  const createStudentRes = await request(app)
    .post('/api/v1/students')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      email: 'alice@test.local', password: 'Password123!', firstName: 'Alice', lastName: 'Student', gender: 'female',
      school: school._id.toString(), classId: g1._id.toString(),
    });
  assert(createStudentRes.status === 201, `POST /students succeeds (status ${createStudentRes.status}, body: ${JSON.stringify(createStudentRes.body).slice(0, 300)})`);
  const aliceId = createStudentRes.body?.data?._id;
  const aliceEnrolledAtCreate = (createStudentRes.body?.data?.enrolledCourses || []).map((c: any) => String(c._id || c));
  assert(aliceEnrolledAtCreate.includes(String(g1Math._id)), `new student's enrolledCourses includes Grade1 Math immediately at creation (got ${JSON.stringify(aliceEnrolledAtCreate)})`);

  const g1MathAfterCreate = await Course.findById(g1Math._id).lean();
  assert((g1MathAfterCreate as any)?.enrolledStudents === 1, `Grade1 Math enrolledStudents count reflects the new student (got ${(g1MathAfterCreate as any)?.enrolledStudents})`);

  const courseCountAfterCreate = await Course.countDocuments({});
  const contentCountAfterCreate = await CourseContent.countDocuments({});
  assert(courseCountAfterCreate === 2, `creating a student did NOT clone any Course (still ${courseCountAfterCreate})`);
  assert(contentCountAfterCreate === 2, `creating a student did NOT clone any CourseContent (still ${contentCountAfterCreate})`);

  const aliceProgress = await Progress.create({ student: aliceId, course: g1Math._id, status: 'completed', completedLessons: 5 });

  // -------------------------------------------------------------------
  section('FULL LIFECYCLE: preview + promote Grade1 -> Grade2');
  // -------------------------------------------------------------------
  const previewA = await request(app)
    .get('/api/v1/classes/promotion-preview')
    .set('Authorization', `Bearer ${adminToken}`)
    .query({ schoolId: school._id.toString(), targetAcademicYear: '2026-2027' });
  const groupG1 = previewA.body?.data?.groups?.find((gr: any) => String(gr.classId) === String(g1._id));
  assert(groupG1?.action === 'promote-existing', `preview labels Grade1 'promote-existing' (got ${groupG1?.action})`);

  const execA = await request(app)
    .post('/api/v1/classes/promote-all')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ schoolId: school._id.toString(), targetAcademicYear: '2026-2027' });
  assert(execA.status === 200 || execA.status === 201, `promote-all succeeds (status ${execA.status})`);
  assert(execA.body?.data?.promoted === 1, `1 class promoted (got ${execA.body?.data?.promoted})`);
  assert(execA.body?.data?.studentsMoved === 1, `1 student moved (got ${execA.body?.data?.studentsMoved})`);

  const aliceAfter = await Student.findById(aliceId).lean();
  assert(String((aliceAfter as any)?.class) === String(g2._id), 'Alice.class now Grade2');
  const aliceCourses = ((aliceAfter as any)?.enrolledCourses || []).map((id: any) => String(id));
  assert(aliceCourses.length === 1 && aliceCourses[0] === String(g2Math._id), `Alice has exactly Grade2 Math enrolled, no duplicates (got ${JSON.stringify(aliceCourses)})`);

  section('HISTORICAL DATA after promotion');
  const g1After = await ClassModel.findById(g1._id).lean();
  assert((g1After as any)?.status === 'completed' && String((g1After as any)?.promotedTo) === String(g2._id), 'Grade1 class preserved (not deleted), correctly marked completed/promotedTo Grade2');
  const progressAfter = await Progress.findById(aliceProgress._id).lean();
  assert(!!progressAfter && (progressAfter as any).completedLessons === 5 && String((progressAfter as any).course) === String(g1Math._id),
    '"What did Alice study in Grade 1" still answerable — Progress record untouched, still points at Grade1 Math');
  console.log('  NOTE: enrollment history beyond Progress is NOT separately preserved — see final report.');

  // -------------------------------------------------------------------
  section('IDEMPOTENCY: promote-all run a 2nd time');
  // -------------------------------------------------------------------
  const execA2 = await request(app)
    .post('/api/v1/classes/promote-all')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ schoolId: school._id.toString(), targetAcademicYear: '2026-2027' });
  assert(execA2.body?.data?.promoted === 0 && execA2.body?.data?.studentsMoved === 0, '2nd run promotes 0 / moves 0');
  const aliceAfter2 = await Student.findById(aliceId).lean();
  const aliceCourses2 = ((aliceAfter2 as any)?.enrolledCourses || []).map((id: any) => String(id));
  assert(aliceCourses2.length === 1, `Alice still has exactly 1 enrolled course after 2nd run (got ${aliceCourses2.length})`);
  const studentTotal = await Student.countDocuments({});
  assert(studentTotal === 1, `no duplicate Student document (got ${studentTotal})`);
  const progressTotal = await Progress.countDocuments({});
  assert(progressTotal === 1, `no duplicate Progress document (got ${progressTotal})`);

  // -------------------------------------------------------------------
  section('SKIP PARITY: target missing / no courses / graduating / missing gradeLevel');
  // -------------------------------------------------------------------
  const g3 = await makeClass({ title: 'Grade 3', gradeLevel: 3, academicYear: '2025-2026' });
  const g4 = await makeClass({ title: 'Grade 4', gradeLevel: 4, academicYear: '2026-2027' }); // no courses
  const g5 = await makeClass({ title: 'Grade 5', gradeLevel: 5, academicYear: '2025-2026' }); // no Grade 6 target at all
  const g12 = await makeClass({ title: 'Grade 12', gradeLevel: 12, academicYear: '2025-2026', isGraduatingGrade: true });
  const gX = await ClassModel.create({ school: school._id, department: dept._id, title: 'Ungraded', room: 'Room X', academicYear: '2025-2026', status: 'active' });

  const previewB = await request(app).get('/api/v1/classes/promotion-preview').set('Authorization', `Bearer ${adminToken}`)
    .query({ schoolId: school._id.toString(), targetAcademicYear: '2026-2027' });
  const find = (cls: any) => previewB.body?.data?.groups?.find((gr: any) => String(gr.classId) === String(cls._id));
  assert(find(g3)?.action === 'skipped', `Grade3 (0 target courses) -> preview 'skipped' (got ${find(g3)?.action})`);
  assert(find(g5)?.action === 'skipped', `Grade5 (no target class) -> preview 'skipped' (got ${find(g5)?.action})`);
  assert(find(g12)?.action === 'graduate', `Grade12 -> preview 'graduate' (got ${find(g12)?.action})`);
  assert(!!previewB.body?.data?.missingGradeLevel?.find((c: any) => String(c.classId) === String(gX._id)), 'Ungraded class reported in missingGradeLevel');

  const execB = await request(app).post('/api/v1/classes/promote-all').set('Authorization', `Bearer ${adminToken}`)
    .send({ schoolId: school._id.toString(), targetAcademicYear: '2026-2027' });
  const result = (cls: any) => execB.body?.data?.results?.find((r: any) => String(r.classId) === String(cls._id));
  assert(result(g3)?.action === 'skipped' && result(g3)?.studentsMoved === 0, `Grade3 execution matches preview: skipped, 0 moved (got ${JSON.stringify(result(g3))})`);
  assert(result(g5)?.action === 'skipped', `Grade5 execution matches preview: skipped (got ${result(g5)?.action})`);
  assert(result(g12)?.action === 'graduated', `Grade12 execution: graduated (got ${result(g12)?.action})`);
  assert(!result(gX), 'Ungraded class never touched by execution (matches preview\'s "will not be touched")');

  // -------------------------------------------------------------------
  section('SECURITY: cross-organization isolation (org_admin, forged schoolId)');
  // -------------------------------------------------------------------
  const school2 = await School.create({
    name: 'Other School', organizationType: 'private', country: 'Somalia', city: 'Hargeisa',
    address: '456 St', phone: '+111', email: 'other@test.local', principalName: 'Other Principal',
    establishedYear: 2021, createdBy: adminUser._id,
  });
  const orgAdminUser = await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
  const orgAdminToken = tokenFor(orgAdminUser._id.toString(), 'org_admin', school._id.toString());

  const crossOrgExec = await request(app).post('/api/v1/classes/promote-all').set('Authorization', `Bearer ${orgAdminToken}`)
    .send({ schoolId: school2._id.toString(), targetAcademicYear: '2099-2100' });
  const school1Ids = new Set([g1, g2, g3, g4, g5, g12, gX].map((c: any) => String(c._id)));
  const touchedIds: string[] = (crossOrgExec.body?.data?.results || []).map((r: any) => String(r.classId));
  assert(touchedIds.length > 0 && touchedIds.every((id) => school1Ids.has(id)), `org_admin's forged schoolId silently overridden with own org — all ${touchedIds.length} touched classes belong to school1, none to school2`);
  const school2ClassCount = await ClassModel.countDocuments({ school: school2._id });
  assert(school2ClassCount === 0, 'School2 has zero classes — untouched');

  // -------------------------------------------------------------------
  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
