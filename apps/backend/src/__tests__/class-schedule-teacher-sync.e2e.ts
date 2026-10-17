process.env.JWT_ACCESS_SECRET = 'schedule-sync-access';
process.env.JWT_REFRESH_SECRET = 'schedule-sync-refresh';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('class-schedule-teacher-sync');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: ClassSchedule } = await import('../models/class-schedule.model');
    const { generateAccessToken } = await import('../utils/jwt');

    const admin = await User.create({ email: 'sync-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({ name: 'Sync School', institutionType: 'school', organizationType: 'school', ownershipType: 'private', attendanceType: 'class_based', country: 'Somalia', city: 'Mogadishu', address: 'Road', phone: '+252610000041', email: 'sync-school@test.local', principalName: 'P', establishedYear: 2020, createdBy: admin._id });
    const orgAdmin = await User.create({ email: 'sync-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const orgToken = generateAccessToken({ userId: String(orgAdmin._id), role: 'org_admin', permissions: [], organizationId: String(school._id) });

    const mkTeacher = async (tag: string, n: number) => {
      const user = await User.create({ email: `sync-${tag}@test.local`, password: 'Password123!', role: 'teacher', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: tag, lastName: 'Teacher', gender: 'male' });
      return Teacher.create({ user: user._id, profile: profile._id, school: school._id, teacherId: `TCH-SYNC-${n}`, courses: [], joiningDate: new Date('2026-01-01'), status: 'active' });
    };
    const oldTeacher = await mkTeacher('Old', 1);
    const newTeacher = await mkTeacher('New', 2);
    const classA = await ClassModel.create({ school: school._id, title: 'Grade 6', section: 'A', room: 'R-6', shiftMode: 'Morning', gradeLevel: 6, academicYear: '2026/27', status: 'active' });
    const arabic = await Course.create({ title: { en: 'Arabic', so: '', ar: '' }, courseCode: 'ARAB-6', slug: 'sync-arabic', description: { en: '', so: '', ar: '' }, category: '', level: 'beginner', duration: 1, fee: 0, teacher: oldTeacher._id, school: school._id, class: classA._id, maxStudents: 50, enrolledStudents: 0, syllabus: [], prerequisites: [], status: 'published', isLive: false, accessMode: 'open' });

    const lesson = await ClassSchedule.create({ school: school._id, class: classA._id, course: arabic._id, teacher: oldTeacher._id, dayOfWeek: 0, startTime: '08:00', endTime: '08:40', isActive: true, createdBy: orgAdmin._id });
    const lessonTwo = await ClassSchedule.create({ school: school._id, class: classA._id, course: arabic._id, teacher: oldTeacher._id, dayOfWeek: 1, startTime: '08:00', endTime: '08:40', isActive: true, createdBy: orgAdmin._id });

    // Changing the course teacher moves its lessons too.
    const changed = await request(app).patch(`/api/v1/courses/${arabic._id}`).set('Authorization', `Bearer ${orgToken}`).send({ teacher: String(newTeacher._id) }).expect(200);
    assert.equal(changed.body.data.scheduleSync.updated, 2);
    assert.equal(String((await ClassSchedule.findById(lesson._id).lean())!.teacher), String(newTeacher._id));
    assert.equal(String((await ClassSchedule.findById(lessonTwo._id).lean())!.teacher), String(newTeacher._id));

    // Other edits do not touch lessons.
    const renamed = await request(app).patch(`/api/v1/courses/${arabic._id}`).set('Authorization', `Bearer ${orgToken}`).send({ status: 'published' }).expect(200);
    assert.equal(renamed.body.data.scheduleSync, undefined);

    // Lessons saved before the fix (stale teacher) are healed when the timetable loads.
    await ClassSchedule.updateOne({ _id: lesson._id }, { $set: { teacher: oldTeacher._id } });
    const listed = (await request(app).get(`/api/v1/class-schedules/school/list?school=${school._id}`).set('Authorization', `Bearer ${orgToken}`).expect(200)).body.data;
    const row = listed.find((item: any) => String(item._id) === String(lesson._id));
    assert.equal(String(row.teacher._id), String(newTeacher._id), 'the timetable shows the course teacher');
    assert.equal(String((await ClassSchedule.findById(lesson._id).lean())!.teacher), String(newTeacher._id), 'and the stored lesson is corrected');

    // Removing the course teacher clears its lessons' teacher.
    await request(app).patch(`/api/v1/courses/${arabic._id}`).set('Authorization', `Bearer ${orgToken}`).send({ teacher: null }).expect(200);
    assert.equal((await ClassSchedule.findById(lesson._id).lean())!.teacher ?? null, null);

    console.log('Class schedule teacher sync e2e passed');
  } finally {
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
