/**
 * Student Quiz & Lesson Performance end-to-end regression.
 *
 * Exercises the real Express app against an ephemeral MongoDB and verifies the
 * complete student flow used by the frontend:
 *   Performance by Course -> Lesson Activity -> Attempt Details.
 *
 * Coverage includes latest quiz score selection, retry history, Interactive
 * Gate first-attempt scoring, correct-answer review, and ownership isolation.
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
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Teacher } = await import('../models/teacher.model');
  const { default: Course } = await import('../models/course.model');
  const { default: Student } = await import('../models/student.model');
  const { default: CourseContent } = await import('../models/course-content.model');
  const { default: Progress } = await import('../models/progress.model');
  const { default: QuizAttempt } = await import('../models/quiz-attempt.model');
  const { default: LessonBlockProgress } = await import('../models/lesson-block-progress.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({
    email: 'performance-admin@test.local', password: 'Password123!', role: 'admin',
  });
  const school = await School.create({
    name: 'Performance QA School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'QA Street', phone: '+252610000001', email: 'performance-school@test.local',
    principalName: 'QA Principal', establishedYear: 2020, createdBy: adminUser._id,
  });

  const teacherUser = await User.create({
    email: 'performance-teacher@test.local', password: 'Password123!', role: 'teacher', organizationId: school._id,
  });
  const teacherProfile = await Profile.create({
    user: teacherUser._id, firstName: 'Performance', lastName: 'Teacher', gender: 'male',
  });
  const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id });

  const course = await Course.create({
    title: { en: 'Mathematics Foundations' },
    slug: `performance-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    category: 'mathematics', level: 'beginner', duration: 8, maxStudents: 40,
    school: school._id, teacher: teacher._id, status: 'published',
  });

  const studentUser = await User.create({
    email: 'performance-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id,
  });
  const studentProfile = await Profile.create({
    user: studentUser._id, firstName: 'Amina', lastName: 'Student', gender: 'female',
  });
  const student = await Student.create({
    user: studentUser._id, profile: studentProfile._id, school: school._id, enrolledCourses: [course._id],
  });
  const studentToken = tokenFor(studentUser._id.toString(), 'student', school._id.toString());

  const otherUser = await User.create({
    email: 'performance-other@test.local', password: 'Password123!', role: 'student', organizationId: school._id,
  });
  const otherProfile = await Profile.create({
    user: otherUser._id, firstName: 'Other', lastName: 'Student', gender: 'male',
  });
  await Student.create({
    user: otherUser._id, profile: otherProfile._id, school: school._id, enrolledCourses: [course._id],
  });
  const otherToken = tokenFor(otherUser._id.toString(), 'student', school._id.toString());

  const lessonId = new mongoose.Types.ObjectId();
  const quizId = new mongoose.Types.ObjectId();
  const quizQuestion1Id = new mongoose.Types.ObjectId();
  const quizQuestion2Id = new mongoose.Types.ObjectId();

  await CourseContent.create({
    course: course._id,
    chapters: [{
      title: 'Numbers and Logic', order: 1, status: 'published',
      items: [
        {
          _id: lessonId,
          title: 'Interactive Number Check', type: 'lesson', status: 'published', order: 1, duration: 10,
          deliveryMode: 'interactive_gate', attachments: [],
          contentBlocks: [
            {
              title: 'Counting', order: 0, content: '<p>Counting basics</p>', minReadSeconds: 5,
              questions: [
                { question: 'Which number comes after 1?', type: 'mcq', options: ['1', '2'], correctIndex: 1, explanation: 'Counting moves from 1 to 2.', aiGenerated: false },
                { question: 'Zero is less than one.', type: 'true_false', correctAnswer: true, explanation: '0 is less than 1.', aiGenerated: false },
              ],
            },
          ],
        },
        {
          _id: quizId,
          title: 'Numbers Quiz', type: 'quiz', status: 'published', order: 2, duration: 5, passingScore: 60,
          questions: [
            { _id: quizQuestion1Id, type: 'mcq', question: 'What is 2 + 2?', options: ['3', '4'], correctIndex: 1, points: 2, explanation: '2 + 2 equals 4.' },
            { _id: quizQuestion2Id, type: 'true_false', question: 'Five is less than three.', correctAnswer: false, points: 1, explanation: 'Five is greater than three.' },
          ],
        },
      ],
    }],
  });

  await Progress.create({
    student: student._id, course: course._id, completedLessons: 1, completedQuizzes: 1,
    completedAssignments: 0, totalItems: 2, lastAccessed: new Date(),
  });

  const firstQuizAttempt = await QuizAttempt.create({
    student: student._id,
    course: course._id,
    quizId: quizId.toString(),
    answers: [
      { questionId: quizQuestion1Id.toString(), selectedAnswer: '4', correct: true, points: 2 },
      { questionId: quizQuestion2Id.toString(), selectedAnswer: true, correct: false, points: 0 },
    ],
    score: 2,
    totalPoints: 3,
    percentage: 67,
    passed: true,
    durationSeconds: 90,
    isFirstAttempt: true,
  });
  await QuizAttempt.updateOne({ _id: firstQuizAttempt._id }, { $set: { createdAt: new Date('2026-09-15T09:00:00.000Z') } });

  const secondQuizAttempt = await QuizAttempt.create({
    student: student._id,
    course: course._id,
    quizId: quizId.toString(),
    answers: [
      { questionId: quizQuestion1Id.toString(), selectedAnswer: '4', correct: true, points: 2 },
      { questionId: quizQuestion2Id.toString(), selectedAnswer: false, correct: true, points: 1 },
    ],
    score: 3,
    totalPoints: 3,
    percentage: 100,
    passed: true,
    durationSeconds: 60,
    isFirstAttempt: false,
  });
  await QuizAttempt.updateOne({ _id: secondQuizAttempt._id }, { $set: { createdAt: new Date('2026-09-16T09:00:00.000Z') } });

  const gate = await LessonBlockProgress.create({
    student: student._id,
    course: course._id,
    lessonId,
    unlockedBlockIndex: 0,
    gateCompleted: true,
    attempts: [
      { blockIndex: 0, questionIndex: 0, selectedAnswer: 0, correct: false, attemptedAt: new Date('2026-09-16T08:00:00.000Z'), timeSpentSeconds: 20 },
      { blockIndex: 0, questionIndex: 0, selectedAnswer: 1, correct: true, attemptedAt: new Date('2026-09-16T08:00:30.000Z'), timeSpentSeconds: 10 },
      { blockIndex: 0, questionIndex: 1, selectedAnswer: true, correct: true, attemptedAt: new Date('2026-09-16T08:01:00.000Z'), timeSpentSeconds: 8 },
    ],
  });

  section('PERFORMANCE BY COURSE — latest quiz score and Interactive Gate first-attempt score');
  const performance = await request(app)
    .get('/api/v1/students/my/performance')
    .set('Authorization', `Bearer ${studentToken}`);

  assert(performance.status === 200, `performance request succeeds (status ${performance.status})`);
  assert(performance.body?.data?.courses?.length === 1, 'one enrolled course is returned');
  assert(performance.body?.data?.courses?.[0]?.averageScore === 75, `course average blends latest quiz 100% and gate first-attempt 50% (got ${performance.body?.data?.courses?.[0]?.averageScore})`);

  const activities = performance.body?.data?.activities || [];
  const quizActivity = activities.find((row: any) => row.type === 'quiz');
  const lessonActivity = activities.find((row: any) => row.type === 'interactive_lesson');
  assert(quizActivity?.id === secondQuizAttempt._id.toString(), 'Lesson Activity points at the latest quiz attempt');
  assert(quizActivity?.percentage === 100 && quizActivity?.attempts === 2, `latest quiz shows 100% with 2 attempts (got ${quizActivity?.percentage}% / ${quizActivity?.attempts})`);
  assert(lessonActivity?.score === 1 && lessonActivity?.total === 2 && lessonActivity?.percentage === 50, `Interactive Gate uses first answers only: 1/2 = 50% (got ${lessonActivity?.score}/${lessonActivity?.total}, ${lessonActivity?.percentage}%)`);

  section('QUIZ ATTEMPT DETAILS — answer review and retry history');
  const firstDetail = await request(app)
    .get(`/api/v1/students/my/performance/attempt/quiz/${firstQuizAttempt._id}`)
    .set('Authorization', `Bearer ${studentToken}`);

  assert(firstDetail.status === 200, `first quiz attempt detail succeeds (status ${firstDetail.status})`);
  assert(firstDetail.body?.data?.summary?.attemptNumber === 1 && firstDetail.body?.data?.summary?.totalAttempts === 2, `attempt history reports 1 of 2 (got ${firstDetail.body?.data?.summary?.attemptNumber}/${firstDetail.body?.data?.summary?.totalAttempts})`);
  assert(firstDetail.body?.data?.attemptHistory?.length === 2, 'both quiz retries are available in attempt history');
  const firstQuestions = firstDetail.body?.data?.questions || [];
  assert(firstQuestions.length === 2, 'quiz attempt detail returns both questions');
  assert(firstQuestions[0]?.correct === true && firstQuestions[0]?.correctAnswerDisplay === '4', `correct MCQ answer is reviewable after submission (got ${firstQuestions[0]?.correctAnswerDisplay})`);
  assert(firstQuestions[1]?.correct === false && firstQuestions[1]?.correctAnswerDisplay === 'False', `incorrect True/False answer exposes the correct review answer (got ${firstQuestions[1]?.correctAnswerDisplay})`);

  section('INTERACTIVE LESSON DETAILS — first answer plus retry history');
  const gateDetail = await request(app)
    .get(`/api/v1/students/my/performance/attempt/interactive_lesson/${gate._id}`)
    .set('Authorization', `Bearer ${studentToken}`);

  assert(gateDetail.status === 200, `interactive lesson detail succeeds (status ${gateDetail.status})`);
  assert(gateDetail.body?.data?.summary?.percentage === 50, `interactive summary remains first-attempt 50% (got ${gateDetail.body?.data?.summary?.percentage}%)`);
  const gateQuestions = gateDetail.body?.data?.questions || [];
  assert(gateQuestions.length === 2, 'two Stop & Check questions are returned');
  assert(gateQuestions[0]?.correct === false, 'first Stop & Check preserves the original incorrect first answer');
  assert(gateQuestions[0]?.attempts?.length === 2 && gateQuestions[0]?.attempts?.[1]?.correct === true, 'retry history preserves the later corrected answer');
  assert(gateQuestions[0]?.correctAnswerDisplay === '2', `MCQ correct answer is rendered as option text (got ${gateQuestions[0]?.correctAnswerDisplay})`);

  section('PRIVACY — another student cannot open someone else\'s attempt details');
  const forbiddenQuiz = await request(app)
    .get(`/api/v1/students/my/performance/attempt/quiz/${firstQuizAttempt._id}`)
    .set('Authorization', `Bearer ${otherToken}`);
  const forbiddenGate = await request(app)
    .get(`/api/v1/students/my/performance/attempt/interactive_lesson/${gate._id}`)
    .set('Authorization', `Bearer ${otherToken}`);
  assert(forbiddenQuiz.status === 404, `other student cannot open quiz attempt (status ${forbiddenQuiz.status})`);
  assert(forbiddenGate.status === 404, `other student cannot open interactive attempt (status ${forbiddenGate.status})`);

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
