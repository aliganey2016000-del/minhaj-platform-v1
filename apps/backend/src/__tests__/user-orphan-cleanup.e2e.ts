/**
 * User Management "Delete" — orphan cleanup regression.
 *
 * The Student/Teacher/Parent create flow writes User -> Profile -> domain
 * record without a transaction (this deployment's MongoDB has no replica
 * set, so transactions aren't available at all — see student.controller.ts's
 * `create`). If the last step fails, the User/Profile is left behind with no
 * Student/Teacher/Parent ever created for it. That orphan is invisible on
 * Manage Students/Teachers/Parents (which read from the domain collection),
 * but still lists on User Management — and until this fix, "Delete" there
 * only ever set isActive:false, permanently blocking the email with no way
 * to actually remove it through the UI.
 *
 * Covers: an orphaned account (no domain record) is genuinely removed and
 * its email freed up, while a real account (with a domain record) is still
 * only ever deactivated, never deleted, through this same endpoint.
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
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Student } = await import('../models/student.model');

  const admin = await User.create({ email: 'orphan-cleanup-admin@test.local', password: 'Password123!', role: 'admin' });
  const adminToken = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });

  const school = await School.create({
    name: 'Orphan Cleanup School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Road', phone: '+252611119999', email: 'orphan-cleanup-school@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: admin._id,
  });

  section('ORPHAN — a failed "Add Student" leaves a User+Profile with no Student');
  const orphanUser = await User.create({ email: 'orphan-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
  const orphanProfile = await Profile.create({ user: orphanUser._id, firstName: 'Orphan', lastName: 'Student', gender: 'male' });
  assert(!(await Student.exists({ user: orphanUser._id })), 'fixture sanity check: no Student document references this orphan User');

  const deleteOrphan = await request(app)
    .delete(`/api/v1/users/${orphanUser._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(deleteOrphan.status === 200, `delete succeeds (status ${deleteOrphan.status})`);
  assert(/removed/i.test(deleteOrphan.body?.message || ''), `response says the account was removed, not deactivated (got "${deleteOrphan.body?.message}")`);
  assert(!(await User.findById(orphanUser._id)), 'the orphan User document is actually gone, not just deactivated');
  assert(!(await Profile.findById(orphanProfile._id)), 'the orphan Profile document is gone too');

  const reregister = await User.create({ email: 'orphan-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
  assert(String(reregister.email) === 'orphan-student@test.local', 'the freed email can be used again for a fresh registration');

  section('REAL STUDENT — Delete only ever deactivates, never removes a linked account');
  const realUser = await User.create({ email: 'real-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
  const realProfile = await Profile.create({ user: realUser._id, firstName: 'Real', lastName: 'Student', gender: 'male' });
  const realStudent = await Student.create({ user: realUser._id, profile: realProfile._id, school: school._id, status: 'active', approvalStatus: 'approved' });

  const deleteReal = await request(app)
    .delete(`/api/v1/users/${realUser._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(deleteReal.status === 200, `delete succeeds (status ${deleteReal.status})`);
  assert(/deactivated/i.test(deleteReal.body?.message || ''), `response says the account was deactivated, not removed (got "${deleteReal.body?.message}")`);
  const realUserAfter: any = await User.findById(realUser._id).lean();
  assert(realUserAfter?.isActive === false, 'the real User document still exists and is now inactive');
  assert(await Student.exists({ _id: realStudent._id }), 'the linked Student document is completely untouched');
  assert(await Profile.exists({ _id: realProfile._id }), 'the linked Profile document is completely untouched');

  section('NON-DOMAIN ROLES — admin/org_admin/staff accounts are unaffected by the orphan check');
  const orgAdminUser = await User.create({ email: 'org-admin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
  const deleteOrgAdmin = await request(app)
    .delete(`/api/v1/users/${orgAdminUser._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(deleteOrgAdmin.status === 200, `delete succeeds (status ${deleteOrgAdmin.status})`);
  assert(/deactivated/i.test(deleteOrgAdmin.body?.message || ''), 'org_admin accounts (no domain-record concept) are only ever deactivated');
  assert(await User.exists({ _id: orgAdminUser._id }), 'the org_admin User document still exists');

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL USER ORPHAN CLEANUP CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
