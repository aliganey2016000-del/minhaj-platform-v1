/**
 * Phase 3 tenant-isolation / privilege-escalation regressions from the
 * 2026-10-04 deep audit. One assertion per finding, each run against two
 * schools (A and B) so a cross-school attempt must fail (403/404) and a
 * same-school attempt must succeed (200/201).
 *
 * 1  /system settings + logs were readable/writable by org_admin/staff —
 *    now platform-admin only.
 * 2  GET course content leaked another school's content (and quiz answers)
 *    to any authenticated role.
 * 3  org_admin could grade an assignment submission in any organization.
 * 4  Assignment list's `courseId` query param overrode (not intersected)
 *    the teacher/org_admin scope.
 * 5  GET /assignments/:id had no ownership check for teacher/parent/tenant
 *    roles.
 * 6  School getAll/getById only scoped org_admin — a teacher saw every
 *    school.
 * 7  School update let org_admin set subscriptionPlan/slug/orgId/status.
 * 8  School update's admin-password reset could target another org_admin.
 * 9  Staff (acting as org_admin) could create finance/staff accounts.
 * 10 Parent unlinkChild unset an arbitrary student's parent field.
 * 11 Notification create let org_admin notify any user platform-wide.
 * 12 /attendance/course,/report,/insights had no role gate.
 * 13 Gamification leaderboard was platform-wide.
 * 14 AI tutor chat had no enrollment check; voice notes were readable by
 *    any authenticated user.
 * 15 Course category list's `?school=` param was trusted for any role.
 * 16 /classes/schedule/:courseId had no scope at all.
 * 17 Interactive Gate block-answer submission had no enrollment check.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
process.env.BASE_DOMAIN = 'sahaledu.com';

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
  const db = await startTestDb('phase3-tenant');
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
    const { default: ClassModel } = await import('../models/class.model');
    const { default: CourseContent } = await import('../models/course-content.model');
    const { default: Assignment } = await import('../models/assignment.model');
    const { default: AssignmentSubmission } = await import('../models/assignment-submission.model');
    const { default: Setting } = await import('../models/setting.model');
    const { default: ActivityLog } = await import('../models/activity-log.model');
    const { default: Notification } = await import('../models/notification.model');
    const { default: Gamification } = await import('../models/gamification.model');
    const { default: LessonBlockProgress } = await import('../models/lesson-block-progress.model');
    const { default: CourseCategory } = await import('../models/course-category.model');

    const token = (user: any, extra: { permissions?: string[]; organizationId?: string } = {}) => generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
      permissions: extra.permissions || [],
      organizationId: extra.organizationId ?? (user.organizationId ? user.organizationId.toString() : undefined),
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const platformAdmin = await User.create({ email: 'p3-admin@example.com', password: 'Password123!', role: 'admin' });

    const makeSchool = (name: string, subdomain: string) => School.create({
      name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St', phone: '+000',
      email: `${subdomain}@example.com`, principalName: 'Principal', establishedYear: 2020, createdBy: platformAdmin._id,
      subdomain, status: 'active',
    });
    const schoolA = await makeSchool('Phase3 School A', 'p3-alpha');
    const schoolB = await makeSchool('Phase3 School B', 'p3-beta');

    const orgAdminA = await User.create({ email: 'p3-orgadmin-a@example.com', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    const orgAdminB = await User.create({ email: 'p3-orgadmin-b@example.com', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });
    const staffA = await User.create({
      email: 'p3-staff-a@example.com', password: 'Password123!', role: 'staff', organizationId: schoolA._id,
      permissions: [
        { module: 'system', actions: ['read', 'edit'] },
        { module: 'organization', actions: ['create'] },
        { module: 'academic', actions: ['read'] },
        { module: 'courses', actions: ['read'] },
      ],
    });

    const teacherUserA = await User.create({ email: 'p3-teacher-a@example.com', password: 'Password123!', role: 'teacher', organizationId: schoolA._id });
    const teacherProfileA = await Profile.create({ user: teacherUserA._id, firstName: 'T', lastName: 'A', gender: 'male' });
    const teacherA = await Teacher.create({ user: teacherUserA._id, profile: teacherProfileA._id, school: schoolA._id, teacherId: 'TCH-P3-A' });

    const teacherUserB = await User.create({ email: 'p3-teacher-b@example.com', password: 'Password123!', role: 'teacher', organizationId: schoolB._id });
    const teacherProfileB = await Profile.create({ user: teacherUserB._id, firstName: 'T', lastName: 'B', gender: 'male' });
    const teacherB = await Teacher.create({ user: teacherUserB._id, profile: teacherProfileB._id, school: schoolB._id, teacherId: 'TCH-P3-B' });

    const makeCourse = (school: any, teacher: any, slug: string) => Course.create({
      title: { en: `Course ${slug}` }, slug, category: 'general', level: 'beginner', duration: 8, maxStudents: 50,
      school: school._id, teacher: teacher._id, status: 'published',
    });
    const courseA = await makeCourse(schoolA, teacherA, 'p3-course-a');
    const courseB = await makeCourse(schoolB, teacherB, 'p3-course-b');

    const studentUserA = await User.create({ email: 'p3-student-a@example.com', password: 'Password123!', role: 'student', organizationId: schoolA._id });
    const studentProfileA = await Profile.create({ user: studentUserA._id, firstName: 'S', lastName: 'A', gender: 'female' });
    const studentA = await Student.create({ user: studentUserA._id, profile: studentProfileA._id, school: schoolA._id, enrolledCourses: [courseA._id] });

    const studentUserB = await User.create({ email: 'p3-student-b@example.com', password: 'Password123!', role: 'student', organizationId: schoolB._id });
    const studentProfileB = await Profile.create({ user: studentUserB._id, firstName: 'S', lastName: 'B', gender: 'female' });
    const studentB = await Student.create({ user: studentUserB._id, profile: studentProfileB._id, school: schoolB._id, enrolledCourses: [courseB._id] });

    const parentUserA = await User.create({ email: 'p3-parent-a@example.com', password: 'Password123!', role: 'parent', organizationId: schoolA._id });
    const parentProfileA = await Profile.create({ user: parentUserA._id, firstName: 'P', lastName: 'A', gender: 'male' });
    const parentA = await Parent.create({ user: parentUserA._id, profile: parentProfileA._id, school: schoolA._id, children: [studentA._id] });
    await Student.updateOne({ _id: studentA._id }, { $set: { parent: parentA._id } });

    const orgAToken = token(orgAdminA);
    const orgBToken = token(orgAdminB);
    // Flat module.action strings, exactly what requirePermission checks
    // against — distinct from the {module, actions} shape stored on the
    // User document, which generateAccessToken does not read.
    const staffAToken = token(staffA, { permissions: ['system.read', 'system.edit', 'organization.create', 'academic.read', 'courses.read'] });
    const teacherAToken = token(teacherUserA);
    const teacherBToken = token(teacherUserB);
    const studentAToken = token(studentUserA);
    const studentBToken = token(studentUserB);
    const parentAToken = token(parentUserA);
    const adminToken = token(platformAdmin);

    let res: request.Response;

    section('Finding 1: /system settings and logs are platform-admin only');
    res = await request(app).get('/api/v1/system/settings').set(auth(orgAToken));
    assert(res.status === 403, `org_admin cannot read platform settings (got ${res.status})`);
    res = await request(app).delete('/api/v1/system/logs').set(auth(staffAToken));
    assert(res.status === 403, `staff cannot clear activity logs (got ${res.status})`);
    res = await request(app).get('/api/v1/system/settings').set(auth(adminToken));
    assert(res.status === 200, `the platform admin can still read settings (got ${res.status})`);
    assert((await Setting.countDocuments()) >= 0 && (await ActivityLog.countDocuments()) >= 0, 'models remain reachable');

    section('Finding 2: course content GET is scoped per role');
    await CourseContent.create({
      course: courseB._id,
      chapters: [{
        title: 'Chapter 1', order: 0, status: 'draft', collapsed: false,
        items: [{
          _id: new mongoose.Types.ObjectId(), title: 'Lesson 1', type: 'lesson', content: 'Secret content',
          deliveryMode: 'traditional', order: 0, status: 'draft', duration: 10,
        }],
      }],
    });
    res = await request(app).get(`/api/v1/courses/${courseB._id}/content`).set(auth(studentAToken));
    assert(res.status === 403, `school A student cannot read school B's course content (got ${res.status})`);
    res = await request(app).get(`/api/v1/courses/${courseB._id}/content`).set(auth(teacherAToken));
    assert(res.status === 403, `school A teacher cannot read school B's course content (got ${res.status})`);
    res = await request(app).get(`/api/v1/courses/${courseB._id}/content`).set(auth(orgBToken));
    assert(res.status === 200, `school B's own org_admin can read it (got ${res.status})`);

    section('Finding 3: org_admin grading is scoped to their own organization');
    const assignmentB = await Assignment.create({ title: 'HW1', course: courseB._id, dueDate: new Date(Date.now() + 86400000), createdBy: teacherUserB._id });
    const submissionB = await AssignmentSubmission.create({ assignment: assignmentB._id, student: studentB._id, course: courseB._id, answer: 'answer' });
    res = await request(app).patch(`/api/v1/assignment-submissions/${submissionB._id}/grade`).set(auth(orgAToken)).send({ grade: 90 });
    assert(res.status === 403, `org_admin A cannot grade a school B submission (got ${res.status})`);
    res = await request(app).patch(`/api/v1/assignment-submissions/${submissionB._id}/grade`).set(auth(orgBToken)).send({ grade: 90 });
    assert(res.status === 200, `org_admin B can grade their own submission (got ${res.status})`);

    section('Finding 4: assignment list courseId filter intersects, never overrides, scope');
    const assignmentA = await Assignment.create({ title: 'HW-A', course: courseA._id, dueDate: new Date(Date.now() + 86400000), createdBy: teacherUserA._id });
    res = await request(app).get(`/api/v1/assignments?courseId=${courseB._id}`).set(auth(teacherAToken));
    const idsSeen = (res.body?.data || []).map((a: any) => String(a._id));
    assert(res.status === 200 && !idsSeen.includes(String(assignmentB._id)), `teacher A passing school B's courseId sees none of its assignments (got ${idsSeen.length})`);
    res = await request(app).get(`/api/v1/assignments?courseId=${courseA._id}`).set(auth(teacherAToken));
    const ownIds = (res.body?.data || []).map((a: any) => String(a._id));
    assert(ownIds.includes(String(assignmentA._id)), 'teacher A can still see their own assignment via courseId');

    section('Finding 5: GET /assignments/:id is scoped by role');
    res = await request(app).get(`/api/v1/assignments/${assignmentB._id}`).set(auth(teacherAToken));
    assert(res.status === 403, `teacher A cannot view school B's assignment (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignmentB._id}`).set(auth(orgAToken));
    assert(res.status === 403, `org_admin A cannot view school B's assignment (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignmentA._id}`).set(auth(teacherAToken));
    assert(res.status === 200, `teacher A can view their own assignment (got ${res.status})`);

    section('Finding 6: school getAll/getById scope every non-admin role');
    res = await request(app).get('/api/v1/schools').set(auth(teacherAToken));
    const schoolIds = (res.body?.data || []).map((s: any) => String(s._id));
    assert(res.status === 200 && schoolIds.length === 1 && schoolIds[0] === String(schoolA._id), `teacher A's school list contains only their own school (got ${schoolIds.join(',')})`);
    res = await request(app).get(`/api/v1/schools/${schoolB._id}`).set(auth(teacherAToken));
    assert(res.status === 403, `teacher A cannot open school B's record (got ${res.status})`);
    res = await request(app).get(`/api/v1/schools/${schoolA._id}`).set(auth(teacherAToken));
    assert(res.status === 200, `teacher A can open their own school's record (got ${res.status})`);

    section('Finding 7: org_admin update cannot set platform-governed fields');
    res = await request(app).patch(`/api/v1/schools/${schoolA._id}`).set(auth(orgAToken)).send({ subscriptionPlan: 'premium', orgId: 'hijacked', slug: 'stolen-slug' });
    assert(res.status === 200, `the update itself still succeeds (got ${res.status})`);
    const refetchedA: any = await School.findById(schoolA._id).lean();
    assert(refetchedA.subscriptionPlan !== 'premium' && refetchedA.orgId !== 'hijacked' && refetchedA.slug !== 'stolen-slug', `subscriptionPlan/orgId/slug were stripped (got ${refetchedA.subscriptionPlan}, ${refetchedA.orgId}, ${refetchedA.slug})`);

    section('Finding 8: admin-password reset on org update targets only the caller\'s own account');
    const coAdminA = await User.create({ email: 'p3-coadmin-a@example.com', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    res = await request(app).patch(`/api/v1/schools/${schoolA._id}`).set(auth(orgAToken)).send({ adminPassword: 'NewPassword123!' });
    assert(res.status === 200, `org_admin A's own password reset succeeds (got ${res.status})`);
    const coAdminAfter = await User.findById(coAdminA._id).select('+password');
    const orgAdminAAfter = await User.findById(orgAdminA._id).select('+password');
    assert(coAdminAfter!.password === coAdminA.password, "a co-admin's password was not touched by another org_admin's reset");
    assert(await orgAdminAAfter!.comparePassword('NewPassword123!'), "the caller's own password was updated");

    section('Finding 9: staff can only create student/teacher/parent accounts');
    res = await request(app).post('/api/v1/users').set(auth(staffAToken)).send({
      email: 'p3-staff-created-finance@example.com', password: 'Password123!', firstName: 'F', lastName: 'M', gender: 'male', role: 'finance_manager',
    });
    assert(res.status === 403, `staff cannot create a finance_manager account (got ${res.status})`);
    res = await request(app).post('/api/v1/users').set(auth(staffAToken)).send({
      email: 'p3-staff-created-student@example.com', password: 'Password123!', firstName: 'S', lastName: 'N', gender: 'male', role: 'student',
    });
    assert(res.status === 201, `staff can still create a student account (got ${res.status})`);

    section('Finding 10: unlinkChild requires actual parent/child membership');
    const otherStudentUser = await User.create({ email: 'p3-other-student@example.com', password: 'Password123!', role: 'student', organizationId: schoolA._id });
    const otherStudentProfile = await Profile.create({ user: otherStudentUser._id, firstName: 'O', lastName: 'S', gender: 'male' });
    const otherParentUser = await User.create({ email: 'p3-other-parent@example.com', password: 'Password123!', role: 'parent', organizationId: schoolA._id });
    const otherParentProfile = await Profile.create({ user: otherParentUser._id, firstName: 'O', lastName: 'P', gender: 'female' });
    const otherParent = await Parent.create({ user: otherParentUser._id, profile: otherParentProfile._id, school: schoolA._id, children: [] });
    const otherStudent = await Student.create({ user: otherStudentUser._id, profile: otherStudentProfile._id, school: schoolA._id, parent: otherParent._id });
    res = await request(app).post(`/api/v1/parents/${parentA._id}/unlink-child`).set(auth(orgAToken)).send({ childId: otherStudent._id.toString() });
    assert(res.status === 400, `cannot unlink a student who is not this parent's child (got ${res.status})`);
    const otherStudentAfter: any = await Student.findById(otherStudent._id).lean();
    assert(String(otherStudentAfter.parent) === String(otherParent._id), "the unrelated student's own parent link was left untouched");
    res = await request(app).post(`/api/v1/parents/${parentA._id}/unlink-child`).set(auth(orgAToken)).send({ childId: studentA._id.toString() });
    assert(res.status === 200, `unlinking the parent's actual child still works (got ${res.status})`);

    section('Finding 11: notification create is scoped to the org_admin\'s own organization');
    res = await request(app).post('/api/v1/notifications').set(auth(orgAToken)).send({ user: studentUserB._id.toString(), title: 'Hi', message: 'hello' });
    assert(res.status === 403, `org_admin A cannot notify a school B user (got ${res.status})`);
    res = await request(app).post('/api/v1/notifications').set(auth(orgAToken)).send({ user: studentUserA._id.toString(), title: 'Hi', message: 'hello' });
    assert(res.status === 201, `org_admin A can notify their own school's user (got ${res.status})`);
    assert((await Notification.countDocuments({ user: studentUserB._id })) === 0, 'no notification was created for the school B user');

    section('Finding 12: course attendance/report/insights require a staff role');
    res = await request(app).get(`/api/v1/attendance/course?courseId=${courseA._id}&date=2026-01-05`).set(auth(studentAToken));
    assert(res.status === 403, `a student cannot read the whole course's attendance roster (got ${res.status})`);
    res = await request(app).get(`/api/v1/attendance/course?courseId=${courseA._id}&date=2026-01-05`).set(auth(parentAToken));
    assert(res.status === 403, `a parent cannot read the whole course's attendance roster (got ${res.status})`);
    res = await request(app).get(`/api/v1/attendance/course?courseId=${courseA._id}&date=2026-01-05`).set(auth(teacherAToken));
    assert(res.status === 200, `the course's own teacher can still read it (got ${res.status})`);

    section('Finding 13: gamification leaderboard is scoped to the caller\'s school');
    await Gamification.create({ student: studentA._id, xp: 500, level: 5 });
    await Gamification.create({ student: studentB._id, xp: 900, level: 9 });
    res = await request(app).get('/api/v1/gamification/leaderboard').set(auth(studentAToken));
    const leaderboardStudentIds = (res.body?.data || []).map((e: any) => e.studentId);
    assert(res.status === 200 && (res.body?.data || []).length === 1, `school A's leaderboard only has school A's student (got ${leaderboardStudentIds.length} entries)`);
    res = await request(app).get('/api/v1/gamification/leaderboard').set(auth(studentBToken));
    assert(res.status === 200 && (res.body?.data || []).length === 1, `school B's leaderboard only has school B's student (got ${(res.body?.data || []).length} entries)`);

    section('Finding 14: AI tutor chat is scoped by enrollment/ownership');
    res = await request(app).post('/api/v1/ai/tutor/chat').set(auth(studentAToken)).send({ courseId: courseB._id.toString(), message: 'help' });
    assert(res.status === 403, `a student cannot use the tutor for a course they are not enrolled in (got ${res.status})`);
    res = await request(app).get('/api/v1/ai/tutor/voice-note/nonexistent-but-not-mine.webm').set(auth(studentAToken));
    assert(res.status === 403 || res.status === 400, `a voice note filename not prefixed with the caller's own id is refused (got ${res.status})`);

    section('Finding 15: course category list is pinned to the caller\'s own org');
    const categoryB = await CourseCategory.create({ name: 'Science', slug: 'science', school: schoolB._id });
    res = await request(app).get(`/api/v1/course-categories?school=${schoolB._id}`).set(auth(teacherAToken));
    const categoryNames = (res.body?.data || []).map((c: any) => c.name);
    assert(res.status === 200 && !categoryNames.includes('Science'), `teacher A's \`?school=\` override is ignored (got ${categoryNames.join(',')})`);
    assert(Boolean(await CourseCategory.exists({ _id: categoryB._id })), 'school B\'s category still exists, untouched');

    section('Finding 16: class schedule requires course ownership/enrollment/org match');
    await ClassModel.create({ school: schoolB._id, title: 'Class B1', room: 'R1', course: courseB._id, teacher: teacherB._id });
    res = await request(app).get(`/api/v1/classes/schedule/${courseB._id}`).set(auth(studentAToken));
    assert(res.status === 403, `a school A student cannot read school B's course schedule (got ${res.status})`);
    res = await request(app).get(`/api/v1/classes/schedule/${courseB._id}`).set(auth(teacherBToken));
    assert(res.status === 200, `school B's own teacher can read it (got ${res.status})`);

    section('Finding 17: Interactive Gate block-answer submission requires enrollment');
    const gateContent = await CourseContent.create({
      course: courseA._id,
      chapters: [{
        title: 'Gate Chapter', order: 0, status: 'draft', collapsed: false,
        items: [{
          _id: new mongoose.Types.ObjectId(), title: 'Gate Lesson', type: 'lesson', content: '',
          deliveryMode: 'interactive_gate', order: 0, status: 'draft', duration: 10,
          contentBlocks: [{
            title: 'Block 1', order: 0, content: 'Read this.', minReadSeconds: 5,
            questions: [{ question: 'Q?', type: 'mcq', options: ['a', 'b'], correctIndex: 0 }],
          }],
        }],
      }],
    });
    const gateLessonId = (gateContent.chapters[0].items[0] as any)._id.toString();
    res = await request(app)
      .post(`/api/v1/courses/${courseA._id}/lessons/${gateLessonId}/gate/blocks/0/answer`)
      .set(auth(studentBToken))
      .send({ answer: 0 });
    assert(res.status === 403, `a student not enrolled in the course cannot submit/grade a gate answer (got ${res.status})`);
    res = await request(app)
      .post(`/api/v1/courses/${courseA._id}/lessons/${gateLessonId}/gate/blocks/0/answer`)
      .set(auth(studentAToken))
      .send({ answer: 0 });
    assert(res.status === 200, `the enrolled student can submit the answer (got ${res.status})`);
    void LessonBlockProgress; // referenced for type-checking only
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll phase 3 tenant isolation checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
