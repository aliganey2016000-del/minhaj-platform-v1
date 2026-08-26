/**
 * Exam attempt start/submit time & duration.
 *
 * Reported bug: the admin/student need accurate data on when a student
 * opened an exam, when they finished it, and the correct duration. The
 * timestamps (ExamAttempt.startedAt/submittedAt) were always recorded
 * correctly server-side, but getMine (GET /exams/:id/attempt) and getReview
 * (GET /exams/:id/review) never included startedAt or any computed duration
 * in their response payloads — so the correct data existed in the database
 * but was invisible to every client. Fixed by adding startedAt and a
 * durationSeconds field (computed as submittedAt - startedAt) to both
 * response payloads.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:exam-duration`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

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
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Teacher } = await import('../models/teacher.model');
  const { default: Course } = await import('../models/course.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Exam } = await import('../models/exam.model');
  const { default: ExamPaper } = await import('../models/exam-paper.model');
  const { default: ExamAttempt } = await import('../models/exam-attempt.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });

  const teacherUser = await User.create({ email: 'teacher@test.local', password: 'Password123!', role: 'teacher' });
  const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'Liban', lastName: 'Hassan', gender: 'male' });
  const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id });

  const course = await Course.create({
    title: { en: 'Matn Safiinat An-Najaah' }, slug: 'matn-' + new mongoose.Types.ObjectId().toString().slice(-6),
    category: 'islamic-studies', level: 'beginner', duration: 8, maxStudents: 50,
    school: school._id, teacher: teacher._id, status: 'published',
  });

  const studentUser = await User.create({ email: 'leyla@test.local', password: 'Password123!', role: 'student' });
  const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'Leyla', lastName: 'Isaaq', gender: 'female' });
  const student = await Student.create({ user: studentUser._id, profile: studentProfile._id, school: school._id, enrolledCourses: [course._id] });
  const studentToken = tokenFor(studentUser._id.toString(), 'student', school._id.toString());

  const exam = await Exam.create({
    title: 'Mid Exam', course: course._id, school: school._id, examDate: new Date(), startTime: '09:00', endTime: '10:00',
    duration: 60, totalMarks: 10, passingMarks: 5, createdBy: adminUser._id,
  });
  await ExamPaper.create({ exam: exam._id, title: 'Mid Exam Paper', status: 'approved', submittedBy: adminUser._id, questions: [] });

  // Simulate a real attempt: student opened it 12 minutes 34 seconds before submitting.
  const startedAt = new Date('2026-08-20T09:00:00.000Z');
  const submittedAt = new Date('2026-08-20T09:12:34.000Z');
  await ExamAttempt.create({
    exam: exam._id, paper: (await ExamPaper.findOne({ exam: exam._id }))!._id, student: student._id,
    startedAt, deadline: new Date(startedAt.getTime() + 60 * 60000), submittedAt, status: 'submitted',
    autoGradedScore: 8, maxScore: 10, school: school._id,
  });

  // -------------------------------------------------------------------
  section('GET /exams/:id/attempt — startedAt, submittedAt, and durationSeconds are all present and correct');
  // -------------------------------------------------------------------
  const res = await request(app).get(`/api/v1/exams/${exam._id}/attempt`).set('Authorization', `Bearer ${studentToken}`);
  assert(res.status === 200, `request succeeds (status ${res.status})`);
  assert(res.body?.data?.startedAt, `startedAt is present in the response (got ${res.body?.data?.startedAt})`);
  assert(new Date(res.body?.data?.startedAt).getTime() === startedAt.getTime(), `startedAt matches what was recorded (got ${res.body?.data?.startedAt})`);
  assert(new Date(res.body?.data?.submittedAt).getTime() === submittedAt.getTime(), `submittedAt matches what was recorded (got ${res.body?.data?.submittedAt})`);
  assert(res.body?.data?.durationSeconds === 754, `durationSeconds is exactly 754 (12m34s), matching submittedAt - startedAt (got ${res.body?.data?.durationSeconds})`);

  // -------------------------------------------------------------------
  section('IN-PROGRESS ATTEMPT — durationSeconds is null, not a garbage/negative number, while unsubmitted');
  // -------------------------------------------------------------------
  const student2User = await User.create({ email: 'xasan@test.local', password: 'Password123!', role: 'student' });
  const student2Profile = await Profile.create({ user: student2User._id, firstName: 'Xasan', lastName: 'Warsame', gender: 'male' });
  const student2 = await Student.create({ user: student2User._id, profile: student2Profile._id, school: school._id, enrolledCourses: [course._id] });
  const student2Token = tokenFor(student2User._id.toString(), 'student', school._id.toString());
  await ExamAttempt.create({
    exam: exam._id, paper: (await ExamPaper.findOne({ exam: exam._id }))!._id, student: student2._id,
    startedAt: new Date(), deadline: new Date(Date.now() + 60 * 60000), status: 'in_progress',
    maxScore: 10, school: school._id,
  });
  const res2 = await request(app).get(`/api/v1/exams/${exam._id}/attempt`).set('Authorization', `Bearer ${student2Token}`);
  assert(res2.status === 200, `request succeeds (status ${res2.status})`);
  assert(res2.body?.data?.durationSeconds === null, `durationSeconds is null for an in-progress attempt, not 0 or negative (got ${res2.body?.data?.durationSeconds})`);
  assert(res2.body?.data?.submittedAt === null, `submittedAt is null for an in-progress attempt (got ${res2.body?.data?.submittedAt})`);

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
