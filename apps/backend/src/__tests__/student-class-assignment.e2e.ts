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
  const { default: Student } = await import('../models/student.model');
  const { default: School } = await import('../models/school.model');
  const { default: Department } = await import('../models/department.model');
  const { default: ClassModel } = await import('../models/class.model');

  const admin = await User.create({ email: 'assignment-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });

  const schoolA = await School.create({ name: 'Assignment School A', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'A Road', phone: '+252611100001', email: 'assignment-a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: admin._id });
  const schoolB = await School.create({ name: 'Assignment School B', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: 'B Road', phone: '+252611100002', email: 'assignment-b@test.local', principalName: 'Principal B', establishedYear: 2020, createdBy: admin._id });
  const deptA = await Department.create({ name: 'Primary', tenantId: schoolA._id });
  const deptB = await Department.create({ name: 'Primary', tenantId: schoolB._id });

  const activeA = await ClassModel.create({ school: schoolA._id, department: deptA._id, title: 'Grade 5', section: 'A', room: '5A', gradeLevel: 5, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning' });
  const completedA = await ClassModel.create({ school: schoolA._id, department: deptA._id, title: 'Grade 4', section: 'A', room: '4A', gradeLevel: 4, academicYear: '2025-2026', status: 'completed', shiftMode: 'Morning' });
  const activeB = await ClassModel.create({ school: schoolB._id, department: deptB._id, title: 'Grade 5', section: 'A', room: '5A', gradeLevel: 5, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning' });

  console.log('\n=== CREATE — reject invalid placement before account side effects ===');
  const completedEmail = 'completed-class-create@test.local';
  const completedCreate = await request(app).post('/api/v1/students').set('Authorization', `Bearer ${token}`).send({
    firstName: 'Completed', lastName: 'Class', gender: 'male', email: completedEmail, password: 'Password123!',
    school: schoolA._id.toString(), classId: completedA._id.toString(), enrollmentDate: '2026-09-01',
  });
  assert(completedCreate.status === 400, `new student cannot be assigned to completed class (got ${completedCreate.status})`);
  assert((await User.countDocuments({ email: completedEmail })) === 0, 'rejected class assignment creates no orphan User account');

  const crossEmail = 'cross-tenant-create@test.local';
  const crossCreate = await request(app).post('/api/v1/students').set('Authorization', `Bearer ${token}`).send({
    firstName: 'Cross', lastName: 'Tenant', gender: 'male', email: crossEmail, password: 'Password123!',
    school: schoolA._id.toString(), classId: activeB._id.toString(), enrollmentDate: '2026-09-01',
  });
  assert(crossCreate.status === 400, `new student cannot use another organization's class (got ${crossCreate.status})`);
  assert((await User.countDocuments({ email: crossEmail })) === 0, 'cross-tenant rejection creates no orphan User account');

  console.log('\n=== CREATE / EDIT — active class works, historical current class remains editable ===');
  const validCreate = await request(app).post('/api/v1/students').set('Authorization', `Bearer ${token}`).send({
    firstName: 'Valid', lastName: 'Student', gender: 'male', email: 'valid-assignment@test.local', password: 'Password123!',
    school: schoolA._id.toString(), classId: activeA._id.toString(), enrollmentDate: '2026-09-01',
  });
  assert(validCreate.status === 201, `active same-organization class is accepted (got ${validCreate.status})`);
  const studentId = validCreate.body?.data?._id;
  const created: any = studentId ? await Student.findById(studentId).lean() : null;
  assert(created?.grade === '5', `created student's grade follows class (got ${created?.grade})`);
  assert(created?.department === 'Primary', `created student's department follows class (got ${created?.department})`);
  assert(created?.shiftMode === 'Morning', `created student's shift follows class (got ${created?.shiftMode})`);

  activeA.status = 'completed';
  await activeA.save();
  const preserveHistorical = await request(app).patch(`/api/v1/students/${studentId}`).set('Authorization', `Bearer ${token}`).send({
    firstName: 'Valid Updated', classId: activeA._id.toString(), school: schoolA._id.toString(),
  });
  assert(preserveHistorical.status === 200, `editing a student may preserve their own now-completed historical class (got ${preserveHistorical.status})`);

  const moveToCompleted = await request(app).patch(`/api/v1/students/${studentId}`).set('Authorization', `Bearer ${token}`).send({
    classId: completedA._id.toString(), school: schoolA._id.toString(),
  });
  assert(moveToCompleted.status === 400, `student cannot be moved into a different completed class (got ${moveToCompleted.status})`);

  console.log('\n=== APPROVAL — target class must be active and belong to selected school ===');
  const pendingUser = await User.create({ email: 'pending-assignment@test.local', password: 'Password123!', role: 'student' });
  const pendingProfile = await Profile.create({ user: pendingUser._id, firstName: 'Pending', lastName: 'Student', gender: 'male' });
  const pending = await Student.create({ user: pendingUser._id, profile: pendingProfile._id, studentId: 'STU-PENDING-ASG', status: 'active', approvalStatus: 'pending', enrolledCourses: [], enrollmentHistory: [] });

  const approveCross = await request(app).patch(`/api/v1/students/${pending._id}/approve`).set('Authorization', `Bearer ${token}`).send({
    school: schoolA._id.toString(), classId: activeB._id.toString(),
  });
  assert(approveCross.status === 400, `approval rejects class from another organization (got ${approveCross.status})`);

  const approveCompleted = await request(app).patch(`/api/v1/students/${pending._id}/approve`).set('Authorization', `Bearer ${token}`).send({
    school: schoolA._id.toString(), classId: completedA._id.toString(),
  });
  assert(approveCompleted.status === 400, `approval rejects completed class (got ${approveCompleted.status})`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL STUDENT CLASS ASSIGNMENT CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
