/**
 * Gamification integrity regression (round 8, 2026-10-04).
 *
 * 1  Quiz XP/completedQuizzes race: quiz.controller.ts's submitAttempt used
 *    to decide `isFirstAttempt` with `!(await QuizAttempt.exists(...))`,
 *    checked before the matching `QuizAttempt.create(...)` landed — a
 *    check-then-act race. Two concurrent submissions of the same quiz must
 *    now award gamification XP / Progress.completedQuizzes exactly once
 *    between them, via the atomic QuizFirstAttemptClaim upsert.
 * 2  Lesson-completion XP must not be farmable by replaying
 *    POST /gamification/complete-lesson for the same (course, lesson):
 *    calling it twice for the identical lesson only awards XP once.
 * 3  The self-service POST /gamification/xp endpoint (any authenticated
 *    student could award themselves an arbitrary amount of XP under an
 *    arbitrary "source", unbounded and uncapped) has been removed — the
 *    route must now 404.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';

import request from 'supertest';
import mongoose from 'mongoose';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('gamification-integrity');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Course } = await import('../models/course.model');
    const { default: CourseContent } = await import('../models/course-content.model');
    const { default: Progress } = await import('../models/progress.model');
    const { default: Gamification } = await import('../models/gamification.model');
    const { default: QuizAttempt } = await import('../models/quiz-attempt.model');

    const token = (user: any) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions: [],
      organizationId: user.organizationId ? user.organizationId.toString() : undefined,
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const admin = await User.create({ email: 'gam-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Gamification Integrity School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St',
      phone: '+000', email: 'gam@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });

    const course = await Course.create({
      title: { en: 'Gamification Course' },
      slug: `gamification-course-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
      category: 'general', level: 'beginner', duration: 4, maxStudents: 20,
    });

    const quizItemId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const lessonItemId = new mongoose.Types.ObjectId();
    await CourseContent.create({
      course: course._id,
      chapters: [{
        title: 'Chapter 1', order: 1, status: 'published',
        items: [
          { _id: lessonItemId, title: 'Lesson 1', type: 'lesson', order: 1, status: 'published', duration: 10 },
          {
            _id: quizItemId, title: 'Quiz 1', type: 'quiz', order: 2, status: 'published', duration: 5,
            passingScore: 60,
            // awardQuizXP's percentage is score/totalQuestions (see
            // quiz.controller.ts/gamification.controller.ts), so this fixture
            // uses the default 1 point/question to keep that ratio meaningful.
            questions: [{ _id: questionId, type: 'mcq', question: '2+2?', options: ['4', '5'], correctIndex: 0 }],
          },
        ],
      }],
    });

    const studentUser = await User.create({ email: 'gam-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
    const profile = await Profile.create({ user: studentUser._id, firstName: 'Gam', lastName: 'Student', gender: 'male' });
    const student = await Student.create({
      user: studentUser._id, profile: profile._id, school: school._id, status: 'active', approvalStatus: 'approved',
      enrolledCourses: [course._id],
    });
    const studentToken = token(studentUser);

    section('1: concurrent quiz-attempt submissions award XP/completedQuizzes exactly once');
    const submitOnce = () => request(app)
      .post('/api/v1/quizzes/submit-attempt')
      .set(auth(studentToken))
      .send({ courseId: course._id.toString(), quizId: quizItemId.toString(), answers: [{ questionId: questionId.toString(), answer: '4' }], durationSeconds: 30 });

    const [respA, respB] = await Promise.all([submitOnce(), submitOnce()]);
    assert(respA.status === 200 && respB.status === 200, `both concurrent submissions succeed (got ${respA.status}, ${respB.status})`);

    const attemptCount = await QuizAttempt.countDocuments({ student: student._id, quizId: quizItemId.toString() });
    assert(attemptCount === 2, `both attempts are still recorded individually (found ${attemptCount})`);

    const firstAttemptCount = await QuizAttempt.countDocuments({ student: student._id, quizId: quizItemId.toString(), isFirstAttempt: true });
    assert(firstAttemptCount === 1, `exactly one of the two attempts is flagged isFirstAttempt (found ${firstAttemptCount})`);

    const progressAfterQuiz: any = await Progress.findOne({ student: student._id, course: course._id }).lean();
    assert(progressAfterQuiz?.completedQuizzes === 1, `Progress.completedQuizzes incremented exactly once (got ${progressAfterQuiz?.completedQuizzes})`);

    const gamAfterQuiz: any = await Gamification.findOne({ student: student._id }).lean();
    // Perfect score (10/10) is worth 40 XP — must be awarded exactly once, not twice.
    assert(gamAfterQuiz?.xp === 40, `gamification XP awarded exactly once for the perfect quiz (got ${gamAfterQuiz?.xp})`);
    assert(gamAfterQuiz?.totalQuizzesCompleted === 1, `totalQuizzesCompleted incremented exactly once (got ${gamAfterQuiz?.totalQuizzesCompleted})`);

    section('1b: a later, genuinely new attempt at the same quiz is not treated as first again');
    await submitOnce();
    const gamAfterRetry: any = await Gamification.findOne({ student: student._id }).lean();
    assert(gamAfterRetry?.totalQuizzesCompleted === 1, `a third (retry) submission does not re-award totalQuizzesCompleted (got ${gamAfterRetry?.totalQuizzesCompleted})`);
    assert(gamAfterRetry?.xp === 40, `a third (retry) submission does not re-award XP (got ${gamAfterRetry?.xp})`);

    section('2: replaying complete-lesson for the same lesson does not farm XP');
    const completeLessonOnce = () => request(app)
      .post('/api/v1/gamification/complete-lesson')
      .set(auth(studentToken))
      .send({ timeSpentSeconds: 20, courseId: course._id.toString(), lessonId: lessonItemId.toString() });

    const lessonResp1 = await completeLessonOnce();
    assert(lessonResp1.status === 200, `first complete-lesson call succeeds (got ${lessonResp1.status})`);
    const gamAfterLesson1: any = await Gamification.findOne({ student: student._id }).lean();
    assert(gamAfterLesson1?.totalLessonsCompleted === 1, `first call increments totalLessonsCompleted (got ${gamAfterLesson1?.totalLessonsCompleted})`);
    const xpAfterLesson1 = gamAfterLesson1?.xp;

    const lessonResp2 = await completeLessonOnce();
    assert(lessonResp2.status === 200, `replayed complete-lesson call still succeeds (got ${lessonResp2.status})`);
    assert(lessonResp2.body?.data?.alreadyAwarded === true, 'replayed call reports alreadyAwarded: true');
    const gamAfterLesson2: any = await Gamification.findOne({ student: student._id }).lean();
    assert(gamAfterLesson2?.totalLessonsCompleted === 1, `replayed call does not re-increment totalLessonsCompleted (got ${gamAfterLesson2?.totalLessonsCompleted})`);
    assert(gamAfterLesson2?.xp === xpAfterLesson1, `replayed call does not re-award XP (xp stayed at ${gamAfterLesson2?.xp})`);

    const lessonResp3 = await completeLessonOnce();
    const gamAfterLesson3: any = await Gamification.findOne({ student: student._id }).lean();
    assert(lessonResp3.status === 200 && gamAfterLesson3?.totalLessonsCompleted === 1, 'a third replay still does not re-award');

    section('3: the self-service XP-injection endpoint is gone');
    const xpResp = await request(app)
      .post('/api/v1/gamification/xp')
      .set(auth(studentToken))
      .send({ amount: 999999, source: 'totally legitimate', description: 'trust me' });
    assert(xpResp.status === 404, `POST /gamification/xp no longer exists (got ${xpResp.status})`);
    const gamAfterXpAttempt: any = await Gamification.findOne({ student: student._id }).lean();
    assert(gamAfterXpAttempt?.xp === gamAfterLesson3?.xp, 'no XP was added by the removed self-service endpoint');

    console.log(`\n${'='.repeat(60)}`);
    if (failures === 0) console.log('ALL CHECKS PASSED (0 failures)');
    else console.log(`${failures} CHECK(S) FAILED`);
    console.log('='.repeat(60));
  } finally {
    await db.stop();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('FATAL ERROR:', error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
