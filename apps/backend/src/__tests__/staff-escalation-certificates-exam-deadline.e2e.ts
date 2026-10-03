/**
 * Phase 1 security regressions from the 2026-10-03 deep audit.
 *
 * C1  A staff account with User Management permission could PATCH its own
 *     user to role "admin": roleMiddleware let staff skip every role list
 *     once any module permission passed, and user.update only restricted
 *     org_admin callers. Staff now act as org_admin of their own school and
 *     can never change roles, schools, admin accounts or their own grants.
 * H1  GET /certificates/:id had no role guard and returned the whole list;
 *     no certificate endpoint was scoped to the caller's school.
 * M1  Submitting an exam after the deadline graded whatever answers the
 *     submit request carried, so a student could hold the submit back and
 *     keep answering after time ran out.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import mongoose from 'mongoose';
import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('phase1-security');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Parent } = await import('../models/parent.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Certificate } = await import('../models/certificate.model');
    const { default: Exam } = await import('../models/exam.model');
    const { default: ExamPaper } = await import('../models/exam-paper.model');
    const { default: ExamAttempt } = await import('../models/exam-attempt.model');

    const token = (user: any, permissions: string[] = []) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions,
      organizationId: user.organizationId ? user.organizationId.toString() : undefined,
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const admin = await User.create({ email: 'p1-admin@test.local', password: 'Password123!', role: 'admin' });
    const makeSchool = (name: string, email: string) => School.create({
      name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St', phone: '+000',
      email, principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const schoolA = await makeSchool('Phase1 School A', 'p1-a@test.local');
    const schoolB = await makeSchool('Phase1 School B', 'p1-b@test.local');

    const orgAdminA = await User.create({ email: 'p1-orgadmin-a@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    const staffA = await User.create({ email: 'p1-staff-a@test.local', password: 'Password123!', role: 'staff', organizationId: schoolA._id });
    const staffA2 = await User.create({ email: 'p1-staff-a2@test.local', password: 'Password123!', role: 'staff', organizationId: schoolA._id });
    const teacherUserA = await User.create({ email: 'p1-teacher-a@test.local', password: 'Password123!', role: 'teacher', organizationId: schoolA._id });
    const userB = await User.create({ email: 'p1-teacher-b@test.local', password: 'Password123!', role: 'teacher', organizationId: schoolB._id });

    const staffPerms = ['organization.read', 'organization.edit', 'organization.create', 'organization.delete', 'exams.read'];
    const staffToken = token(staffA, staffPerms);
    const orgAdminToken = token(orgAdminA);

    section('C1: staff cannot escalate or leave their school');
    let res = await request(app).patch(`/api/v1/users/${staffA._id}`).set(auth(staffToken)).send({ role: 'admin' });
    assert(res.status === 403, `staff cannot make themselves admin (got ${res.status})`);
    assert((await User.findById(staffA._id))!.role === 'staff', 'staff role is unchanged in the database');

    res = await request(app).patch(`/api/v1/users/${staffA2._id}`).set(auth(staffToken)).send({ role: 'org_admin' });
    assert(res.status === 403, `staff cannot promote another staff to org_admin (got ${res.status})`);

    res = await request(app).patch(`/api/v1/users/${staffA2._id}`).set(auth(staffToken)).send({ organizationId: schoolB._id.toString() });
    assert(res.status === 403, `staff cannot move a user to another school (got ${res.status})`);

    res = await request(app).patch(`/api/v1/users/${orgAdminA._id}`).set(auth(staffToken)).send({ email: 'takeover@test.local' });
    assert(res.status === 403, `staff cannot edit the org admin's login (got ${res.status})`);

    res = await request(app).patch(`/api/v1/users/${admin._id}`).set(auth(orgAdminToken)).send({ email: 'takeover2@test.local' });
    assert(res.status === 403, `org admin cannot edit a platform admin (got ${res.status})`);

    res = await request(app).patch(`/api/v1/users/${staffA2._id}`).set(auth(staffToken)).send({ title: 'Registrar' });
    assert(res.status === 200, `staff can still edit an ordinary user in their school (got ${res.status})`);

    res = await request(app).post('/api/v1/users').set(auth(staffToken)).send({
      email: 'p1-new-admin@test.local', password: 'Password123!', firstName: 'N', lastName: 'A', gender: 'male', role: 'admin', organizationId: schoolA._id.toString(),
    });
    assert(res.status === 403, `staff cannot create an admin account (got ${res.status})`);

    res = await request(app).get('/api/v1/users').set(auth(staffToken));
    const listedOrgs = new Set((res.body?.data || []).map((u: any) => String(u.organizationId?._id ?? u.organizationId)));
    assert(res.status === 200 && listedOrgs.size === 1 && listedOrgs.has(schoolA._id.toString()), `staff user list is limited to their school (got ${[...listedOrgs].join(',')})`);

    res = await request(app).get(`/api/v1/users/${userB._id}`).set(auth(staffToken));
    assert(res.status === 404, `staff cannot read a user from another school (got ${res.status})`);
    res = await request(app).get(`/api/v1/users/${userB._id}`).set(auth(orgAdminToken));
    assert(res.status === 404, `org admin cannot read a user from another school (got ${res.status})`);
    res = await request(app).get(`/api/v1/users/${teacherUserA._id}`).set(auth(orgAdminToken));
    assert(res.status === 200, `org admin can read a user in their own school (got ${res.status})`);

    res = await request(app).patch(`/api/v1/users/${staffA._id}/permissions`).set(auth(staffToken))
      .send({ permissions: [{ module: 'finance', actions: ['read', 'edit'] }] });
    assert(res.status === 403, `staff cannot change their own permissions (got ${res.status})`);
    res = await request(app).patch(`/api/v1/users/${staffA2._id}/permissions`).set(auth(staffToken))
      .send({ permissions: [{ module: 'finance', actions: ['read'] }] });
    assert(res.status === 403, `staff cannot grant a permission they do not hold (got ${res.status})`);
    res = await request(app).patch(`/api/v1/users/${staffA2._id}/permissions`).set(auth(staffToken))
      .send({ permissions: [{ module: 'organization', actions: ['read'] }] });
    assert(res.status === 200, `staff can pass on a permission they hold (got ${res.status})`);

    res = await request(app).post('/api/v1/schools').set(auth(staffToken)).send({ name: 'Rogue' });
    assert(res.status === 403, `staff cannot reach platform-admin-only routes (got ${res.status})`);
    res = await request(app).patch(`/api/v1/schools/${schoolB._id}`).set(auth(staffToken)).send({ name: 'Hijacked' });
    assert(res.status === 403, `staff cannot edit another school (got ${res.status})`);
    res = await request(app).patch(`/api/v1/schools/${schoolA._id}`).set(auth(staffToken)).send({ adminPassword: 'NewPassword123!' });
    assert(res.status === 403, `staff cannot reset the org admin password (got ${res.status})`);

    res = await request(app).get('/api/v1/users').set(auth(token(staffA2, [])));
    assert(res.status === 403, `staff without a grant is refused (got ${res.status})`);

    res = await request(app).patch(`/api/v1/users/${teacherUserA._id}`).set(auth(orgAdminToken)).send({ role: 'org_admin' });
    assert(res.status === 403, `org admin cannot change a role (got ${res.status})`);
    res = await request(app).patch(`/api/v1/users/${staffA2._id}`).set(auth(token(admin))).send({ title: 'Head of Office' });
    assert(res.status === 200, `platform admin can still edit any user (got ${res.status})`);

    section('H1: certificates are scoped to the caller');
    const makeTeacher = async (user: any, school: any) => {
      const profile = await Profile.create({ user: user._id, firstName: 'T', lastName: 'T', gender: 'male' });
      return Teacher.create({ user: user._id, profile: profile._id, school: school._id });
    };
    const teacherA = await makeTeacher(teacherUserA, schoolA);
    const teacherB = await makeTeacher(userB, schoolB);
    const makeCourse = (school: any, teacher: any, slug: string) => Course.create({
      title: { en: slug }, slug, category: 'general', level: 'beginner', duration: 8, maxStudents: 50,
      school: school._id, teacher: teacher._id, status: 'published',
    });
    const courseA = await makeCourse(schoolA, teacherA, 'p1-course-a');
    const courseB = await makeCourse(schoolB, teacherB, 'p1-course-b');
    const makeStudent = async (email: string, school: any, course: any) => {
      const user = await User.create({ email, password: 'Password123!', role: 'student', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: 'S', lastName: email, gender: 'female' });
      const student = await Student.create({ user: user._id, profile: profile._id, school: school._id, enrolledCourses: [course._id] });
      return { user, student };
    };
    const sA = await makeStudent('p1-student-a@test.local', schoolA, courseA);
    const sB = await makeStudent('p1-student-b@test.local', schoolB, courseB);
    const certA = await Certificate.create({ title: 'A cert', student: sA.student._id, course: courseA._id, issuedBy: admin._id, status: 'issued' });
    const certB = await Certificate.create({ title: 'B cert', student: sB.student._id, course: courseB._id, issuedBy: admin._id, status: 'issued' });

    res = await request(app).get('/api/v1/certificates').set(auth(orgAdminToken));
    let ids = (res.body?.data || []).map((c: any) => String(c._id));
    assert(res.status === 200 && ids.length === 1 && ids[0] === certA._id.toString(), `org admin lists only their school's certificates (got ${ids.length})`);
    res = await request(app).get('/api/v1/certificates?search=cert').set(auth(orgAdminToken));
    ids = (res.body?.data || []).map((c: any) => String(c._id));
    assert(res.status === 200 && ids.length === 1 && ids[0] === certA._id.toString(), `search is scoped too (got ${ids.length})`);
    res = await request(app).get(`/api/v1/certificates/${certB._id}`).set(auth(orgAdminToken));
    assert(res.status === 404, `another school's certificate is not readable (got ${res.status})`);
    res = await request(app).get(`/api/v1/certificates/${certA._id}`).set(auth(orgAdminToken));
    assert(res.status === 200 && String(res.body?.data?._id) === certA._id.toString(), `own certificate by id returns that one certificate (got ${res.status})`);
    res = await request(app).get(`/api/v1/certificates/${certA._id}`).set(auth(token(sB.user)));
    assert(res.status === 403, `a student cannot use the staff detail endpoint (got ${res.status})`);
    res = await request(app).get('/api/v1/certificates').set(auth(token(userB)));
    ids = (res.body?.data || []).map((c: any) => String(c._id));
    assert(res.status === 200 && ids.length === 1 && ids[0] === certB._id.toString(), `a teacher sees only certificates for their courses (got ${ids.length})`);
    res = await request(app).get(`/api/v1/certificates/student/${sA.student._id}`).set(auth(token(sB.user)));
    assert(res.status === 200 && (res.body?.data || []).length === 0, `a student cannot list another student's certificates (got ${(res.body?.data || []).length})`);
    const parentUser = await User.create({ email: 'p1-parent@test.local', password: 'Password123!', role: 'parent', organizationId: schoolB._id });
    const parentProfile = await Profile.create({ user: parentUser._id, firstName: 'P', lastName: 'P', gender: 'male' });
    await Parent.create({ user: parentUser._id, profile: parentProfile._id, parentId: 'PRN-P1', school: schoolB._id, children: [sB.student._id] });
    res = await request(app).get(`/api/v1/certificates/student/${sA.student._id}`).set(auth(token(parentUser)));
    assert(res.status === 200 && (res.body?.data || []).length === 0, `a parent cannot list a non-child's certificates (got ${(res.body?.data || []).length})`);
    res = await request(app).get(`/api/v1/certificates/student/${sB.student._id}`).set(auth(token(parentUser)));
    assert(res.status === 200 && (res.body?.data || []).length === 1, `a parent still sees their own child's certificate (got ${(res.body?.data || []).length})`);

    res = await request(app).patch(`/api/v1/certificates/${certB._id}/status`).set(auth(orgAdminToken)).send({ status: 'revoked' });
    assert(res.status === 404 && (await Certificate.findById(certB._id))!.status === 'issued', `cannot revoke another school's certificate (got ${res.status})`);
    res = await request(app).delete(`/api/v1/certificates/${certB._id}`).set(auth(orgAdminToken));
    assert(res.status === 404 && Boolean(await Certificate.exists({ _id: certB._id })), `cannot delete another school's certificate (got ${res.status})`);
    res = await request(app).patch(`/api/v1/certificates/${certA._id}`).set(auth(orgAdminToken)).send({ grade: 'A', student: sB.student._id.toString() });
    const afterEdit = await Certificate.findById(certA._id).lean();
    assert(res.status === 200 && afterEdit!.grade === 'A' && String(afterEdit!.student) === sA.student._id.toString(), 'editing a certificate cannot move it to another student');
    res = await request(app).post('/api/v1/certificates').set(auth(orgAdminToken)).send({ title: 'x', student: sB.student._id.toString(), course: courseB._id.toString() });
    assert(res.status === 403, `cannot issue a certificate to another school's student (got ${res.status})`);
    res = await request(app).post('/api/v1/certificates').set(auth(orgAdminToken)).send({ title: 'New', student: sA.student._id.toString(), course: courseA._id.toString() });
    assert(res.status === 201, `can still issue a certificate in their own school (got ${res.status})`);

    section('M1: a late submit grades the answers saved before the deadline');
    const exam = await Exam.create({
      title: 'P1 Exam', course: courseA._id, school: schoolA._id, examDate: new Date(), startTime: '09:00', endTime: '10:00',
      duration: 60, totalMarks: 1, passingMarks: 1, createdBy: admin._id,
    });
    const paper = await ExamPaper.create({
      exam: exam._id, title: 'Paper', status: 'approved', submittedBy: admin._id,
      questions: [{ type: 'true_false', question: 'Sky is blue?', correctAnswer: true, points: 1 }],
    });
    const questionId = paper.questions[0]._id!.toString();
    const studentToken = token(sA.user);

    await ExamAttempt.create({
      exam: exam._id, paper: paper._id, student: sA.student._id, startedAt: new Date(Date.now() - 70 * 60000),
      deadline: new Date(Date.now() - 5 * 60000), status: 'in_progress', maxScore: 1, school: schoolA._id,
      answers: [{ questionId, value: false }],
    });
    res = await request(app).post(`/api/v1/exams/${exam._id}/attempt/submit`).set(auth(studentToken))
      .send({ answers: [{ questionId, value: true }] });
    assert(res.status === 200 && res.body?.data?.autoGradedScore === 0, `answers sent after the deadline are ignored (score ${res.body?.data?.autoGradedScore})`);
    assert(res.body?.data?.status === 'auto_submitted', 'a late submit is marked auto_submitted');
    res = await request(app).post(`/api/v1/exams/${exam._id}/attempt/submit`).set(auth(studentToken)).send({});
    assert(res.status === 400, `a second submit is refused (got ${res.status})`);

    const sA2 = await makeStudent('p1-student-a2@test.local', schoolA, courseA);
    await ExamAttempt.create({
      exam: exam._id, paper: paper._id, student: sA2.student._id, startedAt: new Date(),
      deadline: new Date(Date.now() + 30 * 60000), status: 'in_progress', maxScore: 1, school: schoolA._id,
      answers: [{ questionId, value: false }],
    });
    const token2 = token(sA2.user);
    res = await request(app).post(`/api/v1/exams/${exam._id}/attempt/submit`).set(auth(token2)).send({ answers: [{ questionId, value: true }] });
    assert(res.status === 200 && res.body?.data?.autoGradedScore === 1 && res.body?.data?.status === 'submitted', `an on-time submit still grades the submitted answers (score ${res.body?.data?.autoGradedScore})`);
    res = await request(app).patch(`/api/v1/exams/${exam._id}/attempt`).set(auth(token2)).send({ answers: [{ questionId, value: false }] });
    const graded = await ExamAttempt.findOne({ student: sA2.student._id }).lean();
    assert(res.status === 400 && (graded as any).answers[0].value === true, `an autosave after submit cannot change graded answers (got ${res.status})`);
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll phase 1 security checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
