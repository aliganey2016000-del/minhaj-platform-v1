/**
 * Student historical Quiz & Lesson Performance regression.
 *
 * Verifies that promotion changes the current class/course set without
 * erasing performance from the previous enrollment period. The student API
 * must expose current and historical periods separately while keeping the
 * root courses/activities payload backward-compatible with the current period.
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

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Course } = await import('../models/course.model');
  const { default: CourseContent } = await import('../models/course-content.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Progress } = await import('../models/progress.model');
  const { default: QuizAttempt } = await import('../models/quiz-attempt.model');
  const { syncStudentCourseEnrollment, reassignStudentClassCourses } = await import('../services/enrollment.service');

  const admin = await User.create({ email: 'history-admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Historical Performance School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'History Street', phone: '+252610000099', email: 'history-school@test.local',
    principalName: 'History Principal', establishedYear: 2020, createdBy: admin._id,
  });

  const grade1 = await ClassModel.create({
    school: school._id, title: 'Grade 1', section: 'A', room: 'G1-A', gradeLevel: 1,
    academicYear: '2025-2026', shiftMode: 'Morning', status: 'active',
  });
  const grade2 = await ClassModel.create({
    school: school._id, title: 'Grade 2', section: 'A', room: 'G2-A', gradeLevel: 2,
    academicYear: '2026-2027', shiftMode: 'Morning', status: 'active',
  });

  const oldCourse = await Course.create({
    title: { en: 'Grade 1 Mathematics' },
    slug: `history-g1-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    category: 'mathematics', level: 'beginner', duration: 8, maxStudents: 40,
    school: school._id, class: grade1._id, status: 'published',
  });
  const currentCourse = await Course.create({
    title: { en: 'Grade 2 Mathematics' },
    slug: `history-g2-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    category: 'mathematics', level: 'beginner', duration: 8, maxStudents: 40,
    school: school._id, class: grade2._id, status: 'published',
  });

  const oldQuizId = new mongoose.Types.ObjectId();
  const oldQuestionId = new mongoose.Types.ObjectId();
  const currentQuizId = new mongoose.Types.ObjectId();
  const currentQuestionId = new mongoose.Types.ObjectId();

  await CourseContent.create({
    course: oldCourse._id,
    chapters: [{
      title: 'Grade 1 Numbers', order: 1, status: 'published',
      items: [{
        _id: oldQuizId, title: 'Grade 1 Number Quiz', type: 'quiz', status: 'published', order: 1,
        duration: 5, passingScore: 50,
        questions: [{ _id: oldQuestionId, type: 'mcq', question: 'What is 1 + 1?', options: ['1', '2'], correctIndex: 1, points: 1 }],
      }],
    }],
  });
  await CourseContent.create({
    course: currentCourse._id,
    chapters: [{
      title: 'Grade 2 Numbers', order: 1, status: 'published',
      items: [{
        _id: currentQuizId, title: 'Grade 2 Number Quiz', type: 'quiz', status: 'published', order: 1,
        duration: 5, passingScore: 50,
        questions: [{ _id: currentQuestionId, type: 'mcq', question: 'What is 2 + 2?', options: ['3', '4'], correctIndex: 1, points: 1 }],
      }],
    }],
  });

  const studentUser = await User.create({
    email: 'history-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id,
  });
  const profile = await Profile.create({ user: studentUser._id, firstName: 'History', lastName: 'Student', gender: 'female' });
  const student = await Student.create({ user: studentUser._id, profile: profile._id, school: school._id, class: grade1._id });
  const token = generateAccessToken({ userId: studentUser._id.toString(), role: 'student', permissions: [], organizationId: school._id.toString() });

  await syncStudentCourseEnrollment(student._id, grade1._id);
  await Progress.create({ student: student._id, course: oldCourse._id, completedQuizzes: 1, totalItems: 1, lastAccessed: new Date() });
  const oldAttempt = await QuizAttempt.create({
    student: student._id, course: oldCourse._id, quizId: oldQuizId.toString(),
    answers: [{ questionId: oldQuestionId.toString(), selectedAnswer: '2', correct: true, points: 1 }],
    score: 1, totalPoints: 1, percentage: 100, passed: true, durationSeconds: 35, isFirstAttempt: true,
  });

  section('PROMOTION — current links move to Grade 2 while enrollment history keeps Grade 1');
  await reassignStudentClassCourses(student._id, grade1._id, grade2._id, '2026-2027');
  const promoted: any = await Student.findById(student._id).setOptions({ skipCourseNormalization: true }).lean();
  assert(String(promoted?.class) === String(grade2._id), 'student current class is Grade 2');
  assert((promoted?.enrolledCourses || []).some((id: any) => String(id) === String(currentCourse._id)), 'current Grade 2 course is enrolled');
  assert(!(promoted?.enrolledCourses || []).some((id: any) => String(id) === String(oldCourse._id)), 'Grade 1 course is removed from current enrolledCourses');
  assert(promoted?.enrollmentHistory?.length === 2, `two enrollment periods are preserved (got ${promoted?.enrollmentHistory?.length})`);
  assert(promoted?.enrollmentHistory?.[0]?.status === 'completed', 'Grade 1 enrollment is closed as completed');
  assert(promoted?.enrollmentHistory?.[1]?.status === 'active', 'Grade 2 enrollment is active');

  await Progress.create({ student: student._id, course: currentCourse._id, completedQuizzes: 1, totalItems: 1, lastAccessed: new Date() });
  const currentAttempt = await QuizAttempt.create({
    student: student._id, course: currentCourse._id, quizId: currentQuizId.toString(),
    answers: [{ questionId: currentQuestionId.toString(), selectedAnswer: '4', correct: true, points: 1 }],
    score: 1, totalPoints: 1, percentage: 100, passed: true, durationSeconds: 25, isFirstAttempt: true,
  });

  section('PERFORMANCE API — current and historical periods are separated');
  const res = await request(app).get('/api/v1/students/my/performance').set('Authorization', `Bearer ${token}`);
  assert(res.status === 200, `performance request succeeds (status ${res.status})`);
  const periods = res.body?.data?.periods || [];
  assert(periods.length === 2, `two academic periods are returned (got ${periods.length})`);

  const currentPeriod = periods.find((period: any) => period.isCurrent);
  const oldPeriod = periods.find((period: any) => period.academicYear === '2025-2026');
  assert(currentPeriod?.academicYear === '2026-2027', `current period is 2026-2027 (got ${currentPeriod?.academicYear})`);
  assert(currentPeriod?.class?.title === 'Grade 2', `current period class is Grade 2 (got ${currentPeriod?.class?.title})`);
  assert(oldPeriod?.class?.title === 'Grade 1', `historical period class is Grade 1 (got ${oldPeriod?.class?.title})`);
  assert(oldPeriod?.status === 'completed' && oldPeriod?.isCurrent === false, 'historical Grade 1 period is completed, not current');

  assert(currentPeriod?.courses?.length === 1 && currentPeriod?.courses?.[0]?.courseId === currentCourse._id.toString(), 'current period contains only the Grade 2 course');
  assert(oldPeriod?.courses?.length === 1 && oldPeriod?.courses?.[0]?.courseId === oldCourse._id.toString(), 'historical period still contains the Grade 1 course');
  assert(currentPeriod?.activities?.some((row: any) => row.id === currentAttempt._id.toString()), 'current period contains the Grade 2 quiz result');
  assert(oldPeriod?.activities?.some((row: any) => row.id === oldAttempt._id.toString()), 'historical period contains the Grade 1 quiz result');

  assert(res.body?.data?.courses?.length === 1 && res.body?.data?.courses?.[0]?.courseId === currentCourse._id.toString(), 'backward-compatible root courses remain current-period only');
  assert(res.body?.data?.activities?.some((row: any) => row.id === currentAttempt._id.toString()), 'backward-compatible root activities use current period');
  assert(!res.body?.data?.activities?.some((row: any) => row.id === oldAttempt._id.toString()), 'historical activity does not leak into current root activity list');

  section('HISTORICAL ATTEMPT DETAILS — previous-class results remain reviewable');
  const detail = await request(app)
    .get(`/api/v1/students/my/performance/attempt/quiz/${oldAttempt._id}`)
    .set('Authorization', `Bearer ${token}`);
  assert(detail.status === 200, `historical attempt detail succeeds after promotion (status ${detail.status})`);
  assert(detail.body?.data?.course?.id === oldCourse._id.toString(), 'historical attempt still points to the Grade 1 course');
  assert(detail.body?.data?.summary?.percentage === 100, `historical score remains 100% (got ${detail.body?.data?.summary?.percentage}%)`);

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
