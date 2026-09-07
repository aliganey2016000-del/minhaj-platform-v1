/**
 * Institution-type <-> academicSystem consistency.
 *
 * The academic-structure schema (academic-structure.model.ts) only knows
 * about the annual/semester + 2-or-3-semester invariant — it has no idea
 * what institution the AcademicStructure document belongs to, so it would
 * happily accept `academicSystem: 'semester'` on a School's or Training
 * Center's document even though neither has any semester-aware workflow
 * anywhere in the product (no semester UI on Class/Student pages, no
 * Faculty/Department/Program hierarchy to hang a semester on).
 *
 * validateAcademicConfig() (utils/academic-config.ts) now also takes the
 * resolved institutionType and rejects `semester` for School/Training
 * Center, at every write path that can set academicSystem:
 *   - POST /schools (registration)
 *   - PATCH /schools/:id/complete-onboarding (re-validates stored structure)
 *   - PATCH /classes/academic-structure (updateStructure)
 *
 * University and College keep their existing rules unchanged (annual, or
 * semester with 2 or 3 semesters/year) — this suite proves School/Training
 * Center are newly rejected while University/College behavior, tenant
 * isolation, and the semesterNumber/studyYear/semesterInYear progression
 * formula are all unaffected.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:academic-config-consistency`.
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
  const { default: AcademicStructure } = await import('../models/academic-structure.model');

  const admin = await User.create({ email: 'academic-config-admin@test.local', password: 'Password123!', role: 'admin' });
  const adminToken = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });

  function baseFields(name: string) {
    return {
      name,
      country: 'Somalia', city: 'Mogadishu', address: '1 St',
      phone: '+2521234567', email: `${new mongoose.Types.ObjectId()}@test.local`,
      principalName: 'Principal', establishedYear: 2020,
      adminPassword: 'Password123!',
    };
  }

  // -------------------------------------------------------------------
  section('SCHOOL — valid configuration (annual, default)');
  // -------------------------------------------------------------------
  const schoolDefault = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config School Default'), institutionType: 'school' });
  assert(schoolDefault.status === 201, `school registers with no academicSystem specified (got ${schoolDefault.status}, ${JSON.stringify(schoolDefault.body).slice(0, 200)})`);
  assert(schoolDefault.body.data.academicStructure.academicSystem === 'annual', `school defaults to annual (got ${schoolDefault.body.data.academicStructure?.academicSystem})`);

  const schoolExplicitAnnual = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config School Explicit Annual'), institutionType: 'school', academicSystem: 'annual' });
  assert(schoolExplicitAnnual.status === 201 && schoolExplicitAnnual.body.data.academicStructure.academicSystem === 'annual', `school can explicitly request annual (got ${schoolExplicitAnnual.status})`);
  const schoolId = schoolExplicitAnnual.body.data.school._id;

  // -------------------------------------------------------------------
  section('SCHOOL — invalid semester configuration is rejected at registration');
  // -------------------------------------------------------------------
  const schoolSemesterAtRegistration = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config School Semester Reject'), institutionType: 'school', academicSystem: 'semester', semestersPerAcademicYear: 2 });
  assert(schoolSemesterAtRegistration.status === 400, `school cannot register with academicSystem: 'semester' (got ${schoolSemesterAtRegistration.status}, ${JSON.stringify(schoolSemesterAtRegistration.body).slice(0, 200)})`);

  // -------------------------------------------------------------------
  section("SCHOOL — invalid semester configuration is rejected on later update (schema alone wouldn't reject this)");
  // -------------------------------------------------------------------
  const schoolAdminUser = await User.create({ email: 'config-school-admin@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolId });
  const schoolAdminToken = generateAccessToken({ userId: schoolAdminUser._id.toString(), role: 'org_admin', permissions: [], organizationId: String(schoolId) });

  const schoolSemesterUpdate = await request(app).patch('/api/v1/classes/academic-structure').set('Authorization', `Bearer ${schoolAdminToken}`)
    .send({ academicSystem: 'semester', semestersPerAcademicYear: 2 });
  assert(schoolSemesterUpdate.status === 400, `School org_admin cannot switch Academic Structure to 'semester' (got ${schoolSemesterUpdate.status}, ${JSON.stringify(schoolSemesterUpdate.body).slice(0, 200)})`);

  const schoolStructureUnchanged = await AcademicStructure.findOne({ school: schoolId }).lean();
  assert(schoolStructureUnchanged?.academicSystem === 'annual', `the rejected update did not mutate the stored structure (still annual, got ${schoolStructureUnchanged?.academicSystem})`);

  // -------------------------------------------------------------------
  section('TRAINING CENTER — semester is rejected the same way as School');
  // -------------------------------------------------------------------
  const tcSemesterAtRegistration = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config Training Center Semester Reject'), institutionType: 'training_center', academicSystem: 'semester', semestersPerAcademicYear: 3 });
  assert(tcSemesterAtRegistration.status === 400, `training center cannot register with academicSystem: 'semester' (got ${tcSemesterAtRegistration.status})`);

  const tcAnnual = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config Training Center Annual'), institutionType: 'training_center' });
  assert(tcAnnual.status === 201 && tcAnnual.body.data.academicStructure.academicSystem === 'annual', `training center defaults to and accepts annual (got ${tcAnnual.status})`);

  // -------------------------------------------------------------------
  section('UNIVERSITY — valid annual configuration');
  // -------------------------------------------------------------------
  const uniAnnual = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config University Annual'), institutionType: 'university', academicSystem: 'annual' });
  assert(uniAnnual.status === 201 && uniAnnual.body.data.academicStructure.academicSystem === 'annual', `university can use annual (got ${uniAnnual.status})`);

  // -------------------------------------------------------------------
  section('UNIVERSITY — valid semester + 2 configuration');
  // -------------------------------------------------------------------
  const uniSem2 = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config University Sem2'), institutionType: 'university', academicSystem: 'semester', semestersPerAcademicYear: 2 });
  assert(uniSem2.status === 201 && uniSem2.body.data.academicStructure.semestersPerAcademicYear === 2, `university semester/2 accepted (got ${uniSem2.status}, semesters=${uniSem2.body.data.academicStructure?.semestersPerAcademicYear})`);
  const uniSem2Id = uniSem2.body.data.school._id;

  // -------------------------------------------------------------------
  section('UNIVERSITY — valid semester + 3 configuration');
  // -------------------------------------------------------------------
  const uniSem3 = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config University Sem3'), institutionType: 'university', academicSystem: 'semester', semestersPerAcademicYear: 3 });
  assert(uniSem3.status === 201 && uniSem3.body.data.academicStructure.semestersPerAcademicYear === 3, `university semester/3 accepted (got ${uniSem3.status}, semesters=${uniSem3.body.data.academicStructure?.semestersPerAcademicYear})`);

  // -------------------------------------------------------------------
  section('UNIVERSITY — invalid semester count (1) is rejected');
  // -------------------------------------------------------------------
  const uniBadCount = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config University Bad Count'), institutionType: 'university', academicSystem: 'semester', semestersPerAcademicYear: 1 });
  assert(uniBadCount.status === 400, `semester count of 1 is rejected (got ${uniBadCount.status})`);

  const uniBadCount4 = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config University Bad Count 4'), institutionType: 'university', academicSystem: 'semester', semestersPerAcademicYear: 4 });
  assert(uniBadCount4.status === 400, `semester count of 4 is rejected (got ${uniBadCount4.status})`);

  // -------------------------------------------------------------------
  section('UNIVERSITY — org_admin can later switch its own org between annual and semester');
  // -------------------------------------------------------------------
  const uniAnnualAdminUser = await User.create({ email: 'config-uni-annual-admin@test.local', password: 'Password123!', role: 'org_admin', organizationId: uniAnnual.body.data.school._id });
  const uniAnnualAdminToken = generateAccessToken({ userId: uniAnnualAdminUser._id.toString(), role: 'org_admin', permissions: [], organizationId: String(uniAnnual.body.data.school._id) });
  const uniSwitchToSemester = await request(app).patch('/api/v1/classes/academic-structure').set('Authorization', `Bearer ${uniAnnualAdminToken}`)
    .send({ academicSystem: 'semester', semestersPerAcademicYear: 2 });
  assert(uniSwitchToSemester.status === 200 && uniSwitchToSemester.body.data.academicSystem === 'semester', `university org_admin can switch annual -> semester (got ${uniSwitchToSemester.status})`);

  // -------------------------------------------------------------------
  section('COLLEGE — follows the same higher-ed rules as University, not treated as School');
  // -------------------------------------------------------------------
  const collegeAnnual = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config College Annual'), institutionType: 'college', code: 'CFG-001', facultyName: 'Faculty of Health', deanName: 'Dr. Warsame' });
  assert(collegeAnnual.status === 201 && collegeAnnual.body.data.academicStructure.academicSystem === 'annual', `college defaults to annual (got ${collegeAnnual.status}, ${collegeAnnual.body.data.academicStructure?.academicSystem})`);

  const collegeSemester = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config College Semester'), institutionType: 'college', code: 'CFG-002', facultyName: 'Faculty of Law', deanName: 'Dr. Ali', academicSystem: 'semester', semestersPerAcademicYear: 2 });
  assert(collegeSemester.status === 201 && collegeSemester.body.data.academicStructure.semestersPerAcademicYear === 2, `college can register directly with semester/2, same as university (got ${collegeSemester.status}, ${JSON.stringify(collegeSemester.body).slice(0, 200)})`);

  const collegeBadSemesterCount = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Config College Bad Semester Count'), institutionType: 'college', code: 'CFG-003', facultyName: 'Faculty of Arts', deanName: 'Dr. Nur', academicSystem: 'semester', semestersPerAcademicYear: 1 });
  assert(collegeBadSemesterCount.status === 400, `college is bound by the same 2-or-3 semester rule as university (got ${collegeBadSemesterCount.status})`);

  // -------------------------------------------------------------------
  section('COMPLETE-ONBOARDING — re-validates the stored structure against institutionType');
  // -------------------------------------------------------------------
  // Force an inconsistent state directly in the DB (simulating data that predates this
  // guard, or a manual DB edit) — completeOnboarding must still catch it.
  await AcademicStructure.updateOne({ school: schoolId }, { $set: { academicSystem: 'semester', semestersPerAcademicYear: 2 } });
  const completeWithBadConfig = await request(app).patch(`/api/v1/schools/${schoolId}/complete-onboarding`).set('Authorization', `Bearer ${schoolAdminToken}`).send({});
  assert(completeWithBadConfig.status === 400, `complete-onboarding rejects a School whose stored structure is inconsistently 'semester' (got ${completeWithBadConfig.status})`);
  await AcademicStructure.updateOne({ school: schoolId }, { $set: { academicSystem: 'annual', semestersPerAcademicYear: 1 } });
  const completeWithGoodConfig = await request(app).patch(`/api/v1/schools/${schoolId}/complete-onboarding`).set('Authorization', `Bearer ${schoolAdminToken}`).send({});
  assert(completeWithGoodConfig.status === 200, `complete-onboarding succeeds once the structure is annual again (got ${completeWithGoodConfig.status})`);

  // -------------------------------------------------------------------
  section('TENANT ISOLATION — one university org_admin cannot alter another university\'s academic structure');
  // -------------------------------------------------------------------
  const uniSem2AdminUser = await User.create({ email: 'config-uni-sem2-admin@test.local', password: 'Password123!', role: 'org_admin', organizationId: uniSem2Id });
  const uniSem2AdminToken = generateAccessToken({ userId: uniSem2AdminUser._id.toString(), role: 'org_admin', permissions: [], organizationId: String(uniSem2Id) });

  // org_admin's schoolId is always forced to their own org (resolveOrgIdForCreate), so even
  // though this admin belongs to uniSem2, an attempt to change "another org's" structure by
  // supplying schoolId in the body can only ever affect their OWN org, never uniSem3's.
  const crossOrgAttempt = await request(app).patch('/api/v1/classes/academic-structure').set('Authorization', `Bearer ${uniSem2AdminToken}`)
    .send({ schoolId: uniSem3.body.data.school._id, academicSystem: 'annual' });
  const uniSem3StructureAfter = await AcademicStructure.findOne({ school: uniSem3.body.data.school._id }).lean();
  assert(uniSem3StructureAfter?.academicSystem === 'semester' && uniSem3StructureAfter?.semestersPerAcademicYear === 3, `university B's structure is untouched by university A's org_admin forging a schoolId (still semester/3, response was ${crossOrgAttempt.status})`);

  const getOtherOrgStructure = await request(app).get(`/api/v1/classes/academic-structure?schoolId=${uniSem3.body.data.school._id}`).set('Authorization', `Bearer ${uniSem2AdminToken}`);
  assert(getOtherOrgStructure.body?.data?.school?.toString() !== uniSem3.body.data.school._id, `reading academic structure with a forged schoolId param returns the caller's own org's structure, not the other org's`);

  // -------------------------------------------------------------------
  section('SEMESTER PROGRESSION FORMULA — unaffected by the new institution-type guard (2 and 3 semesters/year)');
  // -------------------------------------------------------------------
  function studyYearOf(semesterNumber: number, perYear: number) { return Math.ceil(semesterNumber / perYear); }
  function semesterInYearOf(semesterNumber: number, perYear: number) { return ((semesterNumber - 1) % perYear) + 1; }

  const expected2 = [
    [1, 1, 1], [2, 1, 2], [3, 2, 1], [4, 2, 2], [5, 3, 1], [6, 3, 2],
  ];
  for (const [semesterNumber, expectedYear, expectedInYear] of expected2) {
    assert(studyYearOf(semesterNumber, 2) === expectedYear && semesterInYearOf(semesterNumber, 2) === expectedInYear, `2/year: S${semesterNumber} -> Y${expectedYear} S${expectedInYear} (got Y${studyYearOf(semesterNumber, 2)} S${semesterInYearOf(semesterNumber, 2)})`);
  }
  const expected3 = [
    [1, 1, 1], [2, 1, 2], [3, 1, 3], [4, 2, 1], [5, 2, 2], [6, 2, 3],
  ];
  for (const [semesterNumber, expectedYear, expectedInYear] of expected3) {
    assert(studyYearOf(semesterNumber, 3) === expectedYear && semesterInYearOf(semesterNumber, 3) === expectedInYear, `3/year: S${semesterNumber} -> Y${expectedYear} S${expectedInYear} (got Y${studyYearOf(semesterNumber, 3)} S${semesterInYearOf(semesterNumber, 3)})`);
  }

  // End-to-end: create a real class on the semester/2 university and confirm the server
  // computes/accepts the same studyYear for a given semesterNumber (full regression coverage
  // of the progression math itself lives in semester-progression.e2e.ts).
  const uniSem2Faculty = await request(app).post('/api/v1/departments/faculties').set('Authorization', `Bearer ${uniSem2AdminToken}`)
    .send({ name: 'Faculty of Config Testing' });
  const uniSem2Dept = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${uniSem2AdminToken}`)
    .send({ name: 'Testing Dept', facultyId: uniSem2Faculty.body.data._id });
  const uniSem2Class = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${uniSem2AdminToken}`)
    .send({ department: uniSem2Dept.body.data._id, title: 'S3 Cohort', room: 'R1', academicYear: '2026-2027', semesterNumber: 3 });
  assert(uniSem2Class.status === 201 && uniSem2Class.body.data.studyYear === 2 && uniSem2Class.body.data.semesterInYear === 1, `semester 3 on a 2-per-year university resolves to studyYear=2, semesterInYear=1 (got ${uniSem2Class.status}, studyYear=${uniSem2Class.body.data?.studyYear}, semesterInYear=${uniSem2Class.body.data?.semesterInYear})`);

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
