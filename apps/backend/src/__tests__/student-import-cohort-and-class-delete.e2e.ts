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
  const { default: Profile } = await import('../models/profile.model');
  const { default: Student } = await import('../models/student.model');
  const { default: School } = await import('../models/school.model');
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');

  const admin = await User.create({ email: 'cohort-import-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
  const school = await School.create({
    name: 'Cohort Import School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Test Road', phone: '+252611200000', email: 'cohort-import-school@test.local',
    principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
  });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });

  const repeatGrade9 = await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 9', section: 'A', room: '9R',
    batch: '2026', gradeLevel: 9, academicYear: '2027-2028', status: 'active', shiftMode: 'Morning',
  });
  const intakeGrade9 = await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 9', section: 'A', room: '9N',
    batch: '2027', gradeLevel: 9, academicYear: '2027-2028', status: 'active', shiftMode: 'Afternoon', isEntryGrade: true,
  });
  const activeGrade8 = await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 8', section: 'A', room: '8A',
    batch: '2027', gradeLevel: 8, academicYear: '2027-2028', status: 'active', shiftMode: 'Morning',
  });
  await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 8', section: 'A', room: '8-old',
    batch: '2026', gradeLevel: 8, academicYear: '2026-2027', status: 'completed', shiftMode: 'Morning',
  });

  console.log('\n=== CANONICAL / COHORT-AWARE STUDENT IMPORT ===');
  const importRows = [
    {
      'First Name': 'AutoCohort', 'Last Name': 'Student', Gender: 'male',
      Email: 'auto-cohort@test.local', Organization: school.name,
      'Class Name': 'Grade 9', Section: 'A', 'Enrollment Date': '2027-09-01',
      'Guardian Name': 'Auto Parent', 'Guardian Phone': '+252611100001', Relationship: 'Father',
    },
    {
      'First Name': 'ExplicitCohort', 'Last Name': 'Student', Gender: 'female',
      Email: 'explicit-cohort@test.local', Organization: school.name,
      'Class Name': 'Grade 9', Section: 'A', 'Academic Year': '2027-2028', 'Batch Number': '2027',
      'Enrollment Date': '2027-09-01',
      'Guardian Name': 'Explicit Parent', 'Guardian Phone': '+252611100002', Relationship: 'Mother',
    },
    {
      'First Name': 'LegacySheet', 'Last Name': 'Student', Gender: 'male',
      Email: 'legacy-sheet@test.local', Organization: school.name,
      'Class Name': 'Grade 8', Section: 'A', 'Enrollment Date': '2027-09-01',
      'Guardian Name': 'Legacy Parent', 'Guardian Phone': '+252611100003', Relationship: 'Guardian',
    },
  ];

  const imported = await request(app)
    .post('/api/v1/students/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', workbookBuffer(importRows), { filename: 'students.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  assert(imported.status === 200, `import request succeeds with per-row results (got ${imported.status})`);
  assert(imported.body?.data?.created === 3, `all three valid rows are imported (got ${imported.body?.data?.created})`);
  assert(imported.body?.data?.failed === 0, `no valid row is rejected (got ${imported.body?.data?.failed})`);

  const autoUser: any = await User.findOne({ email: 'auto-cohort@test.local' }).lean();
  const explicitUser: any = await User.findOne({ email: 'explicit-cohort@test.local' }).lean();
  const legacyUser: any = await User.findOne({ email: 'legacy-sheet@test.local' }).lean();
  const autoStudent: any = autoUser ? await Student.findOne({ user: autoUser._id }).lean() : null;
  const explicitStudent: any = explicitUser ? await Student.findOne({ user: explicitUser._id }).lean() : null;
  const legacyStudent: any = legacyUser ? await Student.findOne({ user: legacyUser._id }).lean() : null;

  assert(String(autoStudent?.class) === String(intakeGrade9._id), 'Class Name + Section deterministically select the newest/current active cohort when duplicates exist');
  assert(String(autoStudent?.class) !== String(repeatGrade9._id), 'automatic cohort selection does not silently choose the older repeat cohort');
  assert(String(explicitStudent?.class) === String(intakeGrade9._id), 'legacy Academic Year + Batch selectors still resolve the requested cohort');
  assert(String(legacyStudent?.class) === String(activeGrade8._id), 'completed duplicate classes are ignored and the active class is selected');
  assert(!!autoStudent?.parent && !!explicitStudent?.parent && !!legacyStudent?.parent, 'canonical import creates/links required guardian records');

  console.log('\n=== CLASS DELETE REFERENCE PROTECTION ===');
  const currentClass = await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 10', section: 'B', room: '10B',
    batch: '2027', gradeLevel: 10, academicYear: '2027-2028', status: 'active', shiftMode: 'Morning',
  });
  const historyOnlyClass = await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 9', section: 'B', room: '9B-old',
    batch: '2026', gradeLevel: 9, academicYear: '2026-2027', status: 'completed', shiftMode: 'Morning',
  });
  const freeClass = await ClassModel.create({
    school: school._id, department: department._id, title: 'Unused', section: 'Z', room: 'Z1',
    batch: '2027', gradeLevel: 7, academicYear: '2027-2028', status: 'active', shiftMode: 'Morning',
  });
  const freeBulkClass = await ClassModel.create({
    school: school._id, department: department._id, title: 'Unused Bulk', section: 'Z', room: 'Z2',
    batch: '2027', gradeLevel: 7, academicYear: '2027-2028', status: 'active', shiftMode: 'Morning',
  });

  const historyUser = await User.create({ email: 'history-delete@test.local', password: 'Password123!', role: 'student' });
  const historyProfile = await Profile.create({ user: historyUser._id, firstName: 'History', lastName: 'Student', gender: 'male' });
  await Student.create({
    user: historyUser._id, profile: historyProfile._id, school: school._id, class: currentClass._id,
    status: 'active', approvalStatus: 'approved', enrolledCourses: [],
    enrollmentHistory: [
      { academicYear: '2026-2027', class: historyOnlyClass._id, grade: 'Grade 9', courses: [], status: 'completed', startedAt: new Date('2026-09-01'), endedAt: new Date('2027-06-30') },
      { academicYear: '2027-2028', class: currentClass._id, grade: 'Grade 10', courses: [], status: 'active', startedAt: new Date('2027-09-01') },
    ],
  });

  const currentDelete = await request(app).delete(`/api/v1/classes/${currentClass._id}`).set('Authorization', `Bearer ${token}`);
  assert(currentDelete.status === 400, `current student class cannot be deleted (got ${currentDelete.status})`);

  const historyDelete = await request(app).delete(`/api/v1/classes/${historyOnlyClass._id}`).set('Authorization', `Bearer ${token}`);
  assert(historyDelete.status === 400, `historical enrollment class cannot be deleted (got ${historyDelete.status})`);

  const freeDelete = await request(app).delete(`/api/v1/classes/${freeClass._id}`).set('Authorization', `Bearer ${token}`);
  assert(freeDelete.status === 204, `unreferenced class can still be deleted (got ${freeDelete.status})`);

  const bulkDelete = await request(app).delete('/api/v1/classes/bulk').set('Authorization', `Bearer ${token}`).send({
    ids: [historyOnlyClass._id.toString(), freeBulkClass._id.toString()],
  });
  assert(bulkDelete.status === 400, `bulk delete fails safely if any selected class is referenced (got ${bulkDelete.status})`);
  assert(!!(await ClassModel.findById(historyOnlyClass._id)), 'referenced class remains after blocked bulk delete');
  assert(!!(await ClassModel.findById(freeBulkClass._id)), 'unreferenced class also remains because blocked bulk delete is atomic');

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL CANONICAL IMPORT / CLASS DELETE CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
