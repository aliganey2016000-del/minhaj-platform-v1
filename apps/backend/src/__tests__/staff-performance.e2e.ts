/**
 * Admin + Teacher learning performance regression.
 *
 * Verifies teacher course ownership, org-admin tenant isolation, platform-admin
 * organization filtering, latest-quiz scoring, Interactive Gate first-answer
 * scoring, and student drill-down data.
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
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Teacher } = await import('../models/teacher.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Course } = await import('../models/course.model');
  const { default: Student } = await import('../models/student.model');
  const { default: CourseContent } = await import('../models/course-content.model');
  const { default: QuizAttempt } = await import('../models/quiz-attempt.model');
  const { default: LessonBlockProgress } = await import('../models/lesson-block-progress.model');
  const { default: Progress } = await import('../models/progress.model');

  const tokenFor = (userId: string, role: string, organizationId?: string) =>
    generateAccessToken({ userId, role, permissions: [], organizationId });

  const platformAdmin = await User.create({ email: 'staff-performance-admin@test.local', password: 'Password123!', role: 'admin' });
  const school1 = await School.create({
    name: 'Performance School One', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'One Street', phone: '+252610000101', email: 'performance-one@test.local', principalName: 'Principal One',
    establishedYear: 2020, createdBy: platformAdmin._id,
  });
  const school2 = await School.create({
    name: 'Performance School Two', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Two Street', phone: '+252610000102', email: 'performance-two@test.local', principalName: 'Principal Two',
    establishedYear: 2021, createdBy: platformAdmin._id,
  });

  const orgAdmin1 = await User.create({ email: 'staff-performance-org1@test.local', password: 'Password123!', role: 'org_admin', organizationId: school1._id });
  const orgAdmin2 = await User.create({ email: 'staff-performance-org2@test.local', password: 'Password123!', role: 'org_admin', organizationId: school2._id });

  const teacherUser1 = await User.create({ email: 'staff-performance-teacher1@test.local', password: 'Password123!', role: 'teacher', organizationId: school1._id });
  const teacherProfile1 = await Profile.create({ user: teacherUser1._id, firstName: 'Maryan', lastName: 'Teacher', gender: 'female' });
  const teacher1 = await Teacher.create({ user: teacherUser1._id, profile: teacherProfile1._id, school: school1._id, teacherId: 'TCH-2026-9101' });

  const teacherUser2 = await User.create({ email: 'staff-performance-teacher2@test.local', password: 'Password123!', role: 'teacher', organizationId: school2._id });
  const teacherProfile2 = await Profile.create({ user: teacherUser2._id, firstName: 'Ahmed', lastName: 'Teacher', gender: 'male' });
  const teacher2 = await Teacher.create({ user: teacherUser2._id, profile: teacherProfile2._id, school: school2._id, teacherId: 'TCH-2026-9201' });

  const class1 = await ClassModel.create({ school: school1._id, title: 'Grade 7', section: 'A', room: 'R7', shiftMode: 'Morning', academicYear: '2026-2027' });
  const class2 = await ClassModel.create({ school: school2._id, title: 'Grade 8', section: 'B', room: 'R8', shiftMode: 'Morning', academicYear: '2026-2027' });

  const course1 = await Course.create({
    title: { en: 'Mathematics Performance', so: '', ar: '' }, slug: `staff-performance-one-${Date.now()}`,
    category: 'mathematics', level: 'beginner', duration: 8, maxStudents: 40,
    school: school1._id, class: class1._id, teacher: teacher1._id, status: 'published',
  });
  const course2 = await Course.create({
    title: { en: 'Science Performance', so: '', ar: '' }, slug: `staff-performance-two-${Date.now()}`,
    category: 'science', level: 'beginner', duration: 8, maxStudents: 40,
    school: school2._id, class: class2._id, teacher: teacher2._id, status: 'published',
  });

  const studentUser1 = await User.create({ email: 'staff-performance-student1@test.local', password: 'Password123!', role: 'student', organizationId: school1._id });
  const studentProfile1 = await Profile.create({ user: studentUser1._id, firstName: 'Amina', lastName: 'Learner', gender: 'female' });
  const student1 = await Student.create({
    user: studentUser1._id, profile: studentProfile1._id, school: school1._id, class: class1._id,
    studentId: 'PERF-ONE-001', enrolledCourses: [course1._id], status: 'active',
  });

  const studentUser2 = await User.create({ email: 'staff-performance-student2@test.local', password: 'Password123!', role: 'student', organizationId: school2._id });
  const studentProfile2 = await Profile.create({ user: studentUser2._id, firstName: 'Hodan', lastName: 'Learner', gender: 'female' });
  const student2 = await Student.create({
    user: studentUser2._id, profile: studentProfile2._id, school: school2._id, class: class2._id,
    studentId: 'PERF-TWO-001', enrolledCourses: [course2._id], status: 'active',
  });

  const lessonId = new mongoose.Types.ObjectId();
  const quizId = new mongoose.Types.ObjectId();
  const quizQ1 = new mongoose.Types.ObjectId();
  const quizQ2 = new mongoose.Types.ObjectId();

  await CourseContent.create({
    course: course1._id,
    chapters: [{
      title: 'Number Skills', order: 1, status: 'published', items: [
        {
          _id: lessonId, title: 'Interactive Number Check', type: 'lesson', status: 'published', order: 1,
          duration: 10, deliveryMode: 'interactive_gate', attachments: [],
          contentBlocks: [{
            title: 'Counting', order: 0, content: '<p>Counting</p>', minReadSeconds: 1,
            questions: [
              { question: 'What follows 1?', type: 'mcq', options: ['1', '2'], correctIndex: 1, aiGenerated: false },
              { question: 'Zero is less than one.', type: 'true_false', correctAnswer: true, aiGenerated: false },
            ],
          }],
        },
        {
          _id: quizId, title: 'Numbers Quiz', type: 'quiz', status: 'published', order: 2, duration: 5, passingScore: 60,
          questions: [
            { _id: quizQ1, type: 'mcq', question: '2 + 2?', options: ['3', '4'], correctIndex: 1, points: 2 },
            { _id: quizQ2, type: 'true_false', question: '5 < 3', correctAnswer: false, points: 1 },
          ],
        },
      ],
    }],
  });
  await CourseContent.create({ course: course2._id, chapters: [] });

  await Progress.create({ student: student1._id, course: course1._id, completedLessons: 1, completedQuizzes: 1, completedAssignments: 0, totalItems: 2, lastAccessed: new Date() });
  await Progress.create({ student: student2._id, course: course2._id, completedLessons: 0, completedQuizzes: 0, completedAssignments: 0, totalItems: 1, lastAccessed: new Date() });

  await QuizAttempt.create({
    student: student1._id, course: course1._id, quizId: quizId.toString(),
    answers: [{ questionId: quizQ1.toString(), selectedAnswer: '4', correct: true, points: 2 }],
    score: 2, totalPoints: 3, percentage: 67, passed: true, durationSeconds: 90, isFirstAttempt: true,
  });
  const latestQuiz = await QuizAttempt.create({
    student: student1._id, course: course1._id, quizId: quizId.toString(),
    answers: [
      { questionId: quizQ1.toString(), selectedAnswer: '4', correct: true, points: 2 },
      { questionId: quizQ2.toString(), selectedAnswer: false, correct: true, points: 1 },
    ],
    score: 3, totalPoints: 3, percentage: 100, passed: true, durationSeconds: 60, isFirstAttempt: false,
  });

  await LessonBlockProgress.create({
    student: student1._id, course: course1._id, lessonId, unlockedBlockIndex: 0, gateCompleted: true,
    attempts: [
      { blockIndex: 0, questionIndex: 0, selectedAnswer: 0, correct: false, attemptedAt: new Date(), timeSpentSeconds: 10 },
      { blockIndex: 0, questionIndex: 0, selectedAnswer: 1, correct: true, attemptedAt: new Date(), timeSpentSeconds: 5 },
      { blockIndex: 0, questionIndex: 1, selectedAnswer: true, correct: true, attemptedAt: new Date(), timeSpentSeconds: 5 },
    ],
  });

  const teacherToken1 = tokenFor(teacherUser1._id.toString(), 'teacher', school1._id.toString());
  const orgToken1 = tokenFor(orgAdmin1._id.toString(), 'org_admin', school1._id.toString());
  const orgToken2 = tokenFor(orgAdmin2._id.toString(), 'org_admin', school2._id.toString());
  const platformToken = tokenFor(platformAdmin._id.toString(), 'admin');

  section('TEACHER — only assigned courses are visible');
  const teacherOverview = await request(app).get('/api/v1/teacher-portal/analytics/performance').set('Authorization', `Bearer ${teacherToken1}`);
  assert(teacherOverview.status === 200, `teacher performance succeeds (status ${teacherOverview.status})`);
  assert(teacherOverview.body?.data?.courses?.length === 1, 'teacher sees exactly one assigned course');
  assert(String(teacherOverview.body?.data?.courses?.[0]?.courseId) === String(course1._id), 'teacher course is the assigned organization-one course');
  assert(!JSON.stringify(teacherOverview.body).includes('Science Performance'), 'teacher response excludes another teacher organization course');

  const teacherForbidden = await request(app)
    .get(`/api/v1/teacher-portal/analytics/performance?courseId=${course2._id}`)
    .set('Authorization', `Bearer ${teacherToken1}`);
  assert(teacherForbidden.status === 403, `teacher cannot drill into another teacher course (status ${teacherForbidden.status})`);

  section('TEACHER — course and student drill-down use academic activity semantics');
  const teacherCourse = await request(app)
    .get(`/api/v1/teacher-portal/analytics/performance?courseId=${course1._id}`)
    .set('Authorization', `Bearer ${teacherToken1}`);
  assert(teacherCourse.status === 200, `teacher course detail succeeds (status ${teacherCourse.status})`);
  const metric = teacherCourse.body?.data?.selectedCourse?.students?.[0];
  assert(metric?.averageScore === 75, `student average blends latest quiz 100% and first-answer interactive 50% (got ${metric?.averageScore}%)`);
  assert(metric?.quizAverage === 100, `latest quiz attempt drives quiz average (got ${metric?.quizAverage}%)`);
  assert(metric?.interactiveAverage === 50, `interactive lesson uses first answers only (got ${metric?.interactiveAverage}%)`);
  assert(metric?.progressPercent === 100, `course progress is 100% (got ${metric?.progressPercent}%)`);

  const teacherStudent = await request(app)
    .get(`/api/v1/teacher-portal/analytics/performance?courseId=${course1._id}&studentId=${student1._id}`)
    .set('Authorization', `Bearer ${teacherToken1}`);
  assert(teacherStudent.status === 200, `teacher student drill-down succeeds (status ${teacherStudent.status})`);
  assert(teacherStudent.body?.data?.studentDetail?.activities?.length === 2, 'student drill-down returns quiz and interactive activity');
  const quizActivity = teacherStudent.body?.data?.studentDetail?.activities?.find((row: any) => row.type === 'quiz');
  assert(quizActivity?.id === latestQuiz._id.toString(), 'quiz activity points to the latest attempt');

  section('ORG ADMIN — analytics remain tenant isolated');
  const orgOne = await request(app).get('/api/v1/analytics/performance').set('Authorization', `Bearer ${orgToken1}`);
  assert(orgOne.status === 200, `org one performance succeeds (status ${orgOne.status})`);
  assert(orgOne.body?.data?.courses?.length === 1 && String(orgOne.body?.data?.courses?.[0]?.courseId) === String(course1._id), 'org one sees only its course');
  assert(!JSON.stringify(orgOne.body).includes('Science Performance'), 'org one response excludes org two data');

  const orgOneForbidden = await request(app)
    .get(`/api/v1/analytics/performance?courseId=${course2._id}`)
    .set('Authorization', `Bearer ${orgToken1}`);
  assert(orgOneForbidden.status === 403, `org one cannot select org two course (status ${orgOneForbidden.status})`);

  const orgTwo = await request(app).get('/api/v1/analytics/performance').set('Authorization', `Bearer ${orgToken2}`);
  assert(orgTwo.body?.data?.courses?.length === 1 && String(orgTwo.body?.data?.courses?.[0]?.courseId) === String(course2._id), 'org two sees only its own course');

  section('PLATFORM ADMIN — may target a specific organization');
  const adminSchoolTwo = await request(app)
    .get(`/api/v1/analytics/performance?schoolId=${school2._id}`)
    .set('Authorization', `Bearer ${platformToken}`);
  assert(adminSchoolTwo.status === 200, `platform admin scoped query succeeds (status ${adminSchoolTwo.status})`);
  assert(adminSchoolTwo.body?.data?.courses?.length === 1 && String(adminSchoolTwo.body?.data?.courses?.[0]?.courseId) === String(course2._id), 'platform admin school filter returns only requested organization');

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
