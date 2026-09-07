/**
 * Faculty/Department "usesFaculty" gating — per-institution-type defaults
 * AND explicit override behavior.
 *
 * Regression coverage for a bug introduced and caught during this audit
 * pass: faculty.controller.ts's assertUsesFaculty() and
 * department.controller.ts's usesFaculty() were briefly changed to treat
 * "any higher-ed institution type" (isHigherEdInstitutionType — true for
 * BOTH university and college) as an unconditional faculty-enabled
 * fallback. That silently broke the college-defaults-to-false behavior
 * organization-registration.e2e.ts already covers (college starts with
 * usesFaculty=false and must explicitly opt in), because a College is
 * "higher-ed" too, so the fallback OR'd itself back to true regardless of
 * the org's actual AcademicStructure.usesFaculty setting.
 *
 * The fix: an explicit AcademicStructure.usesFaculty always wins (whether
 * true or false, for either university or college); the institution type's
 * default (university=true, college=false — see defaultAcademicConfig) is
 * used ONLY as a fallback when no AcademicStructure document exists yet at
 * all. This suite locks that in directly, including the case
 * organization-registration.e2e.ts does NOT cover: a University explicitly
 * turning usesFaculty OFF must actually block Faculty creation, not be
 * silently overridden back to true because it's "higher-ed".
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:faculty-usesfaculty-defaults`.
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

  const admin = await User.create({ email: 'usesfaculty-admin@test.local', password: 'Password123!', role: 'admin' });
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

  function orgAdminTokenFor(organizationId: string, email: string) {
    return (async () => {
      const u = await User.create({ email, password: 'Password123!', role: 'org_admin', organizationId });
      return generateAccessToken({ userId: u._id.toString(), role: 'org_admin', permissions: [], organizationId: String(organizationId) });
    })();
  }

  // -------------------------------------------------------------------
  section('UNIVERSITY — no AcademicStructure opt-out: Faculty creation allowed by default');
  // -------------------------------------------------------------------
  const uni = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('UsesFaculty University'), institutionType: 'university' });
  assert(uni.status === 201 && uni.body.data.academicStructure.usesFaculty === true, `university registers with usesFaculty=true by default (got ${uni.status}, ${uni.body.data.academicStructure?.usesFaculty})`);
  const uniAdminToken = await orgAdminTokenFor(uni.body.data.school._id, 'usesfaculty-uni-admin@test.local');

  const uniFacultyCreate = await request(app).post('/api/v1/faculties').set('Authorization', `Bearer ${uniAdminToken}`).send({ name: 'Faculty of Medicine' });
  assert(uniFacultyCreate.status === 201, `university can create a Faculty by default (got ${uniFacultyCreate.status}, ${JSON.stringify(uniFacultyCreate.body).slice(0, 200)})`);

  // -------------------------------------------------------------------
  section('UNIVERSITY — explicitly opting OUT of usesFaculty is honored, not overridden by "higher-ed" default');
  // -------------------------------------------------------------------
  const uniOptOut = await request(app).patch('/api/v1/classes/academic-structure').set('Authorization', `Bearer ${uniAdminToken}`)
    .send({ academicSystem: 'annual', usesFaculty: false });
  assert(uniOptOut.status === 200 && uniOptOut.body.data.usesFaculty === false, `university can explicitly disable usesFaculty (got ${uniOptOut.status}, ${uniOptOut.body.data?.usesFaculty})`);

  const uniFacultyAfterOptOut = await request(app).post('/api/v1/faculties').set('Authorization', `Bearer ${uniAdminToken}`).send({ name: 'Should Be Rejected' });
  assert(uniFacultyAfterOptOut.status === 400, `Faculty creation is REJECTED once a university explicitly turns usesFaculty off, despite being a higher-ed institution type (got ${uniFacultyAfterOptOut.status}, ${JSON.stringify(uniFacultyAfterOptOut.body).slice(0, 200)})`);

  const uniDeptAfterOptOut = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${uniAdminToken}`).send({ name: 'No Faculty Dept' });
  assert(uniDeptAfterOptOut.status === 201 && !uniDeptAfterOptOut.body.data.facultyId, `Department creation still works with no Faculty required once usesFaculty is off (got ${uniDeptAfterOptOut.status})`);

  // -------------------------------------------------------------------
  section('COLLEGE — defaults to usesFaculty=false and Faculty creation is rejected until opted in');
  // -------------------------------------------------------------------
  const college = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('UsesFaculty College'), institutionType: 'college', code: 'UF-001', facultyName: 'Faculty of Nursing', deanName: 'Dr. Osman' });
  assert(college.status === 201 && college.body.data.academicStructure.usesFaculty === false, `college registers with usesFaculty=false by default (got ${college.status}, ${college.body.data.academicStructure?.usesFaculty})`);
  const collegeAdminToken = await orgAdminTokenFor(college.body.data.school._id, 'usesfaculty-college-admin@test.local');

  const collegeFacultyBeforeOptIn = await request(app).post('/api/v1/faculties').set('Authorization', `Bearer ${collegeAdminToken}`).send({ name: 'Should Be Rejected Too' });
  assert(collegeFacultyBeforeOptIn.status === 400, `a fresh college (higher-ed, but usesFaculty=false by default) CANNOT create a Faculty — this is the exact regression this suite guards against (got ${collegeFacultyBeforeOptIn.status}, ${JSON.stringify(collegeFacultyBeforeOptIn.body).slice(0, 200)})`);

  const collegeDeptBeforeOptIn = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${collegeAdminToken}`).send({ name: 'Pre-OptIn Dept' });
  assert(collegeDeptBeforeOptIn.status === 201 && !collegeDeptBeforeOptIn.body.data.facultyId, `college can create a Department with no Faculty before opting in (got ${collegeDeptBeforeOptIn.status})`);

  // -------------------------------------------------------------------
  section('COLLEGE — opting in to usesFaculty then allows Faculty creation, and Department now requires it');
  // -------------------------------------------------------------------
  const collegeOptIn = await request(app).patch('/api/v1/classes/academic-structure').set('Authorization', `Bearer ${collegeAdminToken}`)
    .send({ academicSystem: 'annual', usesFaculty: true });
  assert(collegeOptIn.status === 200 && collegeOptIn.body.data.usesFaculty === true, `college can opt in to usesFaculty (got ${collegeOptIn.status})`);

  const collegeFacultyAfterOptIn = await request(app).post('/api/v1/faculties').set('Authorization', `Bearer ${collegeAdminToken}`).send({ name: 'Faculty of Nursing Programs' });
  assert(collegeFacultyAfterOptIn.status === 201, `Faculty creation now succeeds after the college opts in (got ${collegeFacultyAfterOptIn.status}, ${JSON.stringify(collegeFacultyAfterOptIn.body).slice(0, 200)})`);

  const collegeDeptWithoutFacultyAfterOptIn = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${collegeAdminToken}`).send({ name: 'Missing Faculty Dept' });
  assert(collegeDeptWithoutFacultyAfterOptIn.status === 400, `once usesFaculty is on, Department creation now REQUIRES a facultyId (got ${collegeDeptWithoutFacultyAfterOptIn.status})`);

  const collegeDeptWithFacultyAfterOptIn = await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${collegeAdminToken}`)
    .send({ name: 'Nursing Dept', facultyId: collegeFacultyAfterOptIn.body.data._id });
  assert(collegeDeptWithFacultyAfterOptIn.status === 201, `Department creation succeeds once a valid facultyId is supplied (got ${collegeDeptWithFacultyAfterOptIn.status}, ${JSON.stringify(collegeDeptWithFacultyAfterOptIn.body).slice(0, 200)})`);

  // -------------------------------------------------------------------
  section('SCHOOL / TRAINING CENTER — never use Faculty regardless of any override attempt');
  // -------------------------------------------------------------------
  const school = await request(app).post('/api/v1/schools').set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseFields('UsesFaculty School'), institutionType: 'school' });
  const schoolAdminToken = await orgAdminTokenFor(school.body.data.school._id, 'usesfaculty-school-admin@test.local');
  const schoolFacultyAttempt = await request(app).post('/api/v1/faculties').set('Authorization', `Bearer ${schoolAdminToken}`).send({ name: 'Should Never Exist' });
  assert(schoolFacultyAttempt.status === 400, `School cannot create a Faculty (got ${schoolFacultyAttempt.status})`);

  // The structure endpoint itself must reject turning usesFaculty ON for a School —
  // Faculty is a higher-ed-only concept and a School org must never end up with one.
  const schoolForceFlagAttempt = await request(app).patch('/api/v1/classes/academic-structure').set('Authorization', `Bearer ${schoolAdminToken}`)
    .send({ academicSystem: 'annual', usesFaculty: true });
  assert(schoolForceFlagAttempt.status === 400, `School cannot turn usesFaculty ON via the Academic Structure endpoint (got ${schoolForceFlagAttempt.status}, ${JSON.stringify(schoolForceFlagAttempt.body).slice(0, 200)})`);

  // Defense in depth: even if usesFaculty were somehow true in the DB (direct edit,
  // legacy data), Faculty creation must still be hard-gated on the institution type.
  await AcademicStructure.updateOne({ school: school.body.data.school._id }, { $set: { usesFaculty: true } });
  const schoolFacultyAfterForcedFlag = await request(app).post('/api/v1/faculties').set('Authorization', `Bearer ${schoolAdminToken}`).send({ name: 'Forced Flag Attempt' });
  assert(schoolFacultyAfterForcedFlag.status === 400, `Faculty creation is still rejected for a School even with usesFaculty forced true directly in the DB (got ${schoolFacultyAfterForcedFlag.status})`);

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
