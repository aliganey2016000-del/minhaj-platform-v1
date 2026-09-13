/**
 * Two related fixes surfaced by "why do some places show '—'":
 *
 * 1. "Deleted course" vs genuinely course-less events. getTimeline/
 *    getAnalytics used to .populate('course', 'title'), which resolves to
 *    `null` BOTH when an event never had a course (login, page views — a
 *    real "—") AND when it references a course that's since been deleted
 *    or recreated (a real gap, but one the admin has no way to tell apart
 *    from #1). Both endpoints now resolve the raw course id by hand so a
 *    dangling reference reports `courseDeleted: true` / "Deleted course"
 *    instead of silently looking identical to "no course at all".
 *
 * 2. Search endpoints across the app built a MongoDB $regex directly from
 *    raw, unescaped user input. A search containing a regex metacharacter
 *    (starting with "+" — any real phone number) crashed the whole
 *    endpoint with a 500 (MongoServerError: Regular expression is
 *    invalid). Fixed everywhere with a shared escapeRegex() utility.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:activity-deleted-course`.
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
  const { default: LearningActivity } = await import('../models/learning-activity.model');
  const { default: LearningSession } = await import('../models/learning-session.model');
  const { default: Progress } = await import('../models/progress.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
  });
  const orgAdminToken = tokenFor(
    (await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id }))._id.toString(),
    'org_admin', school._id.toString()
  );

  const teacherUser = await User.create({ email: 'teacher@test.local', password: 'Password123!', role: 'teacher' });
  const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'Liban', lastName: 'Hassan', gender: 'male' });
  const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id });
  const teacherToken = tokenFor(teacherUser._id.toString(), 'teacher');

  const otherTeacherUser = await User.create({ email: 'teacher2@test.local', password: 'Password123!', role: 'teacher' });
  const otherTeacherProfile = await Profile.create({ user: otherTeacherUser._id, firstName: 'Amina', lastName: 'Yusuf', gender: 'female' });
  const otherTeacher = await Teacher.create({ user: otherTeacherUser._id, profile: otherTeacherProfile._id, school: school._id });

  const liveCourse = await Course.create({
    title: { en: 'Introduction to Politics' }, slug: 'intro-politics-' + new mongoose.Types.ObjectId().toString().slice(-6),
    category: 'islamic-studies', level: 'beginner', duration: 8, maxStudents: 50,
    school: school._id, teacher: teacher._id, status: 'published',
  });
  const otherCourse = await Course.create({
    title: { en: 'Private Mathematics' }, slug: 'private-math-' + new mongoose.Types.ObjectId().toString().slice(-6),
    category: 'mathematics', level: 'beginner', duration: 8, maxStudents: 50,
    school: school._id, teacher: otherTeacher._id, status: 'published',
  });
  // Simulates a course that was deleted/recreated after activity referencing
  // it was already logged — a dangling reference, never actually inserted.
  const deletedCourseId = new mongoose.Types.ObjectId();

  const studentUser = await User.create({ email: 'leyla@test.local', password: 'Password123!', role: 'student' });
  const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'Leyla', lastName: 'Isaaq', gender: 'female' });
  const studentClassId = new mongoose.Types.ObjectId();
  const student = await Student.create({
    user: studentUser._id,
    profile: studentProfile._id,
    school: school._id,
    class: studentClassId,
    enrolledCourses: [liveCourse._id, otherCourse._id],
    enrollmentHistory: [{
      academicYear: '2025-2026',
      class: studentClassId,
      courses: [liveCourse._id],
      status: 'active',
      startedAt: new Date(),
    }],
  });

  await LearningActivity.create({ user: studentUser._id, student: student._id, school: school._id, type: 'login', createdAt: new Date() });
  await LearningActivity.create({ user: studentUser._id, student: student._id, school: school._id, type: 'lesson_view', course: liveCourse._id, lessonId: 'l1', resourceName: 'Lesson 1', durationSeconds: 30, createdAt: new Date() });
  await LearningActivity.create({ user: studentUser._id, student: student._id, school: school._id, type: 'lesson_view', course: otherCourse._id, lessonId: 'private-l1', resourceName: 'Private Lesson', durationSeconds: 900, createdAt: new Date() });
  await LearningActivity.create({ user: studentUser._id, student: student._id, school: school._id, type: 'lesson_view', course: deletedCourseId, lessonId: 'l2', resourceName: 'Lesson 2: Adjectives', durationSeconds: 20, createdAt: new Date() });

  await Progress.create({ student: student._id, course: liveCourse._id, completedLessons: 2, totalItems: 10, status: 'in_progress' });
  await Progress.create({ student: student._id, course: otherCourse._id, completedLessons: 9, totalItems: 10, status: 'in_progress' });
  await Progress.create({ student: student._id, course: deletedCourseId, completedLessons: 1, totalItems: 5, status: 'in_progress' });

  // -------------------------------------------------------------------
  section('TIMELINE — "no course" (login) vs "deleted course" (lesson_view) are distinguishable');
  // -------------------------------------------------------------------
  const timelineRes = await request(app).get(`/api/v1/activity/timeline/${student._id}`).set('Authorization', `Bearer ${orgAdminToken}`);
  assert(timelineRes.status === 200, `request succeeds (status ${timelineRes.status})`);
  const events = timelineRes.body?.data || [];
  const loginEvent = events.find((e: any) => e.type === 'login');
  const liveLessonEvent = events.find((e: any) => e.lessonId === 'l1');
  const deletedLessonEvent = events.find((e: any) => e.lessonId === 'l2');
  assert(loginEvent && loginEvent.course === null && !loginEvent.courseDeleted, `login event: course is null, courseDeleted is falsy (got course=${JSON.stringify(loginEvent?.course)}, courseDeleted=${loginEvent?.courseDeleted})`);
  assert(liveLessonEvent && liveLessonEvent.course?.title?.en === 'Introduction to Politics' && !liveLessonEvent.courseDeleted, `live-course lesson_view resolves the real course name (got ${JSON.stringify(liveLessonEvent?.course)})`);
  assert(deletedLessonEvent && deletedLessonEvent.course === null && deletedLessonEvent.courseDeleted === true, `dangling-course lesson_view reports course=null AND courseDeleted=true, distinguishable from login (got course=${JSON.stringify(deletedLessonEvent?.course)}, courseDeleted=${deletedLessonEvent?.courseDeleted})`);

  // -------------------------------------------------------------------
  section('ANALYTICS — Course Progress distinguishes a live course from a deleted one');
  // -------------------------------------------------------------------
  const analyticsRes = await request(app).get(`/api/v1/activity/analytics/${student._id}`).set('Authorization', `Bearer ${orgAdminToken}`);
  assert(analyticsRes.status === 200, `request succeeds (status ${analyticsRes.status})`);
  const progressRows: any[] = analyticsRes.body?.data?.courseProgress || [];
  assert(progressRows.some((p) => p.course === 'Introduction to Politics'), `live course shows its real title (got ${JSON.stringify(progressRows.map((p) => p.course))})`);
  assert(progressRows.some((p) => p.course === 'Deleted course'), `dangling course shows "Deleted course", not the generic "Unknown" (got ${JSON.stringify(progressRows.map((p) => p.course))})`);

  const courseAnalyticsRes = await request(app).get(`/api/v1/activity/course-analytics/${student._id}`).set('Authorization', `Bearer ${orgAdminToken}`);
  assert(courseAnalyticsRes.status === 200, `course analytics request succeeds (status ${courseAnalyticsRes.status})`);
  const courseAnalytics = courseAnalyticsRes.body?.data || {};
  assert(courseAnalytics.averageScore === null, `overall average score is null when there are zero quiz attempts (got ${courseAnalytics.averageScore})`);
  assert(courseAnalytics.courses?.[0]?.averageScore === null, `course average score is null when there are zero quiz attempts (got ${courseAnalytics.courses?.[0]?.averageScore})`);

  // -------------------------------------------------------------------
  section('TEACHER PRIVACY — shared student data stays inside the teacher’s own courses');
  // -------------------------------------------------------------------
  const teacherTimeline = await request(app).get(`/api/v1/activity/timeline/${student._id}`).set('Authorization', `Bearer ${teacherToken}`);
  const teacherEvents: any[] = teacherTimeline.body?.data || [];
  assert(teacherTimeline.status === 200, `teacher timeline succeeds (status ${teacherTimeline.status})`);
  assert(teacherEvents.some((e) => e.lessonId === 'l1'), 'teacher sees activity from their own course');
  assert(!teacherEvents.some((e) => e.lessonId === 'private-l1'), 'teacher cannot see another teacher’s course activity');
  assert(!teacherEvents.some((e) => e.type === 'login'), 'teacher does not receive student-wide course-less events');

  const teacherAnalytics = await request(app).get(`/api/v1/activity/analytics/${student._id}`).set('Authorization', `Bearer ${teacherToken}`);
  assert(teacherAnalytics.status === 200, `teacher analytics succeeds (status ${teacherAnalytics.status})`);
  assert(teacherAnalytics.body?.data?.totalDurationSeconds === 30, `teacher duration excludes other teacher’s 900 seconds (got ${teacherAnalytics.body?.data?.totalDurationSeconds})`);
  assert((teacherAnalytics.body?.data?.courseProgress || []).length === 1, `teacher progress contains exactly their one course (got ${(teacherAnalytics.body?.data?.courseProgress || []).length})`);

  const teacherCourseAnalytics = await request(app).get(`/api/v1/activity/course-analytics/${student._id}`).set('Authorization', `Bearer ${teacherToken}`);
  const teacherCourses: any[] = teacherCourseAnalytics.body?.data?.courses || [];
  assert(teacherCourses.length === 1 && teacherCourses[0]?.courseId === liveCourse._id.toString(), `teacher course analytics exposes only their course (got ${JSON.stringify(teacherCourses.map((c) => c.courseId))})`);

  const now = new Date();
  await LearningSession.create({
    clientSessionId: 'teacher-visible-session', user: studentUser._id, student: student._id, school: school._id,
    kind: 'lesson', course: liveCourse._id, startedAt: now, lastHeartbeatAt: now, activeSeconds: 60,
    idleSeconds: 0, watchSeconds: 0, status: 'ended',
  });
  await LearningSession.create({
    clientSessionId: 'teacher-hidden-session', user: studentUser._id, student: student._id, school: school._id,
    kind: 'lesson', course: otherCourse._id, startedAt: now, lastHeartbeatAt: now, activeSeconds: 600,
    idleSeconds: 0, watchSeconds: 0, status: 'ended',
  });
  const teacherSessions = await request(app).get(`/api/v1/activity/session-analytics/${student._id}`).query({ datePreset: 'last7' }).set('Authorization', `Bearer ${teacherToken}`);
  assert(teacherSessions.status === 200, `teacher session analytics succeeds (status ${teacherSessions.status})`);
  assert(teacherSessions.body?.data?.totalActiveSeconds === 60, `teacher sessions exclude other teacher’s 600 seconds (got ${teacherSessions.body?.data?.totalActiveSeconds})`);

  // -------------------------------------------------------------------
  section('REGEX SAFETY — a "+"-containing search no longer 500s across the fixed endpoints');
  // -------------------------------------------------------------------
  const timelineSearchRes = await request(app).get(`/api/v1/activity/timeline/${student._id}`).query({ search: '+252 61 234 5678' }).set('Authorization', `Bearer ${orgAdminToken}`);
  assert(timelineSearchRes.status === 200, `activity timeline search with "+" doesn't 500 (status ${timelineSearchRes.status})`);

  const rosterSearchRes = await request(app).get('/api/v1/activity/roster').query({ search: '+1(555)' }).set('Authorization', `Bearer ${orgAdminToken}`);
  assert(rosterSearchRes.status === 200, `activity roster search with regex metacharacters doesn't 500 (status ${rosterSearchRes.status})`);

  const coursesSearchRes = await request(app).get('/api/v1/courses').query({ search: 'C++' }).set('Authorization', `Bearer ${orgAdminToken}`);
  assert(coursesSearchRes.status === 200, `public course search with "++" doesn't 500 (status ${coursesSearchRes.status})`);

  const feeStructureSearchRes = await request(app).get('/api/v1/fee-structures').query({ search: 'Tuition (2026)' }).set('Authorization', `Bearer ${orgAdminToken}`);
  assert(feeStructureSearchRes.status === 200, `fee structure search with parentheses doesn't 500 (status ${feeStructureSearchRes.status})`);

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
