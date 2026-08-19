/**
 * Interactive Gate accuracy reporting — end-to-end verification.
 *
 * Runs the REAL Express app (full middleware chain: auth, role guards,
 * tenant scoping) against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:gate-report`.
 *
 * Covers: first-attempt-only accuracy (retries don't inflate it), the
 * per-lesson and per-student breakdowns, the course-list accuracy summary,
 * and access control (unauthenticated, unrelated teacher, cross-org admin).
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
  const { default: CourseContent } = await import('../models/course-content.model');
  const { default: Student } = await import('../models/student.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const adminToken = tokenFor(adminUser._id.toString(), 'admin');

  const school = await School.create({
    name: 'Test School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '123 St', phone: '+000', email: 'school@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: adminUser._id,
  });
  const school2 = await School.create({
    name: 'Other School', organizationType: 'private', country: 'Somalia', city: 'Hargeisa',
    address: '456 St', phone: '+001', email: 'school2@test.local', principalName: 'Principal 2',
    establishedYear: 2021, createdBy: adminUser._id,
  });

  const teacherUser = await User.create({ email: 'teacher@test.local', password: 'Password123!', role: 'teacher' });
  const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'Liban', lastName: 'Hassan', gender: 'male' });
  const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id });
  const teacherToken = tokenFor(teacherUser._id.toString(), 'teacher');

  const otherTeacherUser = await User.create({ email: 'other-teacher@test.local', password: 'Password123!', role: 'teacher' });
  const otherTeacherProfile = await Profile.create({ user: otherTeacherUser._id, firstName: 'Amina', lastName: 'Yusuf', gender: 'female' });
  await Teacher.create({ user: otherTeacherUser._id, profile: otherTeacherProfile._id, school: school._id });
  const otherTeacherToken = tokenFor(otherTeacherUser._id.toString(), 'teacher');

  const orgAdminUser = await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
  const orgAdminToken = tokenFor(orgAdminUser._id.toString(), 'org_admin', school._id.toString());

  const otherOrgAdminUser = await User.create({ email: 'orgadmin2@test.local', password: 'Password123!', role: 'org_admin', organizationId: school2._id });
  const otherOrgAdminToken = tokenFor(otherOrgAdminUser._id.toString(), 'org_admin', school2._id.toString());

  const course = await Course.create({
    title: { en: 'Matn Safiinat An-Najaah' }, slug: 'matn-safiinat-an-najaah-' + new mongoose.Types.ObjectId().toString().slice(-6),
    category: 'islamic-studies', level: 'beginner', duration: 8, maxStudents: 50,
    school: school._id, teacher: teacher._id, status: 'published',
  });

  async function makeStudent(firstName: string) {
    const u = await User.create({ email: `${new mongoose.Types.ObjectId()}@test.local`, password: 'Password123!', role: 'student' });
    const p = await Profile.create({ user: u._id, firstName, lastName: 'Student', gender: 'male' });
    const s = await Student.create({ user: u._id, profile: p._id, school: school._id, enrolledCourses: [course._id] });
    return { user: u, profile: p, student: s, token: tokenFor(u._id.toString(), 'student', school._id.toString()) };
  }

  const layla = await makeStudent('Layla'); // gets everything right first try
  const yusuf = await makeStudent('Yusuf'); // wrong first try, then retries correct

  // -------------------------------------------------------------------
  section('SEED — Interactive Gate lesson with two Stop & Check blocks');
  // -------------------------------------------------------------------
  const lessonId = new mongoose.Types.ObjectId();
  const content = await CourseContent.create({
    course: course._id,
    chapters: [
      {
        title: 'Chapter 1: Foundations', order: 0, status: 'published',
        items: [
          {
            _id: lessonId,
            title: 'Lesson 1: Usul al-Din', type: 'lesson', status: 'published',
            deliveryMode: 'interactive_gate', order: 0, duration: 10, attachments: [],
            contentBlocks: [
              {
                _id: new mongoose.Types.ObjectId(), order: 0, content: '<p>The five pillars...</p>', minReadSeconds: 5,
                questions: [{ question: 'How many pillars?', type: 'mcq', options: ['3', '4', '5', '6'], correctIndex: 2, aiGenerated: false }],
              },
              {
                _id: new mongoose.Types.ObjectId(), order: 1, content: '<p>Second passage...</p>', minReadSeconds: 5,
                questions: [{ question: 'True or false: prayer is a pillar.', type: 'true_false', correctAnswer: true, aiGenerated: false }],
              },
            ],
          },
        ],
      },
    ],
  });
  assert(!!content, 'CourseContent seeded with a 2-block Interactive Gate lesson');

  async function answer(token: string, blockIndex: number, ans: unknown) {
    return request(app)
      .post(`/api/v1/courses/${course._id}/lessons/${lessonId}/gate/blocks/${blockIndex}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answer: ans, questionIndex: 0 });
  }

  // Layla: correct on the first try, both blocks.
  const laylaB0 = await answer(layla.token, 0, 2);
  assert(laylaB0.status === 200 && laylaB0.body?.data?.correct === true, `Layla block 0 first try correct (status ${laylaB0.status})`);
  const laylaB1 = await answer(layla.token, 1, true);
  assert(laylaB1.status === 200 && laylaB1.body?.data?.gateCompleted === true, `Layla clears the gate on block 1 first try (gateCompleted=true)`);

  // Yusuf: wrong on block 0's first attempt, correct on retry; correct
  // immediately on block 1 — first-attempt accuracy should reflect the miss.
  const yusufB0wrong = await answer(yusuf.token, 0, 0);
  assert(yusufB0wrong.status === 200 && yusufB0wrong.body?.data?.correct === false, `Yusuf block 0 first attempt is WRONG (status ${yusufB0wrong.status})`);
  const yusufB0retry = await answer(yusuf.token, 0, 2);
  assert(yusufB0retry.status === 200 && yusufB0retry.body?.data?.correct === true, `Yusuf block 0 retry is correct`);
  const yusufB1 = await answer(yusuf.token, 1, true);
  assert(yusufB1.status === 200 && yusufB1.body?.data?.gateCompleted === true, `Yusuf clears the gate on block 1 first try`);

  // -------------------------------------------------------------------
  section('ROUTE-LEVEL AUTHORIZATION — /courses/:id/gate-report');
  // -------------------------------------------------------------------
  const noAuth = await request(app).get(`/api/v1/courses/${course._id}/gate-report`);
  assert(noAuth.status === 401, `no token -> 401 (got ${noAuth.status})`);

  const studentAttempt = await request(app).get(`/api/v1/courses/${course._id}/gate-report`).set('Authorization', `Bearer ${layla.token}`);
  assert(studentAttempt.status === 403, `student role -> 403 (got ${studentAttempt.status})`);

  const unrelatedTeacher = await request(app).get(`/api/v1/courses/${course._id}/gate-report`).set('Authorization', `Bearer ${otherTeacherToken}`);
  assert(unrelatedTeacher.status === 403, `teacher NOT assigned to this course -> 403 (got ${unrelatedTeacher.status})`);

  const crossOrgAdmin = await request(app).get(`/api/v1/courses/${course._id}/gate-report`).set('Authorization', `Bearer ${otherOrgAdminToken}`);
  assert(crossOrgAdmin.status === 403, `org_admin from a different organization -> 403 (got ${crossOrgAdmin.status})`);

  // -------------------------------------------------------------------
  section('REPORT CONTENTS — first-attempt accuracy, not retry-inflated');
  // -------------------------------------------------------------------
  const report = await request(app).get(`/api/v1/courses/${course._id}/gate-report`).set('Authorization', `Bearer ${teacherToken}`);
  assert(report.status === 200, `assigned teacher can view the report (status ${report.status})`);
  const data = report.body?.data;

  assert(data?.studentsCount === 2, `studentsCount === 2 (got ${data?.studentsCount})`);
  // 2 students x 2 questions = 4 first-attempt rows; 3 correct on the first
  // try (Layla x2, Yusuf's block 1), 1 wrong (Yusuf's block 0 first attempt).
  assert(data?.totalQuestionsAttempted === 4, `totalQuestionsAttempted === 4 (got ${data?.totalQuestionsAttempted})`);
  assert(data?.overallFirstAttemptAccuracy === 75, `overall first-attempt accuracy === 75% — 3 of 4 correct on first try (got ${data?.overallFirstAttemptAccuracy})`);
  // Total attempts counts the retry too: Layla 2 + Yusuf 3 (wrong + retry + block1) = 5.
  assert(data?.totalAttempts === 5, `totalAttempts === 5 — includes Yusuf's retry (got ${data?.totalAttempts})`);

  const yusufRow = data?.perStudent?.find((s: any) => s.name === 'Yusuf Student');
  assert(!!yusufRow, 'Yusuf appears in perStudent');
  assert(yusufRow?.firstAttemptAccuracy === 50, `Yusuf's first-attempt accuracy is 50% (1 of 2), NOT 100% despite eventually clearing both blocks (got ${yusufRow?.firstAttemptAccuracy})`);
  assert(yusufRow?.totalAttempts === 3, `Yusuf's totalAttempts is 3 (2 on block 0 + 1 on block 1) (got ${yusufRow?.totalAttempts})`);
  assert(yusufRow?.lessonsCompleted === 1, `Yusuf's lessonsCompleted === 1 (got ${yusufRow?.lessonsCompleted})`);

  const laylaRow = data?.perStudent?.find((s: any) => s.name === 'Layla Student');
  assert(laylaRow?.firstAttemptAccuracy === 100, `Layla's first-attempt accuracy is 100% (got ${laylaRow?.firstAttemptAccuracy})`);
  assert(laylaRow?.totalAttempts === 2, `Layla's totalAttempts is 2 — no retries (got ${laylaRow?.totalAttempts})`);

  assert(data?.perLesson?.length === 1, `perLesson has exactly 1 lesson (got ${data?.perLesson?.length})`);
  const lessonRow = data?.perLesson?.[0];
  assert(lessonRow?.lessonTitle === 'Lesson 1: Usul al-Din', `perLesson has the correct lesson title (got "${lessonRow?.lessonTitle}")`);
  assert(lessonRow?.studentsAttempted === 2, `perLesson.studentsAttempted === 2 (got ${lessonRow?.studentsAttempted})`);

  // Global admin (unscoped) can also see it.
  const adminReport = await request(app).get(`/api/v1/courses/${course._id}/gate-report`).set('Authorization', `Bearer ${adminToken}`);
  assert(adminReport.status === 200 && adminReport.body?.data?.studentsCount === 2, `global admin can view the report too (status ${adminReport.status})`);

  // org_admin from the SAME org can also see it.
  const orgAdminReport = await request(app).get(`/api/v1/courses/${course._id}/gate-report`).set('Authorization', `Bearer ${orgAdminToken}`);
  assert(orgAdminReport.status === 200, `same-org org_admin can view the report (status ${orgAdminReport.status})`);

  // -------------------------------------------------------------------
  section('COURSE-LIST ACCURACY SUMMARY — /courses/gate-accuracy-summary');
  // -------------------------------------------------------------------
  const summary = await request(app).get('/api/v1/courses/gate-accuracy-summary').set('Authorization', `Bearer ${teacherToken}`);
  assert(summary.status === 200, `teacher can fetch the summary (status ${summary.status})`);
  const row = summary.body?.data?.find((r: any) => r.courseId === course._id.toString());
  assert(!!row, 'summary includes this course');
  assert(row?.firstAttemptAccuracy === 75, `summary row accuracy matches the detailed report (75%, got ${row?.firstAttemptAccuracy})`);

  const otherTeacherSummary = await request(app).get('/api/v1/courses/gate-accuracy-summary').set('Authorization', `Bearer ${otherTeacherToken}`);
  assert(otherTeacherSummary.status === 200 && (otherTeacherSummary.body?.data || []).length === 0, `teacher with no assigned courses gets an empty summary (got ${JSON.stringify(otherTeacherSummary.body?.data)})`);

  const crossOrgSummary = await request(app).get('/api/v1/courses/gate-accuracy-summary').set('Authorization', `Bearer ${otherOrgAdminToken}`);
  assert(crossOrgSummary.status === 200 && (crossOrgSummary.body?.data || []).length === 0, `org_admin from a different org sees no rows for this course (got ${JSON.stringify(crossOrgSummary.body?.data)})`);

  // -------------------------------------------------------------------
  section('STUDENT ACTIVITY INTEGRATION — Gate answers now logged + blended into Avg Quiz Score');
  // -------------------------------------------------------------------
  const roster = await request(app).get('/api/v1/activity/roster').set('Authorization', `Bearer ${teacherToken}`);
  assert(roster.status === 200, `teacher can fetch the roster (status ${roster.status})`);
  const rosterRows = roster.body?.data || [];
  const yusufRoster = rosterRows.find((r: any) => r._id === yusuf.student._id.toString());
  const laylaRoster = rosterRows.find((r: any) => r._id === layla.student._id.toString());
  assert(yusufRoster?.avgQuizScore === 50, `roster: Yusuf's avgQuizScore is 50 (blended from Gate first-attempt, no traditional QuizAttempts exist) (got ${yusufRoster?.avgQuizScore})`);
  assert(yusufRoster?.quizAttempts === 2, `roster: Yusuf's quizAttempts is 2 (his 2 distinct gate questions) (got ${yusufRoster?.quizAttempts})`);
  assert(laylaRoster?.avgQuizScore === 100, `roster: Layla's avgQuizScore is 100 (got ${laylaRoster?.avgQuizScore})`);

  const yusufAnalytics = await request(app).get(`/api/v1/activity/analytics/${yusuf.student._id}`).set('Authorization', `Bearer ${teacherToken}`);
  assert(yusufAnalytics.status === 200, `teacher can fetch Yusuf's analytics (status ${yusufAnalytics.status})`);
  assert(yusufAnalytics.body?.data?.avgQuizScore === 50, `analytics: Yusuf's avgQuizScore is 50 (got ${yusufAnalytics.body?.data?.avgQuizScore})`);
  assert(yusufAnalytics.body?.data?.quizAttempts === 2, `analytics: Yusuf's quizAttempts is 2 (got ${yusufAnalytics.body?.data?.quizAttempts})`);

  const yusufTimeline = await request(app).get(`/api/v1/activity/timeline/${yusuf.student._id}`).set('Authorization', `Bearer ${teacherToken}`);
  assert(yusufTimeline.status === 200, `teacher can fetch Yusuf's timeline (status ${yusufTimeline.status})`);
  const gateEvents = (yusufTimeline.body?.data || []).filter((e: any) => e.type === 'quiz_attempt' && e.metadata?.source === 'interactive_gate');
  // Every submit call logs one event, including the wrong first attempt AND the retry — 3 total for Yusuf (wrong, retry, block 1).
  assert(gateEvents.length === 3, `timeline: all 3 of Yusuf's gate answer submissions (incl. the wrong one and the retry) are logged (got ${gateEvents.length})`);
  assert(gateEvents.some((e: any) => e.status === 'failed'), 'timeline: the wrong first attempt is logged with status=failed');

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
