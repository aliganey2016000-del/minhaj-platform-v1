/**
 * Organization registration / onboarding regression coverage.
 *
 * Verifies institutionType (school/college/university/training_center) is
 * captured and validated at registration, ownershipType is stored
 * independently of it, the org's AcademicStructure (annual/semester,
 * 2-or-3-semester) is established atomically with the org, Faculty
 * availability is driven by the configurable usesFaculty flag rather than a
 * hardcoded institution-type check, invalid academic configurations are
 * rejected server-side, tenant isolation holds for the new endpoints, and a
 * pre-existing organization created before these fields existed keeps
 * working unmodified.
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
  const { default: School } = await import('../models/school.model');
  const { default: AcademicStructure } = await import('../models/academic-structure.model');
  const { default: ClassModel } = await import('../models/class.model');

  const admin = await User.create({ email: 'org-reg-admin@test.local', password: 'Password123!', role: 'admin' });
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

  // ── A. SCHOOL registration ──
  section('A. SCHOOL registration');
  const schoolRes = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Test School A'), institutionType: 'school' });
  assert(schoolRes.status === 201, `school registration succeeds (got ${schoolRes.status}, ${JSON.stringify(schoolRes.body).slice(0, 200)})`);
  assert(schoolRes.body.data.school.institutionType === 'school', 'institutionType stored as school');
  assert(schoolRes.body.data.school.onboardingCompleted === false, 'onboardingCompleted starts false');
  assert(schoolRes.body.data.academicStructure.academicSystem === 'annual', `school defaults to annual (got ${schoolRes.body.data.academicStructure.academicSystem})`);
  assert(schoolRes.body.data.academicStructure.usesFaculty === false, 'school defaults usesFaculty=false');

  const completeRes = await request(app).patch(`/api/v1/schools/${schoolRes.body.data.school._id}/complete-onboarding`).set('Authorization', `Bearer ${adminToken}`).send({});
  assert(completeRes.status === 200 && completeRes.body.data.onboardingCompleted === true, `complete-onboarding flips the flag (got ${completeRes.status})`);

  // ── B/C/D. UNIVERSITY — annual, semester/2, semester/3 ──
  section('B. UNIVERSITY — annual');
  const uniAnnual = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Test University Annual'), institutionType: 'university', academicSystem: 'annual' });
  assert(uniAnnual.status === 201, `university/annual registration succeeds (got ${uniAnnual.status}, ${JSON.stringify(uniAnnual.body).slice(0, 200)})`);
  assert(uniAnnual.body.data.academicStructure.academicSystem === 'annual' && uniAnnual.body.data.academicStructure.semestersPerAcademicYear === 1, 'annual university stores semestersPerAcademicYear=1 (semester fields not required)');

  section('C. UNIVERSITY — semester / 2 per year');
  const uniSem2 = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Test University Sem2'), institutionType: 'university', academicSystem: 'semester', semestersPerAcademicYear: 2 });
  assert(uniSem2.status === 201 && uniSem2.body.data.academicStructure.semestersPerAcademicYear === 2, `university 2-semester config accepted (got ${uniSem2.status}, semesters=${uniSem2.body.data.academicStructure?.semestersPerAcademicYear})`);
  assert(uniSem2.body.data.academicStructure.usesFaculty === true, 'university defaults usesFaculty=true');

  section('D. UNIVERSITY — semester / 3 per year');
  const uniSem3 = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Test University Sem3'), institutionType: 'university', academicSystem: 'semester', semestersPerAcademicYear: 3 });
  assert(uniSem3.status === 201 && uniSem3.body.data.academicStructure.semestersPerAcademicYear === 3, `university 3-semester config accepted (got ${uniSem3.status}, semesters=${uniSem3.body.data.academicStructure?.semestersPerAcademicYear})`);

  // ── E. COLLEGE — Faculty is optional/configurable, not hardcoded ──
  section('E. COLLEGE — Faculty is opt-in, not assumed');
  const collegeRes = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Test College'), institutionType: 'college' });
  assert(collegeRes.status === 201 && collegeRes.body.data.school.institutionType === 'college', `college registration succeeds (got ${collegeRes.status})`);
  const collegeId = collegeRes.body.data.school._id;

  const deptWithoutFaculty = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Business Studies', tenantId: collegeId });
  assert(deptWithoutFaculty.status === 201, `college can create a department with no Faculty by default (got ${deptWithoutFaculty.status}, ${JSON.stringify(deptWithoutFaculty.body).slice(0, 200)})`);

  const facultyRejected = await request(app).post('/api/v1/departments/faculties').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Faculty of Business', tenantId: collegeId });
  assert(facultyRejected.status === 400, `Faculty creation rejected for college with usesFaculty=false (got ${facultyRejected.status})`);

  const enableFaculty = await request(app).patch('/api/v1/classes/academic-structure').set('Authorization', `Bearer ${adminToken}`)
    .send({ schoolId: collegeId, academicSystem: 'semester', semestersPerAcademicYear: 2, usesFaculty: true });
  assert(enableFaculty.status === 200 && enableFaculty.body.data.usesFaculty === true, `college can opt into usesFaculty (got ${enableFaculty.status})`);

  const facultyAllowed = await request(app).post('/api/v1/departments/faculties').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Faculty of Business', tenantId: collegeId });
  assert(facultyAllowed.status === 201, `Faculty creation now allowed after opt-in (got ${facultyAllowed.status}, ${JSON.stringify(facultyAllowed.body).slice(0, 200)})`);

  // ── F. TRAINING CENTER — not forced into school grade structure ──
  section('F. TRAINING CENTER');
  const tcRes = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Test Training Center'), institutionType: 'training_center' });
  assert(tcRes.status === 201 && tcRes.body.data.school.institutionType === 'training_center', `training center registration succeeds (got ${tcRes.status})`);
  const tcId = tcRes.body.data.school._id;
  const tcDept = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Vocational Programs', tenantId: tcId });
  assert(tcDept.status === 201, `training center department created without Faculty (got ${tcDept.status})`);
  const tcClass = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: tcId, department: tcDept.body.data._id, title: 'Web Development Cohort', batch: 'B1', room: 'Lab 1', academicYear: '2026-2027' });
  assert(tcClass.status === 201, `training center class created without gradeLevel/semester fields (got ${tcClass.status}, ${JSON.stringify(tcClass.body).slice(0, 200)})`);
  assert(tcClass.body.data.semesterNumber == null && tcClass.body.data.gradeLevel == null, 'training center class carries no semester/grade fields');

  const tcClassNoDept = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: tcId, title: 'Data Analytics Bootcamp', batch: 'B2', room: 'Lab 2', academicYear: '2026-2027' });
  assert(tcClassNoDept.status === 201, `training center class created with NO department at all (got ${tcClassNoDept.status}, ${JSON.stringify(tcClassNoDept.body).slice(0, 200)})`);

  const tcClassMissingBatch = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: tcId, title: 'Missing Batch', room: 'Lab 1', academicYear: '2026-2027' });
  assert(tcClassMissingBatch.status === 400, `training center class without Batch/Cohort is rejected (got ${tcClassMissingBatch.status})`);

  // ── G. Invalid configurations rejected server-side ──
  section('G. Invalid configurations');
  const badSemesterCount = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Bad Semester Count'), institutionType: 'university', academicSystem: 'semester', semestersPerAcademicYear: 1 });
  assert(badSemesterCount.status === 400, `semester system with 1 semester/year is rejected (got ${badSemesterCount.status})`);

  const badInstitutionType = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Bad Institution Type'), institutionType: 'seminary' });
  assert(badInstitutionType.status === 400, `unknown institutionType is rejected (got ${badInstitutionType.status})`);

  const badOwnershipType = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Bad Ownership Type'), institutionType: 'school', ownershipType: 'communal' });
  assert(badOwnershipType.status === 400, `unknown ownershipType is rejected (got ${badOwnershipType.status})`);

  const facultyRejectedForSchool = await request(app).post('/api/v1/departments/faculties').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Should Fail', tenantId: schoolRes.body.data.school._id });
  assert(facultyRejectedForSchool.status === 400, `Faculty creation rejected for a plain school (got ${facultyRejectedForSchool.status})`);

  const uniDept = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Computer Science', tenantId: uniSem2.body.data.school._id, facultyId: (await request(app).post('/api/v1/departments/faculties').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Faculty of Science', tenantId: uniSem2.body.data.school._id })).body.data._id });
  assert(uniDept.status === 201, `university department created under faculty (got ${uniDept.status})`);

  const badSemesterNumber = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: uniSem2.body.data.school._id, department: uniDept.body.data._id, title: 'Bad Semester', room: 'R1', academicYear: '2026-2027', semesterNumber: 0 });
  assert(badSemesterNumber.status === 400, `semester number 0 is rejected for a semester-mode university (got ${badSemesterNumber.status})`);

  const uniAnnualFaculty = await request(app).post('/api/v1/departments/faculties').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Faculty of Annual Studies', tenantId: uniAnnual.body.data.school._id });
  const uniAnnualDept = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Annual Dept', tenantId: uniAnnual.body.data.school._id, facultyId: uniAnnualFaculty.body.data._id });
  const badStudyYear = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: uniAnnual.body.data.school._id, department: uniAnnualDept.body.data._id, title: 'Bad Study Year', room: 'R1', academicYear: '2026-2027', studyYear: 0 });
  assert(badStudyYear.status === 400, `study year 0 is rejected for an annual-mode university (got ${badStudyYear.status})`);

  const missingAcademicYear = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: schoolRes.body.data.school._id, department: (await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${adminToken}`).send({ name: 'No Year Dept', tenantId: schoolRes.body.data.school._id })).body.data._id, title: 'No Year', room: 'R1', batch: 'B1', gradeLevel: 1 });
  assert(missingAcademicYear.status === 400, `class without Academic Year is rejected regardless of institution type (got ${missingAcademicYear.status})`);

  // ── H. Tenant isolation ──
  section('H. Tenant isolation');
  const orgAOrgAdmin = await User.create({ email: 'org-a-admin@test.local', password: 'Password123!', role: 'org_admin', organizationId: uniSem2.body.data.school._id });
  const orgAToken = generateAccessToken({ userId: orgAOrgAdmin._id.toString(), role: 'org_admin', permissions: [], organizationId: uniSem2.body.data.school._id.toString() });

  const crossOrgComplete = await request(app).patch(`/api/v1/schools/${collegeId}/complete-onboarding`).set('Authorization', `Bearer ${orgAToken}`).send({});
  assert(crossOrgComplete.status === 403, `org_admin cannot complete-onboarding for ANOTHER organization (got ${crossOrgComplete.status})`);

  const crossOrgStructureUpdate = await request(app).patch('/api/v1/classes/academic-structure').set('Authorization', `Bearer ${orgAToken}`)
    .send({ schoolId: collegeId, academicSystem: 'annual' });
  const collegeStructureAfter = await AcademicStructure.findOne({ school: collegeId }).lean();
  assert(collegeStructureAfter?.academicSystem === 'semester', `org_admin cannot modify another organization's academic structure via forged schoolId (still semester, response ${crossOrgStructureUpdate.status})`);

  // ── I. Existing organization predating institutionType keeps working ──
  section('I. Legacy organization (no institutionType field) continues working');
  const legacySchool = await School.create({
    name: 'Legacy Org', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: `${new mongoose.Types.ObjectId()}@test.local`,
    principalName: 'Principal', establishedYear: 2019, createdBy: admin._id,
  });
  // Simulate a truly pre-migration document by stripping the field the
  // model's pre-validate hook would otherwise have backfilled on create.
  await School.collection.updateOne({ _id: legacySchool._id }, { $unset: { institutionType: '' } });

  const legacyGet = await request(app).get(`/api/v1/schools/${legacySchool._id}`).set('Authorization', `Bearer ${adminToken}`);
  assert(legacyGet.status === 200, `legacy org (no institutionType) is still readable (got ${legacyGet.status})`);

  const legacyStructure = await request(app).get(`/api/v1/classes/academic-structure?schoolId=${legacySchool._id}`).set('Authorization', `Bearer ${adminToken}`);
  assert(legacyStructure.status === 200 && legacyStructure.body.data.academicSystem === 'annual', `legacy organizationType:'private' resolves to school defaults (annual) via getOrCreateStructure (got ${legacyStructure.status}, ${legacyStructure.body.data?.academicSystem})`);

  const legacyDept = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Legacy Dept', tenantId: legacySchool._id.toString() });
  assert(legacyDept.status === 201, `legacy org can still create a department (got ${legacyDept.status}, ${JSON.stringify(legacyDept.body).slice(0, 200)})`);

  // ── J. Program hierarchy: Department → Program → Cohort/Class ──
  section('J. Program hierarchy (College/University/Training Center)');
  const collegeDept = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Business Administration', tenantId: collegeId, facultyId: facultyAllowed.body.data._id });
  const collegeProgram = await request(app).post('/api/v1/programs').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'BA Accounting', tenantId: collegeId, department: collegeDept.body.data._id, school: collegeId });
  assert(collegeProgram.status === 201, `college program created under a department (got ${collegeProgram.status}, ${JSON.stringify(collegeProgram.body).slice(0, 200)})`);

  const collegeCohort = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: collegeId, department: collegeDept.body.data._id, program: collegeProgram.body.data._id, title: 'Cohort 2026', room: 'Hall 2', academicYear: '2026-2027', semesterNumber: 1 });
  assert(collegeCohort.status === 201 && collegeCohort.body.data.programId === collegeProgram.body.data._id, `cohort links to its program (got ${collegeCohort.status}, programId=${collegeCohort.body.data?.programId})`);

  // Training center: Program with NO department at all.
  const tcProgram = await request(app).post('/api/v1/programs').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Web Development', school: tcId });
  assert(tcProgram.status === 201 && !tcProgram.body.data.department, `training center program created with no department (got ${tcProgram.status})`);

  const programCrossTenant = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: tcId, title: 'Cross-tenant program batch', batch: 'B3', room: 'Lab 3', academicYear: '2026-2027', program: collegeProgram.body.data._id });
  assert(programCrossTenant.status === 400, `class creation rejects a Program that belongs to a different organization (got ${programCrossTenant.status})`);

  const deptCrossTenantProgram = await request(app).post('/api/v1/programs').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Cross Dept Program', school: collegeId, department: tcDept.body.data._id });
  assert(deptCrossTenantProgram.status === 400, `program creation rejects a Department that belongs to a different organization (got ${deptCrossTenantProgram.status})`);

  // ── K. Tenant isolation — Program & structure reads ──
  section('K. Tenant isolation — Programs, Departments, Faculties, Classes');
  const orgBOrgAdmin = await User.create({ email: 'org-b-admin@test.local', password: 'Password123!', role: 'org_admin', organizationId: tcId });
  const orgBToken = generateAccessToken({ userId: orgBOrgAdmin._id.toString(), role: 'org_admin', permissions: [], organizationId: String(tcId) });

  const crossProgramList = await request(app).get('/api/v1/programs').set('Authorization', `Bearer ${orgBToken}`);
  const crossProgramNames = (crossProgramList.body.data || []).map((p: any) => p.name);
  assert(crossProgramList.status === 200 && !crossProgramNames.includes('BA Accounting'), `org_admin listing programs never sees another org's program (got ${JSON.stringify(crossProgramNames)})`);

  const crossProgramUpdate = await request(app).patch(`/api/v1/programs/${collegeProgram.body.data._id}`).set('Authorization', `Bearer ${orgBToken}`).send({ name: 'Hijacked' });
  assert(crossProgramUpdate.status === 403, `org_admin cannot update another organization's program (got ${crossProgramUpdate.status})`);

  const crossClassCreate = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${orgBToken}`)
    .send({ school: collegeId, department: collegeDept.body.data._id, title: 'Hijacked cohort', room: 'X', academicYear: '2026-2027', batch: 'X', semesterNumber: 1 });
  // org_admin's schoolId is always forced to their own org (resolveOrgIdForCreate) — so
  // this either 400s on cross-tenant department/institution mismatch or silently lands in
  // org B, but must NEVER create a class inside College (org A).
  const collegeClassesAfter = await ClassModel.find({ school: collegeId }).select('title').lean();
  assert(!collegeClassesAfter.some((c: any) => c.title === 'Hijacked cohort'), `forged cross-org class-create attempt never lands inside the other organization (status was ${crossClassCreate.status})`);

  // ── L. Onboarding status — start / resume / complete ──
  section('L. Onboarding status (start / resume / complete)');
  const freshOrg = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('Fresh Onboarding Org'), institutionType: 'university' });
  const freshOrgId = freshOrg.body.data.school._id;

  const notStarted = await request(app).get(`/api/v1/schools/${freshOrgId}/onboarding`).set('Authorization', `Bearer ${adminToken}`);
  assert(notStarted.status === 200 && notStarted.body.data.stage === 'not_started', `freshly registered org reports stage=not_started (got ${notStarted.body.data?.stage})`);

  const freshFaculty = await request(app).post('/api/v1/departments/faculties').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Faculty of Arts', tenantId: freshOrgId });
  const inProgress = await request(app).get(`/api/v1/schools/${freshOrgId}/onboarding`).set('Authorization', `Bearer ${adminToken}`);
  assert(inProgress.status === 200 && inProgress.body.data.stage === 'in_progress', `after creating a Faculty (but no Department yet), stage=in_progress (got ${inProgress.body.data?.stage})`);

  await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${adminToken}`).send({ name: 'History', tenantId: freshOrgId, facultyId: freshFaculty.body.data._id });
  const readyToComplete = await request(app).get(`/api/v1/schools/${freshOrgId}/onboarding`).set('Authorization', `Bearer ${adminToken}`);
  assert(readyToComplete.status === 200 && readyToComplete.body.data.stage === 'ready_to_complete', `after a Department exists (Faculty already there), stage=ready_to_complete (got ${readyToComplete.body.data?.stage})`);

  const freshComplete = await request(app).patch(`/api/v1/schools/${freshOrgId}/complete-onboarding`).set('Authorization', `Bearer ${adminToken}`).send({});
  const completedStatus = await request(app).get(`/api/v1/schools/${freshOrgId}/onboarding`).set('Authorization', `Bearer ${adminToken}`);
  assert(freshComplete.status === 200 && completedStatus.body.data.stage === 'completed', `explicit complete-onboarding call moves stage to completed (got ${completedStatus.body.data?.stage})`);

  // Resume: a second GET after completion still reflects the same, stable state (idempotent read).
  const resumedStatus = await request(app).get(`/api/v1/schools/${freshOrgId}/onboarding`).set('Authorization', `Bearer ${adminToken}`);
  assert(resumedStatus.status === 200 && resumedStatus.body.data.onboardingCompleted === true, `resuming (re-fetching) onboarding status after completion is stable (got ${resumedStatus.body.data?.onboardingCompleted})`);

  // ── M. Capacity — create, update, validation, persistence ──
  section('M. Capacity');
  const capacityClass = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: tcId, title: 'Capacity Batch', batch: 'CAP1', room: 'Lab 4', academicYear: '2026-2027', capacity: 25 });
  assert(capacityClass.status === 201 && capacityClass.body.data.capacity === 25, `class created with capacity=25 persists it (got ${capacityClass.status}, capacity=${capacityClass.body.data?.capacity})`);

  const capacityUpdate = await request(app).patch(`/api/v1/classes/${capacityClass.body.data._id}`).set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Capacity Batch', batch: 'CAP1', room: 'Lab 4', academicYear: '2026-2027', capacity: 40 });
  assert(capacityUpdate.status === 200 && capacityUpdate.body.data.capacity === 40, `capacity can be updated (got ${capacityUpdate.status}, capacity=${capacityUpdate.body.data?.capacity})`);

  const capacityInvalid = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${adminToken}`)
    .send({ school: tcId, title: 'Invalid Capacity', batch: 'CAP2', room: 'Lab 5', academicYear: '2026-2027', capacity: 0 });
  assert(capacityInvalid.status === 400, `capacity below 1 is rejected with a friendly 400 (got ${capacityInvalid.status})`);

  const capacityPersisted = await ClassModel.findById(capacityClass.body.data._id).select('capacity').lean();
  assert((capacityPersisted as any)?.capacity === 40, `capacity is actually persisted in the database, not just echoed in the response (got ${(capacityPersisted as any)?.capacity})`);

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) console.log('ALL CHECKS PASSED (0 failures)');
  else console.log(`${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('FATAL ERROR:', error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
