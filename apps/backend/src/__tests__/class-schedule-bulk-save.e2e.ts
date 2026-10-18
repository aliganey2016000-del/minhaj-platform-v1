process.env.JWT_ACCESS_SECRET = 'schedule-bulk-access';
process.env.JWT_REFRESH_SECRET = 'schedule-bulk-refresh';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestDb } from './support/test-db';

async function main() {
  const db = await startTestDb('class-schedule-bulk-save');
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

    const admin = await User.create({ email: 'bulk-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({ name: 'Bulk School', institutionType: 'school', organizationType: 'school', ownershipType: 'private', attendanceType: 'class_based', country: 'Somalia', city: 'Mogadishu', address: 'Road', phone: '+252610000061', email: 'bulk-school@test.local', principalName: 'P', establishedYear: 2020, createdBy: admin._id });
    const orgAdmin = await User.create({ email: 'bulk-org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const token = generateAccessToken({ userId: String(orgAdmin._id), role: 'org_admin', permissions: [], organizationId: String(school._id) });
    const H = { Authorization: `Bearer ${token}` };

    const mkTeacher = async (tag: string, n: number) => {
      const user = await User.create({ email: `bulk-${tag}@test.local`, password: 'Password123!', role: 'teacher', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: tag, lastName: 'Teacher', gender: 'male' });
      return Teacher.create({ user: user._id, profile: profile._id, school: school._id, teacherId: `TCH-BULK-${n}`, courses: [], joiningDate: new Date('2026-01-01'), status: 'active' });
    };
    const salah = await mkTeacher('Salah', 1);
    const saalax = await mkTeacher('Saalax', 2);
    const mkClass = (section: string, room: string) => ClassModel.create({ school: school._id, title: 'Grade 9', section, room, shiftMode: 'Morning', gradeLevel: 9, academicYear: '2026/27', status: 'active' });
    const g9 = await mkClass('A', 'R9');
    const g10 = await mkClass('B', 'R10');
    const mkCourse = (slug: string, title: string, cls: any, teacher: any) => Course.create({ title: { en: title, so: '', ar: '' }, courseCode: slug.toUpperCase(), slug, description: { en: '', so: '', ar: '' }, category: '', level: 'beginner', duration: 1, fee: 0, teacher: teacher._id, school: school._id, class: cls._id, maxStudents: 50, enrolledStudents: 0, syllabus: [], prerequisites: [], status: 'published', isLive: false, accessMode: 'open' });
    const arabic9 = await mkCourse('bulk-arabic-9', 'Arabic', g9, salah);
    const history9 = await mkCourse('bulk-history-9', 'History', g9, saalax);
    const arabic10 = await mkCourse('bulk-arabic-10', 'Arabic', g10, salah);
    const history10 = await mkCourse('bulk-history-10', 'History', g10, saalax);
    const science9 = await mkCourse('bulk-science-9', 'Science', g9, saalax);

    // Wednesday period 4: Grade 9 has History (Saalax), Grade 10 has Arabic (Salah).
    const slot = { dayOfWeek: 3, startTime: '10:30', endTime: '11:10', isActive: true, createdBy: orgAdmin._id };
    await ClassSchedule.create({ school: school._id, class: g9._id, course: history9._id, teacher: saalax._id, ...slot });
    await ClassSchedule.create({ school: school._id, class: g10._id, course: arabic10._id, teacher: salah._id, ...slot });
    const cell = (cls: any, course: any) => ({ key: `3|${cls._id}|10:30|11:10`, class: String(cls._id), dayOfWeek: 3, startTime: '10:30', endTime: '11:10', course: course ? String(course._id) : null });
    const save = (changes: any[]) => request(app).post('/api/v1/class-schedules/school/bulk-save').set(H).send({ school: String(school._id), changes });

    // Swapping the two teachers saves, because the final timetable has no clash.
    const swap = (await save([cell(g9, arabic9), cell(g10, history10)]).expect(200)).body.data;
    assert.deepEqual(swap.failed, [], JSON.stringify(swap));
    assert.equal(swap.saved.length, 2);
    const at = async (cls: any) => (await ClassSchedule.findOne({ class: cls._id, dayOfWeek: 3, startTime: '10:30' }).lean())!;
    assert.equal(String((await at(g9)).teacher), String(salah._id));
    assert.equal(String((await at(g10)).teacher), String(saalax._id));
    assert.equal(await ClassSchedule.countDocuments({ school: school._id }), 2, 'no duplicate lessons');

    // A real clash is reported and skipped; the rest of the batch still saves.
    const mixed = (await save([cell(g10, arabic10), { ...cell(g9, null), key: 'unrelated' }]).expect(200)).body.data;
    // Grade 10 would get Salah while Grade 9 still has Salah, unless Grade 9 is cleared in the same save.
    assert.equal(mixed.failed.length, 0, 'clearing Grade 9 frees Salah for Grade 10');
    assert.equal(await ClassSchedule.countDocuments({ school: school._id, class: g9._id }), 0);

    // Now Grade 10 has Arabic (Salah); giving Grade 9 Arabic too is a real clash and is rejected.
    const clash = (await save([cell(g9, arabic9)]).expect(200)).body.data;
    assert.equal(clash.saved.length, 0);
    assert.match(clash.failed[0].message, /Teacher conflict: .*Salah.* is already scheduled for Arabic in Grade 9 — B from 10:30 to 11:10/);
    assert.equal(await ClassSchedule.countDocuments({ school: school._id, class: g9._id }), 0, 'nothing was written for the clashing change');

    // One clashing change does not stop an independent one in the same batch.
    const partial = (await save([cell(g9, arabic9), { ...cell(g9, science9), key: 'other', startTime: '08:00', endTime: '08:40' }]).expect(200)).body.data;
    assert.deepEqual(partial.saved, ['other']);
    assert.equal(partial.failed.length, 1);

    // Clearing a cell deletes its lesson.
    const cleared = (await save([cell(g10, null)]).expect(200)).body.data;
    assert.equal(cleared.saved.length, 1);
    assert.equal(await ClassSchedule.countDocuments({ school: school._id, class: g10._id }), 0);

    await request(app).post('/api/v1/class-schedules/school/bulk-save').set(H).send({ school: String(school._id), changes: [] }).expect(400);

    console.log('Class schedule bulk save e2e passed');
  } finally {
    await db.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
