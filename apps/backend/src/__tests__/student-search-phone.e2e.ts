/**
 * GET /students?search= — phone number matching.
 *
 * Record Payment's student picker needs to find a student by phone number
 * (not just name/email/studentId), and needs the phone number back in the
 * response to display. Neither worked before: the `user` populate select
 * didn't include `phone` at all, and the search filter never checked it.
 *
 * Phone matching strips non-digit characters from both the query and the
 * stored number, so "+252 61 234 5678", "0612345678", and a search of
 * "612345678" all match each other regardless of formatting.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:student-search-phone`.
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
  const { default: Student } = await import('../models/student.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });
  const orgAdminToken = tokenFor(
    (await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id }))._id.toString(),
    'org_admin', school._id.toString()
  );

  async function makeStudent(studentId: string, firstName: string, phone: string) {
    const u = await User.create({ email: `${studentId.toLowerCase()}@test.local`, password: 'Password123!', role: 'student', phone });
    const p = await Profile.create({ user: u._id, firstName, lastName: 'Test', gender: 'female' });
    return Student.create({ user: u._id, profile: p._id, studentId, school: school._id, status: 'active', approvalStatus: 'approved' });
  }

  const leyla = await makeStudent('TUSMO-501', 'Leyla', '+252612345678');
  await makeStudent('TUSMO-502', 'Xasan', '+252699000001');

  // -------------------------------------------------------------------
  section('SEARCH BY PHONE — formatted query, stripped-digits match');
  // -------------------------------------------------------------------
  const res1 = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${orgAdminToken}`).query({ search: '+252 61 234 5678', limit: '20', approvalStatus: 'approved' });
  assert(res1.status === 200, `request succeeds (status ${res1.status})`);
  const ids1 = (res1.body?.data || []).map((s: any) => s._id);
  assert(ids1.length === 1 && ids1[0] === leyla._id.toString(), `formatted phone search finds exactly Leyla (got ${JSON.stringify(res1.body?.data?.map((s: any) => s.studentId))})`);
  assert(res1.body?.data?.[0]?.user?.phone === '+252612345678', `the phone number is actually present in the response (got ${res1.body?.data?.[0]?.user?.phone})`);

  // -------------------------------------------------------------------
  section('SEARCH BY PHONE — bare digits, no formatting');
  // -------------------------------------------------------------------
  const res2 = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${orgAdminToken}`).query({ search: '612345678', limit: '20', approvalStatus: 'approved' });
  const ids2 = (res2.body?.data || []).map((s: any) => s._id);
  assert(ids2.length === 1 && ids2[0] === leyla._id.toString(), `bare-digit phone search still finds Leyla (got ${JSON.stringify(res2.body?.data?.map((s: any) => s.studentId))})`);

  // -------------------------------------------------------------------
  section('SEARCH BY STUDENT ID — still works, unaffected by the phone matching addition');
  // -------------------------------------------------------------------
  const res3 = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${orgAdminToken}`).query({ search: 'TUSMO-501', limit: '20', approvalStatus: 'approved' });
  const ids3 = (res3.body?.data || []).map((s: any) => s._id);
  assert(ids3.length === 1 && ids3[0] === leyla._id.toString(), `studentId search still works (got ${JSON.stringify(res3.body?.data?.map((s: any) => s.studentId))})`);

  // -------------------------------------------------------------------
  section('SEARCH BY NAME — was silently broken before: the DB-level query only ever matched studentId, so a name search that didn\'t coincidentally hit the studentId string returned nothing');
  // -------------------------------------------------------------------
  const res5 = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${orgAdminToken}`).query({ search: 'Leyla', limit: '20', approvalStatus: 'approved' });
  const ids5 = (res5.body?.data || []).map((s: any) => s._id);
  assert(ids5.length === 1 && ids5[0] === leyla._id.toString(), `search by first name "Leyla" now finds her (got ${JSON.stringify(res5.body?.data?.map((s: any) => s.studentId))})`);

  // -------------------------------------------------------------------
  section('SHORT QUERY — a 2-digit search does not match every phone number by accident');
  // -------------------------------------------------------------------
  const res4 = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${orgAdminToken}`).query({ search: '99', limit: '20', approvalStatus: 'approved' });
  const ids4 = (res4.body?.data || []).map((s: any) => s._id);
  assert(ids4.length === 0, `a 2-digit query matches nothing by phone (the 3-digit minimum guard works) (got ${ids4.length} results)`);

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
