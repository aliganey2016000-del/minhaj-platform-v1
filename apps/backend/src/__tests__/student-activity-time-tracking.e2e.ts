/**
 * Student Activity — every activity states an exact time span, and time spent
 * anywhere in the app is actually counted.
 *
 * Reported directly, with screenshots of the Student Activity page: sign-ins
 * came back as "Signed in, no activity recorded", whole days as "Time not
 * recorded", and the header's total duration (113h) bore no relation to the
 * active study it reported (20h).
 *
 * Two causes, both covered here:
 *
 * 1. Time was only ever recorded on the lesson player route. The tracker
 *    returned early on every other student screen, so a sign-in spent on the
 *    dashboard, assignments, the schedule or a quiz produced no session at
 *    all — not a short one, none — and the day it happened on had nothing to
 *    show. A 'page' session kind now covers those screens. The server side of
 *    that is asserted here: a page session is accepted, heartbeats into it
 *    accrue active time, and its seconds reach the analytics the page reads.
 *
 * 2. An event carried only `createdAt` — the moment it reached the server,
 *    which for anything with a duration is its END. Nothing recorded when an
 *    activity began, so "start, end and duration" could not be stated for any
 *    of them. Events now carry an explicit span, either as reported by the
 *    client or derived once at write time, and this pins down every case:
 *    a full span, a duration alone, an instant, and the two ways a wrong
 *    device clock could otherwise write nonsense (an end before its start,
 *    or a span in the future).
 *
 * Also covered: a course scope (what a teacher sees) must not silently drop
 * the sessions that belong to no course — that is most of the day.
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
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { resolveActivitySpan } = await import('../utils/learning-activity-logger');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Teacher } = await import('../models/teacher.model');
  const { default: Course } = await import('../models/course.model');
  const { default: Student } = await import('../models/student.model');
  const { default: LearningSession } = await import('../models/learning-session.model');

  const tokenFor = (userId: string, role: string, organizationId?: string) =>
    generateAccessToken({ userId, role, permissions: [], organizationId });

  const adminUser = await User.create({ email: 'activity-admin@test.local', password: 'Password123!', role: 'admin' });
  const adminToken = tokenFor(adminUser._id.toString(), 'admin');
  const school = await School.create({
    name: 'Activity Tracking School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Road', phone: '+252611240000', email: 'activity-school@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: adminUser._id,
  });

  const teacherUser = await User.create({ email: 'activity-teacher@test.local', password: 'Password123!', role: 'teacher' });
  const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'Faarax', lastName: 'Nuur', gender: 'male' });
  const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id });
  const teacherToken = tokenFor(teacherUser._id.toString(), 'teacher');

  const course = await Course.create({
    title: { en: 'English G 10' }, slug: `english-g10-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    category: 'general', level: 'beginner', duration: 8, maxStudents: 40,
    school: school._id, teacher: teacher._id, status: 'published',
  });

  const studentUser = await User.create({ email: 'activity-student@test.local', password: 'Password123!', role: 'student' });
  const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'Abdiqadir', lastName: 'Ali', gender: 'male' });
  const student = await Student.create({
    user: studentUser._id, profile: studentProfile._id, school: school._id,
    status: 'active', approvalStatus: 'approved', enrolledCourses: [course._id], enrollmentHistory: [],
  });
  const studentToken = tokenFor(studentUser._id.toString(), 'student');

  section('PAGE TIME — a screen that is not a lesson is still tracked');
  const pageStart = await request(app)
    .post('/api/v1/activity/session/start')
    .set('Authorization', `Bearer ${studentToken}`)
    .set('X-Login-Session-Id', 'login-1')
    .send({ clientSessionId: 'page-session-1', kind: 'page', resourceName: 'Assignments', metadata: { path: '/student/assignments' } });
  assert(pageStart.status === 200, `a 'page' session is accepted (status ${pageStart.status})`);
  assert(pageStart.body?.data?.kind === 'page', `the session records what it is (got ${pageStart.body?.data?.kind})`);
  assert(pageStart.body?.data?.loginSessionId === 'login-1', 'the page session is filed under the sign-in it happened in');

  // Backdate the heartbeat clock so the next beat measures a real, known gap
  // instead of the handful of milliseconds this test actually takes.
  await LearningSession.updateOne(
    { clientSessionId: 'page-session-1' },
    { $set: { lastHeartbeatAt: new Date(Date.now() - 30_000) } },
  );
  const beat = await request(app)
    .post('/api/v1/activity/session/heartbeat')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ clientSessionId: 'page-session-1', active: true });
  assert(beat.status === 200, `heartbeat into a page session succeeds (status ${beat.status})`);
  assert(beat.body?.data?.activeSeconds >= 29 && beat.body?.data?.activeSeconds <= 31, `the 30s gap is banked as active time (got ${beat.body?.data?.activeSeconds}s)`);

  const pageEnd = await request(app)
    .post('/api/v1/activity/session/end')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ clientSessionId: 'page-session-1', active: true });
  assert(pageEnd.status === 200 && pageEnd.body?.data?.status === 'ended', 'the page session closes cleanly');
  assert(Boolean(pageEnd.body?.data?.endedAt), 'the page session records when it ended');

  section('ANALYTICS — page time reaches the figures the admin page reads');
  const adminSessions = await request(app)
    .get(`/api/v1/activity/session-analytics/${student._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminSessions.status === 200, `session analytics succeeds (status ${adminSessions.status})`);
  assert(adminSessions.body?.data?.totalActiveSeconds >= 29, `page time counts towards active study (got ${adminSessions.body?.data?.totalActiveSeconds}s)`);
  assert((adminSessions.body?.data?.byKind || []).some((k: any) => k.kind === 'page'), 'page time is reported as its own kind, not folded into lessons');
  assert((adminSessions.body?.data?.daily || []).length > 0, 'the day it happened on reports time rather than reading as empty');

  // A teacher is scoped to their own courses. A page session names no course
  // at all, so scoping it away would blank out most of a student's day.
  const teacherSessions = await request(app)
    .get(`/api/v1/activity/session-analytics/${student._id}`)
    .set('Authorization', `Bearer ${teacherToken}`);
  assert(teacherSessions.status === 200, `teacher session analytics succeeds (status ${teacherSessions.status})`);
  assert(teacherSessions.body?.data?.totalActiveSeconds >= 29, `a course scope does not swallow course-less page time (got ${teacherSessions.body?.data?.totalActiveSeconds}s)`);

  section('EVENT SPANS — start, end and duration for every activity');
  const visitStart = new Date(Date.now() - 5 * 60_000);
  const visitEnd = new Date(Date.now() - 2 * 60_000);
  const reported = await request(app)
    .post('/api/v1/activity/event')
    .set('Authorization', `Bearer ${studentToken}`)
    .set('X-Login-Session-Id', 'login-1')
    .send({ type: 'page_view', resourceName: 'My Schedule', startedAt: visitStart.toISOString(), endedAt: visitEnd.toISOString() });
  assert(reported.status === 200, `an event reporting its own span is accepted (status ${reported.status})`);

  const durationOnly = await request(app)
    .post('/api/v1/activity/event')
    .set('Authorization', `Bearer ${studentToken}`)
    .set('X-Login-Session-Id', 'login-1')
    .send({ type: 'lesson_view', course: course._id.toString(), resourceName: 'Unit 1', durationSeconds: 90 });
  assert(durationOnly.status === 200, `an event reporting only a duration is accepted (status ${durationOnly.status})`);

  const timeline = await request(app)
    .get(`/api/v1/activity/timeline/${student._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  const rows: any[] = timeline.body?.data || [];
  const visit = rows.find((e) => e.resourceName === 'My Schedule');
  assert(Boolean(visit), 'the visited page appears in the timeline');
  assert(new Date(visit?.startedAt).getTime() === visitStart.getTime(), `the visit keeps the exact start it reported (got ${visit?.startedAt})`);
  assert(new Date(visit?.endedAt).getTime() === visitEnd.getTime(), `the visit keeps the exact end it reported (got ${visit?.endedAt})`);
  assert(visit?.durationSeconds === 180, `duration is the span itself, not a separately-claimed number (got ${visit?.durationSeconds})`);

  const lessonView = rows.find((e) => e.resourceName === 'Unit 1');
  assert(Boolean(lessonView?.startedAt && lessonView?.endedAt), 'an event that reported only a duration still gets a real start and end');
  assert(lessonView?.durationSeconds === 90, `its duration is preserved (got ${lessonView?.durationSeconds})`);
  assert(
    Math.abs(new Date(lessonView?.endedAt).getTime() - new Date(lessonView?.startedAt).getTime() - 90_000) < 1000,
    'its derived start sits exactly one duration before its end',
  );

  section('SPAN RESOLUTION — a wrong device clock cannot write nonsense');
  const now = new Date('2026-09-16T10:00:00.000Z');
  const ahead = new Date(now.getTime() + 60 * 60_000);
  // An impossible span collapses to the instant it reported starting at:
  // the start is still a real observation, the end is not, and the duration
  // stays unmeasured rather than being stored as negative time.
  const backwards = resolveActivitySpan({ startedAt: now, endedAt: new Date(now.getTime() - 60_000) }, now);
  assert(backwards.durationSeconds === undefined, `an end before its own start never becomes a duration (got ${backwards.durationSeconds})`);
  assert(backwards.startedAt?.getTime() === now.getTime(), 'the start it reported is kept');
  assert(
    (backwards.endedAt?.getTime() ?? 0) >= (backwards.startedAt?.getTime() ?? 0),
    'the stored end never precedes the stored start',
  );
  const future = resolveActivitySpan({ startedAt: ahead, endedAt: ahead, durationSeconds: 30 }, now);
  assert(
    (future.startedAt?.getTime() ?? 0) <= now.getTime() && (future.endedAt?.getTime() ?? 0) <= now.getTime(),
    'a span claimed in the future is pulled back to now',
  );
  const instant = resolveActivitySpan({}, now);
  assert(
    instant.startedAt?.getTime() === now.getTime() && instant.endedAt?.getTime() === now.getTime() && instant.durationSeconds === undefined,
    'an instant (a login, a click) is a point in time, not a zero-length span claiming to be measured',
  );
  const fromDuration = resolveActivitySpan({ durationSeconds: 120 }, now);
  assert(
    fromDuration.endedAt?.getTime() === now.getTime()
      && fromDuration.startedAt?.getTime() === now.getTime() - 120_000
      && fromDuration.durationSeconds === 120,
    'a duration alone ends now and starts that far back',
  );

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL STUDENT ACTIVITY TIME-TRACKING CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
