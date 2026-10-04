/**
 * Tenant Sidebar Config + Staff/Admin Access regressions.
 *
 * Covers:
 * - student and teacher sidebar settings are isolated per tenant
 * - org_admin cannot target another tenant by supplying a school id
 * - teacher/student effective settings come from their own school
 * - Staff sidebar access and API permissions are aligned
 * - read-only Staff gets 403 on write APIs
 * - cross-tenant permission assignment is rejected
 * - Staff cannot edit their own grants/sidebar access
 * - page-specific permission normalization rejects irrelevant actions
 * - frontend AdminGuard contains the Staff direct-URL gate
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('tenant-sidebar-staff-access');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Student } = await import('../models/student.model');
    const { default: SidebarSetting } = await import('../models/sidebar-setting.model');

    const token = (user: any) => generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
      permissions: (user.permissions || []).flatMap((permission: any) =>
        (permission.actions || []).map((action: string) =>
          permission.page ? `page:${permission.page}.${action}` : `${permission.module}.${action}`
        )
      ),
      organizationId: user.organizationId?.toString(),
    });
    const auth = (user: any) => ({ Authorization: `Bearer ${token(user)}` });

    const platformAdmin = await User.create({ email: 'sidebar-admin@test.local', password: 'Password123!', role: 'admin' });
    const makeSchool = (name: string, email: string) => School.create({
      name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 Test Street', phone: '+252000000000', email,
      principalName: 'Principal', establishedYear: 2020, createdBy: platformAdmin._id,
    });
    const schoolA = await makeSchool('Sidebar School A', 'sidebar-a@test.local');
    const schoolB = await makeSchool('Sidebar School B', 'sidebar-b@test.local');

    const orgAdminA = await User.create({ email: 'sidebar-org-a@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    const orgAdminB = await User.create({ email: 'sidebar-org-b@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });

    section('Student sidebar tenant isolation');
    let res = await request(app).put('/api/v1/sidebar-settings').set(auth(orgAdminA)).send({
      portal: 'student',
      items: [{ key: 'student/courses', visible: false }],
      school: schoolB._id.toString(),
    });
    assert(res.status === 200, `org admin can save own student sidebar (got ${res.status})`);

    const studentASetting = await SidebarSetting.findOne({ school: schoolA._id, portal: 'student' }).lean();
    const studentBSetting = await SidebarSetting.findOne({ school: schoolB._id, portal: 'student' }).lean();
    assert(Boolean(studentASetting) && !studentBSetting, 'supplied cross-tenant school id is ignored; only School A changed');

    res = await request(app).get('/api/v1/sidebar-settings?portal=student').set(auth(orgAdminA));
    assert(res.status === 200 && res.body?.data?.items?.find((i: any) => i.key === 'student/courses')?.visible === false, 'School A sees its disabled Student item');

    res = await request(app).get('/api/v1/sidebar-settings?portal=student').set(auth(orgAdminB));
    assert(res.status === 200 && res.body?.data?.items?.find((i: any) => i.key === 'student/courses')?.visible === true, 'School B remains at default Student visibility');

    section('Teacher sidebar configuration and effective tenant settings');
    res = await request(app).put('/api/v1/sidebar-settings').set(auth(orgAdminA)).send({
      portal: 'teacher',
      items: [{ key: 'teacher/exams', visible: false }, { key: 'teacher/results/enter', visible: false }],
    });
    assert(res.status === 200, `org admin can save Teacher sidebar (got ${res.status})`);

    const teacherUserA = await User.create({ email: 'sidebar-teacher-a@test.local', password: 'Password123!', role: 'teacher', organizationId: schoolA._id });
    const teacherProfileA = await Profile.create({ user: teacherUserA._id, firstName: 'Teacher', lastName: 'A', gender: 'male' });
    await Teacher.create({ user: teacherUserA._id, profile: teacherProfileA._id, school: schoolA._id });

    const teacherUserB = await User.create({ email: 'sidebar-teacher-b@test.local', password: 'Password123!', role: 'teacher', organizationId: schoolB._id });
    const teacherProfileB = await Profile.create({ user: teacherUserB._id, firstName: 'Teacher', lastName: 'B', gender: 'male' });
    await Teacher.create({ user: teacherUserB._id, profile: teacherProfileB._id, school: schoolB._id });

    res = await request(app).get('/api/v1/sidebar-settings/mine?portal=teacher').set(auth(teacherUserA));
    assert(res.status === 200 && res.body?.data?.items?.find((i: any) => i.key === 'teacher/exams')?.visible === false, 'Teacher A receives School A Teacher config');

    res = await request(app).get('/api/v1/sidebar-settings/mine?portal=teacher').set(auth(teacherUserB));
    assert(res.status === 200 && res.body?.data?.items?.find((i: any) => i.key === 'teacher/exams')?.visible === true, 'Teacher B does not inherit School A Teacher config');

    const studentUserA = await User.create({ email: 'sidebar-student-a@test.local', password: 'Password123!', role: 'student', organizationId: schoolA._id });
    const studentProfileA = await Profile.create({ user: studentUserA._id, firstName: 'Student', lastName: 'A', gender: 'female' });
    await Student.create({ user: studentUserA._id, profile: studentProfileA._id, school: schoolA._id });
    res = await request(app).get('/api/v1/sidebar-settings/mine?portal=student').set(auth(studentUserA));
    assert(res.status === 200 && res.body?.data?.items?.find((i: any) => i.key === 'student/courses')?.visible === false, 'Student receives own-school Student config');

    section('Staff module permissions and API enforcement');
    let staffA = await User.create({
      email: 'sidebar-staff-a@test.local', password: 'Password123!', role: 'staff', organizationId: schoolA._id,
    });
    const staffB = await User.create({
      email: 'sidebar-staff-b@test.local', password: 'Password123!', role: 'staff', organizationId: schoolB._id,
    });

    res = await request(app).patch(`/api/v1/users/${staffA._id}/sidebar-access`).set(auth(orgAdminA)).send({ keys: ['admin/payments'] });
    assert(res.status === 200, `org admin can assign Staff sidebar page (got ${res.status})`);
    res = await request(app).patch(`/api/v1/users/${staffA._id}/permissions`).set(auth(orgAdminA)).send({
      permissions: [{ module: 'finance', page: 'admin/payments', actions: ['read'] }],
    });
    assert(res.status === 200, `org admin can assign Staff read permission (got ${res.status})`);

    staffA = (await User.findById(staffA._id))!;
    res = await request(app).get('/api/v1/payments').set(auth(staffA));
    assert(res.status !== 403, `Finance View grant passes authorization layer (got ${res.status})`);
    res = await request(app).post('/api/v1/payments').set(auth(staffA)).send({});
    assert(res.status === 403, `Finance View-only Staff cannot create/receive payment (got ${res.status})`);

    res = await request(app).patch(`/api/v1/users/${staffB._id}/permissions`).set(auth(orgAdminA)).send({
      permissions: [{ module: 'finance', page: 'admin/payments', actions: ['read'] }],
    });
    assert(res.status === 403, `School A org admin cannot grant access to School B Staff (got ${res.status})`);

    section('Privilege escalation prevention');
    const staffManager = await User.create({
      email: 'sidebar-staff-manager@test.local', password: 'Password123!', role: 'staff', organizationId: schoolA._id,
      sidebarAccess: ['admin/users', 'admin/hr/access'],
      permissions: [
        { module: 'organization', page: 'admin/users', actions: ['read', 'edit'] },
        { module: 'organization', page: 'admin/hr/access', actions: ['read', 'edit'] },
      ],
    });

    res = await request(app).patch(`/api/v1/users/${staffManager._id}/permissions`).set(auth(staffManager)).send({
      permissions: [{ module: 'system', page: 'admin/settings', actions: ['read', 'edit'] }],
    });
    assert(res.status === 403, `Staff cannot change their own permission grants (got ${res.status})`);

    res = await request(app).patch(`/api/v1/users/${staffManager._id}/sidebar-access`).set(auth(staffManager)).send({
      keys: ['admin/settings', 'admin/roles'],
    });
    assert(res.status === 403, `Staff cannot change their own module/sidebar grants (got ${res.status})`);

    res = await request(app).put('/api/v1/sidebar-settings').set(auth(staffManager)).send({
      portal: 'student',
      items: [{ key: 'student/courses', visible: true }],
    });
    assert(res.status === 403, `Staff cannot administer tenant Student/Teacher sidebar settings (got ${res.status})`);

    res = await request(app).get('/api/v1/users/sidebar/catalog').set(auth(orgAdminA));
    const catalogKeys = new Set((res.body?.data || []).map((item: any) => item.key));
    assert(
      res.status === 200
      && !catalogKeys.has('admin/roles')
      && !catalogKeys.has('admin/settings/sidebar')
      && !catalogKeys.has('admin/hr/access'),
      'Staff access catalog excludes role, permission and tenant-sidebar administration pages',
    );

    section('Page-specific action normalization');
    res = await request(app).patch(`/api/v1/users/${staffA._id}/permissions`).set(auth(orgAdminA)).send({
      permissions: [{
        module: 'exams', page: 'admin/results/enter',
        actions: ['read', 'enter_results', 'edit', 'submit', 'publish', 'delete', 'receive_payment'],
      }],
    });
    assert(res.status === 200, `Result Entry permissions save (got ${res.status})`);
    staffA = (await User.findById(staffA._id))!;
    const resultGrant: any = staffA.permissions.find((p: any) => p.page === 'admin/results/enter');
    assert(Boolean(resultGrant) && resultGrant.actions.includes('enter_results') && !resultGrant.actions.includes('delete') && !resultGrant.actions.includes('receive_payment'), 'irrelevant Result Entry actions are stripped server-side');

    section('Frontend direct-URL guard regression');
    const guardPath = path.resolve(process.cwd(), '../frontend/src/features/admin/components/admin-guard.tsx');
    const guardSource = fs.readFileSync(guardPath, 'utf8');
    assert(guardSource.includes('staffPageForLocation') && guardSource.includes('staffDenied') && guardSource.includes('sidebarAccess.includes'), 'AdminGuard blocks Staff direct URLs without sidebar + View permission');

  } finally {
    await mongoose.disconnect();
    await db.stop();
  }

  if (failures) {
    console.error(`\n${failures} tenant sidebar/staff access regression(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll Tenant Sidebar Config / Staff Access regressions passed.');
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
