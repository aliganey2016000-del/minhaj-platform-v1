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
  const { syncStudentCourseEnrollment } = await import('../services/enrollment.service');

  const admin = await User.create({ email: 'review-promotion@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
  const school = await School.create({ name: 'Review Promotion School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'Road', phone: '+252611000000', email: 'review-school@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });

  const grade9 = await ClassModel.create({ school: school._id, department: department._id, title: 'Grade 9', section: 'A', room: '9A', batch: '2026', gradeLevel: 9, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning', isEntryGrade: true });
  const grade10 = await ClassModel.create({ school: school._id, department: department._id, title: 'Grade 10', section: 'A', room: '10A', batch: '2026', gradeLevel: 10, academicYear: '2026-2027', status: 'active', shiftMode: 'Afternoon', isGraduatingGrade: true });
  const grade10Course = await Course.create({
    title: { en: 'Grade 10 Core' },
    slug: `grade-10-core-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    category: 'general', level: 'beginner', duration: 10, maxStudents: 30,
    school: school._id, class: grade10._id, status: 'published',
  });

  async function makeStudent(name: string, cls: any) {
    const user = await User.create({ email: `${name.toLowerCase()}@review.test`, password: 'Password123!', role: 'student' });
    const profile = await Profile.create({ user: user._id, firstName: name, lastName: 'Student', gender: 'male' });
    return Student.create({ user: user._id, profile: profile._id, school: school._id, class: cls._id, status: 'active', approvalStatus: 'approved', enrolledCourses: [], enrollmentHistory: [] });
  }

  const promoteMe = await makeStudent('PromoteMe', grade9);
  const repeatNine = await makeStudent('RepeatNine', grade9);
  const graduateMe = await makeStudent('GraduateMe', grade10);
  const repeatTen = await makeStudent('RepeatTen', grade10);

  await syncStudentCourseEnrollment(promoteMe._id, grade9._id);
  await syncStudentCourseEnrollment(repeatNine._id, grade9._id);
  await syncStudentCourseEnrollment(graduateMe._id, grade10._id);
  await syncStudentCourseEnrollment(repeatTen._id, grade10._id);
  const courseBefore: any = await Course.findById(grade10Course._id).lean();
  assert(courseBefore?.enrolledStudents === 2, `source course starts with two active students (got ${courseBefore?.enrolledStudents})`);
  const classCountBefore = await ClassModel.countDocuments({ school: school._id });

  console.log('\n=== REVIEW PREVIEW ===');
  const preview = await request(app).get('/api/v1/classes/promotion-review').set('Authorization', `Bearer ${token}`).query({ schoolId: school._id.toString() });
  assert(preview.status === 200, `review preview succeeds (got ${preview.status})`);
  const groups = preview.body?.data?.groups || [];
  const g9 = groups.find((x: any) => String(x.classId) === String(grade9._id));
  const g10 = groups.find((x: any) => String(x.classId) === String(grade10._id));
  assert(g9?.students?.length === 2 && g9?.students?.every((x: any) => x.defaultAction === 'promote'), 'Grade 9 defaults to Promote');
  assert(g9?.targetReady === true && String(g9?.targetTitle) === 'Grade 10', 'Grade 9 targets the existing Grade 10 class, ready to go');
  assert(g10?.students?.length === 2 && g10?.students?.every((x: any) => x.defaultAction === 'graduate'), 'Final grade defaults to Graduate');

  console.log('\n=== REVIEWED EXECUTION WITH REPEAT EXCEPTIONS ===');
  const execute = await request(app).post('/api/v1/classes/promote-reviewed').set('Authorization', `Bearer ${token}`).send({
    schoolId: school._id.toString(), targetAcademicYear: '2027-2028',
    decisions: [
      { studentId: repeatNine._id.toString(), action: 'repeat' },
      { studentId: repeatTen._id.toString(), action: 'repeat' },
    ],
  });
  assert(execute.status === 200, `reviewed promotion succeeds (got ${execute.status}, ${JSON.stringify(execute.body)})`);
  assert(execute.body?.data?.studentsPromoted === 1, 'one student promoted');
  assert(execute.body?.data?.studentsRepeated === 2, 'two students repeat');
  assert(execute.body?.data?.studentsGraduated === 1, 'one student graduated');
  assert((execute.body?.data?.missingTargets || []).length === 0, 'no target class was missing');

  const classCountAfter = await ClassModel.countDocuments({ school: school._id });
  assert(classCountAfter === classCountBefore, `no new Class documents were created (before ${classCountBefore}, after ${classCountAfter})`);

  const promoted: any = await Student.findById(promoteMe._id).lean();
  const repeated9: any = await Student.findById(repeatNine._id).lean();
  const graduated: any = await Student.findById(graduateMe._id).lean();
  const repeated10: any = await Student.findById(repeatTen._id).lean();

  assert(String(promoted?.class) === String(grade10._id), 'promoted student moves into the EXISTING Grade 10 class, not a new one');
  assert(promoted?.grade === '10', `promoted student's denormalized grade is synchronized (got ${promoted?.grade})`);
  assert(promoted?.department === 'Secondary', `promoted student's department is synchronized (got ${promoted?.department})`);
  assert(promoted?.shiftMode === 'Afternoon', `promoted student's shift follows target class (got ${promoted?.shiftMode})`);
  assert(String(repeated9?.class) === String(grade9._id), 'Grade 9 repeater STAYS in the same Grade 9 class — no new class');
  assert(String(repeated10?.class) === String(grade10._id), 'Grade 10 repeater STAYS in the same Grade 10 class — no new class');

  const latestActive = (student: any) => (student?.enrollmentHistory || []).find((h: any) => h.status === 'active');
  assert(latestActive(promoted)?.academicYear === '2027-2028', 'promoted student\'s new history entry records the new academic year');
  assert(latestActive(repeated9)?.academicYear === '2027-2028' && String(latestActive(repeated9)?.class) === String(grade9._id), 'Grade 9 repeater opens a fresh history entry for the new year on the SAME class');
  assert(latestActive(repeated10)?.academicYear === '2027-2028' && String(latestActive(repeated10)?.class) === String(grade10._id), 'Grade 10 repeater opens a fresh history entry for the new year on the SAME class');
  assert(graduated?.status === 'graduated', 'default final-grade student graduates');

  // repeatTen stays enrolled in Grade 10's course (same class, same course);
  // only graduateMe's enrollment closed.
  const courseAfter: any = await Course.findById(grade10Course._id).lean();
  assert(courseAfter?.enrolledStudents === 1, `Grade 10 course keeps its repeating student enrolled (got ${courseAfter?.enrolledStudents})`);

  console.log('\n=== SOURCE CLASSES STAY ACTIVE — NEVER "completed" ===');
  const old9: any = await ClassModel.findById(grade9._id).lean();
  const old10: any = await ClassModel.findById(grade10._id).lean();
  assert(old9?.status === 'active', `Grade 9 remains active (got ${old9?.status})`);
  assert(old10?.status === 'active', `Grade 10 remains active (got ${old10?.status})`);
  assert(!old9?.promotedAt && !old10?.promotedAt, 'classes never accumulate a promotedAt marker under the new flow');

  console.log('\n=== UNDO PROMOTION IS A NO-OP FOR THE NEW FLOW ===');
  // rollback-promotion only knows how to undo the OLD clone-and-complete
  // model. Since these classes never became "completed", there is nothing
  // for it to roll back — it must say so, not silently do nothing wrong.
  const rollback = await request(app).post('/api/v1/classes/rollback-promotion').set('Authorization', `Bearer ${token}`).send({
    classIds: [grade9._id.toString(), grade10._id.toString()],
  });
  assert(rollback.status === 400, `rollback correctly refuses classes that were never marked completed (got ${rollback.status})`);

  console.log('\n=== MIXED ACADEMIC YEAR UNDO (legacy completed classes, unrelated to the new flow) ===');
  const mixedA = await ClassModel.create({
    school: school._id, department: department._id, title: 'Mixed Grade 6', section: 'M1', room: 'M1', batch: 'MIX-A',
    gradeLevel: 6, academicYear: '2028-2029', status: 'completed', shiftMode: 'Morning', promotedAt: new Date(),
  });
  const mixedB = await ClassModel.create({
    school: school._id, department: department._id, title: 'Mixed Grade 7', section: 'M2', room: 'M2', batch: 'MIX-B',
    gradeLevel: 7, academicYear: '2030-2031', status: 'completed', shiftMode: 'Morning', promotedAt: new Date(),
  });
  const mixedRollback = await request(app).post('/api/v1/classes/rollback-promotion').set('Authorization', `Bearer ${token}`).send({
    classIds: [mixedA._id.toString(), mixedB._id.toString()],
  });
  assert(mixedRollback.status === 200, `mixed-year legacy promotion rollback succeeds (got ${mixedRollback.status}, ${JSON.stringify(mixedRollback.body)})`);
  const mixedAAfter: any = await ClassModel.findById(mixedA._id).lean();
  const mixedBAfter: any = await ClassModel.findById(mixedB._id).lean();
  assert(mixedAAfter?.status === 'active' && mixedAAfter?.academicYear === '2027-2028', '2028-2029 legacy class rewinds independently to 2027-2028');
  assert(mixedBAfter?.status === 'active' && mixedBAfter?.academicYear === '2029-2030', '2030-2031 legacy class rewinds independently to 2029-2030');

  console.log('\n=== BULK MAKE ACTIVE (legacy completed class) ===');
  const manualCompleted = await ClassModel.create({ school: school._id, department: department._id, title: 'Manual Completed', section: 'B', room: 'MB', batch: '2025', gradeLevel: 8, academicYear: '2025-2026', status: 'completed', shiftMode: 'Morning' });
  await Student.updateOne({ _id: promoteMe._id }, {
    $push: {
      enrollmentHistory: {
        academicYear: '2025-2026', class: manualCompleted._id, grade: 'Manual Completed', courses: [], status: 'completed',
        startedAt: new Date('2025-09-01'), endedAt: new Date('2026-06-30'),
      },
    },
  });
  const activate = await request(app).patch('/api/v1/classes/bulk/status').set('Authorization', `Bearer ${token}`).send({ ids: [manualCompleted._id.toString()], status: 'active' });
  assert(activate.status === 200 && activate.body?.data?.updated === 1, 'bulk Make Active succeeds for completed class');
  const activated: any = await ClassModel.findById(manualCompleted._id).lean();
  assert(activated?.status === 'active', 'bulk Make Active changes class status to active');
  assert(activated?.academicYear === '2025-2026', 'Make Active leaves academic year unchanged');

  const deleteActiveHistoryClass = await request(app).delete(`/api/v1/classes/${manualCompleted._id}`).set('Authorization', `Bearer ${token}`);
  assert(deleteActiveHistoryClass.status === 204, `active class with history-only references can be deleted (got ${deleteActiveHistoryClass.status})`);

  const deleteCurrentActiveClass = await request(app).delete(`/api/v1/classes/${grade9._id}`).set('Authorization', `Bearer ${token}`);
  assert(deleteCurrentActiveClass.status === 400, `active class with a current repeating student remains protected (got ${deleteCurrentActiveClass.status})`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL REVIEWED PROMOTION CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
