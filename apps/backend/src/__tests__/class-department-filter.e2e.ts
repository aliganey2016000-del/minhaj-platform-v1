/**
 * Classes list — Department filter (single and multi-select).
 *
 * The Manage Classes page's Department column filter used to build its
 * checkbox options AND its filtering from only the currently-loaded page of
 * classes (client-side, on top of server pagination) — so a department
 * whose classes weren't on the loaded page never even appeared as an
 * option, looking like it "doesn't exist". Fixed by having the frontend
 * pick real department ids from the full /departments list and pass them
 * to the server; class.controller.ts's getAll now accepts either a single
 * department id or a comma-separated list ($in) for GET /classes?department=.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:class-department-filter`.
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
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');

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

  const primary = await Department.create({ name: 'Primary', tenantId: school._id });
  const secondary = await Department.create({ name: 'Secondary', tenantId: school._id });
  const middle = await Department.create({ name: 'Middle School', tenantId: school._id });

  // 30 Primary classes (pushes Secondary/Middle off a small default page if
  // filtering were still done client-side on the current page only) + a
  // handful of Secondary and Middle classes, all created AFTER Primary so
  // they'd sort BEFORE it (createdAt desc) — but the old bug wasn't about
  // sort order, it was that the filter's own option list only ever looked
  // at whatever page was loaded, so seed enough Primary rows to prove the
  // Department filter isn't just reading page 1 of an unfiltered list.
  for (let i = 0; i < 30; i++) {
    await ClassModel.create({
      school: school._id, department: primary._id, title: `Primary Class ${i}`, section: 'A', room: `P${i}`,
      gradeLevel: 1, academicYear: '2026/27', status: 'active',
    });
  }
  const sec1 = await ClassModel.create({ school: school._id, department: secondary._id, title: 'Secondary Class 1', section: 'A', room: 'S1', gradeLevel: 9, academicYear: '2026/27', status: 'active' });
  const sec2 = await ClassModel.create({ school: school._id, department: secondary._id, title: 'Secondary Class 2', section: 'B', room: 'S2', gradeLevel: 10, academicYear: '2026/27', status: 'active' });
  const mid1 = await ClassModel.create({ school: school._id, department: middle._id, title: 'Middle Class 1', section: 'A', room: 'M1', gradeLevel: 6, academicYear: '2026/27', status: 'active' });

  // -------------------------------------------------------------------
  section('SINGLE DEPARTMENT — filtering by Secondary alone returns exactly its 2 classes, ignoring the 30 Primary ones');
  // -------------------------------------------------------------------
  const singleRes = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${orgAdminToken}`).query({ department: secondary._id.toString(), limit: '25' });
  assert(singleRes.status === 200, `request succeeds (status ${singleRes.status})`);
  const singleIds = (singleRes.body?.data || []).map((c: any) => c._id);
  assert(singleRes.body?.meta?.total === 2, `total is exactly 2, not 30+2 (got ${singleRes.body?.meta?.total})`);
  assert(singleIds.includes(sec1._id.toString()) && singleIds.includes(sec2._id.toString()), `both Secondary classes are present`);
  assert(!singleIds.some((id: string) => id === mid1._id.toString()), `the Middle School class is excluded`);

  // -------------------------------------------------------------------
  section('MULTI DEPARTMENT — comma-separated ids (Secondary + Middle School) returns exactly their 3 classes');
  // -------------------------------------------------------------------
  const multiRes = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${orgAdminToken}`).query({ department: `${secondary._id.toString()},${middle._id.toString()}`, limit: '25' });
  assert(multiRes.status === 200, `request succeeds (status ${multiRes.status})`);
  assert(multiRes.body?.meta?.total === 3, `total is exactly 3 (2 Secondary + 1 Middle School), not 30+ (got ${multiRes.body?.meta?.total})`);
  const multiIds = (multiRes.body?.data || []).map((c: any) => c._id);
  assert([sec1._id.toString(), sec2._id.toString(), mid1._id.toString()].every((id) => multiIds.includes(id)), `all 3 targeted classes are present`);

  // -------------------------------------------------------------------
  section('NO FILTER — every class (33 total) is still reachable via pagination, Secondary/Middle included');
  // -------------------------------------------------------------------
  const allRes = await request(app).get('/api/v1/classes').set('Authorization', `Bearer ${orgAdminToken}`).query({ limit: '50' });
  assert(allRes.status === 200 && allRes.body?.meta?.total === 33, `total is 33 with no department filter (got ${allRes.body?.meta?.total})`);

  // -------------------------------------------------------------------
  section('DEPARTMENTS LIST — GET /departments returns all 3, including Secondary, regardless of class pagination');
  // -------------------------------------------------------------------
  const deptsRes = await request(app).get('/api/v1/departments').set('Authorization', `Bearer ${orgAdminToken}`);
  const deptNames = (deptsRes.body?.data || []).map((d: any) => d.name);
  assert(deptsRes.status === 200 && deptNames.includes('Secondary'), `Secondary is present in the full department list (got ${JSON.stringify(deptNames)})`);

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
