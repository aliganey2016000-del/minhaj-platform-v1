process.env.JWT_ACCESS_SECRET = 'global-test-access';
process.env.JWT_REFRESH_SECRET = 'global-test-refresh';
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('global-course-scope');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Subscription } = await import('../models/global-subscription.model');
    const { generateAccessToken } = await import('../utils/jwt');
    const admin = await User.create({ email: 'global-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({ name: 'Global Test', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Test', phone: '+252000000000', email: 'global-school@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id });
    const headers = (u: any) => ({ Authorization: `Bearer ${generateAccessToken({ userId: String(u._id), role: u.role, organizationId: u.organizationId?.toString(), permissions: [] })}` });
    const org = await User.create({ email: 'global-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const student = await User.create({ email: 'global-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
    const profile = await Profile.create({ user: student._id, firstName: 'Global', lastName: 'Student', gender: 'male' });
    // Student auth resolves the effective tenant from the approved Student record.
    const classroom = await ClassModel.create({ school: school._id, title: 'Grade 12', room: '12', gradeLevel: 12 });
    const studentRecord = await Student.create({ user: student._id, profile: profile._id, studentId: 'GLOBAL-001', class: classroom._id, school: school._id, approvalStatus: 'approved' });
    const payload = { title: { en: 'Global Physics' }, scope: 'global', globalGrade: 12, school: String(school._id) };
    assert.equal((await request(app).post('/api/v1/courses').set(headers(org)).send(payload)).status, 403);
    const created = await request(app).post('/api/v1/courses').set(headers(admin)).send(payload);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data._id;
    assert.equal(created.body.data.school, null);
    assert.equal(created.body.data.scope, 'global');
    assert.equal(created.body.data.enrollmentCapacity, null);
    await Course.updateOne({ _id: id }, { $set: { enrolledStudents: 50000 } });
    const unlimited = await Course.findById(id);
    assert.equal(unlimited!.toObject().isFull, false);
    assert.equal(unlimited!.toObject().availableSeats, null);
    const unpublishedCatalog = await request(app).get('/api/v1/courses/global').set(headers(student));
    assert.equal(unpublishedCatalog.status, 200, JSON.stringify(unpublishedCatalog.body));
    assert.deepEqual(unpublishedCatalog.body.data, []);
    assert.equal((await request(app).patch(`/api/v1/courses/${id}`).set(headers(org)).send({ status: 'published' })).status, 403);
    assert.equal((await request(app).patch(`/api/v1/courses/${id}`).set(headers(admin)).send({ status: 'published' })).status, 200);
    const grade8 = await Course.create({ title: { en: 'Grade 8 Physics' }, scope: 'global', globalGrade: 8, slug: 'grade-8-physics', status: 'published', duration: 8, maxStudents: 50 });
    const catalog = await request(app).get('/api/v1/courses/global').set(headers(student));
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.data[0]._id, id);
    assert.equal(catalog.body.meta.grade, 12);
    assert.equal(catalog.body.data.length, 1);

    // A published catalog card is not enough: learning opens only when the
    // matching-grade subscription is active and this browser is verified.
    assert.equal(
      (await request(app).post(`/api/v1/guuldoon/courses/${id}/open`).set(headers(student))).status,
      403,
    );
    const now = new Date();
    await Subscription.create({
      user: student._id,
      school: school._id,
      grade: 12,
      paymentReference: 'GLOBAL-ACCESS-001',
      verifiedReference: 'GLOBAL-ACCESS-001',
      status: 'approved',
      startsAt: new Date(now.getTime() - 60000),
      expiresAt: new Date(now.getTime() + 365 * 86400000),
    });
    assert.equal(
      (await request(app).post(`/api/v1/guuldoon/courses/${id}/open`).set(headers(student))).status,
      403,
    );

    const verifiedDevice = await request(app)
      .post('/api/v1/guuldoon/devices/verify-password')
      .set(headers(student))
      .send({ password: 'Password123!' });
    assert.equal(verifiedDevice.status, 200, JSON.stringify(verifiedDevice.body));
    const deviceCookies = verifiedDevice.headers['set-cookie'] as unknown as string[];
    assert.ok(deviceCookies?.[0]?.includes('Path=/api/v1'));
    const deviceCookie = deviceCookies[0].split(';')[0];

    const opened = await request(app)
      .post(`/api/v1/guuldoon/courses/${id}/open`)
      .set(headers(student))
      .set('Cookie', deviceCookie);
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.equal(opened.body.data.access, 'granted');
    const enrolledStudent = await Student.findById(studentRecord._id).select('enrolledCourses').lean();
    assert.ok((enrolledStudent?.enrolledCourses || []).some((courseId: any) => String(courseId) === String(id)));

    // The same verified browser can read the course; another browser cannot.
    assert.equal(
      (await request(app).get(`/api/v1/courses/${id}/content`).set(headers(student)).set('Cookie', deviceCookie)).status,
      200,
    );
    assert.equal(
      (await request(app).get(`/api/v1/courses/${id}/content`).set(headers(student))).status,
      403,
    );

    await ClassModel.updateOne({ _id: classroom._id }, { $set: { gradeLevel: 8 } });
    const grade8Catalog = await request(app).get('/api/v1/courses/global?grade=12').set(headers(student));
    assert.equal(grade8Catalog.body.meta.grade, 8);
    assert.deepEqual(grade8Catalog.body.data.map((c: any) => c._id), [String(grade8._id)]);
    await Student.updateOne({ _id: studentRecord._id }, { $unset: { class: 1 } });
    assert.deepEqual((await request(app).get('/api/v1/courses/global').set(headers(student))).body.data, []);
    assert.equal(catalog.body.data[0].syllabus, undefined);
    assert.equal((await request(app).get('/api/v1/courses/global')).status, 401);
    assert.equal((await request(app).get('/api/v1/courses/global-physics')).status, 404);
    assert.equal((await request(app).get(`/api/v1/courses/${id}/content`).set(headers(student))).status, 403);
    assert.equal((await request(app).get(`/api/v1/courses/${id}/admin`).set(headers(admin))).status, 200);
    assert.equal((await request(app).put(`/api/v1/courses/${id}/content`).set(headers(org)).send({ chapters: [] })).status, 403);
    assert.equal((await request(app).put(`/api/v1/courses/${id}/content`).set(headers(admin)).send({ chapters: [] })).status, 200);
    assert.equal((await request(app).patch(`/api/v1/courses/${id}`).set(headers(admin)).send({ school: String(school._id) })).status, 400);
    assert.equal((await request(app).patch(`/api/v1/courses/${id}`).set(headers(admin)).send({ scope: 'school' })).status, 400);
    const local = await Course.create({ title: { en: 'Local Physics' }, slug: 'local-physics', school: school._id, duration: 8, maxStudents: 50 });
    assert.equal(local.scope, 'school');
    console.log('Global scope, catalog and authorization regressions passed.');
  } finally { await db.stop(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
