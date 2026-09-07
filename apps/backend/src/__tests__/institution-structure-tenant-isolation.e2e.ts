/**
 * Institution-type separation + tenant isolation for Faculty/Department/Program.
 *
 * Covers gaps found during the institution-type-awareness audit:
 *
 *  1. School vs University must not mix: a School org has no Faculty/Department
 *     concept exposed by default (Faculty creation is rejected), while a
 *     University org's Faculty->Department->Program hierarchy resolves via
 *     the shared `resolveInstitutionType`/`isHigherEdInstitutionType` helpers
 *     regardless of whether the org was created with the legacy
 *     `organizationType` field or the current `institutionType` field.
 *
 *  2. Tenant isolation: GET /faculties, /departments and /programs used to
 *     scope non-org_admin roles (teacher, student, parent) by a
 *     client-supplied `?school=` query param instead of their own JWT
 *     organizationId, so any authenticated teacher/student/parent could read
 *     another organization's Faculty/Department/Program records by passing
 *     a different org id. Fixed via `resolveViewableOrgId` in
 *     utils/tenant-scope.ts — this test proves a University B teacher can no
 *     longer read University A's faculties by querying `?school=<orgA>`.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:institution-structure-tenant-isolation`.
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
  const { default: School } = await import('../models/school.model');
  const { default: Teacher } = await import('../models/teacher.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });

  // -------------------------------------------------------------------
  section('SETUP — a School org and a University org (created via the legacy organizationType field, no institutionType)');
  // -------------------------------------------------------------------
  const schoolOrg = await School.create({
    name: 'Al-Noor School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'school@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });
  const universityOrgA = await School.create({
    name: 'University A', organizationType: 'university', country: 'Somalia', city: 'Mogadishu',
    address: '2 St', phone: '+001', email: 'uniA@test.local', principalName: 'Rector A', establishedYear: 2010, createdBy: adminUser._id,
  });
  const universityOrgB = await School.create({
    name: 'University B', institutionType: 'university', country: 'Somalia', city: 'Hargeisa',
    address: '3 St', phone: '+002', email: 'uniB@test.local', principalName: 'Rector B', establishedYear: 2015, createdBy: adminUser._id,
  });

  const schoolAdminToken = tokenFor(
    (await User.create({ email: 'schooladmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolOrg._id }))._id.toString(),
    'org_admin', schoolOrg._id.toString()
  );
  const uniAAdminToken = tokenFor(
    (await User.create({ email: 'uniAadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: universityOrgA._id }))._id.toString(),
    'org_admin', universityOrgA._id.toString()
  );
  const uniBAdminUser = await User.create({ email: 'uniBadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: universityOrgB._id });
  const uniBAdminToken = tokenFor(uniBAdminUser._id.toString(), 'org_admin', universityOrgB._id.toString());

  // -------------------------------------------------------------------
  section('GET /schools/:id — institutionType is always resolved, even for a legacy organizationType-only document');
  // -------------------------------------------------------------------
  const schoolGetRes = await request(app).get(`/api/v1/schools/${schoolOrg._id}`).set('Authorization', `Bearer ${schoolAdminToken}`);
  assert(schoolGetRes.status === 200 && schoolGetRes.body?.data?.institutionType === 'school', `legacy 'private' organizationType resolves to institutionType 'school' (got ${schoolGetRes.body?.data?.institutionType})`);

  const uniAGetRes = await request(app).get(`/api/v1/schools/${universityOrgA._id}`).set('Authorization', `Bearer ${uniAAdminToken}`);
  assert(uniAGetRes.status === 200 && uniAGetRes.body?.data?.institutionType === 'university', `legacy organizationType:'university' resolves to institutionType 'university' (got ${uniAGetRes.body?.data?.institutionType})`);

  // -------------------------------------------------------------------
  section('SCHOOL VS UNIVERSITY MUST NOT MIX — School org cannot create a Faculty, University org can');
  // -------------------------------------------------------------------
  const schoolFacultyRes = await request(app).post('/api/v1/faculties').set('Authorization', `Bearer ${schoolAdminToken}`).send({ name: 'Should Not Exist' });
  assert(schoolFacultyRes.status === 400, `School org is rejected when creating a Faculty (got status ${schoolFacultyRes.status})`);

  const uniAFacultyRes = await request(app).post('/api/v1/faculties').set('Authorization', `Bearer ${uniAAdminToken}`).send({ name: 'Faculty of Engineering', code: 'ENG' });
  assert(uniAFacultyRes.status === 201, `University org (legacy organizationType field) can create a Faculty (got status ${uniAFacultyRes.status}, body ${JSON.stringify(uniAFacultyRes.body)})`);
  const uniAFacultyId = uniAFacultyRes.body?.data?._id;

  const uniBFacultyRes = await request(app).post('/api/v1/faculties').set('Authorization', `Bearer ${uniBAdminToken}`).send({ name: 'Faculty of Science', code: 'SCI' });
  assert(uniBFacultyRes.status === 201, `University B (institutionType field) can create a Faculty (got status ${uniBFacultyRes.status})`);

  // -------------------------------------------------------------------
  section('TENANT ISOLATION — org_admin of University A cannot see University B faculties, and vice versa');
  // -------------------------------------------------------------------
  const uniAListRes = await request(app).get('/api/v1/faculties').set('Authorization', `Bearer ${uniAAdminToken}`);
  const uniANames = (uniAListRes.body?.data || []).map((f: any) => f.name);
  assert(uniAListRes.status === 200 && uniANames.includes('Faculty of Engineering') && !uniANames.includes('Faculty of Science'), `University A admin only sees its own faculty (got ${JSON.stringify(uniANames)})`);

  // -------------------------------------------------------------------
  section("TENANT ISOLATION — a University B TEACHER cannot read University A's faculties via ?school=<orgA>");
  // -------------------------------------------------------------------
  const uniBTeacher = await Teacher.create({
    user: uniBAdminUser._id, school: universityOrgB._id, teacherId: 'T-001',
    profile: { firstName: 'Amina', lastName: 'Hassan' }, status: 'active',
  });
  const uniBTeacherUser = await User.create({ email: 'uniBteacher@test.local', password: 'Password123!', role: 'teacher', organizationId: universityOrgB._id });
  const uniBTeacherToken = tokenFor(uniBTeacherUser._id.toString(), 'teacher', universityOrgB._id.toString());
  void uniBTeacher;

  const crossTenantRes = await request(app)
    .get('/api/v1/faculties')
    .set('Authorization', `Bearer ${uniBTeacherToken}`)
    .query({ school: universityOrgA._id.toString() }); // attempted cross-tenant read
  const crossTenantNames = (crossTenantRes.body?.data || []).map((f: any) => f.name);
  assert(crossTenantRes.status === 200, `request succeeds (status ${crossTenantRes.status})`);
  assert(!crossTenantNames.includes('Faculty of Engineering'), `University A's faculty is NOT leaked to a University B teacher passing ?school=<orgA> (got ${JSON.stringify(crossTenantNames)})`);
  assert(crossTenantNames.includes('Faculty of Science'), `the teacher's own organization's faculty (University B) is still returned (got ${JSON.stringify(crossTenantNames)})`);

  void uniAFacultyId;

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
