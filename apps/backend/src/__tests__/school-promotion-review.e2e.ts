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

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Course } = await import('../models/course.model');
  const { syncStudentCourseEnrollment } = await import('../services/enrollment.service');

  const admin = await User.create({ email: 'review-promotion@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
  const school = await School.create({ name: 'Review Promotion School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Road', phone: '+252611000000', email: 'review-school@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });

  const grade9 = await ClassModel.create({ school: school._id, department: department._id, title: 'Grade 9', section: 'A', room: '9A', batch: '2026', gradeLevel: 9, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning', isEntryGrade: true });
  const grade10 = await ClassModel.create({ school: school._id, department: department._id, title: 'Grade 10', section: 'A', room: '10A', batch: '2026', gradeLevel: 10, academicYear: '2026-2027', status: 'active', shiftMode: 'Afternoon', isGraduatingGrade: true });
  const grade10Course = await Course.create({
    title: { en: 'Grade 10 Core' },
    slug: `grade-10-core-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    category: 'general', level: 'beginner', duration: 10, maxStudents: 30,
    school: school._id, class: grade10._id, status: 'published',
  });

  async function makeStudent(name: string, cls: any) {
    const user = await User.create({ email: `${name.toLowerCase()}@review.test`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: user._id, firstName: name, lastName: 'Student', gender: 'male' });
    return Student.create({ user: user._id, profile: profile._id, school: school._id, class: cls._id, status: 'active', approvalStatus: 'approved', enrolledCourses: [], enrollmentHistory: [] });
  }

  const promoteMe = await makeStudent('PromoteMe', grade9);
  const repeatNine = await makeStudent('RepeatNine', grade9);
  const graduateMe = await makeStudent('GraduateMe', grade10);
  const repeatTen = await makeStudent('RepeatTen', grade10);

  await syncStudentCourseEnrollment(graduateMe._id, grade10._id);
  await syncStudentCourseEnrollment(repeatTen._id, grade10._id);
  const courseBefore: any = await Course.findById(grade10Course._id).lean();
  assert(courseBefore?.enrolledStudents === 2, `source course starts with two active students (got ${courseBefore?.enrolledStudents})`);

  console.log('\n=== REVIEW PREVIEW ===');
  const preview = await request(app).get('/api/v1/classes/promotion-review').set('Authorization', `Bearer ${token}`).query({ schoolId: school._id.toString() });
  assert(preview.status === 200, `review preview succeeds (got ${preview.status})`);
  const groups = preview.body?.data?.groups || [];
  const g9 = groups.find((x: any) => String(x.classId) === String(grade9._id));
  const g10 = groups.find((x: any) => String(x.classId) === String(grade10._id));
  assert(g9?.students?.length === 2 && g9?.students?.every((x: any) => x.defaultAction === 'promote'), 'Grade 9 defaults to Promote');
  assert(g10?.students?.length === 2 && g10?.students?.every((x: any) => x.defaultAction === 'graduate'), 'Final grade defaults to Graduate');

  console.log('\n=== REVIEWED EXECUTION WITH REPEAT EXCEPTIONS ===');
  const execute = await request(app).post('/api/v1/classes/promote-reviewed').set('Authorization', `Bearer ${token}`).send({
    schoolId: school._id.toString(), targetAcademicYear: '2027-2028',
    decisions: [
      { studentId: repeatNine._id.toString(), action: 'repeat' },
      { studentId: repeatTen._id.toString(), action: 'repeat' },
    ],
  });
  assert(execute.status === 200, `reviewed promotion succeeds (got ${execute.status}, ${JSON.stringify(execute.body)})`);
  assert(execute.body?.data?.studentsPromoted === 1, 'one student promoted');
  assert(execute.body?.data?.studentsRepeated === 2, 'two students repeat');
  assert(execute.body?.data?.studentsGraduated === 1, 'one student graduated');

  const promoted: any = await Student.findById(promoteMe._id).lean();
  const repeated9: any = await Student.findById(repeatNine._id).lean();
  const graduated: any = await Student.findById(graduateMe._id).lean();
  const repeated10: any = await Student.findById(repeatTen._id).lean();
  const pClass: any = await ClassModel.findById(promoted?.class).lean();
  const r9Class: any = await ClassModel.findById(repeated9?.class).lean();
  const r10Class: any = await ClassModel.findById(repeated10?.class).lean();

  assert(pClass?.gradeLevel === 10 && pClass?.academicYear === '2027-2028', 'promoted student moves to next grade in new year');
  assert(promoted?.grade === '10', `promoted student's denormalized grade is synchronized (got ${promoted?.grade})`);
  assert(promoted?.department === 'Secondary', `promoted student's department is synchronized (got ${promoted?.department})`);
  assert(promoted?.shiftMode === 'Afternoon', `promoted student's shift follows target class (got ${promoted?.shiftMode})`);
  assert(r9Class?.gradeLevel === 9 && r9Class?.academicYear === '2027-2028' && r9Class?.batch === '2026', 'Grade 9 repeater stays same grade in new year and keeps cohort batch');
  assert(repeated9?.shiftMode === 'Morning', `repeater keeps the repeated class shift (got ${repeated9?.shiftMode})`);
  assert(r10Class?.gradeLevel === 10 && r10Class?.academicYear === '2027-2028' && r10Class?.batch === '2026', 'final-grade repeater stays final grade in new year');
  assert(graduated?.status === 'graduated', 'default final-grade student graduates');

  const courseAfter: any = await Course.findById(grade10Course._id).lean();
  assert(courseAfter?.enrolledStudents === 0, `completed source course has zero active students after repeat/graduate (got ${courseAfter?.enrolledStudents})`);

  const newIntake = await ClassModel.findOne({ school: school._id, gradeLevel: 9, academicYear: '2027-2028', batch: '2027', isEntryGrade: true }).lean();
  assert(!!newIntake, 'new Grade 9 intake is separate from repeat class');
  const old9: any = await ClassModel.findById(grade9._id).lean();
  const old10: any = await ClassModel.findById(grade10._id).lean();
  assert(old9?.status === 'completed' && old10?.status === 'completed', 'source classes are completed');

  const second = await request(app).post('/api/v1/classes/promote-reviewed').set('Authorization', `Bearer ${token}`).send({ schoolId: school._id.toString(), targetAcademicYear: '2027-2028', decisions: [] });
  assert(second.status === 200 && second.body?.data?.classesCompleted === 0, 'second run is idempotent and changes no source classes');

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL REVIEWED PROMOTION CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
