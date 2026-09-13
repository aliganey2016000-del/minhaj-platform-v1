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
  const { default: Teacher } = await import('../models/teacher.model');
  const { default: Course } = await import('../models/course.model');

  const admin = await User.create({ email: 'timetable-admin@test.local', password: 'Password123!', role: 'admin' });
  const token = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
  const school = await School.create({ name: 'Timetable School', organizationType: 'private', institutionType: 'school', country: 'Somalia', city: 'Mogadishu', address: 'Road', phone: '+252611222333', email: 'timetable-school@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id });
  const department = await Department.create({ name: 'Secondary', tenantId: school._id });
  const classA = await ClassModel.create({ school: school._id, department: department._id, title: 'Grade 10', section: 'A', room: 'Room 10', batch: '2026', gradeLevel: 10, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning' });
  const classB = await ClassModel.create({ school: school._id, department: department._id, title: 'Grade 11', section: 'A', room: 'Room 10', batch: '2026', gradeLevel: 11, academicYear: '2026-2027', status: 'active', shiftMode: 'Morning' });

  const teacherUser = await User.create({ email: 'teacher-timetable@test.local', password: 'Password123!', role: 'teacher' });
  const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'Ahmed', lastName: 'Ali', gender: 'male' });
  const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id, teacherId: 'TCH-2026-9001', courses: [], status: 'active' });

  const courseA = await Course.create({ title: { en: 'Mathematics', so: '', ar: '' }, slug: `math-${Date.now()}`, description: { en: '', so: '', ar: '' }, category: 'general', level: 'beginner', duration: 10, fee: 0, teacher: teacher._id, school: school._id, class: classA._id, maxStudents: 30, enrolledStudents: 0, syllabus: [], prerequisites: [], status: 'published', isLive: false, accessMode: 'open' });
  const courseB = await Course.create({ title: { en: 'Physics', so: '', ar: '' }, slug: `physics-${Date.now()}`, description: { en: '', so: '', ar: '' }, category: 'general', level: 'beginner', duration: 10, fee: 0, teacher: teacher._id, school: school._id, class: classB._id, maxStudents: 30, enrolledStudents: 0, syllabus: [], prerequisites: [], status: 'published', isLive: false, accessMode: 'open' });

  console.log('\n=== MANUAL SCHEDULE + ROOM CONFLICT ===');
  const first = await request(app).post('/api/v1/class-schedules/school').set('Authorization', `Bearer ${token}`).send({ school: school._id.toString(), class: classA._id.toString(), course: courseA._id.toString(), teacher: teacher._id.toString(), dayOfWeek: 0, startTime: '08:00', endTime: '08:45', isActive: true });
  assert(first.status === 201, `first schedule created (got ${first.status})`);

  const roomConflict = await request(app).post('/api/v1/class-schedules/school').set('Authorization', `Bearer ${token}`).send({ school: school._id.toString(), class: classB._id.toString(), course: courseB._id.toString(), teacher: null, dayOfWeek: 0, startTime: '08:00', endTime: '08:45', isActive: true });
  assert(roomConflict.status === 400 && String(roomConflict.body?.message || '').includes('Room conflict'), `room double-booking is blocked (got ${roomConflict.status}, ${roomConflict.body?.message})`);

  const second = await request(app).post('/api/v1/class-schedules/school').set('Authorization', `Bearer ${token}`).send({ school: school._id.toString(), class: classB._id.toString(), course: courseB._id.toString(), teacher: teacher._id.toString(), dayOfWeek: 1, startTime: '08:00', endTime: '08:45', isActive: true });
  assert(second.status === 201, `second schedule created on another day (got ${second.status})`);

  console.log('\n=== STUDIO SETTINGS + CONFLICT CHECKER ===');
  const bootstrap = await request(app).get('/api/v1/class-schedules/school/studio/bootstrap').set('Authorization', `Bearer ${token}`).query({ school: school._id.toString() });
  assert(bootstrap.status === 200, `studio bootstrap succeeds (got ${bootstrap.status})`);
  assert(Array.isArray(bootstrap.body?.data?.config?.periods) && bootstrap.body.data.config.periods.length > 0, 'default periods are available before settings are saved');

  const config = await request(app).patch('/api/v1/class-schedules/school/studio/config').set('Authorization', `Bearer ${token}`).send({ school: school._id.toString(), workingDays: [0, 1, 2, 3, 4], strictPeriods: true, timezone: 'Africa/Mogadishu', periods: [
    { key: 'p1', label: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
    { key: 'p2', label: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
    { key: 'break', label: 'Break', startTime: '09:30', endTime: '09:45', isBreak: true },
  ] });
  assert(config.status === 200 && config.body?.data?.strictPeriods === true, 'timetable settings persist');

  const availability = await request(app).put(`/api/v1/class-schedules/school/studio/teachers/${teacher._id}/availability`).set('Authorization', `Bearer ${token}`).send({ school: school._id.toString(), dayOffs: [1], unavailableWindows: [], maxLessonsPerDay: 5, maxConsecutiveLessons: 3 });
  assert(availability.status === 200, 'teacher availability saves');

  const conflictCheck = await request(app).post('/api/v1/class-schedules/school/studio/conflicts').set('Authorization', `Bearer ${token}`).send({ school: school._id.toString() });
  const conflictTypes = (conflictCheck.body?.data?.conflicts || []).map((item: any) => item.type);
  assert(conflictCheck.status === 200, `conflict checker succeeds (got ${conflictCheck.status})`);
  assert(conflictTypes.includes('teacher_day_off'), 'teacher day-off violation is detected');

  console.log('\n=== DRAFT, SAVE, PUBLISH, VERSION ===');
  const draftCreate = await request(app).post('/api/v1/class-schedules/school/studio/drafts').set('Authorization', `Bearer ${token}`).send({ school: school._id.toString(), name: 'Test Draft' });
  assert(draftCreate.status === 201, `draft created from current timetable (got ${draftCreate.status})`);
  const draftId = draftCreate.body?.data?._id;
  const draftEntries: any[] = draftCreate.body?.data?.entries || [];
  const secondEntry = draftEntries.find((entry) => String(entry.class) === String(classB._id));
  if (secondEntry) {
    secondEntry.dayOfWeek = 0;
    secondEntry.startTime = '08:45';
    secondEntry.endTime = '09:30';
  }

  const saveDraft = await request(app).put(`/api/v1/class-schedules/school/studio/drafts/${draftId}`).set('Authorization', `Bearer ${token}`).send({ school: school._id.toString(), name: 'Test Draft', entries: draftEntries });
  assert(saveDraft.status === 200, `draft can be edited and saved (got ${saveDraft.status})`);

  const publish = await request(app).post(`/api/v1/class-schedules/school/studio/drafts/${draftId}/publish`).set('Authorization', `Bearer ${token}`).send({ school: school._id.toString(), label: 'Foundation test publish' });
  assert(publish.status === 200, `conflict-free draft publishes (got ${publish.status}, ${publish.body?.message})`);
  assert(publish.body?.data?.version?.version === 1, 'first publish creates timetable version 1');

  const rollback = await request(app).post('/api/v1/class-schedules/school/studio/versions/1/rollback').set('Authorization', `Bearer ${token}`).send({ school: school._id.toString() });
  assert(rollback.status === 200 && rollback.body?.data?.version === 1, `published version can be rolled back (got ${rollback.status})`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL AI TIMETABLE STUDIO FOUNDATION CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
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
