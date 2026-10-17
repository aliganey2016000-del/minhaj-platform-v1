process.env.JWT_ACCESS_SECRET = 'student-next-email-access';
process.env.JWT_REFRESH_SECRET = 'student-next-email-refresh';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('student-next-email');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Student } = await import('../models/student.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { parseNumberedEmail } = await import('../controllers/student-next-email.controller');
    const { generateAccessToken } = await import('../utils/jwt');

    assert.deepEqual(parseNumberedEmail('Student732@Balcad.com'), { prefix: 'student', digits: '732', domain: 'balcad.com' });
    assert.equal(parseNumberedEmail('ali.hassan@balcad.com'), null);

    const admin = await User.create({ email: 'ne-admin@test.local', password: 'Password123!', role: 'admin' });
    const mkSchool = (n: string, phone: string) => School.create({ name: `NE ${n}`, institutionType: 'school', organizationType: 'school', ownershipType: 'private', attendanceType: 'class_based', country: 'Somalia', city: 'Mogadishu', address: 'Road', phone, email: `ne-${n}@test.local`, principalName: 'P', establishedYear: 2020, createdBy: admin._id });
    const school = await mkSchool('A', '+252610000051');
    const other = await mkSchool('B', '+252610000052');
    const classroom = await ClassModel.create({ school: school._id, title: 'Grade 6', section: 'A', room: 'R1', shiftMode: 'Morning', gradeLevel: 6, academicYear: '2026/27', status: 'active' });
    const otherClass = await ClassModel.create({ school: other._id, title: 'Grade 6', section: 'A', room: 'R1', shiftMode: 'Morning', gradeLevel: 6, academicYear: '2026/27', status: 'active' });
    const orgAdmin = await User.create({ email: 'ne-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const token = generateAccessToken({ userId: String(orgAdmin._id), role: 'org_admin', permissions: [], organizationId: String(school._id) });
    const studentUser = await User.create({ email: 'ne-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
    const studentToken = generateAccessToken({ userId: String(studentUser._id), role: 'student', permissions: [], organizationId: String(school._id) });

    let n = 0;
    const addStudent = async (email: string, sch: any, cls: any) => {
      n += 1;
      const user = await User.create({ email, password: 'Password123!', role: 'student', organizationId: sch._id });
      const profile = await Profile.create({ user: user._id, firstName: `S${n}`, lastName: 'Test', gender: 'male' });
      await Student.create({ user: user._id, profile: profile._id, studentId: `NE-${n}`, school: sch._id, class: cls._id, status: 'active', approvalStatus: 'approved' });
      await new Promise((resolve) => setTimeout(resolve, 15));
    };
    const next = async () => (await request(app).get('/api/v1/students/next-email').set('Authorization', `Bearer ${token}`).expect(200)).body.data;

    // No students yet: nothing to continue.
    assert.equal((await next()).email, null);

    await addStudent('student9@balcad.com', school, classroom);
    await addStudent('student731@balcad.com', school, classroom);
    await addStudent('student732@balcad.com', school, classroom);
    assert.equal((await next()).email, 'student733@balcad.com', 'continues from the last student');

    // Another school's numbers are never used.
    await addStudent('student900@balcad.com', other, otherClass);
    assert.equal((await next()).email, 'student733@balcad.com');

    // The highest number wins even if it was not the last one created, and a taken address is skipped.
    await addStudent('student740@balcad.com', school, classroom);
    await addStudent('student735@balcad.com', school, classroom);
    await User.create({ email: 'student741@balcad.com', password: 'Password123!', role: 'student', organizationId: other._id });
    assert.equal((await next()).email, 'student742@balcad.com');

    // Zero padding is kept; a last email without a number gives no suggestion.
    await addStudent('pupil007@x.org', school, classroom);
    assert.equal((await next()).email, 'pupil008@x.org');
    await addStudent('ali.hassan@x.org', school, classroom);
    assert.equal((await next()).email, null);

    const denied = await request(app).get('/api/v1/students/next-email').set('Authorization', `Bearer ${studentToken}`);
    assert.ok([401, 403].includes(denied.status), 'a student cannot ask for the next email');

    console.log('Student next-email e2e passed');
  } finally {
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
