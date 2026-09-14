/**
 * Attendance lock audit regression.
 *
 * A completed school period must be immutable for every role, including the
 * platform admin. Corrections are allowed only after the explicit school
 * unlock endpoint records a reason in AttendanceSession.corrections.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    console.log(`  FAIL ${label}`);
    failures += 1;
  }
}

function messageOf(response: any): string {
  return String(response.body?.message || response.body?.error?.message || response.text || '');
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Student } = await import('../models/student.model');
    const { default: ClassSchedule } = await import('../models/class-schedule.model');
    const { default: AttendanceSession } = await import('../models/attendance-session.model');
    const { default: Attendance } = await import('../models/attendance.model');

    const admin = await User.create({
      email: 'attendance-lock-admin@test.local',
      password: 'Password123!',
      role: 'admin',
    });
    const adminToken = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });

    const school = await School.create({
      name: 'Attendance Lock QA School',
      institutionType: 'school',
      organizationType: 'school',
      ownershipType: 'private',
      attendanceType: 'class_based',
      country: 'Somalia',
      city: 'Mogadishu',
      address: 'QA Road',
      phone: '+252610000101',
      email: 'attendance-lock-school@test.local',
      principalName: 'QA Principal',
      establishedYear: 2020,
      createdBy: admin._id,
    });

    const cls = await ClassModel.create({
      school: school._id,
      title: 'Grade 8',
      section: 'A',
      room: 'R-8A',
      shiftMode: 'Morning',
      gradeLevel: 8,
      academicYear: '2026/27',
      status: 'active',
    });

    const course = await Course.create({
      title: { en: 'Mathematics', so: '', ar: '' },
      courseCode: 'ATT-QA-MATH',
      slug: 'attendance-lock-qa-math',
      description: { en: '', so: '', ar: '' },
      category: '',
      level: 'beginner',
      duration: 1,
      fee: 0,
      teacher: null,
      school: school._id,
      class: cls._id,
      maxStudents: 50,
      enrolledStudents: 0,
      syllabus: [],
      prerequisites: [],
      status: 'published',
      isLive: false,
      accessMode: 'open',
    });

    const studentUser = await User.create({
      email: 'attendance-lock-student@test.local',
      password: 'Password123!',
      role: 'student',
      organizationId: school._id,
    });
    const studentProfile = await Profile.create({
      user: studentUser._id,
      firstName: 'Lock',
      lastName: 'Student',
      gender: 'male',
    });
    const student = await Student.create({
      user: studentUser._id,
      profile: studentProfile._id,
      studentId: 'ATT-LOCK-001',
      school: school._id,
      class: cls._id,
      status: 'active',
      approvalStatus: 'approved',
      enrollmentDate: new Date('2026-09-01'),
      enrolledCourses: [course._id],
    });

    // 2026-09-14 is Monday (dayOfWeek=1).
    const schedule = await ClassSchedule.create({
      school: school._id,
      class: cls._id,
      course: course._id,
      teacher: null,
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '08:45',
      isActive: true,
      createdBy: admin._id,
    });

    const payload = {
      course: course._id.toString(),
      schedule: schedule._id.toString(),
      date: '2026-09-14',
      records: [{ student: student._id.toString(), status: 'present' }],
    };

    const firstSubmit = await request(app)
      .post('/api/v1/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    assert(firstSubmit.status === 200, `first school attendance submission succeeds (${firstSubmit.status}: ${messageOf(firstSubmit)})`);
    assert(firstSubmit.body?.data?.locked === true, 'complete school roster is locked');

    const lockedSession: any = await AttendanceSession.findOne({ schedule: schedule._id, date: new Date('2026-09-14T00:00:00') }).lean();
    assert(lockedSession?.locked === true, 'AttendanceSession persists locked=true');

    const bypassAttempt = await request(app)
      .post('/api/v1/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, records: [{ student: student._id.toString(), status: 'absent' }] });
    assert(bypassAttempt.status === 403, `platform admin cannot overwrite locked school attendance (${bypassAttempt.status}: ${messageOf(bypassAttempt)})`);
    assert(/unlock/i.test(messageOf(bypassAttempt)), 'locked overwrite response directs user through audited unlock flow');

    const unchanged: any = await Attendance.findOne({ schedule: schedule._id, student: student._id }).lean();
    assert(unchanged?.status === 'present', 'blocked overwrite leaves original attendance unchanged');

    const unlock = await request(app)
      .patch('/api/v1/attendance/school/unlock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        course: course._id.toString(),
        schedule: schedule._id.toString(),
        date: '2026-09-14',
        reason: 'Correcting verified register entry',
      });
    assert(unlock.status === 200, `audited unlock succeeds (${unlock.status}: ${messageOf(unlock)})`);

    const afterUnlock: any = await AttendanceSession.findOne({ schedule: schedule._id }).lean();
    assert(afterUnlock?.locked === false, 'unlock clears the session lock');
    assert(afterUnlock?.corrections?.length === 1, 'unlock appends one correction audit record');
    assert(afterUnlock?.corrections?.[0]?.reason === 'Correcting verified register entry', 'correction reason is persisted');
    assert(String(afterUnlock?.corrections?.[0]?.unlockedBy || '') === admin._id.toString(), 'correction actor is persisted');

    const correctedSubmit = await request(app)
      .post('/api/v1/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, records: [{ student: student._id.toString(), status: 'absent', reasonCode: 'sick' }] });
    assert(correctedSubmit.status === 200, `attendance can be corrected after audited unlock (${correctedSubmit.status}: ${messageOf(correctedSubmit)})`);

    const corrected: any = await Attendance.findOne({ schedule: schedule._id, student: student._id }).lean();
    assert(corrected?.status === 'absent' && corrected?.reasonCode === 'sick', 'corrected attendance is persisted after unlock');

    const relocked: any = await AttendanceSession.findOne({ schedule: schedule._id }).lean();
    assert(relocked?.locked === true && relocked?.status === 'complete', 'corrected complete roster is re-locked');
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} attendance lock regression assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nAttendance lock audit regression passed.');
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});