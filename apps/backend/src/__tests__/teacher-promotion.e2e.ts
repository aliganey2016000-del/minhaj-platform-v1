/**
 * Teacher Portal + academic progression end-to-end verification.
 *
 * Verifies the production path the portal depends on:
 * Grade 1 -> Grade 2, enrollment history preservation, existing target
 * curriculum reuse, and the assigned teacher seeing the promoted student
 * under the Grade 2 class.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
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
  const { default: CourseContent } = await import('../models/course-content.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Teacher } = await import('../models/teacher.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const adminUser = await User.create({
    email: 'admin-teacher-flow@test.local',
    password: 'Password123!',
    role: 'admin',
  });
  const adminToken = tokenFor(adminUser._id.toString(), 'admin');

  const school = await School.create({
    name: 'Teacher Flow School',
    organizationType: 'private',
    country: 'Somalia',
    city: 'Mogadishu',
    address: 'Teacher Flow St',
    phone: '+000',
    email: 'teacher-flow@test.local',
    principalName: 'Principal',
    establishedYear: 2020,
    createdBy: adminUser._id,
  });
  const dept = await Department.create({ name: 'Primary', tenantId: school._id });

  const grade1 = await ClassModel.create({
    school: school._id,
    department: dept._id,
    title: 'Grade 1',
    room: 'Room 1',
    gradeLevel: 1,
    academicYear: '2025-2026',
    status: 'active',
  });
  const grade2 = await ClassModel.create({
    school: school._id,
    department: dept._id,
    title: 'Grade 2',
    room: 'Room 2',
    gradeLevel: 2,
    academicYear: '2026-2027',
    status: 'active',
  });

  const grade1Math = await Course.create({
    title: { en: 'Grade 1 Math' },
    slug: 'teacher-flow-grade-1-math',
    category: 'general',
    level: 'beginner',
    duration: 10,
    maxStudents: 30,
    school: school._id,
    class: grade1._id,
    status: 'published',
  });
  const grade2Math = await Course.create({
    title: { en: 'Grade 2 Math' },
    slug: 'teacher-flow-grade-2-math',
    category: 'general',
    level: 'beginner',
    duration: 10,
    maxStudents: 30,
    school: school._id,
    class: grade2._id,
    status: 'published',
  });

  await CourseContent.create({
    course: grade1Math._id,
    chapters: [{ title: 'Numbers', order: 0 }],
  });
  await CourseContent.create({
    course: grade2Math._id,
    chapters: [{ title: 'Addition', order: 0 }],
  });

  const teacherUser = await User.create({
    email: 'teacher-flow@test.local',
    password: 'Password123!',
    role: 'teacher',
  });
  const teacherProfile = await Profile.create({
    user: teacherUser._id,
    firstName: 'Teacher',
    lastName: 'Flow',
    gender: 'male',
  });
  await Teacher.create({
    user: teacherUser._id,
    profile: teacherProfile._id,
    school: school._id,
    teacherId: 'TCH-FLOW-001',
    courses: [grade2Math._id],
    coursePermission: 'COURSE_BUILDER',
    status: 'active',
  });
  await Course.updateOne({ _id: grade2Math._id }, { $set: { teacher: teacherUser._id } });
  const teacherToken = tokenFor(teacherUser._id.toString(), 'teacher', school._id.toString());

  const createStudentRes = await request(app)
    .post('/api/v1/students')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      email: 'alice-teacher-flow@test.local',
      password: 'Password123!',
      firstName: 'Alice',
      lastName: 'Student',
      gender: 'female',
      school: school._id.toString(),
      classId: grade1._id.toString(),
    });
  assert(createStudentRes.status === 201, `create Grade 1 student succeeds (got ${createStudentRes.status})`);
  const aliceId = createStudentRes.body?.data?._id;
  assert(!!aliceId, 'created student id is present');

  const beforePromotion = await Student.findById(aliceId).lean();
  assert(
    (beforePromotion as any)?.enrollmentHistory?.length === 1 &&
      String((beforePromotion as any).enrollmentHistory[0].class) === String(grade1._id) &&
      (beforePromotion as any).enrollmentHistory[0].status === 'active',
    'new student has an active Grade 1 enrollment-history entry',
  );

  const promoteRes = await request(app)
    .post('/api/v1/classes/promote-all')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ schoolId: school._id.toString(), targetAcademicYear: '2026-2027' });
  assert(promoteRes.status === 200 || promoteRes.status === 201, `Grade 1 -> Grade 2 promotion succeeds (got ${promoteRes.status})`);
  assert(promoteRes.body?.data?.promoted === 1, 'exactly one class promoted');
  assert(promoteRes.body?.data?.studentsMoved === 1, 'exactly one student moved');

  const alice = await Student.findById(aliceId).lean();
  const history = (alice as any)?.enrollmentHistory || [];
  const grade1History = history.find((entry: any) => String(entry.class) === String(grade1._id));
  const grade2History = history.find((entry: any) => String(entry.class) === String(grade2._id));

  assert(String((alice as any)?.class) === String(grade2._id), 'Alice.class is now Grade 2');
  assert(
    grade1History?.status === 'completed' &&
      grade1History?.courses?.some((id: any) => String(id) === String(grade1Math._id)),
    'Grade 1 history is preserved as completed with Grade 1 Math',
  );
  assert(
    grade2History?.status === 'active' &&
      grade2History?.courses?.some((id: any) => String(id) === String(grade2Math._id)),
    'Grade 2 history is active with the existing Grade 2 Math curriculum',
  );
  assert(history.length === 2, `history contains exactly two academic enrollments (got ${history.length})`);

  const contentsAfter = await CourseContent.countDocuments({});
  const coursesAfter = await Course.countDocuments({});
  assert(contentsAfter === 2, `promotion reused existing curriculum without cloning CourseContent (got ${contentsAfter})`);
  assert(coursesAfter === 2, `promotion reused existing courses without cloning Course documents (got ${coursesAfter})`);

  const teacherStudentsRes = await request(app)
    .get('/api/v1/students')
    .set('Authorization', `Bearer ${teacherToken}`)
    .query({ limit: 100, status: 'active' });
  assert(teacherStudentsRes.status === 200, `teacher student directory is accessible (got ${teacherStudentsRes.status})`);

  const visibleAlice = (teacherStudentsRes.body?.data || []).find((student: any) => String(student._id) === String(aliceId));
  assert(!!visibleAlice, 'assigned teacher sees Alice in the student directory');
  assert(
    String(visibleAlice?.class?._id || visibleAlice?.class) === String(grade2._id),
    `teacher sees Alice under Grade 2 (got ${String(visibleAlice?.class?._id || visibleAlice?.class)})`,
  );
  assert(
    (visibleAlice?.enrolledCourses || []).some((course: any) => String(course._id || course) === String(grade2Math._id)),
    'teacher sees the Grade 2 Math course on Alice',
  );

  const teacherDashboardRes = await request(app)
    .get('/api/v1/teacher-portal/dashboard')
    .set('Authorization', `Bearer ${teacherToken}`);
  assert(teacherDashboardRes.status === 200, `teacher portal dashboard is accessible (got ${teacherDashboardRes.status})`);
  const assignedCourse = (teacherDashboardRes.body?.data?.activeCourses || []).find(
    (course: any) => String(course._id) === String(grade2Math._id),
  );
  assert(!!assignedCourse, 'teacher dashboard contains the assigned Grade 2 Math course');
  assert(
    String(assignedCourse?.class?._id || assignedCourse?.class) === String(grade2._id),
    'teacher dashboard shows the course under Grade 2',
  );

  await mongod.stop();
  await mongoose.disconnect();

  if (failures > 0) {
    console.error(`\nTeacher promotion E2E failed: ${failures} assertion(s).`);
    process.exit(1);
  }
  console.log('\nTeacher promotion E2E passed.');
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
