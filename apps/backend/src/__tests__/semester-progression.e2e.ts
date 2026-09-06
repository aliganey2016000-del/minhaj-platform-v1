/**
 * Semester progression regression coverage.
 *
 * Verifies global semester numbering for two- and three-semester systems,
 * academic-year rollover, active student history sync, and idempotency.
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
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Course } = await import('../models/course.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: Student } = await import('../models/student.model');
  const { default: AcademicStructure } = await import('../models/academic-structure.model');

  const admin = await User.create({ email: 'semester-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });

  async function createScenario(options: { semestersPerAcademicYear: 2 | 3; semesterNumber: number; studyYear: number; semesterInYear: number; academicYear: string }) {
    const school = await School.create({
      name: `Semester School ${options.semestersPerAcademicYear}-${options.semesterNumber}`,
      organizationType: 'university', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: `${new mongoose.Types.ObjectId()}@test.local`,
      principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const department = await Department.create({ name: 'Faculty of Studies', tenantId: school._id });
    const classRecord = await ClassModel.create({
      school: school._id, department: department._id, title: `S${options.semesterNumber}`,
      room: 'Room 1', academicYear: options.academicYear, studyYear: options.studyYear,
      semesterNumber: options.semesterNumber, semesterInYear: options.semesterInYear,
      status: 'active',
    });
    const course = await Course.create({
      title: { en: 'Semester Course' },
      slug: `semester-course-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
      category: 'general', level: 'beginner', duration: 10, maxStudents: 30,
      school: school._id, class: classRecord._id, status: 'published',
    });
    const user = await User.create({ email: `${new mongoose.Types.ObjectId()}@test.local`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: user._id, firstName: 'Semester', lastName: 'Student', gender: 'male' });
    const student = await Student.create({
      user: user._id, profile: profile._id, school: school._id, class: classRecord._id,
      studentId: `STU-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
      status: 'active', enrolledCourses: [course._id], enrollmentHistory: [{
        academicYear: options.academicYear, class: classRecord._id,
        studyYear: options.studyYear, semesterNumber: options.semesterNumber,
        semesterInYear: options.semesterInYear, courses: [course._id], status: 'active', startedAt: new Date(),
      }],
    });
    await AcademicStructure.create({ school: school._id, academicSystem: 'semester', semestersPerAcademicYear: options.semestersPerAcademicYear });
    return { school, classRecord, course, student };
  }

  section('TWO-SEMESTER SYSTEM — S1 -> S2');
  const twoSemester = await createScenario({ semestersPerAcademicYear: 2, semesterNumber: 1, studyYear: 1, semesterInYear: 1, academicYear: '2025-2026' });
  const firstAdvance = await request(app)
    .post('/api/v1/classes/advance-semester')
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', 'two-semester-s2')
    .send({ schoolId: twoSemester.school._id.toString(), classIds: [twoSemester.classRecord._id.toString()] });
  assert(firstAdvance.status === 200, `S1 -> S2 succeeds (got ${firstAdvance.status})`);
  const s2 = await ClassModel.findById(twoSemester.classRecord._id).lean() as any;
  assert(s2.semesterNumber === 2 && s2.studyYear === 1 && s2.semesterInYear === 2, `S2 maps to study year 1, semester 2 (got S${s2.semesterNumber}, Y${s2.studyYear}, in-year ${s2.semesterInYear})`);
  const studentAfterS2: any = await Student.findById(twoSemester.student._id).setOptions({ skipCourseNormalization: true }).lean();
  assert(studentAfterS2.enrollmentHistory.filter((entry: any) => entry.status === 'active').length === 1, 'student has one active enrollment after S1 -> S2');
  assert(studentAfterS2.enrollmentHistory.some((entry: any) => entry.semesterNumber === 2 && entry.semesterInYear === 2), 'student history records S2');

  section('IDEMPOTENCY — duplicate operation key is rejected');
  const duplicate = await request(app)
    .post('/api/v1/classes/advance-semester')
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', 'two-semester-s2')
    .send({ schoolId: twoSemester.school._id.toString(), classIds: [twoSemester.classRecord._id.toString()] });
  assert(duplicate.status === 400, `same idempotency key is rejected (got ${duplicate.status})`);
  const unchanged = await ClassModel.findById(twoSemester.classRecord._id).lean() as any;
  assert(unchanged.semesterNumber === 2, 'duplicate request does not advance the class again');

  section('TWO-SEMESTER ROLLOVER — S2 -> S3');
  await AcademicStructure.updateOne({ school: twoSemester.school._id }, { $set: { lastSemesterAdvanceAt: new Date(Date.now() - 60_000) } });
  const rollover = await request(app)
    .post('/api/v1/classes/advance-semester')
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', 'two-semester-s3')
    .send({ schoolId: twoSemester.school._id.toString(), classIds: [twoSemester.classRecord._id.toString()] });
  assert(rollover.status === 200, `S2 -> S3 succeeds (got ${rollover.status})`);
  const s3 = await ClassModel.findById(twoSemester.classRecord._id).lean() as any;
  assert(s3.semesterNumber === 3 && s3.studyYear === 2 && s3.semesterInYear === 1, `S3 rolls into study year 2, semester 1 (got S${s3.semesterNumber}, Y${s3.studyYear}, in-year ${s3.semesterInYear})`);
  assert(s3.academicYear === '2026-2027', `academic year rolls over at S3 (got ${s3.academicYear})`);

  section('THREE-SEMESTER SYSTEM — S3 -> S4');
  const threeSemester = await createScenario({ semestersPerAcademicYear: 3, semesterNumber: 3, studyYear: 1, semesterInYear: 3, academicYear: '2025-2026' });
  const threeAdvance = await request(app)
    .post('/api/v1/classes/advance-semester')
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', 'three-semester-s4')
    .send({ schoolId: threeSemester.school._id.toString(), classIds: [threeSemester.classRecord._id.toString()] });
  assert(threeAdvance.status === 200, `three-semester S3 -> S4 succeeds (got ${threeAdvance.status})`);
  const s4 = await ClassModel.findById(threeSemester.classRecord._id).lean() as any;
  assert(s4.semesterNumber === 4 && s4.studyYear === 2 && s4.semesterInYear === 1, `S4 maps to study year 2, semester 1 (got S${s4.semesterNumber}, Y${s4.studyYear}, in-year ${s4.semesterInYear})`);

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) console.log('ALL CHECKS PASSED (0 failures)');
  else console.log(`${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('FATAL ERROR:', error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
