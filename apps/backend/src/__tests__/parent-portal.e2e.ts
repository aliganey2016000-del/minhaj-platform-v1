/**
 * Parent Portal regression suite.
 * Covers strict parent-role access, child ownership, unpublished-result privacy,
 * event tenant isolation, notification scoping, and self-service profile edits.
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
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: School } = await import('../models/school.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: Parent } = await import('../models/parent.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Course } = await import('../models/course.model');
  const { default: Exam } = await import('../models/exam.model');
  const { default: Result } = await import('../models/result.model');
  const { default: Attendance } = await import('../models/attendance.model');
  const { default: Event } = await import('../models/event.model');
  const { default: Notification } = await import('../models/notification.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const platformAdmin = await User.create({ email: 'platform-admin@test.local', password: 'Password123!', role: 'admin' });
  const schoolA = await School.create({
    name: 'Parent Portal School A', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'A Street', phone: '+252610000001', email: 'school-a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: platformAdmin._id,
  });
  const schoolB = await School.create({
    name: 'Parent Portal School B', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'B Street', phone: '+252610000002', email: 'school-b@test.local', principalName: 'Principal B', establishedYear: 2021, createdBy: platformAdmin._id,
  });
  const orgAdminA = await User.create({ email: 'org-a@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
  const orgAdminB = await User.create({ email: 'org-b@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });

  const parentUser = await User.create({
    email: 'parent-a@test.local', password: 'Password123!', role: 'parent', organizationId: schoolA._id, preferredLanguage: 'en',
  });
  const parentProfile = await Profile.create({ user: parentUser._id, firstName: 'Amina', lastName: 'Guardian', gender: 'female' });
  const parent = await Parent.create({ user: parentUser._id, profile: parentProfile._id, parentId: 'PAR-A-001', school: schoolA._id });
  const parentToken = tokenFor(parentUser._id.toString(), 'parent', schoolA._id.toString());
  const adminToken = tokenFor(orgAdminA._id.toString(), 'org_admin', schoolA._id.toString());

  const ownStudentUser = await User.create({ email: 'child-a@test.local', password: 'Password123!', role: 'student', organizationId: schoolA._id });
  const ownStudentProfile = await Profile.create({ user: ownStudentUser._id, firstName: 'Hassan', lastName: 'Ali', gender: 'male' });
  const ownStudent = await Student.create({
    user: ownStudentUser._id, profile: ownStudentProfile._id, studentId: 'STU-A-001', school: schoolA._id,
    status: 'active', approvalStatus: 'approved', attendancePercentage: 95, gpa: 3.4, totalFeesPaid: 100, totalFeesDue: 50,
  });

  const foreignStudentUser = await User.create({ email: 'child-b@test.local', password: 'Password123!', role: 'student', organizationId: schoolB._id });
  const foreignStudentProfile = await Profile.create({ user: foreignStudentUser._id, firstName: 'Foreign', lastName: 'Student', gender: 'male' });
  const foreignStudent = await Student.create({
    user: foreignStudentUser._id, profile: foreignStudentProfile._id, studentId: 'STU-B-001', school: schoolB._id,
    status: 'active', approvalStatus: 'approved',
  });

  parent.children = [ownStudent._id];
  await parent.save();
  ownStudent.parent = parent._id;
  await ownStudent.save();

  const course = await Course.create({
    title: { en: 'Mathematics', so: '', ar: '' }, slug: 'parent-portal-math', duration: 12,
    maxStudents: 40, status: 'published', school: schoolA._id,
  });
  ownStudent.enrolledCourses = [course._id];
  await ownStudent.save();

  await Attendance.create({
    course: course._id, student: ownStudent._id, date: new Date('2026-09-10T08:00:00Z'),
    status: 'present', markedBy: orgAdminA._id,
  });

  const publishedExam = await Exam.create({
    title: 'Published Midterm', course: course._id, school: schoolA._id, examDate: new Date('2026-09-01T00:00:00Z'),
    startTime: '08:00', endTime: '09:00', duration: 60, totalMarks: 100, passingMarks: 50,
    status: 'completed', resultsPublished: true, createdBy: orgAdminA._id,
  });
  const unpublishedExam = await Exam.create({
    title: 'Private Final', course: course._id, school: schoolA._id, examDate: new Date('2026-09-05T00:00:00Z'),
    startTime: '08:00', endTime: '09:00', duration: 60, totalMarks: 100, passingMarks: 50,
    status: 'completed', resultsPublished: false, createdBy: orgAdminA._id,
  });
  await Result.create({ exam: publishedExam._id, student: ownStudent._id, marksObtained: 82, totalMarks: 100, enteredBy: orgAdminA._id });
  await Result.create({ exam: unpublishedExam._id, student: ownStudent._id, marksObtained: 41, totalMarks: 100, enteredBy: orgAdminA._id });

  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  await Event.create({ title: 'School A Event', eventDate: future, status: 'upcoming', createdBy: orgAdminA._id });
  await Event.create({ title: 'School B Secret Event', eventDate: future, status: 'upcoming', createdBy: orgAdminB._id });
  await Event.create({ title: 'Platform Event', eventDate: future, status: 'upcoming', createdBy: platformAdmin._id });

  await Notification.create({ user: parentUser._id, title: 'Own alert', message: 'For this parent', type: 'info' });
  await Notification.create({ user: ownStudentUser._id, title: 'Student alert', message: 'Not for parent', type: 'info' });

  section('ROLE GUARD');
  const adminOverview = await request(app).get('/api/v1/parents/me/overview').set('Authorization', `Bearer ${adminToken}`);
  assert(adminOverview.status === 403, `non-parent role is rejected from parent self-service (status ${adminOverview.status})`);

  section('OVERVIEW + UNPUBLISHED RESULT PRIVACY');
  const overview = await request(app).get('/api/v1/parents/me/overview').set('Authorization', `Bearer ${parentToken}`);
  assert(overview.status === 200, `parent overview succeeds (status ${overview.status})`);
  assert((overview.body?.data?.children || []).length === 1, `overview returns only the linked child`);
  const overviewResultTitles = (overview.body?.data?.recentResults || []).map((r: any) => r.exam?.title);
  assert(overviewResultTitles.includes('Published Midterm'), `published result appears on dashboard`);
  assert(!overviewResultTitles.includes('Private Final'), `unpublished result is hidden from dashboard`);

  section('CHILD OWNERSHIP');
  const ownAttendance = await request(app)
    .get(`/api/v1/parents/me/children/${ownStudent._id}/attendance`)
    .set('Authorization', `Bearer ${parentToken}`);
  assert(ownAttendance.status === 200 && ownAttendance.body?.data?.summary?.present === 1, `parent can read own child's attendance`);

  const foreignAttendance = await request(app)
    .get(`/api/v1/parents/me/children/${foreignStudent._id}/attendance`)
    .set('Authorization', `Bearer ${parentToken}`);
  assert(foreignAttendance.status === 404, `parent cannot read another child's attendance (status ${foreignAttendance.status})`);

  const resultRes = await request(app)
    .get(`/api/v1/parents/me/children/${ownStudent._id}/results`)
    .set('Authorization', `Bearer ${parentToken}`);
  const resultTitles = (resultRes.body?.data || []).map((r: any) => r.exam?.title);
  assert(resultRes.status === 200 && resultTitles.length === 1, `results endpoint exposes exactly the published result`);
  assert(resultTitles[0] === 'Published Midterm', `unpublished exam result is absent from child results`);

  const foreignResults = await request(app)
    .get(`/api/v1/parents/me/children/${foreignStudent._id}/results`)
    .set('Authorization', `Bearer ${parentToken}`);
  assert(foreignResults.status === 404, `parent cannot read another child's results (status ${foreignResults.status})`);

  section('EVENT TENANT ISOLATION');
  const eventsRes = await request(app).get('/api/v1/parents/me/events').set('Authorization', `Bearer ${parentToken}`);
  const eventTitles = (eventsRes.body?.data || []).map((e: any) => e.title);
  assert(eventTitles.includes('School A Event'), `own-school event is visible`);
  assert(eventTitles.includes('Platform Event'), `platform-wide admin event is visible`);
  assert(!eventTitles.includes('School B Secret Event'), `other-school event is hidden`);

  section('NOTIFICATION USER ISOLATION');
  const notificationsRes = await request(app).get('/api/v1/parents/me/notifications').set('Authorization', `Bearer ${parentToken}`);
  const notificationTitles = (notificationsRes.body?.data || []).map((n: any) => n.title);
  assert(notificationTitles.length === 1 && notificationTitles[0] === 'Own alert', `parent sees only their own notification`);

  section('PROFILE SELF-SERVICE');
  const profileRes = await request(app)
    .patch('/api/v1/parents/me/profile')
    .set('Authorization', `Bearer ${parentToken}`)
    .send({ phone: '+252611234567', occupation: 'Engineer', preferredLanguage: 'so' });
  assert(profileRes.status === 200, `parent profile update succeeds (status ${profileRes.status})`);
  const updatedUser: any = await User.findById(parentUser._id).lean();
  const updatedParent: any = await Parent.findById(parent._id).lean();
  assert(updatedUser?.preferredLanguage === 'so', `preferred language persists`);
  assert(updatedParent?.occupation === 'Engineer', `parent occupation persists`);

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) console.log('ALL PARENT PORTAL CHECKS PASSED (0 failures)');
  else console.log(`${failures} PARENT PORTAL CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
