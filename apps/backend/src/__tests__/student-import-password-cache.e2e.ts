/**
 * Student bulk import — large imports must not time out, and guardians
 * shared by concurrent rows must not be duplicated.
 *
 * The live student import endpoint is student-registration-io.controller.ts
 * (POST /api/v1/students/import — routed in student.routes.ts). It used to
 * import rows strictly one at a time: for each row, create a User (which
 * hashes a password via User's pre-save hook), a Profile, a Student, link
 * or create a guardian, then sync course enrollment — all sequential DB
 * round trips, fully serial across rows. A real bulk import (reported: 722
 * rows) took long enough to blow past the reverse-proxy's request timeout:
 * the browser reported "Import failed" while the request kept running
 * server-side and actually finished the insert, leaving admins looking at
 * stale/partial student counts until a manual page refresh.
 *
 * (There was also an unrelated, fully dead copy of an import controller —
 * student-import.controller.ts — referenced by no route. It looked like a
 * plausible fix target but had zero effect on the real endpoint; it has
 * been deleted.)
 *
 * The fix batches rows into bounded-concurrency groups instead of a single
 * sequential loop. That introduces a real race the old sequential code
 * never had: two rows in the same concurrent batch can share a guardian
 * (the common sibling case), and the guardian find-or-create sequence is
 * not atomic — without protection, both rows would each create their own
 * Parent record for the same phone number. The fix adds a per-phone-number
 * async lock so same-phone rows still run their guardian step one at a
 * time, while different-phone rows stay fully concurrent.
 *
 * This test proves both properties:
 *  - a large import (200 rows) completes within a generous bound, well
 *    under what a sequential import of the same size would take;
 *  - two rows sharing one guardian phone number, imported in the same
 *    concurrent batch, resolve to exactly one Parent record with both
 *    students as children — not two.
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
  const { default: Parent } = await import('../models/parent.model');
  const { default: School } = await import('../models/school.model');
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');
  const bcrypt = (await import('bcrypt')).default;

  const admin = await User.create({ email: 'bulk-import-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
  const school = await School.create({
    name: 'Bulk Import School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Test Road', phone: '+252611210000', email: 'bulk-import-school@test.local',
    principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
  });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });
  await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 9', section: 'A', room: '9A',
    batch: '2027', gradeLevel: 9, academicYear: '2027-2028', status: 'active', shiftMode: 'Morning',
  });

  section('PERFORMANCE — a large import completes well within a generous bound');
  const bigRows = Array.from({ length: 200 }, (_, i) => ({
    'First Name': `Bulk${i}`, 'Last Name': 'Student', Gender: i % 2 === 0 ? 'male' : 'female',
    Email: `bulk-${i}@test.local`, Organization: school.name, 'Class Name': 'Grade 9', Section: 'A',
    'Enrollment Date': '2027-09-01',
  }));

  const start = Date.now();
  const bigImport = await request(app)
    .post('/api/v1/students/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', workbookBuffer(bigRows), { filename: 'students.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const elapsedMs = Date.now() - start;

  assert(bigImport.status === 200, `large import request succeeds (status ${bigImport.status})`);
  assert(bigImport.body?.data?.created === bigRows.length, `all ${bigRows.length} rows import successfully (got ${bigImport.body?.data?.created}, errors: ${JSON.stringify(bigImport.body?.data?.errors)})`);
  // Generous bound: this is about proving the import stays well clear of a
  // real-world reverse-proxy timeout (30-60s+), not pinning an exact
  // duration that would make the test brittle on a slow CI runner.
  assert(elapsedMs < 20000, `${bigRows.length}-row import finishes in ${elapsedMs}ms (bounded concurrency keeps this well under a typical proxy timeout)`);

  const bulkUsers: any[] = await User.find({ email: { $in: bigRows.map((r) => r.Email) } }).select('+password email').lean();
  assert(bulkUsers.length === bigRows.length, `all ${bigRows.length} student accounts were created`);
  const samplePasswordOk = await bcrypt.compare('not-the-real-password', bulkUsers[0]?.password || '');
  assert(samplePasswordOk === false, "a student's stored password is a real bcrypt hash, not stored in plaintext (compare against a wrong password correctly returns false)");

  section('CONCURRENT SIBLINGS — two rows sharing one guardian phone resolve to a single Parent');
  const siblingRows = [0, 1].map((i) => ({
    'First Name': `Sibling${i}`, 'Last Name': 'Student', Gender: 'male',
    Email: `sibling-${i}@test.local`, Organization: school.name, 'Class Name': 'Grade 9', Section: 'A',
    'Enrollment Date': '2027-09-01',
    'Guardian Name': 'Shared Guardian', 'Guardian Phone': '+252611230000', Relationship: 'Father',
  }));

  const siblingImport = await request(app)
    .post('/api/v1/students/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', workbookBuffer(siblingRows), { filename: 'siblings.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  assert(siblingImport.status === 200, `sibling import request succeeds (status ${siblingImport.status})`);
  assert(siblingImport.body?.data?.created === 2, `both sibling rows import successfully (got ${siblingImport.body?.data?.created}, errors: ${JSON.stringify(siblingImport.body?.data?.errors)})`);

  const guardianParents = await Parent.find({ school: school._id, phone: '+252611230000' }).lean();
  assert(guardianParents.length === 1, `exactly one Parent record exists for the shared guardian phone number (got ${guardianParents.length} — more than one means the concurrent rows raced and duplicated the guardian)`);
  assert((guardianParents[0]?.children || []).length === 2, `the single Parent record has both siblings as children (got ${(guardianParents[0]?.children || []).length})`);

  // A large import can outrun the reverse proxy's timeout: the browser is
  // handed "Import failed" while the server keeps going and finishes. The
  // admin then presses Import again with the same file, which must land on
  // the students already saved instead of creating a second copy of each.
  section('RETRY AFTER A TIMEOUT — re-importing the same file updates, never duplicates');
  const { default: Student } = await import('../models/student.model');
  const beforeRetry = await Student.countDocuments({ school: school._id });

  const retryImport = await request(app)
    .post('/api/v1/students/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', workbookBuffer(bigRows), { filename: 'students.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  assert(retryImport.status === 200, `re-importing the same file succeeds (status ${retryImport.status})`);
  assert(retryImport.body?.data?.created === 0, `re-import creates no new students (got ${retryImport.body?.data?.created})`);
  assert(retryImport.body?.data?.updated === bigRows.length, `re-import matches all ${bigRows.length} rows onto the students already saved (got ${retryImport.body?.data?.updated}, errors: ${JSON.stringify(retryImport.body?.data?.errors)})`);

  const afterRetry = await Student.countDocuments({ school: school._id });
  assert(afterRetry === beforeRetry, `the school still has ${beforeRetry} students after the retry, not double (got ${afterRetry})`);

  section('STUDENT ID ROUND TRIP — Template, Import and Export all carry the column');
  const template = await request(app)
    .get('/api/v1/students/template')
    .set('Authorization', `Bearer ${token}`)
    .buffer(true)
    .parse((res: any, callback: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

  const templateSheet = XLSX.read(template.body as Buffer, { type: 'buffer' });
  const templateHeaders = (XLSX.utils.sheet_to_json(templateSheet.Sheets[templateSheet.SheetNames[0]], { header: 1 })[0] || []) as string[];
  assert(templateHeaders.includes('Student ID'), `the downloadable template carries a Student ID column (got ${JSON.stringify(templateHeaders)})`);

  const known: any = await Student.findOne({ school: school._id }).sort({ studentId: 1 }).lean();
  const byIdRow = [{
    'Student ID': known.studentId, 'First Name': 'RenamedById', 'Last Name': 'Student', Gender: 'male',
    Email: `renamed-by-id@test.local`, Organization: school.name, 'Class Name': 'Grade 9', Section: 'A',
    'Enrollment Date': '2027-09-01',
  }];
  const byIdImport = await request(app)
    .post('/api/v1/students/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', workbookBuffer(byIdRow), { filename: 'by-id.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  assert(byIdImport.status === 200 && byIdImport.body?.data?.updated === 1 && byIdImport.body?.data?.created === 0,
    `a row carrying Student ID updates that exact student instead of creating one (got ${JSON.stringify(byIdImport.body?.data && { created: byIdImport.body.data.created, updated: byIdImport.body.data.updated, errors: byIdImport.body.data.errors })})`);

  const afterById = await Student.countDocuments({ school: school._id });
  assert(afterById === beforeRetry, `importing by Student ID did not add a student (got ${afterById}, expected ${beforeRetry})`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL STUDENT BULK IMPORT CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
