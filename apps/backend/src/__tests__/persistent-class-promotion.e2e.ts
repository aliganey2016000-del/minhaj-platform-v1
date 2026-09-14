/**
 * Persistent-class promotion regression test.
 *
 * Covers the specific guarantees the class/course/schedule-persistence
 * rework makes that the other promotion test files don't already exercise:
 *  - a missing target class is reported and the group is skipped — never
 *    auto-created;
 *  - an existing target's Course and ClassSchedule rows are untouched by
 *    promotion (no cloning, no duplicate rows);
 *  - repeating the exact same "repeat" decision for the same target year
 *    does not duplicate the student's enrollmentHistory entry.
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
  const { default: Student } = await import('../models/student.model');
  const { default: Course } = await import('../models/course.model');
  const { default: ClassSchedule } = await import('../models/class-schedule.model');
  const { syncStudentCourseEnrollment } = await import('../services/enrollment.service');

  const admin = await User.create({ email: 'persistent-promo-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
  const school = await School.create({
    name: 'Persistent Promotion School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: 'Road', phone: '+252611111111', email: 'persistent-promo-school@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: admin._id,
  });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });

  async function makeClass(gradeLevel: number, extra: Record<string, unknown> = {}) {
    return ClassModel.create({
      school: school._id, department: department._id, title: `Grade ${gradeLevel}`, section: 'A',
      room: `Room ${gradeLevel}`, gradeLevel, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning',
      ...extra,
    });
  }
  async function makeStudent(name: string, cls: any) {
    const user = await User.create({ email: `${name.toLowerCase()}@persistent-promo.test`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: user._id, firstName: name, lastName: 'Student', gender: 'male' });
    return Student.create({ user: user._id, profile: profile._id, school: school._id, class: cls._id, status: 'active', approvalStatus: 'approved', enrolledCourses: [], enrollmentHistory: [] });
  }

  section('MISSING TARGET — reported, group skipped, nothing created');
  const grade5 = await makeClass(5); // No Grade 6 class exists at all yet.
  const missingStudent = await makeStudent('NoTarget', grade5);
  const classCountBeforeMissing = await ClassModel.countDocuments({ school: school._id });

  const previewMissing = await request(app).get('/api/v1/classes/promotion-preview').set('Authorization', `Bearer ${token}`).query({ schoolId: school._id.toString() });
  const missingGroup = (previewMissing.body?.data?.groups || []).find((g: any) => String(g.classId) === String(grade5._id));
  assert(missingGroup?.action === 'missing-target', `preview reports the missing target instead of offering to create one (got ${missingGroup?.action})`);
  assert(typeof missingGroup?.reason === 'string' && /Manage Classes/.test(missingGroup.reason), 'preview names Manage Classes as where to create it');

  const promoteMissing = await request(app).post('/api/v1/classes/promote-all').set('Authorization', `Bearer ${token}`).send({ schoolId: school._id.toString(), targetAcademicYear: '2027-2028' });
  assert(promoteMissing.status === 200, `promote-all still succeeds overall despite one missing target (got ${promoteMissing.status})`);
  assert(promoteMissing.body?.data?.studentsMoved === 0, 'the student in the missing-target class was not moved');
  assert((promoteMissing.body?.data?.missingTargets || []).length === 1, 'exactly one missing target is reported');
  assert(String(await ClassModel.countDocuments({ school: school._id })) === String(classCountBeforeMissing), 'no Class document was auto-created for the missing target');
  const stillInGrade5: any = await Student.findById(missingStudent._id).lean();
  assert(String(stillInGrade5?.class) === String(grade5._id), 'the student stays in Grade 5, untouched, until the target exists');

  section('EXISTING TARGET — Course and ClassSchedule are never duplicated');
  const grade6 = await makeClass(6);
  const grade6Course = await Course.create({
    title: { en: 'Grade 6 Core' }, slug: `grade-6-core-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    category: 'general', level: 'beginner', duration: 10, maxStudents: 30, school: school._id, class: grade6._id, status: 'published',
  });
  await ClassSchedule.create({
    school: school._id, class: grade6._id, course: grade6Course._id, room: grade6.room,
    dayOfWeek: 1, startTime: '08:00', endTime: '09:00', isActive: true, createdBy: admin._id,
  });
  const courseCountBefore = await Course.countDocuments({ school: school._id });
  const scheduleCountBefore = await ClassSchedule.countDocuments({ school: school._id });
  const scheduleIdBefore = (await ClassSchedule.findOne({ class: grade6._id }).lean())?._id;

  const readyStudent = await makeStudent('ReadyToMove', grade5);
  const movePromote = await request(app).post('/api/v1/classes/promote-all').set('Authorization', `Bearer ${token}`).send({ schoolId: school._id.toString(), targetAcademicYear: '2027-2028' });
  // Grade 5 now has two active students: the earlier one that was skipped
  // when Grade 6 didn't exist yet, and this new one — both move now that
  // the target is ready.
  assert(movePromote.status === 200 && movePromote.body?.data?.studentsMoved === 2, `both waiting Grade 5 students promote into the now-existing Grade 6 (got ${JSON.stringify(movePromote.body?.data)})`);

  const moved: any = await Student.findById(readyStudent._id).lean();
  const previouslyMissing: any = await Student.findById(missingStudent._id).lean();
  assert(String(moved?.class) === String(grade6._id), 'the newly-added student landed in the real, pre-existing Grade 6 class');
  assert(String(previouslyMissing?.class) === String(grade6._id), 'the earlier skipped student is also picked up now that the target exists');
  assert(await Course.countDocuments({ school: school._id }) === courseCountBefore, 'Course count is unchanged — nothing was cloned');
  assert(await ClassSchedule.countDocuments({ school: school._id }) === scheduleCountBefore, 'ClassSchedule count is unchanged — nothing was cloned');
  const scheduleAfter = await ClassSchedule.findOne({ class: grade6._id }).lean();
  assert(String(scheduleAfter?._id) === String(scheduleIdBefore), 'the original schedule row itself is untouched, not replaced');
  assert(moved?.enrolledCourses?.some((id: any) => String(id) === String(grade6Course._id)), 'the promoted student is enrolled in the target class\'s existing course');

  section('REPEAT IS IDEMPOTENT — same target year twice does not duplicate history');
  const grade7 = await makeClass(7);
  const repeater = await makeStudent('RepeatSame', grade7);
  await syncStudentCourseEnrollment(repeater._id, grade7._id);

  const firstRepeat = await request(app).post('/api/v1/classes/promote-reviewed').set('Authorization', `Bearer ${token}`).send({
    schoolId: school._id.toString(), targetAcademicYear: '2027-2028',
    decisions: [{ studentId: repeater._id.toString(), action: 'repeat' }],
  });
  assert(firstRepeat.status === 200 && firstRepeat.body?.data?.studentsRepeated === 1, `first repeat succeeds (got ${JSON.stringify(firstRepeat.body?.data)})`);

  const secondRepeat = await request(app).post('/api/v1/classes/promote-reviewed').set('Authorization', `Bearer ${token}`).send({
    schoolId: school._id.toString(), targetAcademicYear: '2027-2028',
    decisions: [{ studentId: repeater._id.toString(), action: 'repeat' }],
  });
  assert(secondRepeat.status === 200 && secondRepeat.body?.data?.studentsRepeated === 1, `re-submitting the same repeat decision is accepted, not an error (got ${JSON.stringify(secondRepeat.body?.data)})`);

  const repeaterAfter: any = await Student.findById(repeater._id).lean();
  const historyFor2728 = (repeaterAfter?.enrollmentHistory || []).filter((h: any) => h.academicYear === '2027-2028');
  assert(historyFor2728.length === 1, `exactly one 2027-2028 history entry exists after repeating twice, not two (got ${historyFor2728.length})`);
  assert(String(repeaterAfter?.class) === String(grade7._id), 'repeater is still in the same Grade 7 class after both calls');

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL PERSISTENT-CLASS PROMOTION CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
