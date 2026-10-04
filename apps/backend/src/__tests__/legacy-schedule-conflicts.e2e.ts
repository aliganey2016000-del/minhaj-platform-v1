/**
 * Round 11 audit finding — legacy ClassSchedule routes had NO conflict
 * detection at all.
 *
 * POST /api/v1/class-schedules/school and PUT /api/v1/class-schedules/school/:id
 * (the simplified single-school workflow) run class/teacher/room overlap
 * checks via assertNoConflicts() inside school-class-schedule.controller.ts,
 * already covered by class-schedule-timetable-a-z.e2e.ts.
 *
 * But the LEGACY routes — POST /api/v1/class-schedules and
 * PUT /api/v1/class-schedules/:id — used by university/college/training-
 * center tenants (and any super-admin flow not restricted to institutionType
 * 'school') called neither that controller logic nor any middleware: a
 * teacher (or a room) could be booked into two overlapping classes with zero
 * validation. Fixed by wiring a new validateLegacyScheduleConflicts
 * middleware (middleware/timetable-room-conflict.middleware.ts) into both
 * routes.
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
function messageOf(response: any): string {
  return String(response.body?.message || response.body?.error?.message || response.text || '');
}

async function main() {
  const db = await startTestDb('legacy-schedule-conflicts');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: ClassSchedule } = await import('../models/class-schedule.model');

    const admin = await User.create({ email: 'legacy-sched-admin@test.local', password: 'Password123!', role: 'admin' });
    // A university — the legacy /class-schedules routes are the only ones
    // available to this institution type (the /school workflow explicitly
    // rejects anything but institutionType 'school').
    const school = await School.create({
      name: 'Legacy Schedule University',
      institutionType: 'university',
      organizationType: 'university',
      ownershipType: 'private',
      attendanceType: 'class_based',
      country: 'Somalia',
      city: 'Mogadishu',
      address: 'University Road',
      phone: '+252610000099',
      email: 'legacy-sched-university@test.local',
      principalName: 'University Dean',
      establishedYear: 2015,
      createdBy: admin._id,
    });
    const orgAdmin = await User.create({ email: 'legacy-sched-orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const token = generateAccessToken({ userId: orgAdmin._id.toString(), role: 'org_admin', permissions: [], organizationId: school._id.toString() });

    const teacherUser = await User.create({ email: 'legacy-sched-teacher@test.local', password: 'Password123!', role: 'teacher', organizationId: school._id });
    const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'Legacy', lastName: 'Teacher', gender: 'male' });
    const teacher = await Teacher.create({
      user: teacherUser._id, profile: teacherProfile._id, school: school._id,
      teacherId: 'TCH-LEGACY-001', courses: [], joiningDate: new Date('2026-01-01'), status: 'active',
    });

    const classRoomA = await ClassModel.create({
      school: school._id, title: 'Computer Science', section: 'Y1', room: 'Hall-A', shiftMode: 'Morning',
      gradeLevel: 1, academicYear: '2026/27', status: 'active',
    });
    const classRoomB = await ClassModel.create({
      school: school._id, title: 'Computer Science', section: 'Y2', room: 'Hall-B', shiftMode: 'Morning',
      gradeLevel: 2, academicYear: '2026/27', status: 'active',
    });

    const createCourse = async (slug: string, title: string, cls: any) => {
      return Course.create({
        title: { en: title, so: '', ar: '' }, courseCode: slug.toUpperCase(), slug,
        description: { en: '', so: '', ar: '' }, category: '', level: 'beginner', duration: 1, fee: 0,
        teacher: null, school: school._id, class: cls._id, maxStudents: 50, enrolledStudents: 0,
        syllabus: [], prerequisites: [], status: 'published', isLive: false, accessMode: 'open',
      });
    };
    const courseA = await createCourse('legacy-course-a', 'Algorithms', classRoomA);
    const courseB = await createCourse('legacy-course-b', 'Databases', classRoomB);

    // -----------------------------------------------------------------------
    section('LEGACY POST /class-schedules — teacher double-booking is blocked');
    // -----------------------------------------------------------------------
    const first = await request(app)
      .post('/api/v1/class-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        class: classRoomA._id.toString(), course: courseA._id.toString(), teacher: teacher._id.toString(),
        dayOfWeek: 2, startTime: '10:00', endTime: '11:00', isActive: true,
      });
    assert(first.status === 201, `first legacy schedule is created (status ${first.status}: ${messageOf(first)})`);

    // Same teacher, a DIFFERENT class, a DIFFERENT room, overlapping time —
    // this is exactly the "teacher scheduled for two overlapping classes in
    // different rooms" case: it must be rejected.
    const teacherDoubleBooked = await request(app)
      .post('/api/v1/class-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        class: classRoomB._id.toString(), course: courseB._id.toString(), teacher: teacher._id.toString(),
        dayOfWeek: 2, startTime: '10:30', endTime: '11:30', isActive: true,
      });
    assert(
      teacherDoubleBooked.status === 400 && /teacher conflict/i.test(messageOf(teacherDoubleBooked)),
      `legacy create rejects a teacher double-booked across different classes/rooms (status ${teacherDoubleBooked.status}: ${messageOf(teacherDoubleBooked)})`
    );

    const beforeFixCount = await ClassSchedule.countDocuments({ teacher: teacher._id, dayOfWeek: 2 });
    assert(beforeFixCount === 1, `only the first schedule exists for this teacher/day (found ${beforeFixCount})`);

    // -----------------------------------------------------------------------
    section('LEGACY POST /class-schedules — room double-booking (different classes) is blocked');
    // -----------------------------------------------------------------------
    const classRoomA2 = await ClassModel.create({
      school: school._id, title: 'Computer Science', section: 'Y3', room: 'Hall-A', shiftMode: 'Afternoon',
      gradeLevel: 3, academicYear: '2026/27', status: 'active',
    });
    const courseA2 = await createCourse('legacy-course-a2', 'Operating Systems', classRoomA2);

    const roomDoubleBooked = await request(app)
      .post('/api/v1/class-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        class: classRoomA2._id.toString(), course: courseA2._id.toString(),
        dayOfWeek: 2, startTime: '10:15', endTime: '10:45', isActive: true,
      });
    assert(
      roomDoubleBooked.status === 400 && /room conflict/i.test(messageOf(roomDoubleBooked)),
      `legacy create rejects a room double-booked across different classes (status ${roomDoubleBooked.status}: ${messageOf(roomDoubleBooked)})`
    );

    // -----------------------------------------------------------------------
    section('LEGACY PUT /class-schedules/:id — editing into a conflict is blocked too');
    // -----------------------------------------------------------------------
    const standalone = await request(app)
      .post('/api/v1/class-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        class: classRoomB._id.toString(), course: courseB._id.toString(),
        dayOfWeek: 3, startTime: '09:00', endTime: '10:00', isActive: true,
      });
    assert(standalone.status === 201, `standalone schedule on a different day is created (status ${standalone.status})`);
    const standaloneId = String(standalone.body?.data?._id || '');

    const editIntoConflict = await request(app)
      .put(`/api/v1/class-schedules/${standaloneId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ teacher: teacher._id.toString(), dayOfWeek: 2, startTime: '10:00', endTime: '11:00' });
    assert(
      editIntoConflict.status === 400 && /teacher conflict/i.test(messageOf(editIntoConflict)),
      `legacy update rejects editing a schedule into a teacher conflict (status ${editIntoConflict.status}: ${messageOf(editIntoConflict)})`
    );

    // Sanity: a genuinely non-conflicting create still succeeds end to end.
    const nonConflicting = await request(app)
      .post('/api/v1/class-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        class: classRoomB._id.toString(), course: courseB._id.toString(), teacher: teacher._id.toString(),
        dayOfWeek: 4, startTime: '13:00', endTime: '14:00', isActive: true,
      });
    assert(nonConflicting.status === 201, `a non-conflicting legacy schedule still succeeds (status ${nonConflicting.status}: ${messageOf(nonConflicting)})`);
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll legacy schedule conflict checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
