/**
 * Student bulk import — password hashing must stay both correct and fast.
 *
 * bulkImport() used to call bcrypt.hash() itself for every row (and again
 * for every new guardian account) inside the sequential validation loop,
 * BEFORE calling User.create(). But User's own pre-save hook (user.model.ts)
 * already hashes `password` on every create/modify — so every imported
 * student and guardian account was hashed TWICE (bcrypt(bcrypt(plaintext))).
 * A double-hashed value can never be validated against the real plaintext
 * via bcrypt.compare(), so none of those accounts could ever actually log
 * in with the password they were assigned. This was a real, serious,
 * pre-existing authentication bug, independent of the reported slowness.
 *
 * It also caused the reported slowness: a few hundred sequential
 * bcrypt.hash() calls back to back (one per row, mostly for the same
 * literal default password) was slow enough that a large real-world import
 * (reported: 722 rows) blew past the reverse-proxy's request timeout. The
 * browser reported "Import failed" while the request kept running
 * server-side and actually finished the insert, leaving admins looking at
 * stale/partial student counts until a manual page refresh.
 *
 * The fix removes all manual pre-hashing from the controller and passes
 * plaintext straight into User.create() for both students and guardians,
 * letting the pre-save hook be the single hashing authority — matching the
 * pattern already used by the single-student "Quick Add" endpoint. This
 * also fixes the slowness as a side effect: the real (necessary) hashing
 * work now happens inside the insert phase's existing 10-way-concurrent
 * batching instead of a purely sequential pre-pass.
 *
 * This test proves every imported student's AND guardian's stored password
 * actually validates against the real plaintext they were assigned via
 * bcrypt.compare — the exact property the double-hashing bug broke. It
 * also confirms bcrypt's per-call random salting is preserved (two rows
 * sharing one plaintext password store two different hash strings), since
 * a "fix" that cached/reused one hash across accounts would be a security
 * regression even though it happens to also pass a compare() check.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import * as XLSX from 'xlsx';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

function workbookBuffer(rows: Record<string, unknown>[]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Students');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: School } = await import('../models/school.model');
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');
  const bcrypt = (await import('bcrypt')).default;

  const admin = await User.create({ email: 'password-cache-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
  const school = await School.create({
    name: 'Password Cache School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Test Road', phone: '+252611210000', email: 'password-cache-school@test.local',
    principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
  });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });
  const grade9 = await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 9', section: 'A', room: '9A',
    batch: '2027', gradeLevel: 9, academicYear: '2027-2028', status: 'active', shiftMode: 'Morning',
  });

  section('IMPORT — a mix of blank-default, shared-explicit, and unique passwords, plus a guardian');
  // 8 rows leave Password blank (all fall back to the same 'changeme123'
  // default), 2 rows share one explicit password, and 1 row sets its own.
  // One row also carries guardian details, so the guardian account's
  // password path gets covered too.
  const blankRows = Array.from({ length: 8 }, (_, i) => ({
    'First Name': `Blank${i}`, 'Last Name': 'Student', Gender: 'male',
    Email: `blank-${i}@test.local`, Organization: school.name,
    'Class Name': 'Grade 9', Section: 'A', 'Enrollment Date': '2027-09-01',
  }));
  const sharedRows = [0, 1].map((i) => ({
    'First Name': `Shared${i}`, 'Last Name': 'Student', Gender: 'female',
    Email: `shared-${i}@test.local`, Organization: school.name,
    'Class Name': 'Grade 9', Section: 'A', 'Enrollment Date': '2027-09-01',
    Password: 'SharedSecret1',
  }));
  const uniqueRow = {
    'First Name': 'Unique', 'Last Name': 'Student', Gender: 'male',
    Email: 'unique@test.local', Organization: school.name,
    'Class Name': 'Grade 9', Section: 'A', 'Enrollment Date': '2027-09-01',
    Password: 'OnlyMineSecret1',
  };
  const guardianRow = {
    'First Name': 'HasGuardian', 'Last Name': 'Student', Gender: 'female',
    Email: 'has-guardian@test.local', Organization: school.name,
    'Class Name': 'Grade 9', Section: 'A', 'Enrollment Date': '2027-09-01',
    'Guardian Name': 'Guardian One', 'Guardian Email': 'guardian-one@test.local',
    'Guardian Password': 'GuardianSecret1', 'Guardian Phone': '+252611220000', Relationship: 'Father',
  };
  const importRows = [...blankRows, ...sharedRows, uniqueRow, guardianRow];

  const imported = await request(app)
    .post('/api/v1/students/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', workbookBuffer(importRows), { filename: 'students.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  assert(imported.status === 200, `import request succeeds (status ${imported.status})`);
  assert(imported.body?.data?.created === importRows.length, `all ${importRows.length} rows import successfully (got ${imported.body?.data?.created}, errors: ${JSON.stringify(imported.body?.data?.errors)})`);

  section('LOGIN CORRECTNESS — every stored hash actually validates its real assigned password');
  const blankUsers: any[] = await User.find({ email: { $in: blankRows.map((r) => r.Email) } }).select('+password email').lean();
  assert(blankUsers.length === blankRows.length, `all ${blankRows.length} blank-password students were created`);
  for (const u of blankUsers) {
    assert(await bcrypt.compare('changeme123', u.password), `${u.email}'s stored hash matches the real default "changeme123" (would be able to log in)`);
  }

  const sharedUsers: any[] = await User.find({ email: { $in: sharedRows.map((r) => r.Email) } }).select('+password email').lean();
  assert(sharedUsers.length === 2, 'both shared-password students were created');
  for (const u of sharedUsers) {
    assert(await bcrypt.compare('SharedSecret1', u.password), `${u.email}'s stored hash matches "SharedSecret1" (would be able to log in)`);
  }

  const uniqueUser: any = await User.findOne({ email: uniqueRow.Email }).select('+password').lean();
  assert(Boolean(uniqueUser), 'the unique-password student was created');
  assert(await bcrypt.compare('OnlyMineSecret1', uniqueUser?.password), 'the unique-password row\'s stored hash matches "OnlyMineSecret1" (would be able to log in)');
  assert(!(await bcrypt.compare('OnlyMineSecret1', blankUsers[0].password)), 'a blank-password row\'s hash does NOT also validate the unrelated unique password');

  const guardianUser: any = await User.findOne({ email: guardianRow['Guardian Email'] }).select('+password').lean();
  assert(Boolean(guardianUser), 'the guardian account was created');
  assert(guardianUser?.role === 'parent', 'the guardian account has role "parent"');
  assert(await bcrypt.compare('GuardianSecret1', guardianUser?.password), 'the guardian\'s stored hash matches "GuardianSecret1" (would be able to log in) — this is the double-hash bug\'s exact failure mode');

  section('SALTING PRESERVED — bcrypt\'s per-call random salt still applies (no hash reuse across accounts)');
  const sharedHashes = new Set(sharedUsers.map((u) => u.password));
  assert(sharedHashes.size === 2, `both rows sharing "SharedSecret1" still get their own distinct salted hash (got ${sharedHashes.size} distinct hash(es) — 1 would mean an unsafe shared/cached hash)`);
  const blankHashes = new Set(blankUsers.map((u) => u.password));
  assert(blankHashes.size === blankUsers.length, `every blank-password row still gets its own distinct salted hash (got ${blankHashes.size} of ${blankUsers.length})`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL STUDENT IMPORT PASSWORD CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
