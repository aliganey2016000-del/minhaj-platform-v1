/**
 * Cross-school linking and input-safety regressions (ported from the second
 * production-readiness audit).
 *
 * A1  An assignment's status only accepts "active" / "inactive".
 * C1  A course could be linked to another school's teacher or class.
 * GR1 A manual grade could be written for another school's student or for a
 *     grading category the course does not have.
 * UP1 Assignment attachments could point at another school's uploads, a
 *     private document folder or a traversal path; an assignment could be
 *     tied to another school's class.
 * N1  Notification links must stay inside the app.
 * T1  Public branding must not expose internal storage keys.
 * X1  Category names are literal text, not regular expressions.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
process.env.BASE_DOMAIN = 'sahaledu.com';
delete process.env.TENANT_PROXY_SECRET;

import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
// FerretDB (used only where the MongoDB binary cannot be downloaded) lacks
// $lookup, $expr and pipeline updates. Real MongoDB (CI) supports them, so a
// response that fails for that reason is reported as skipped, never as passed.
function emulatorLimited(res: { status: number; body?: any }): boolean {
  const message = String(res.body?.message || '');
  return res.status === 500 && /not (implemented|supported)/i.test(message);
}
function skip(label: string) { console.log(`  SKIP ${label} (database emulator limitation)`); }
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('audit-tenant-isolation');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Exam } = await import('../models/exam.model');
    const { default: Result } = await import('../models/result.model');
    const { default: Assignment } = await import('../models/assignment.model');
    const { default: ActivityLog } = await import('../models/activity-log.model');
    const { default: Setting } = await import('../models/setting.model');
    const { default: Gamification } = await import('../models/gamification.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Invoice } = await import('../models/invoice.model');

    const token = (user: any, organizationId?: string) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions: [],
      organizationId: organizationId ?? (user.organizationId ? user.organizationId.toString() : undefined),
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const admin = await User.create({ email: 'a5-admin@example.com', password: 'Password123!', role: 'admin' });
    const makeSchool = (name: string, subdomain: string) => School.create({
      name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St', phone: '+000',
      email: `${subdomain}@example.com`, principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
      subdomain, status: 'active', branding: { logo: 'https://cdn.example/logo.png', logoStorageKey: 'secret/key.png', themeColor: '#123456' },
    });
    const schoolA = await makeSchool('Audit School A', 'a5-alpha');
    const schoolB = await makeSchool('Audit School B', 'a5-beta');

    const orgAdminA = await User.create({ email: 'a5-oa@example.com', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    const orgAdminB = await User.create({ email: 'a5-ob@example.com', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });
    const tokA = token(orgAdminA);
    const tokB = token(orgAdminB);

    const makeTeacher = async (email: string, school: any) => {
      const user = await User.create({ email, password: 'Password123!', role: 'teacher', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: 'T', lastName: email.slice(0, 4), gender: 'male' });
      const teacher = await Teacher.create({ user: user._id, profile: profile._id, school: school._id });
      return { user, teacher };
    };
    const tA = await makeTeacher('a5-ta@example.com', schoolA);
    const tB = await makeTeacher('a5-tb@example.com', schoolB);

    const makeStudent = async (email: string, school: any, sid: string) => {
      const user = await User.create({ email, password: 'Password123!', role: 'student', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: 'S', lastName: sid, gender: 'male' });
      const student = await Student.create({
        user: user._id, profile: profile._id, studentId: sid, school: school._id, status: 'active', approvalStatus: 'approved',
      });
      return { user, student };
    };
    const sA = await makeStudent('a5-sa@example.com', schoolA, 'A5-A-1');
    const sA2 = await makeStudent('a5-sa2@example.com', schoolA, 'A5-A-2');
    const sB = await makeStudent('a5-sb@example.com', schoolB, 'A5-B-1');

    const courseA = await Course.create({
      title: { en: 'A5 Math A' }, slug: 'a5-math-a', category: 'general', level: 'beginner', duration: 8, maxStudents: 1,
      school: schoolA._id, teacher: tA.teacher._id, status: 'published',
    });
    sA.student.enrolledCourses = [courseA._id];
    await sA.student.save();

    // ---------------------------------------------------------------- R1
    // ---------------------------------------------------------------- A1
    let res: any;
    section('A1: an assignment is only readable by its own course audience');
    const assignment = await Assignment.create({ title: 'A5 homework', course: courseA._id, dueDate: new Date(Date.now() + 86400000), createdBy: tA.user._id });
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(tokB));
    assert(res.status === 403, `another school's admin is refused (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(tB.user)));
    assert(res.status === 403, `another school's teacher is refused (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(sB.user)));
    assert(res.status === 403, `another school's student is refused (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(tokA));
    assert(res.status === 200, `the course's own org admin can read it (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(tA.user)));
    assert(res.status === 200, `the course teacher can read it (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(sA.user)));
    assert(res.status === 200, `an enrolled student can read it (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(sA2.user)));
    assert(res.status === 403, `a same-school student who is not enrolled is refused (got ${res.status})`);
    res = await request(app).patch(`/api/v1/assignments/${assignment._id}/status`).set(auth(tokA)).send({ status: 'bogus' });
    assert(res.status === 400, `an invalid status is rejected (got ${res.status})`);

    // ---------------------------------------------------------------- AT1
    // ---------------------------------------------------------------- C1
    section('C1: a course only links teachers and classes of its own school');
    const classB = await ClassModel.create({ school: schoolB._id, title: 'B Class', section: 'A', room: 'R1', academicYear: '2026/27' } as any);
    const base = { title: { en: 'A5 New Course' }, level: 'beginner', duration: 8, maxStudents: 10, fee: 0 };
    res = await request(app).post('/api/v1/courses').set(auth(tokA)).send({ ...base, teacher: tB.teacher._id });
    assert(res.status === 400, `a foreign teacher is refused (got ${res.status} ${res.body?.message})`);
    res = await request(app).post('/api/v1/courses').set(auth(tokA)).send({ ...base, title: { en: 'A5 New Course 2' }, class: classB._id });
    assert(res.status === 400, `a foreign class is refused (got ${res.status} ${res.body?.message})`);
    res = await request(app).post('/api/v1/courses').set(auth(tokA)).send({ ...base, title: { en: 'A5 New Course 3' }, teacher: tA.teacher._id });
    assert(res.status === 201, `an own-school teacher is accepted (got ${res.status} ${res.body?.message})`);
    const newCourseId = res.body?.data?._id;
    res = await request(app).patch(`/api/v1/courses/${newCourseId}`).set(auth(tokA)).send({ teacher: tB.teacher._id });
    assert(res.status === 400, `re-assigning to a foreign teacher is refused (got ${res.status})`);

    // ---------------------------------------------------------------- E1
    // ---------------------------------------------------------------- E1
    section('GR1: manual grades respect school, category and teacher visibility');
    const { default: GradingScheme } = await import('../models/grading-scheme.model');
    await GradingScheme.create({
      course: courseA._id,
      categories: [
        { key: 'quiz', label: 'Quiz', weight: 50, sourceType: 'manual', teacherVisible: true },
        { key: 'final', label: 'Final', weight: 50, sourceType: 'manual', teacherVisible: false },
      ],
    } as any);
    const tTeacherA = token(tA.user);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sA.student._id}`).set(auth(tTeacherA)).send({ categoryKey: 'quiz', score: 80 });
    assert(res.status === 200, `a teacher can grade a visible category (got ${res.status} ${res.body?.message})`);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sA.student._id}`).set(auth(tTeacherA)).send({ categoryKey: 'final', score: 80 });
    assert(res.status === 403, `a teacher cannot grade an admin-only category (got ${res.status})`);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sA.student._id}`).set(auth(tokA)).send({ categoryKey: 'final', score: 80 });
    assert(res.status === 200, `the org admin can (got ${res.status})`);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sA.student._id}`).set(auth(tokA)).send({ categoryKey: 'nope', score: 80 });
    assert(res.status === 400, `an unknown category is refused (got ${res.status})`);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sB.student._id}`).set(auth(tokA)).send({ categoryKey: 'quiz', score: 80 });
    assert(res.status === 400, `another school's student is refused (got ${res.status})`);

    section('UP1: assignment attachments stay inside the organization\'s own uploads');
    const mk = (attachments: any[]) => request(app).post('/api/v1/assignments').set(auth(tTeacherA))
      .send({ title: 'A5 attach', course: courseA._id, dueDate: new Date(Date.now() + 86400000).toISOString(), attachments });
    res = await mk([{ url: '/uploads/student-documents/x/y/secret.pdf', name: 's.pdf' }]);
    assert(res.status === 400, `a private document folder is refused (got ${res.status})`);
    res = await mk([{ url: `/uploads/assignments/${schoolB._id}/file.pdf`, name: 'f.pdf' }]);
    assert(res.status === 400, `another school's upload folder is refused (got ${res.status})`);
    res = await mk([{ url: `/uploads/assignments/${schoolA._id}/../../x.pdf`, name: 'f.pdf' }]);
    assert(res.status === 400, `a traversal path is refused (got ${res.status})`);
    res = await mk([{ url: `/uploads/assignments/${schoolA._id}/file.pdf`, name: 'f.pdf' }, { url: 'https://example.com/doc.pdf', name: 'doc.pdf' }]);
    assert(res.status === 201, `own folder and external links are accepted (got ${res.status} ${res.body?.message})`);
    res = await request(app).post('/api/v1/assignments').set(auth(tTeacherA))
      .send({ title: 'A5 class', course: courseA._id, class: classB._id, dueDate: new Date(Date.now() + 86400000).toISOString() });
    assert(res.status === 400, `a foreign class is refused for an assignment (got ${res.status})`);


    // ---------------------------------------------------------------- N1
    section('N1: notifications only reach the sender\'s own users, with in-app links');
    res = await request(app).post('/api/v1/notifications').set(auth(tokA)).send({ user: sB.user._id, title: 'Hi', message: 'Hello' });
    assert(res.status === 403 || res.status === 404, `notifying another school's user is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/notifications').set(auth(tokA)).send({ user: sA.user._id, title: 'Hi', message: 'Hello', link: 'https://evil.example/login' });
    assert(res.status === 400, `an external link is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/notifications').set(auth(tokA)).send({ user: sA.user._id, title: 'Hi', message: 'Hello', link: '//evil.example' });
    assert(res.status === 400, `a protocol-relative link is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/notifications').set(auth(tokA)).send({ user: sA.user._id, title: 'Hi', message: 'Hello', link: '/student/assignments' });
    assert(res.status === 201, `an own user with an in-app link works (got ${res.status})`);
    res = await request(app).post('/api/v1/notifications').set(auth(token(admin))).send({ user: sB.user._id, title: 'Hi', message: 'Hello' });
    assert(res.status === 201, `the platform admin can still notify anyone (got ${res.status})`);

    // ---------------------------------------------------------------- P1
    // ---------------------------------------------------------------- T1
    section('T1: public branding hides internal storage keys');
    res = await request(app).get('/api/v1/tenant/current').set('X-Tenant-Host', 'a5-alpha.sahaledu.com');
    assert(res.status === 200 && res.body?.data?.branding?.logo === 'https://cdn.example/logo.png' && !JSON.stringify(res.body).includes('secret/key.png'), 'tenant/current has no logoStorageKey');
    res = await request(app).get(`/api/v1/tenant/${schoolA.slug}/branding`);
    assert(res.status === 200 && !JSON.stringify(res.body).includes('secret/key.png'), 'tenant/:slug/branding has no logoStorageKey');

    // ---------------------------------------------------------------- X1
    // ---------------------------------------------------------------- X1
    section('X1: category names are literal text, not regular expressions');
    res = await request(app).post('/api/v1/course-categories').set(auth(tokA)).send({ name: 'Maths' });
    assert(res.status === 201, `a category is created (got ${res.status} ${res.body?.message})`);
    res = await request(app).post('/api/v1/course-categories').set(auth(tokA)).send({ name: 'M.*' });
    assert(res.status === 201, `a regex-looking name is not treated as a match for "Maths" (got ${res.status})`);
    res = await request(app).post('/api/v1/course-categories').set(auth(tokA)).send({ name: '(a+)+$(' });
    assert(res.status === 201, `an invalid regex does not crash the request (got ${res.status})`);
    res = await request(app).post('/api/v1/course-categories').set(auth(tokA)).send({ name: 'maths' });
    assert(res.status === 409, `a true duplicate is still refused (got ${res.status})`);
  } finally {
    await db.stop();
  }

  console.log(failures ? `\n${failures} assertion(s) failed` : '\nPASS: cross-school linking and input-safety regressions');
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
