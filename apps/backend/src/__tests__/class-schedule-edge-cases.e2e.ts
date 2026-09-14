/**
 * Regression coverage for two production timetable edge cases:
 * 1) legacy active schedules remain visible when no Period Settings were saved;
 * 2) student/teacher portals hide stale schedules after referenced resources
 *    become non-schedulable.
 */
process.env.JWT_ACCESS_SECRET = 'schedule-edge-test-access-secret';
process.env.JWT_REFRESH_SECRET = 'schedule-edge-test-refresh-secret';
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

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: School } = await import('../models/school.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Course } = await import('../models/course.model');
  const { default: Teacher } = await import('../models/teacher.model');
  const { default: Student } = await import('../models/student.model');
  const { default: ClassSchedule } = await import('../models/class-schedule.model');

  const admin = await User.create({ email: 'edge-admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Schedule Edge School',
    institutionType: 'school',
    organizationType: 'school',
    ownershipType: 'private',
    attendanceType: 'class_based',
    country: 'Somalia',
    city: 'Mogadishu',
    address: 'Edge Road',
    phone: '+252610009991',
    email: 'edge-school@test.local',
    principalName: 'Edge Principal',
    establishedYear: 2024,
    createdBy: admin._id,
  });

  const orgAdmin = await User.create({
    email: 'edge-orgadmin@test.local',
    password: 'Password123!',
    role: 'org_admin',
    organizationId: school._id,
  });
  const orgToken = generateAccessToken({
    userId: orgAdmin._id.toString(),
    role: 'org_admin',
    permissions: [],
    organizationId: school._id.toString(),
  });

  const teacherUser = await User.create({
    email: 'edge-teacher@test.local',
    password: 'Password123!',
    role: 'teacher',
    organizationId: school._id,
  });
  const teacherProfile = await Profile.create({
    user: teacherUser._id,
    firstName: 'Edge',
    lastName: 'Teacher',
    gender: 'male',
  });
  const teacher = await Teacher.create({
    user: teacherUser._id,
    profile: teacherProfile._id,
    school: school._id,
    teacherId: 'TCH-2026-EDGE1',
    courses: [],
    joiningDate: new Date('2026-01-01'),
    status: 'active',
  });
  const teacherToken = generateAccessToken({
    userId: teacherUser._id.toString(),
    role: 'teacher',
    permissions: [],
    organizationId: school._id.toString(),
  });

  const cls = await ClassModel.create({
    school: school._id,
    title: 'Grade 7',
    section: 'A',
    room: 'R-7A',
    shiftMode: 'Morning',
    gradeLevel: 7,
    academicYear: '2026/27',
    status: 'active',
  });

  const course = await Course.create({
    title: { en: 'Edge Mathematics', so: '', ar: '' },
    courseCode: 'EDGE-MATH',
    slug: 'edge-mathematics',
    description: { en: '', so: '', ar: '' },
    category: '',
    level: 'beginner',
    duration: 1,
    fee: 0,
    teacher: teacher._id,
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
  teacher.courses = [course._id];
  await teacher.save();

  const studentUser = await User.create({
    email: 'edge-student@test.local',
    password: 'Password123!',
    role: 'student',
    organizationId: school._id,
  });
  const studentProfile = await Profile.create({
    user: studentUser._id,
    firstName: 'Edge',
    lastName: 'Student',
    gender: 'male',
  });
  await Student.create({
    user: studentUser._id,
    profile: studentProfile._id,
    studentId: 'EDGE-STU-001',
    school: school._id,
    class: cls._id,
    status: 'active',
    approvalStatus: 'approved',
    enrollmentDate: new Date('2026-09-01'),
    enrolledCourses: [course._id],
  });
  const studentToken = generateAccessToken({
    userId: studentUser._id.toString(),
    role: 'student',
    permissions: [],
    organizationId: school._id.toString(),
  });

  const schedule = await ClassSchedule.create({
    school: school._id,
    class: cls._id,
    course: course._id,
    teacher: teacher._id,
    dayOfWeek: 6,
    startTime: '07:10',
    endTime: '07:55',
    isActive: true,
    createdBy: orgAdmin._id,
  });

  console.log('\n=== UNSAVED PERIOD SETTINGS KEEP EXISTING SCHEDULE TIMES ===');
  const inferred = await request(app)
    .get('/api/v1/class-schedules/school/period-settings')
    .set('Authorization', `Bearer ${orgToken}`);
  assert(inferred.status === 200, `period settings load without saved configuration (${inferred.status})`);
  assert(inferred.body?.data?.configured === false, 'response identifies settings as not explicitly configured');
  assert(inferred.body?.data?.source === 'schedules', 'existing schedule times are used before hard-coded defaults');
  assert(
    (inferred.body?.data?.periods || []).some((p: any) => p.startTime === '07:10' && p.endTime === '07:55'),
    'legacy 07:10-07:55 lesson remains representable in Timetable View',
  );

  const saved = await request(app)
    .put('/api/v1/class-schedules/school/period-settings')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({ periods: [
      { label: 'Period 1', startTime: '07:00', endTime: '07:40', isBreak: false },
      { label: 'Break', startTime: '07:40', endTime: '08:00', isBreak: true },
    ] });
  assert(saved.status === 200, 'explicit period settings save successfully');

  const configured = await request(app)
    .get('/api/v1/class-schedules/school/period-settings')
    .set('Authorization', `Bearer ${orgToken}`);
  assert(configured.body?.data?.configured === true && configured.body?.data?.source === 'configured', 'saved settings remain authoritative');
  assert(configured.body?.data?.periods?.[0]?.startTime === '07:00', 'saved period time is returned after configuration');

  console.log('\n=== STALE REFERENCES DO NOT LEAK INTO PORTALS ===');
  const studentVisible = await request(app)
    .get('/api/v1/class-schedules/my')
    .set('Authorization', `Bearer ${studentToken}`);
  const teacherVisible = await request(app)
    .get('/api/v1/class-schedules/my-teaching')
    .set('Authorization', `Bearer ${teacherToken}`);
  assert((studentVisible.body?.data || []).some((row: any) => String(row._id) === String(schedule._id)), 'student sees valid active lesson');
  assert((teacherVisible.body?.data || []).some((row: any) => String(row._id) === String(schedule._id)), 'teacher sees valid active lesson');

  course.status = 'draft';
  await course.save();
  const studentAfterUnpublish = await request(app)
    .get('/api/v1/class-schedules/my')
    .set('Authorization', `Bearer ${studentToken}`);
  const teacherAfterUnpublish = await request(app)
    .get('/api/v1/class-schedules/my-teaching')
    .set('Authorization', `Bearer ${teacherToken}`);
  assert(!(studentAfterUnpublish.body?.data || []).some((row: any) => String(row._id) === String(schedule._id)), 'student portal hides schedule after course is unpublished');
  assert(!(teacherAfterUnpublish.body?.data || []).some((row: any) => String(row._id) === String(schedule._id)), 'teacher portal hides schedule after course is unpublished');

  course.status = 'published';
  await course.save();
  cls.status = 'inactive';
  await cls.save();
  const studentAfterClassInactive = await request(app)
    .get('/api/v1/class-schedules/my')
    .set('Authorization', `Bearer ${studentToken}`);
  const teacherAfterClassInactive = await request(app)
    .get('/api/v1/class-schedules/my-teaching')
    .set('Authorization', `Bearer ${teacherToken}`);
  assert(!(studentAfterClassInactive.body?.data || []).some((row: any) => String(row._id) === String(schedule._id)), 'student portal hides schedule after class is inactive');
  assert(!(teacherAfterClassInactive.body?.data || []).some((row: any) => String(row._id) === String(schedule._id)), 'teacher portal hides schedule after class is inactive');

  cls.status = 'active';
  await cls.save();
  teacher.status = 'inactive';
  await teacher.save();
  const studentAfterTeacherInactive = await request(app)
    .get('/api/v1/class-schedules/my')
    .set('Authorization', `Bearer ${studentToken}`);
  const teacherAfterTeacherInactive = await request(app)
    .get('/api/v1/class-schedules/my-teaching')
    .set('Authorization', `Bearer ${teacherToken}`);
  assert(!(studentAfterTeacherInactive.body?.data || []).some((row: any) => String(row._id) === String(schedule._id)), 'student portal hides schedule after assigned teacher is inactive');
  assert(!(teacherAfterTeacherInactive.body?.data || []).some((row: any) => String(row._id) === String(schedule._id)), 'inactive teacher no longer receives stale teaching schedule');

  assert(Boolean(await ClassSchedule.exists({ _id: schedule._id, isActive: true })), 'stale schedule remains stored for admin history/cleanup rather than being silently deleted');

  console.log(`\n${'='.repeat(68)}`);
  if (failures === 0) console.log('ALL CLASS SCHEDULE EDGE-CASE CHECKS PASSED (0 failures)');
  else console.log(`${failures} CLASS SCHEDULE EDGE-CASE CHECK(S) FAILED`);
  console.log('='.repeat(68));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('FATAL ERROR:', error);
  try { await mongoose.disconnect(); } catch { /* no-op */ }
  process.exit(1);
});
