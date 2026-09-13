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
  const { default: Student } = await import('../models/student.model');
  const { default: School } = await import('../models/school.model');
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Course } = await import('../models/course.model');

  const admin = await User.create({ email: 'lifecycle-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
  const school = await School.create({
    name: 'Lifecycle Workflow School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Lifecycle Road', phone: '+252611310000', email: 'lifecycle-school@test.local',
    principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
  });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });

  const grade9 = await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 9', section: 'A', room: '9A',
    batch: '2026', gradeLevel: 9, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning', isEntryGrade: true,
  });
  const grade10 = await ClassModel.create({
    school: school._id, department: department._id, title: 'Grade 10', section: 'A', room: '10A',
    batch: '2026', gradeLevel: 10, academicYear: '2026-2027', status: 'active', shiftMode: 'Afternoon', isGraduatingGrade: true,
  });

  const grade9Course = await Course.create({
    title: { en: 'Grade 9 Core' }, slug: `lifecycle-g9-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    category: 'general', level: 'beginner', duration: 10, maxStudents: 30,
    school: school._id, class: grade9._id, status: 'published',
  });
  const grade10Course = await Course.create({
    title: { en: 'Grade 10 Core' }, slug: `lifecycle-g10-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    category: 'general', level: 'beginner', duration: 10, maxStudents: 30,
    school: school._id, class: grade10._id, status: 'published',
  });

  console.log('\n=== 1. ADD STUDENT ===');
  const manualAdd = await request(app).post('/api/v1/students').set('Authorization', `Bearer ${token}`).send({
    firstName: 'Manual', lastName: 'Promote', gender: 'male', email: 'manual-promote@test.local', password: 'Password123!',
    school: school._id.toString(), classId: grade9._id.toString(), enrollmentDate: '2026-09-01',
  });
  assert(manualAdd.status === 201, `manual Add Student succeeds (got ${manualAdd.status})`);
  const manualId = manualAdd.body?.data?._id;
  const manualBefore: any = manualId ? await Student.findById(manualId).lean() : null;
  assert(String(manualBefore?.class) === String(grade9._id), 'manual student is assigned to selected Grade 9 class');
  assert(manualBefore?.grade === '9' && manualBefore?.department === 'Secondary' && manualBefore?.shiftMode === 'Morning', 'manual add inherits grade, department and shift from class');
  assert((manualBefore?.enrolledCourses || []).some((id: any) => String(id) === String(grade9Course._id)), 'manual add receives current published class course');
  assert((manualBefore?.enrollmentHistory || []).some((entry: any) => String(entry.class) === String(grade9._id) && entry.status === 'active'), 'manual add opens active enrollment history');

  console.log('\n=== 2. IMPORT STUDENT ===');
  const imported = await request(app)
    .post('/api/v1/students/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', workbookBuffer([{
      'First Name': 'Imported', 'Last Name': 'Repeat', Gender: 'female', Email: 'imported-repeat@test.local', Password: 'Password123!',
      Organization: school.name, 'Class Name': 'Grade 9', Section: 'A', 'Academic Year': '2026-2027', 'Batch Number': '2026',
      'Enrollment Date': '2026-09-01',
    }]), { filename: 'lifecycle-students.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert(imported.status === 200 && imported.body?.data?.created === 1 && imported.body?.data?.failed === 0, `cohort-aware import succeeds (status ${imported.status}, created ${imported.body?.data?.created})`);
  const importedUser: any = await User.findOne({ email: 'imported-repeat@test.local' }).lean();
  const importedStudent: any = importedUser ? await Student.findOne({ user: importedUser._id }).lean() : null;
  assert(String(importedStudent?.class) === String(grade9._id), 'imported student lands in exact year/batch Grade 9 cohort');
  assert(importedStudent?.grade === '9' && importedStudent?.department === 'Secondary' && importedStudent?.shiftMode === 'Morning', 'imported student placement metadata is synchronized from class');
  assert((importedStudent?.enrolledCourses || []).some((id: any) => String(id) === String(grade9Course._id)), 'imported student receives current published class course');
  assert((importedStudent?.enrollmentHistory || []).some((entry: any) => String(entry.class) === String(grade9._id) && entry.status === 'active'), 'import opens active enrollment history');

  console.log('\n=== 3. ADD FINAL-GRADE STUDENTS ===');
  const graduateAdd = await request(app).post('/api/v1/students').set('Authorization', `Bearer ${token}`).send({
    firstName: 'Final', lastName: 'Graduate', gender: 'male', email: 'final-graduate@test.local', password: 'Password123!',
    school: school._id.toString(), classId: grade10._id.toString(), enrollmentDate: '2026-09-01',
  });
  const repeatFinalAdd = await request(app).post('/api/v1/students').set('Authorization', `Bearer ${token}`).send({
    firstName: 'Final', lastName: 'Repeat', gender: 'male', email: 'final-repeat@test.local', password: 'Password123!',
    school: school._id.toString(), classId: grade10._id.toString(), enrollmentDate: '2026-09-01',
  });
  assert(graduateAdd.status === 201 && repeatFinalAdd.status === 201, 'final-grade students can be added to active final class');
  const graduateId = graduateAdd.body?.data?._id;
  const repeatFinalId = repeatFinalAdd.body?.data?._id;

  const g9CourseBefore: any = await Course.findById(grade9Course._id).lean();
  const g10CourseBefore: any = await Course.findById(grade10Course._id).lean();
  assert(g9CourseBefore?.enrolledStudents === 2, `Grade 9 course count reflects Add + Import students (got ${g9CourseBefore?.enrolledStudents})`);
  assert(g10CourseBefore?.enrolledStudents === 2, `Grade 10 course count reflects both final-grade students (got ${g10CourseBefore?.enrolledStudents})`);

  console.log('\n=== 4. REVIEW + PROMOTE / REPEAT / GRADUATE ===');
  const preview = await request(app).get('/api/v1/classes/promotion-review').set('Authorization', `Bearer ${token}`).query({ schoolId: school._id.toString() });
  assert(preview.status === 200, `promotion review loads (got ${preview.status})`);
  const previewGroups = preview.body?.data?.groups || [];
  const preview9 = previewGroups.find((group: any) => String(group.classId) === String(grade9._id));
  const preview10 = previewGroups.find((group: any) => String(group.classId) === String(grade10._id));
  assert(preview9?.students?.length === 2 && preview9.students.every((student: any) => student.defaultAction === 'promote'), 'Grade 9 students default to Promote');
  assert(preview10?.students?.length === 2 && preview10.students.every((student: any) => student.defaultAction === 'graduate'), 'final-grade students default to Graduate');

  const execute = await request(app).post('/api/v1/classes/promote-reviewed').set('Authorization', `Bearer ${token}`).send({
    schoolId: school._id.toString(), targetAcademicYear: '2027-2028',
    decisions: [
      { studentId: importedStudent?._id?.toString(), action: 'repeat' },
      { studentId: repeatFinalId, action: 'repeat' },
    ],
  });
  assert(execute.status === 200, `reviewed promotion succeeds (got ${execute.status}, ${JSON.stringify(execute.body)})`);
  assert(execute.body?.data?.studentsPromoted === 1, 'one Grade 9 student is promoted');
  assert(execute.body?.data?.studentsRepeated === 2, 'two exception students repeat');
  assert(execute.body?.data?.studentsGraduated === 1, 'one final-grade student graduates');

  const manualAfter: any = await Student.findById(manualId).lean();
  const importedAfter: any = await Student.findById(importedStudent?._id).lean();
  const graduateAfter: any = await Student.findById(graduateId).lean();
  const repeatFinalAfter: any = await Student.findById(repeatFinalId).lean();
  const manualTarget: any = await ClassModel.findById(manualAfter?.class).lean();
  const importedRepeatClass: any = await ClassModel.findById(importedAfter?.class).lean();
  const finalRepeatClass: any = await ClassModel.findById(repeatFinalAfter?.class).lean();

  assert(manualAfter?.status === 'active' && manualTarget?.gradeLevel === 10 && manualTarget?.academicYear === '2027-2028', 'promoted student is active in next grade / target year');
  assert(importedAfter?.status === 'active' && importedRepeatClass?.gradeLevel === 9 && importedRepeatClass?.academicYear === '2027-2028' && importedRepeatClass?.batch === '2026', 'imported repeater stays Grade 9 in new year with original cohort');
  assert(graduateAfter?.status === 'graduated' && String(graduateAfter?.class) === String(grade10._id), 'graduate keeps historical final class and becomes graduated');
  assert(repeatFinalAfter?.status === 'active' && finalRepeatClass?.gradeLevel === 10 && finalRepeatClass?.academicYear === '2027-2028' && finalRepeatClass?.batch === '2026', 'final-grade repeater remains active in final grade / target year');

  const g9CourseAfter: any = await Course.findById(grade9Course._id).lean();
  const g10CourseAfter: any = await Course.findById(grade10Course._id).lean();
  assert(g9CourseAfter?.enrolledStudents === 0, `completed Grade 9 source course count is zero (got ${g9CourseAfter?.enrolledStudents})`);
  assert(g10CourseAfter?.enrolledStudents === 0, `completed Grade 10 source course count is zero (got ${g10CourseAfter?.enrolledStudents})`);

  console.log('\n=== 5. MANAGE STUDENTS LIST / FILTERS AFTER PROMOTION ===');
  const allStudents = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${token}`).query({ school: school._id.toString(), limit: 20 });
  assert(allStudents.status === 200 && allStudents.body?.meta?.total === 4, `Manage Students sees all four lifecycle students (got ${allStudents.body?.meta?.total})`);

  const activeStudents = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${token}`).query({ school: school._id.toString(), status: 'active', limit: 20 });
  assert(activeStudents.status === 200 && activeStudents.body?.meta?.total === 3, `active filter shows promoted + two repeaters only (got ${activeStudents.body?.meta?.total})`);

  const graduatedStudents = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${token}`).query({ school: school._id.toString(), status: 'graduated', limit: 20 });
  assert(graduatedStudents.status === 200 && graduatedStudents.body?.meta?.total === 1, `graduated filter shows exactly one graduate (got ${graduatedStudents.body?.meta?.total})`);

  const repeatClassStudents = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${token}`).query({ school: school._id.toString(), classId: importedRepeatClass?._id?.toString(), limit: 20 });
  assert(repeatClassStudents.status === 200 && repeatClassStudents.body?.meta?.total === 1, 'class filter finds the Grade 9 repeater in its target-year repeat class');

  console.log('\n=== 6. GRADUATE EDIT SAFETY ===');
  const preserveGraduate = await request(app).patch(`/api/v1/students/${graduateId}`).set('Authorization', `Bearer ${token}`).send({
    firstName: 'Final Edited', classId: grade10._id.toString(), school: school._id.toString(),
  });
  assert(preserveGraduate.status === 200, `graduate profile edit may preserve completed historical class (got ${preserveGraduate.status})`);

  const invalidGraduateMove = await request(app).patch(`/api/v1/students/${graduateId}`).set('Authorization', `Bearer ${token}`).send({
    classId: manualTarget?._id?.toString(), school: school._id.toString(),
  });
  assert(invalidGraduateMove.status === 400, `graduated student cannot silently move into active class while remaining graduated (got ${invalidGraduateMove.status})`);
  const graduateStillHistorical: any = await Student.findById(graduateId).lean();
  assert(graduateStillHistorical?.status === 'graduated' && String(graduateStillHistorical?.class) === String(grade10._id), 'blocked move leaves graduate status and historical class unchanged');

  const explicitReactivate = await request(app).patch(`/api/v1/students/${graduateId}`).set('Authorization', `Bearer ${token}`).send({
    classId: manualTarget?._id?.toString(), school: school._id.toString(), status: 'active',
  });
  assert(explicitReactivate.status === 200, `explicit reactivation + active target class is allowed (got ${explicitReactivate.status})`);
  const reactivated: any = await Student.findById(graduateId).lean();
  assert(reactivated?.status === 'active' && String(reactivated?.class) === String(manualTarget?._id), 'reactivated student is consistently assigned to active target class');
  assert((reactivated?.enrollmentHistory || []).some((entry: any) => String(entry.class) === String(manualTarget?._id) && entry.status === 'active'), 'reactivation opens a new active enrollment-history entry');

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL STUDENT LIFECYCLE WORKFLOW CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
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
