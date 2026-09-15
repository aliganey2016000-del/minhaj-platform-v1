/**
 * Student bulk import — password hashing must stay both correct and cheap.
 *
 * bulkImport() used to call bcrypt.hash() fresh for every row, inside the
 * single sequential validation loop. A real bulk import overwhelmingly
 * leaves Password blank (falling back to the same literal default), so a
 * few-hundred-row file meant a few hundred *redundant* bcrypt.hash() calls
 * back to back — slow enough that a large real-world import (reported: 722
 * rows) blew past the reverse-proxy's request timeout. The browser reported
 * "Import failed" while the request kept running server-side and actually
 * finished the insert, leaving admins looking at stale/partial student
 * counts until a manual page refresh.
 *
 * The fix caches the computed hash by its plaintext input, so every row
 * sharing a password (the common case) costs one bcrypt.hash() call, not
 * one per row. This test proves that stays *correct*, not just fast:
 *  - many rows sharing the same blank->default password all get the exact
 *    same stored hash (proving the cache hit path is taken), and
 *  - rows with a different explicit password get a genuinely different
 *    hash (proving the cache is keyed by value, not a blanket reuse).
 * Every stored hash is also verified against its real intended password
 * with bcrypt.compare, so a caching bug that reused the wrong hash for
 * the wrong row would fail here even if the row counts looked fine.
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

  section('IMPORT — a mix of blank-default, shared-explicit, and unique passwords');
  // 8 rows leave Password blank (all fall back to the same 'changeme123'
  // default), 2 rows share one explicit password, and 1 row sets its own.
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
  const importRows = [...blankRows, ...sharedRows, uniqueRow];

  const imported = await request(app)
    .post('/api/v1/students/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', workbookBuffer(importRows), { filename: 'students.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  assert(imported.status === 200, `import request succeeds (status ${imported.status})`);
  assert(imported.body?.data?.created === importRows.length, `all ${importRows.length} rows import successfully (got ${imported.body?.data?.created}, errors: ${JSON.stringify(imported.body?.data?.errors)})`);

  section('HASH REUSE — rows sharing a password get the identical stored hash');
  const blankUsers: any[] = await User.find({ email: { $in: blankRows.map((r) => r.Email) } }).select('+password email').lean();
  assert(blankUsers.length === blankRows.length, `all ${blankRows.length} blank-password students were created`);
  const blankHashes = new Set(blankUsers.map((u) => u.password));
  assert(blankHashes.size === 1, `every blank-password row reuses the exact same cached hash (got ${blankHashes.size} distinct hash(es))`);

  const sharedUsers: any[] = await User.find({ email: { $in: sharedRows.map((r) => r.Email) } }).select('+password email').lean();
  assert(sharedUsers.length === 2, 'both shared-password students were created');
  const sharedHashes = new Set(sharedUsers.map((u) => u.password));
  assert(sharedHashes.size === 1, `both rows sharing "SharedSecret1" reuse the same cached hash (got ${sharedHashes.size} distinct hash(es))`);

  const uniqueUser: any = await User.findOne({ email: uniqueRow.Email }).select('+password').lean();
  assert(Boolean(uniqueUser), 'the unique-password student was created');

  section('HASH CORRECTNESS — the cache never leaks one row\'s hash onto another');
  assert([...blankHashes][0] !== [...sharedHashes][0], 'blank-default rows and shared-password rows do NOT collide on the same hash');
  assert([...sharedHashes][0] !== uniqueUser?.password, 'the unique-password row does NOT collide with the shared-password rows');
  assert(await bcrypt.compare('changeme123', blankUsers[0].password), 'a blank-password row\'s stored hash actually matches the real default "changeme123"');
  assert(await bcrypt.compare('SharedSecret1', sharedUsers[0].password), 'a shared-password row\'s stored hash actually matches "SharedSecret1"');
  assert(await bcrypt.compare('OnlyMineSecret1', uniqueUser?.password), 'the unique-password row\'s stored hash actually matches "OnlyMineSecret1"');
  assert(!(await bcrypt.compare('OnlyMineSecret1', blankUsers[0].password)), 'a blank-password row\'s hash does NOT also validate the unrelated unique password');

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL STUDENT IMPORT PASSWORD-CACHE CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
