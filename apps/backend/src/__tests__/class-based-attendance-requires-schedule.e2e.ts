/**
 * A class_based school's attendance must go through a scheduled class
 * period. Previously, submitting POST /attendance for a class_based
 * school's course WITHOUT a schedule (reachable from the teacher's generic
 * "My Students" quick-attendance page, at /teacher/students, which has no
 * idea what attendanceType a course's school uses) was silently accepted:
 * it got locked immediately with none of the class_based roster-
 * completeness check, created no AttendanceSession (so admin
 * dashboards/reports never see it), and — because Attendance's unique
 * index includes `schedule` — landed in a SEPARATE document from whatever
 * the class's real scheduled session already recorded for that student,
 * leaving two independently-"locked", conflicting attendance records for
 * the same student/course/date with no way to reconcile them.
 *
 * course_based schools have no class/schedule concept to require here, so
 * that path must keep working exactly as before.
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
  else { console.log(`  FAIL ${label}`); failures += 1; }
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
    const { default: AttendanceSession } = await import('../models/attendance-session.model');
    const { default: Attendance } = await import('../models/attendance.model');

    const admin = await User.create({ email: 'nosched-admin@test.local', password: 'Password123!', role: 'admin' });
    const adminToken = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });

    const baseSchool = {
      organizationType: 'school', ownershipType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: 'QA Road', principalName: 'QA Principal', establishedYear: 2020, createdBy: admin._id,
    };

    console.log('\n=== class_based school: no schedule is rejected ===');
    {
      const school = await School.create({ ...baseSchool, name: 'Class Based QA School', institutionType: 'school', attendanceType: 'class_based', email: 'nosched-classbased@test.local', phone: '+252610000201' });
      const cls = await ClassModel.create({ school: school._id, title: 'Grade 9', section: 'A', room: 'R-9A', shiftMode: 'Morning', gradeLevel: 9, academicYear: '2026/27', status: 'active' });
      const course = await Course.create({
        title: { en: 'Science', so: '', ar: '' }, courseCode: 'NOSCHED-SCI', slug: 'nosched-science', description: { en: '', so: '', ar: '' },
        category: '', level: 'beginner', duration: 1, fee: 0, teacher: null, school: school._id, class: cls._id,
        maxStudents: 50, enrolledStudents: 0, syllabus: [], prerequisites: [], status: 'published', isLive: false, accessMode: 'open',
      });
      const studentUser = await User.create({ email: 'nosched-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
      const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'No', lastName: 'Schedule', gender: 'male' });
      const student = await Student.create({
        user: studentUser._id, profile: studentProfile._id, studentId: 'NOSCHED-001', school: school._id, class: cls._id,
        status: 'active', approvalStatus: 'approved', enrollmentDate: new Date('2026-09-01'), enrolledCourses: [course._id],
      });

      const quickAttendancePayload = {
        course: course._id.toString(),
        date: '2026-09-14',
        records: [{ student: student._id.toString(), status: 'present' }],
      };

      const response = await request(app).post('/api/v1/attendance').set('Authorization', `Bearer ${adminToken}`).send(quickAttendancePayload);
      assert(response.status === 400, `schedule-less submission is rejected for a class_based school (${response.status}: ${messageOf(response)})`);
      assert(/scheduled class period/i.test(messageOf(response)), 'the error directs the caller to the scheduled-period workflow');

      const stray = await Attendance.findOne({ course: course._id, student: student._id }).lean();
      assert(!stray, 'no orphaned Attendance document was created by the rejected submission');
      const session = await AttendanceSession.findOne({ school: school._id, course: course._id }).lean();
      assert(!session, 'no AttendanceSession was created either');
    }

    console.log('\n=== course_based school: no schedule still works (unchanged) ===');
    {
      const school = await School.create({ ...baseSchool, name: 'Course Based QA School', institutionType: 'school', attendanceType: 'course_based', email: 'nosched-coursebased@test.local', phone: '+252610000202' });
      const course = await Course.create({
        title: { en: 'Arts', so: '', ar: '' }, courseCode: 'NOSCHED-ART', slug: 'nosched-arts', description: { en: '', so: '', ar: '' },
        category: '', level: 'beginner', duration: 1, fee: 0, teacher: null, school: school._id, class: null,
        maxStudents: 50, enrolledStudents: 0, syllabus: [], prerequisites: [], status: 'published', isLive: false, accessMode: 'open',
      });
      const studentUser = await User.create({ email: 'nosched-cb-student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
      const studentProfile = await Profile.create({ user: studentUser._id, firstName: 'Course', lastName: 'Based', gender: 'female' });
      const student = await Student.create({
        user: studentUser._id, profile: studentProfile._id, studentId: 'NOSCHED-CB-001', school: school._id, class: null,
        status: 'active', approvalStatus: 'approved', enrollmentDate: new Date('2026-09-01'), enrolledCourses: [course._id],
      });

      const payload = { course: course._id.toString(), date: '2026-09-14', records: [{ student: student._id.toString(), status: 'present' }] };
      const response = await request(app).post('/api/v1/attendance').set('Authorization', `Bearer ${adminToken}`).send(payload);
      assert(response.status === 200, `schedule-less submission still succeeds for a course_based school (${response.status}: ${messageOf(response)})`);

      const saved = await Attendance.findOne({ course: course._id, student: student._id }).lean();
      assert(saved?.status === 'present' && saved?.schedule == null, 'the attendance record is saved without a schedule, as before');
    }
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} class_based attendance schedule-requirement assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nClass-based attendance schedule requirement regression passed.');
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
