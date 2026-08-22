/**
 * Teacher Management — Add / Edit / Table / Import / Template — end-to-end
 * verification. Runs the REAL Express app against a real, ephemeral
 * in-memory MongoDB (mongodb-memory-server) — never touches the dev/prod
 * database. Repeatable: `npm run test:teacher-crud`.
 *
 * Covers exactly what was reported broken: a global admin who downloads the
 * official import template, fills it in as instructed, and imports it got
 * "School is required for super admin" on every row (template was missing
 * the Organization column) — and separately, the "paste from clipboard"
 * import path built a header-less CSV, so the backend (which reads columns
 * by NAME) silently treated the first pasted teacher's own data as column
 * headers and every row failed with confusing "field is required" errors.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import * as XLSX from 'xlsx';

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

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const adminToken = tokenFor(adminUser._id.toString(), 'admin');

  const school = await School.create({
    name: 'Test School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '123 St', phone: '+000', email: 'school@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: adminUser._id,
  });

  const orgAdminUser = await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
  const orgAdminToken = tokenFor(orgAdminUser._id.toString(), 'org_admin', school._id.toString());

  // -------------------------------------------------------------------
  section('GET SAMPLE TEMPLATE — must include every column bulkImport requires');
  // -------------------------------------------------------------------
  const tplRes = await request(app).get('/api/v1/teachers/template').set('Authorization', `Bearer ${adminToken}`).responseType('blob');
  assert(tplRes.status === 200, `template downloads (status ${tplRes.status})`);
  const tplWb = XLSX.read(tplRes.body as Buffer, { type: 'buffer' });
  const tplRows: any[] = XLSX.utils.sheet_to_json(tplWb.Sheets[tplWb.SheetNames[0]], { defval: '' });
  const tplHeaders = Object.keys(tplRows[0] || {});
  assert(tplHeaders.includes('Organization'), `template includes an "Organization" column (got: ${tplHeaders.join(', ')})`);
  for (const required of ['First Name', 'Last Name', 'Gender', 'Email']) {
    assert(tplHeaders.includes(required), `template includes "${required}"`);
  }

  // -------------------------------------------------------------------
  section('FILE-UPLOAD IMPORT — global admin, exact downloaded template, real org name filled in');
  // -------------------------------------------------------------------
  tplRows[0].Email = 'imported-via-file@test.local';
  tplRows[0].Organization = school.name;
  const filledSheet = XLSX.utils.json_to_sheet(tplRows);
  const filledWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(filledWb, filledSheet, 'Sheet1');
  const filledBuf = XLSX.write(filledWb, { type: 'buffer', bookType: 'xlsx' });

  const fileImportRes = await request(app)
    .post('/api/v1/teachers/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', filledBuf, 'teachers.xlsx');
  assert(fileImportRes.status === 200, `file import request succeeds (status ${fileImportRes.status})`);
  assert(fileImportRes.body?.data?.created === 1, `file import created exactly 1 teacher (got ${JSON.stringify(fileImportRes.body?.data)})`);

  // The exact regression this was about: filling in the DOWNLOADED template
  // as instructed and NOT touching Organization must fail with a clear,
  // actionable error — not silently succeed with the wrong org, and not the
  // old confusing blanket failure with no column to fix.
  const emptyOrgRow = [{ ...tplRows[0], Email: 'no-org@test.local', Organization: '' }];
  const noOrgSheet = XLSX.utils.json_to_sheet(emptyOrgRow);
  const noOrgWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(noOrgWb, noOrgSheet, 'Sheet1');
  const noOrgBuf = XLSX.write(noOrgWb, { type: 'buffer', bookType: 'xlsx' });
  const noOrgRes = await request(app).post('/api/v1/teachers/import').set('Authorization', `Bearer ${adminToken}`).attach('file', noOrgBuf, 'teachers.xlsx');
  assert(noOrgRes.body?.data?.failed === 1 && /School is required/.test(noOrgRes.body?.data?.errors?.[0]?.message || ''), `global admin with a blank Organization column gets the actionable "School is required" error, not a silent wrong-org import (got ${JSON.stringify(noOrgRes.body?.data)})`);

  // -------------------------------------------------------------------
  section('FILE-UPLOAD IMPORT — org_admin, Organization column left blank (auto-scoped)');
  // -------------------------------------------------------------------
  const orgAdminRows = [{ ...tplRows[0], Email: 'orgadmin-import@test.local', Organization: '', Phone: '+252699000001' }];
  const oaSheet = XLSX.utils.json_to_sheet(orgAdminRows);
  const oaWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(oaWb, oaSheet, 'Sheet1');
  const oaBuf = XLSX.write(oaWb, { type: 'buffer', bookType: 'xlsx' });
  const oaRes = await request(app).post('/api/v1/teachers/import').set('Authorization', `Bearer ${orgAdminToken}`).attach('file', oaBuf, 'teachers.xlsx');
  assert(oaRes.body?.data?.created === 1, `org_admin import succeeds with Organization left blank — auto-scoped to their own school (got ${JSON.stringify(oaRes.body?.data)})`);

  // -------------------------------------------------------------------
  section('PASTE IMPORT — header row prepended (as the fixed frontend now does)');
  // -------------------------------------------------------------------
  const PASTE_COLUMNS = ['First Name', 'Last Name', 'Gender', 'Email', 'Password', 'Phone', 'Organization', 'Qualification', 'Specialization', 'Experience (years)', 'Joining Date', 'Bio'];
  const pastedRows = [
    ['Ahmed', 'Hassan', 'male', 'pasted-1@test.local', 'changeme123', '+252612345678', '', 'Bachelor', 'Tajweed', '5', '2026-01-15', 'Bio 1'],
    ['Fatima', 'Ali', 'female', 'pasted-2@test.local', 'changeme123', '+252612345679', '', 'Master', 'Quran', '3', '2026-02-01', 'Bio 2'],
  ];
  const pasteCsv = [PASTE_COLUMNS.join(','), ...pastedRows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
  const pasteRes = await request(app)
    .post('/api/v1/teachers/import')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .attach('file', Buffer.from('﻿' + pasteCsv, 'utf-8'), 'pasted-teachers.csv');
  assert(pasteRes.status === 200, `paste-style import request succeeds (status ${pasteRes.status})`);
  assert(pasteRes.body?.data?.created === 2, `paste-style import (with header prepended) creates both rows (got ${JSON.stringify(pasteRes.body?.data)})`);

  // Reproduces the ORIGINAL bug: no header row prepended — the first row's
  // own values become the "headers", so every field lookup by name fails.
  const brokenCsv = pastedRows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const brokenRes = await request(app)
    .post('/api/v1/teachers/import')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .attach('file', Buffer.from('﻿' + brokenCsv, 'utf-8'), 'pasted-teachers.csv');
  assert(brokenRes.status === 400 || (brokenRes.body?.data?.created ?? 0) < pastedRows.length - 1, `(regression guard) a header-less paste CSV does NOT cleanly import both rows — confirms the bug this fix addresses was real (status ${brokenRes.status}, data ${JSON.stringify(brokenRes.body?.data)})`);

  // -------------------------------------------------------------------
  section('ADD (POST /teachers)');
  // -------------------------------------------------------------------
  const addRes = await request(app).post('/api/v1/teachers').set('Authorization', `Bearer ${orgAdminToken}`).send({
    email: 'manually-added@test.local', password: 'Password123!', firstName: 'Liban', lastName: 'Warsame',
    gender: 'male', qualification: 'BA Islamic Studies', specialization: ['Tajweed'], experience: 4, bio: 'Manually added.',
  });
  assert(addRes.status === 201, `Add Teacher succeeds (status ${addRes.status})`);
  const newTeacherId = addRes.body?.data?._id;
  assert(!!newTeacherId, 'Add Teacher returns a new teacher id');
  assert(addRes.body?.data?.teacherId?.startsWith('TCH-'), `Add Teacher auto-generates a teacherId (got ${addRes.body?.data?.teacherId})`);
  assert(addRes.body?.data?.school?._id === school._id.toString(), 'Add Teacher (org_admin) auto-scopes to their own school');

  // -------------------------------------------------------------------
  section('EDIT (PATCH /teachers/:id)');
  // -------------------------------------------------------------------
  const editRes = await request(app).patch(`/api/v1/teachers/${newTeacherId}`).set('Authorization', `Bearer ${orgAdminToken}`).send({
    qualification: 'MA Islamic Studies', experience: 5, status: 'on_leave',
  });
  assert(editRes.status === 200, `Edit Teacher succeeds (status ${editRes.status})`);
  assert(editRes.body?.data?.qualification === 'MA Islamic Studies', 'Edit Teacher persists the updated qualification');
  assert(editRes.body?.data?.status === 'on_leave', 'Edit Teacher persists the updated status');

  // -------------------------------------------------------------------
  section('TABLE (GET /teachers)');
  // -------------------------------------------------------------------
  const listRes = await request(app).get('/api/v1/teachers').set('Authorization', `Bearer ${orgAdminToken}`).query({ limit: 100 });
  assert(listRes.status === 200, `Teacher table loads (status ${listRes.status})`);
  const listedIds = (listRes.body?.data || []).map((t: any) => t._id);
  assert(listedIds.includes(newTeacherId), 'the just-added/edited teacher appears in the table');
  const teacherIds = (listRes.body?.data || []).map((t: any) => t.teacherId);
  assert(new Set(teacherIds).size === teacherIds.length, `every teacherId in the table is unique — no duplicates (got ${teacherIds.length} rows, ${new Set(teacherIds).size} unique)`);

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
