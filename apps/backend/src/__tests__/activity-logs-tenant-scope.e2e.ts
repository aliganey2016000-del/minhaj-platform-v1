/**
 * Activity Logs authorization and tenant-isolation regression coverage.
 *
 * Verifies org_admin access is scoped exclusively from authenticated
 * organizationId and that platform-admin behavior remains unchanged.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
process.env.BASE_DOMAIN = 'sahaledu.com';

import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('activity-logs-tenant');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: ActivityLog } = await import('../models/activity-log.model');

    const platformAdmin = await User.create({
      email: 'logs-platform-admin@example.com', password: 'Password123!', role: 'admin',
    });
    const makeSchool = (name: string, subdomain: string) => School.create({
      name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: `${subdomain}@example.com`,
      principalName: 'Principal', establishedYear: 2020, createdBy: platformAdmin._id,
      subdomain, status: 'active',
    });
    const schoolA = await makeSchool('Logs School A', 'logs-alpha');
    const schoolB = await makeSchool('Logs School B', 'logs-beta');

    const orgAdminA = await User.create({
      email: 'logs-org-a@example.com', password: 'Password123!', role: 'org_admin',
      organizationId: schoolA._id,
    });
    const orgAdminB = await User.create({
      email: 'logs-org-b@example.com', password: 'Password123!', role: 'org_admin',
      organizationId: schoolB._id,
    });
    const teacherA = await User.create({
      email: 'logs-teacher-a@example.com', password: 'Password123!', role: 'teacher',
      organizationId: schoolA._id,
    });

    const token = (user: any) => generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
      permissions: [],
      organizationId: user.organizationId?.toString(),
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const adminToken = token(platformAdmin);
    const orgAToken = token(orgAdminA);
    const teacherAToken = token(teacherA);

    const a1 = await ActivityLog.create({
      user: orgAdminA._id, organizationId: schoolA._id, action: 'create',
      resource: 'Student', resourceId: 'A-1', details: 'Alpha create',
    });
    const a2 = await ActivityLog.create({
      user: orgAdminA._id, organizationId: schoolA._id, action: 'update',
      resource: 'Class', resourceId: 'A-2', details: 'A-only-search-needle',
    });
    const a3 = await ActivityLog.create({
      user: orgAdminA._id, organizationId: schoolA._id, action: 'delete',
      resource: 'Course', resourceId: 'A-3', details: 'Alpha delete',
    });
    const b1 = await ActivityLog.create({
      user: orgAdminB._id, organizationId: schoolB._id, action: 'create',
      resource: 'Student', resourceId: 'B-1', details: 'B-secret-search-needle',
    });
    const platformOnly = await ActivityLog.create({
      user: platformAdmin._id, action: 'view', resource: 'Platform', resourceId: 'P-1',
      details: 'Unscoped platform log',
    });

    section('org_admin reads only own organization');
    let res = await request(app).get('/api/v1/system/logs?limit=100').set(auth(orgAToken));
    const ids = (res.body?.data || []).map((row: any) => String(row._id));
    assert(res.status === 200, `org_admin A may access Activity Logs (got ${res.status})`);
    assert(ids.length === 3 && ids.includes(String(a1._id)) && ids.includes(String(a2._id)) && ids.includes(String(a3._id)),
      `org_admin A receives all and only Organization A logs (got ${ids.length})`);
    assert(!ids.includes(String(b1._id)) && !ids.includes(String(platformOnly._id)),
      'org_admin A cannot read Organization B or unscoped platform logs');
    assert(res.body?.meta?.total === 3, `pagination/count is tenant scoped (got total=${res.body?.meta?.total})`);

    section('search, action filter, user filter and spoof attempts remain tenant scoped');
    res = await request(app).get('/api/v1/system/logs?search=A-only-search-needle&limit=100').set(auth(orgAToken));
    assert(res.status === 200 && res.body?.data?.length === 1 && String(res.body.data[0]._id) === String(a2._id),
      'org_admin A search finds its own matching log');
    assert(res.body?.meta?.total === 1, `search count covers only Organization A (got ${res.body?.meta?.total})`);

    res = await request(app).get('/api/v1/system/logs?search=B-secret-search-needle&limit=100').set(auth(orgAToken));
    assert(res.status === 200 && res.body?.data?.length === 0 && res.body?.meta?.total === 0,
      'org_admin A search cannot discover Organization B logs');

    res = await request(app).get('/api/v1/system/logs?action=create&limit=100').set(auth(orgAToken));
    assert(res.status === 200 && res.body?.data?.length === 1 && String(res.body.data[0]._id) === String(a1._id),
      'action filter is intersected with Organization A scope');
    assert(res.body?.meta?.total === 1, `action-filter count is tenant scoped (got ${res.body?.meta?.total})`);

    res = await request(app).get(`/api/v1/system/logs?user=${orgAdminB._id}&limit=100`).set(auth(orgAToken));
    assert(res.status === 200 && res.body?.data?.length === 0 && res.body?.meta?.total === 0,
      'user filter cannot be used to read another organization');

    res = await request(app)
      .get(`/api/v1/system/logs?organizationId=${schoolB._id}&tenantId=${schoolB._id}&limit=100`)
      .set(auth(orgAToken))
      .set('x-organization-id', schoolB._id.toString())
      .set('x-tenant-id', schoolB._id.toString());
    const spoofIds = (res.body?.data || []).map((row: any) => String(row._id));
    assert(res.status === 200 && spoofIds.length === 3 && !spoofIds.includes(String(b1._id)),
      'query/header organization spoofing is ignored; authenticated tenant wins');

    section('org_admin Clear All deletes only own organization');
    res = await request(app)
      .delete(`/api/v1/system/logs?organizationId=${schoolB._id}&tenantId=${schoolB._id}`)
      .set(auth(orgAToken))
      .set('x-organization-id', schoolB._id.toString())
      .set('x-tenant-id', schoolB._id.toString())
      .send({ organizationId: schoolB._id.toString(), tenantId: schoolB._id.toString() });
    assert(res.status === 200, `org_admin A may clear its Activity Logs (got ${res.status})`);
    assert((await ActivityLog.countDocuments({ organizationId: schoolA._id })) === 0,
      'org_admin A Clear All removes Organization A logs');
    assert((await ActivityLog.countDocuments({ organizationId: schoolB._id })) === 1,
      'org_admin A Clear All does not delete Organization B logs');
    assert((await ActivityLog.countDocuments({ _id: platformOnly._id })) === 1,
      'org_admin A Clear All does not delete unscoped platform logs');

    section('platform admin remains platform-wide');
    res = await request(app).get('/api/v1/system/logs?limit=100').set(auth(adminToken));
    const adminIds = (res.body?.data || []).map((row: any) => String(row._id));
    assert(res.status === 200 && adminIds.includes(String(b1._id)) && adminIds.includes(String(platformOnly._id)),
      'platform admin can still read logs across tenants and platform scope');

    res = await request(app).delete('/api/v1/system/logs').set(auth(adminToken));
    assert(res.status === 200 && (await ActivityLog.countDocuments()) === 0,
      'platform admin Clear All still clears platform-wide Activity Logs');

    section('unauthenticated and unauthorized users remain blocked');
    res = await request(app).get('/api/v1/system/logs');
    assert(res.status === 401, `unauthenticated user is blocked (got ${res.status})`);
    res = await request(app).get('/api/v1/system/logs').set(auth(teacherAToken));
    assert(res.status === 403, `teacher is blocked (got ${res.status})`);
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll Activity Logs tenant-isolation checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
