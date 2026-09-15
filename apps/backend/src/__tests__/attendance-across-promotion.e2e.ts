/**
 * Attendance across a promotion cycle.
 *
 * Classes/Courses/ClassSchedule are persistent (never cloned per academic
 * year — see class-promotion.service.ts and the promotion controllers), so a
 * teacher who taught Grade 2 Math this year keeps teaching the exact same
 * Class/Course/ClassSchedule documents next year, just with a different
 * student roster. This test proves the attendance system already handles
 * that correctly end-to-end:
 *  - the teacher still has access to their course/schedule after promotion
 *    (Course.teacher / ClassSchedule.teacher are untouched by promotion);
 *  - the "take attendance" roster is computed live from the student's
 *    current class, so it automatically reflects this year's intake and
 *    excludes the students who promoted out;
 *  - marking the new year's attendance on the same recurring weekly slot
 *    never collides with last year's rows (Attendance/AttendanceSession are
 *    keyed by date, and academic years never share a date) — no duplicates;
 *    corrections to a locked school session require an audited unlock first,
 *    then update the existing date rather than inserting another row;
 *  - last year's attendance for the students who moved on to Grade 3 stays
 *    fully retrievable, even though they are no longer enrolled in the
 *    course or class it was recorded against.
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
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}
function messageOf(response: any): string {
  return String(response.body?.message || response.body?.error?.message || response.text || '');
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function nextMonday(from: Date): Date {
  const d = new Date(from);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Course } = await import('../models/course.model');
  const { default: Teacher } = await import('../models/teacher.model');
  const { default: Student } = await import('../models/student.model');
  const { default: ClassSchedule } = await import('../models/class-schedule.model');
  const { default: Attendance } = await import('../models/attendance.model');
  const { default: AttendanceSession } = await import('../models/attendance-session.model');
  const { syncStudentCourseEnrollment } = await import('../services/enrollment.service');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const admin = await User.create({ email: 'attendance-promo-admin@test.local', password: 'Password123!', role: 'admin' });
  const adminToken = tokenFor(admin._id.toString(), 'admin');

  const school = await School.create({
    name: 'Attendance Promotion School', institutionType: 'school', organizationType: 'school',
    ownershipType: 'private', attendanceType: 'class_based', country: 'Somalia', city: 'Mogadishu',
    address: 'Road', phone: '+252613330000', email: 'attendance-promo-school@test.local',
    principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
  });
  const department = await Department.create({ name: 'Primary', tenantId: school._id });

  async function makeClass(gradeLevel: number) {
    return ClassModel.create({
      school: school._id, department: department._id, title: `Grade ${gradeLevel}`, section: 'A',
      room: `Room ${gradeLevel}`, gradeLevel, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning',
    });
  }
  const grade1 = await makeClass(1);
  const grade2 = await makeClass(2);
  const grade3 = await makeClass(3);

  const teacherPerson = await User.create({ email: 'math-teacher@test.local', password: 'Password123!', role: 'teacher', organizationId: school._id });
  const teacherProfile = await Profile.create({ user: teacherPerson._id, firstName: 'Math', lastName: 'Teacher', gender: 'male' });
  const mathTeacher = await Teacher.create({
    user: teacherPerson._id, profile: teacherProfile._id, school: school._id,
    teacherId: 'TCH-2026-0001', courses: [], joiningDate: new Date('2026-01-01'), status: 'active',
  });
  const teacherToken = tokenFor(teacherPerson._id.toString(), 'teacher', school._id.toString());

  const mathCourse = await Course.create({
    title: { en: 'Mathematics' }, slug: `math-grade2-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    category: 'general', level: 'beginner', duration: 10, maxStudents: 30, school: school._id,
    class: grade2._id, teacher: mathTeacher._id, status: 'published',
  });
  const mathSchedule = await ClassSchedule.create({
    school: school._id, class: grade2._id, course: mathCourse._id, teacher: mathTeacher._id,
    room: grade2.room, dayOfWeek: 1, startTime: '08:00', endTime: '08:45', isActive: true, createdBy: admin._id,
  });

  async function makeStudent(name: string, cls: any) {
    const user = await User.create({ email: `${name.toLowerCase()}@attendance-promo.test`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: user._id, firstName: name, lastName: 'Student', gender: 'male' });
    const student = await Student.create({ user: user._id, profile: profile._id, school: school._id, class: cls._id, status: 'active', approvalStatus: 'approved', enrolledCourses: [], enrollmentHistory: [] });
    await syncStudentCourseEnrollment(student._id, cls._id);
    return student;
  }

  // This year's Grade 2 roster — will promote OUT to Grade 3.
  const g2a = await makeStudent('G2A', grade2);
  const g2b = await makeStudent('G2B', grade2);
  // Next year's Grade 2 roster — currently in Grade 1, will promote IN.
  const futureG2 = await makeStudent('FutureG2', grade1);

  const yearOneMonday = nextMonday(new Date(2026, 8, 1));
  const yearTwoMonday = new Date(yearOneMonday);
  yearTwoMonday.setDate(yearOneMonday.getDate() + 364); // exactly 52 weeks later — same weekday
  const yearOneDate = isoDate(yearOneMonday);
  const yearTwoDate = isoDate(yearTwoMonday);
  assert(yearOneMonday.getDay() === 1 && yearTwoMonday.getDay() === 1, 'both test dates land on the schedule\'s Monday slot');

  section('YEAR 1 — teacher takes attendance for the outgoing Grade 2 roster');
  const yearOneAttendance = await request(app)
    .post('/api/v1/attendance')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      course: mathCourse._id.toString(), schedule: mathSchedule._id.toString(), date: yearOneDate,
      records: [
        { student: g2a._id.toString(), status: 'present' },
        { student: g2b._id.toString(), status: 'absent' },
      ],
    });
  assert(yearOneAttendance.status === 200, `Year 1 attendance saves (status ${yearOneAttendance.status}: ${messageOf(yearOneAttendance)})`);
  assert(yearOneAttendance.body?.data?.completion === 'complete' && yearOneAttendance.body?.data?.locked === true, 'full Grade 2 roster completes and locks the Year 1 session');
  assert(await Course.findById(mathCourse._id).lean().then((c: any) => c.enrolledStudents === 2), 'Math course shows 2 enrolled students before promotion');

  section('PROMOTION — Grade 1 -> Grade 2 -> Grade 3, same persistent classes/course/schedule');
  const promoted = await request(app)
    .post('/api/v1/classes/promote-all')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ schoolId: school._id.toString(), targetAcademicYear: '2027-2028' });
  assert(promoted.status === 200, `promote-all succeeds (status ${promoted.status}: ${messageOf(promoted)})`);
  assert(promoted.body?.data?.studentsMoved === 3, `all three students promote in one call (got ${JSON.stringify(promoted.body?.data)})`);
  assert((promoted.body?.data?.missingTargets || []).length === 0, 'Grade 3 has no students of its own yet, so it is never flagged as a missing target');

  const g2aAfter: any = await Student.findById(g2a._id).lean();
  const g2bAfter: any = await Student.findById(g2b._id).lean();
  const futureG2After: any = await Student.findById(futureG2._id).lean();
  assert(String(g2aAfter?.class) === String(grade3._id), 'G2A moved into the existing Grade 3 class');
  assert(String(g2bAfter?.class) === String(grade3._id), 'G2B moved into the existing Grade 3 class');
  assert(String(futureG2After?.class) === String(grade2._id), 'FutureG2 moved into the SAME Grade 2 class the teacher still teaches');

  assert(await ClassSchedule.countDocuments({ school: school._id }) === 1, 'still exactly one ClassSchedule row — never cloned by promotion');
  assert(await Course.countDocuments({ school: school._id }) === 1, 'still exactly one Course — never cloned by promotion');
  const mathCourseAfterPromotion: any = await Course.findById(mathCourse._id).lean();
  assert(mathCourseAfterPromotion?.enrolledStudents === 1, `Math course now shows only the new Grade 2 intake (got ${mathCourseAfterPromotion?.enrolledStudents})`);

  section('YEAR 2 — teacher keeps access to the same course/schedule; roster reflects the new intake');
  const teacherSchedulePortal = await request(app)
    .get('/api/v1/class-schedules/my-teaching')
    .set('Authorization', `Bearer ${teacherToken}`);
  assert(teacherSchedulePortal.status === 200, `teacher schedule portal still loads after promotion (status ${teacherSchedulePortal.status})`);
  assert((teacherSchedulePortal.body?.data || []).some((row: any) => String(row._id) === String(mathSchedule._id)), 'teacher still sees the exact same Math schedule row next year — no reassignment needed');

  const rosterAfterPromotion = await request(app)
    .get(`/api/v1/teacher-portal/courses/${mathCourse._id}/attendance-roster`)
    .set('Authorization', `Bearer ${teacherToken}`);
  assert(rosterAfterPromotion.status === 200, `attendance roster loads for the teacher (status ${rosterAfterPromotion.status})`);
  const rosterIds = (rosterAfterPromotion.body?.data || []).map((s: any) => String(s._id));
  assert(rosterIds.length === 1 && rosterIds[0] === String(futureG2._id), `roster now shows only the new Grade 2 intake, not the students who moved to Grade 3 (got ${JSON.stringify(rosterIds)})`);

  const yearTwoAttendance = await request(app)
    .post('/api/v1/attendance')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      course: mathCourse._id.toString(), schedule: mathSchedule._id.toString(), date: yearTwoDate,
      records: [{ student: futureG2._id.toString(), status: 'present' }],
    });
  assert(yearTwoAttendance.status === 200, `Year 2 attendance saves on the same recurring slot without conflict (status ${yearTwoAttendance.status}: ${messageOf(yearTwoAttendance)})`);
  assert(yearTwoAttendance.body?.data?.completion === 'complete' && yearTwoAttendance.body?.data?.locked === true, 'the new, smaller roster still completes and locks correctly');

  section('DUPLICATE-SAFETY — academic-year dates stay separate; corrections remain audited');
  assert(await Attendance.countDocuments({ course: mathCourse._id }) === 3, 'exactly 3 Attendance rows total: 2 from Year 1, 1 from Year 2');
  assert(await AttendanceSession.countDocuments({ schedule: mathSchedule._id }) === 2, 'exactly 2 AttendanceSession rows: one per date, never merged or duplicated');

  const lockedCorrectionAttempt = await request(app)
    .post('/api/v1/attendance')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      course: mathCourse._id.toString(), schedule: mathSchedule._id.toString(), date: yearTwoDate,
      records: [{ student: futureG2._id.toString(), status: 'late' }],
    });
  assert(lockedCorrectionAttempt.status === 403, `locked Year 2 attendance rejects a direct correction (status ${lockedCorrectionAttempt.status})`);
  assert(/unlock/i.test(messageOf(lockedCorrectionAttempt)), 'locked correction response directs the admin through the audited unlock flow');
  assert(await Attendance.countDocuments({ course: mathCourse._id }) === 3, 'blocked correction never inserts a duplicate attendance row');
  const unchangedRow: any = await Attendance.findOne({ course: mathCourse._id, student: futureG2._id, date: yearTwoMonday }).lean();
  assert(unchangedRow?.status === 'present', 'blocked correction leaves the locked Year 2 attendance unchanged');

  const unlockYearTwo = await request(app)
    .patch('/api/v1/attendance/school/unlock')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      course: mathCourse._id.toString(), schedule: mathSchedule._id.toString(), date: yearTwoDate,
      reason: 'Correcting verified Year 2 register entry',
    });
  assert(unlockYearTwo.status === 200, `authorized audited unlock succeeds before correction (status ${unlockYearTwo.status}: ${messageOf(unlockYearTwo)})`);

  const unlockedSession: any = await AttendanceSession.findOne({
    schedule: mathSchedule._id,
    date: new Date(`${yearTwoDate}T00:00:00`),
  }).lean();
  assert(unlockedSession?.locked === false, 'audited unlock clears the Year 2 session lock');
  assert(unlockedSession?.corrections?.some((row: any) => row.reason === 'Correcting verified Year 2 register entry'), 'audited unlock records the correction reason');

  const correctedYearTwo = await request(app)
    .post('/api/v1/attendance')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      course: mathCourse._id.toString(), schedule: mathSchedule._id.toString(), date: yearTwoDate,
      records: [{ student: futureG2._id.toString(), status: 'late', reasonCode: 'transport_delay' }],
    });
  assert(correctedYearTwo.status === 200, `Year 2 correction succeeds after audited unlock (status ${correctedYearTwo.status}: ${messageOf(correctedYearTwo)})`);
  assert(await Attendance.countDocuments({ course: mathCourse._id }) === 3, 'correcting the same date updates the existing row instead of inserting a duplicate');
  const updatedRow: any = await Attendance.findOne({ course: mathCourse._id, student: futureG2._id, date: yearTwoMonday }).lean();
  assert(updatedRow?.status === 'late' && updatedRow?.reasonCode === 'transport_delay', 'the corrected row reflects the verified late status and reason');

  const relockedSession: any = await AttendanceSession.findOne({
    schedule: mathSchedule._id,
    date: new Date(`${yearTwoDate}T00:00:00`),
  }).lean();
  assert(relockedSession?.locked === true && relockedSession?.status === 'complete', 'corrected complete Year 2 roster is re-locked');

  section('HISTORY — last year\'s Grade 2 attendance stays retrievable for students now in Grade 3');
  const yearOneReadBack = await request(app)
    .get('/api/v1/attendance/course')
    .query({ courseId: mathCourse._id.toString(), date: yearOneDate, schedule: mathSchedule._id.toString() })
    .set('Authorization', `Bearer ${adminToken}`);
  assert(yearOneReadBack.status === 200, `Year 1 attendance is still readable (status ${yearOneReadBack.status})`);
  const yearOneRows = yearOneReadBack.body?.data || [];
  assert(yearOneRows.length === 2, `both Year 1 records are intact (got ${yearOneRows.length})`);

  const g2aHistory = await request(app)
    .get('/api/v1/attendance/history')
    .query({ courseId: mathCourse._id.toString(), studentId: g2a._id.toString() })
    .set('Authorization', `Bearer ${adminToken}`);
  assert(g2aHistory.status === 200, `G2A's Math attendance history is still reachable after moving to Grade 3 (status ${g2aHistory.status})`);
  const g2aRows = g2aHistory.body?.data || [];
  assert(g2aRows.length === 1 && g2aRows[0]?.status === 'present', 'G2A\'s Year 1 "present" record survives even though they are no longer enrolled in this course or class');

  console.log(`\n${'='.repeat(70)}`);
  console.log(failures === 0 ? 'ALL ATTENDANCE-ACROSS-PROMOTION CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(70));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('FATAL ERROR:', error);
  try { await mongoose.disconnect(); } catch { /* no-op */ }
  process.exit(1);
});