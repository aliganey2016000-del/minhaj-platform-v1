process.env.JWT_ACCESS_SECRET = 'global-test-access';
process.env.JWT_REFRESH_SECRET = 'global-test-refresh';
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('guuldoon-portals');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Course } = await import('../models/course.model');
    const { generateAccessToken } = await import('../utils/jwt');
    const admin = await User.create({ email: 'global-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({ name: 'Global Test', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252000000000', email: 'global-school@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id });
    const headers = (u: any) => ({ Authorization: `Bearer ${generateAccessToken({ userId: String(u._id), role: u.role, organizationId: u.organizationId?.toString(), permissions: [] })}` });
    const org = await User.create({ email: 'global-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const student = await User.create({ email: 'global-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
    const profile = await Profile.create({ user: student._id, firstName: 'Global', lastName: 'Student', gender: 'male' });
    // Student auth resolves the effective tenant from the approved Student record.
    await Student.create({ user: student._id, profile: profile._id, studentId: 'GLOBAL-001', school: school._id, approvalStatus: 'approved' });
    const { default: Progress } = await import('../models/progress.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Subscription } = await import('../models/global-subscription.model');
    const ownStudent = await Student.findOne({ user: student._id });
    const otherSchool = await School.create({ name: 'Other Guuldoon', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252000000000', email: 'other-guuldoon@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id });
    const extraUser = await User.create({ email: 'other-student-guuldoon@test.local', password: 'Password123!', role: 'student', organizationId: otherSchool._id });
    const extraProfile = await Profile.create({ user: extraUser._id, firstName: 'Other', lastName: 'Student', gender: 'male' });
    const extraStudent = await Student.create({ user: extraUser._id, profile: extraProfile._id, studentId: 'GD-002', school: otherSchool._id, approvalStatus: 'approved' });
    const teacherUser = await User.create({ email: 'teacher-guuldoon@test.local', password: 'Password123!', role: 'teacher', organizationId: school._id });
    const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'Teacher', lastName: 'One', gender: 'male' });
    const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id });
    const global = await Course.create({ title: { en: 'Global Test' }, slug: 'gd-global', scope: 'global', globalGrade: 12, status: 'published', maxStudents: 50, duration: 8 });
    const local = await Course.create({ title: { en: 'Local Test' }, slug: 'gd-local', school: school._id, teacher: teacher._id, maxStudents: 50, duration: 8 });
    await Student.updateOne({ _id: ownStudent!._id }, { $addToSet: { enrolledCourses: local._id } });
    await Progress.create([
      { student: ownStudent!._id, course: global._id },
      { student: extraStudent._id, course: global._id },
      { student: ownStudent!._id, course: local._id },
    ]);
    for (const reader of [student, org, teacherUser]) {
      const result = await request(app).get(`/api/v1/guuldoon/performance?school=${otherSchool._id}&studentId=${extraStudent._id}`).set(headers(reader));
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.data.length, 1);
      assert.equal(result.body.data[0].student._id, String(ownStudent!._id));
      assert.equal(result.body.data[0].course._id, String(global._id));
    }
    const all = await request(app).get('/api/v1/guuldoon/performance').set(headers(admin));
    assert.equal(all.body.data.length, 2);
    assert.equal((await request(app).get('/api/v1/guuldoon/overview').set(headers(student))).status, 403);
    assert.equal((await request(app).get('/api/v1/guuldoon/overview').set(headers(teacherUser))).status, 403);
    await Subscription.create({ user: student._id, school: school._id, grade: 12, paymentReference: 'GD-PENDING' });
    await Subscription.create({ user: extraUser._id, school: otherSchool._id, grade: 12, paymentReference: 'OTHER-PENDING' });
    const ownOverview = await request(app).get(`/api/v1/guuldoon/overview?school=${otherSchool._id}`).set(headers(org));
    assert.equal(ownOverview.status, 200);
    assert.equal(ownOverview.body.data.pendingPayments, 1);
    assert.equal(ownOverview.body.data.publishedCourses, 1);
    const platform = await request(app).get('/api/v1/guuldoon/overview').set(headers(admin));
    assert.equal(platform.body.data.pendingPayments, 2);
    console.log('Guuldoon role, student, teacher and tenant isolation regressions passed.');
  } finally { await db.stop(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
