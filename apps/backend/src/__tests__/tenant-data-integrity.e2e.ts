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
  const { default: Course } = await import('../models/course.model');

  const root = await User.create({ email: 'root@integrity.test', password: 'Password123!', role: 'admin' });
  const schoolFields = { organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St', phone: '+252600000000', principalName: 'Principal', establishedYear: 2020, createdBy: root._id };
  const schoolA = await School.create({ ...schoolFields, name: 'Somali Academy', email: 'a@integrity.test' });
  const schoolB = await School.create({ ...schoolFields, name: 'Somali International', email: 'b@integrity.test' });

  async function orgAdmin(school: any, email: string) {
    const user = await User.create({ email, password: 'Password123!', role: 'org_admin', organizationId: school._id });
    return generateAccessToken({ userId: user._id.toString(), role: 'org_admin', permissions: [], organizationId: school._id.toString() });
  }
  const tokenA = await orgAdmin(schoolA, 'admin-a@integrity.test');
  const tokenB = await orgAdmin(schoolB, 'admin-b@integrity.test');

  console.log('\n=== STUDENT IDS ===');
  await Student.init();
  await Student.collection.createIndex({ studentId: 1 }, { unique: true, name: 'legacy_studentId_1' });
  async function createStudent(school: any, email: string, firstName: string) {
    const user = await User.create({ email, password: 'Password123!', role: 'student', organizationId: school._id });
    const profile = await Profile.create({ user: user._id, firstName, lastName: 'Test', gender: 'male' });
    return Student.create({ user: user._id, profile: profile._id, school: school._id });
  }
  const studentA = await createStudent(schoolA, 'student-a@integrity.test', 'Ali');
  const studentB = await createStudent(schoolB, 'student-b@integrity.test', 'Amina');
  assert(studentA.studentId !== studentB.studentId, 'same-name organizations receive globally distinct automatic student IDs');
  assert(studentA.studentId.startsWith('SOMALI-') && studentB.studentId.startsWith('SOMALI-'), 'human-readable organization prefix remains present');

  console.log('\n=== CLASS BROWSE OWNERSHIP ===');
  const deptA = await Department.create({ name: 'Primary', tenantId: schoolA._id });
  const deptB = await Department.create({ name: 'Primary', tenantId: schoolB._id });
  const classA = await ClassModel.create({ school: schoolA._id, department: deptA._id, title: 'Grade 5', section: 'A', room: '1', gradeLevel: 5, academicYear: '2026/27', status: 'active' });
  await ClassModel.create({ school: schoolB._id, department: deptB._id, title: 'Grade 5', section: 'A', room: '1', gradeLevel: 5, academicYear: '2026/27', status: 'active' });
  const ownBrowse = await request(app).get('/api/v1/classes/browse').set('Authorization', `Bearer ${tokenA}`).query({ department: deptA._id.toString() });
  assert(ownBrowse.status === 200 && ownBrowse.body?.data?.[0]?._id === classA._id.toString(), 'same-organization department browse succeeds');
  const crossBrowse = await request(app).get('/api/v1/classes/browse').set('Authorization', `Bearer ${tokenA}`).query({ department: deptB._id.toString() });
  assert([403, 404].includes(crossBrowse.status), `cross-organization department browse is denied (status ${crossBrowse.status})`);

  console.log('\n=== COURSE IMPORT SLUGS ===');
  function workbookBuffer() {
    const sheet = XLSX.utils.json_to_sheet([{ 'Course / Subject Name': 'Mathematics', 'Course Code': 'MATH-5', 'Class / Section': 'Grade 5 — A', 'Teacher / Instructor': '', Description: '' }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Courses');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
  const importFor = (token: string) => request(app).post('/api/v1/courses/import').set('Authorization', `Bearer ${token}`).attach('file', workbookBuffer(), 'courses.xlsx');
  const importA = await importFor(tokenA);
  const importB = await importFor(tokenB);
  assert(importA.status === 200 && importB.status === 200, `identical course imports succeed in both organizations (${importA.status}, ${importB.status})`);
  const courseA = await Course.findOne({ school: schoolA._id, courseCode: 'MATH-5' }).lean();
  const courseB = await Course.findOne({ school: schoolB._id, courseCode: 'MATH-5' }).lean();
  assert(Boolean(courseA && courseB && courseA.slug !== courseB.slug), 'generated course slugs are tenant-safe and globally distinct');
  const originalSlug = courseA?.slug;
  const reimportA = await importFor(tokenA);
  const courseAAfter = await Course.findOne({ school: schoolA._id, courseCode: 'MATH-5' }).lean();
  assert(reimportA.status === 200 && courseAAfter?.slug === originalSlug, 're-import updates without changing the established public URL');

  console.log('\n=== COURSE CODE REUSE ACROSS SECTIONS ===');
  const classASectionB = await ClassModel.create({
    school: schoolA._id,
    department: deptA._id,
    title: 'Grade 5',
    section: 'B',
    room: '2',
    gradeLevel: 5,
    academicYear: '2026/27',
    status: 'active',
  });
  function sharedCodeSectionsWorkbookBuffer() {
    const sheet = XLSX.utils.json_to_sheet([
      { 'Course / Subject Name': 'Science', 'Course Code': 'SCI-5', 'Class / Section': 'Grade 5 — A', 'Teacher / Instructor': '', Description: '' },
      { 'Course / Subject Name': 'Science', 'Course Code': 'SCI-5', 'Class / Section': 'Grade 5 — B', 'Teacher / Instructor': '', Description: '' },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Courses');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
  const sharedCodeImport = await request(app)
    .post('/api/v1/courses/import')
    .set('Authorization', `Bearer ${tokenA}`)
    .attach('file', sharedCodeSectionsWorkbookBuffer(), 'shared-code-sections.xlsx');
  const sharedCodeCourses = await Course.find({ school: schoolA._id, courseCode: 'SCI-5' }).sort({ class: 1 }).lean();
  const sharedClassIds = new Set(sharedCodeCourses.map((course: any) => String(course.class)));
  assert(
    sharedCodeImport.status === 200
      && sharedCodeImport.body?.data?.failed === 0
      && sharedCodeCourses.length === 2
      && sharedClassIds.has(String(classA._id))
      && sharedClassIds.has(String(classASectionB._id)),
    'the same Course Code imports successfully into different class sections'
  );

  await mongoose.disconnect();
  await mongod.stop();
  if (failures) process.exit(1);
  console.log('\nALL TENANT DATA-INTEGRITY CHECKS PASSED');
}

main().catch((error) => { console.error(error); process.exit(1); });
