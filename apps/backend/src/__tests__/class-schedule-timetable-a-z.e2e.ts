/**
 * Class Schedule & Timetable — A-Z regression QA.
 *
 * Runs the real Express app against an ephemeral in-memory MongoDB. It covers
 * school Period/Break settings, schedule CRUD, class/teacher/room conflicts,
 * teacher/student portal visibility, tenant isolation, and schedule-linked
 * lesson attendance. It never touches development or production data.
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
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}
function messageOf(response: any): string {
  return String(response.body?.message || response.body?.error?.message || response.text || '');
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to in-memory MongoDB:', process.env.MONGODB_URI);

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
  const { default: AttendanceSession } = await import('../models/attendance-session.model');

  function tokenFor(userId: string, role: string, organizationId?: string) {
    return generateAccessToken({ userId, role, permissions: [], organizationId });
  }

  const platformAdmin = await User.create({ email: 'schedule-admin@test.local', password: 'Password123!', role: 'admin' });
  const school = await School.create({
    name: 'Schedule QA School',
    institutionType: 'school',
    organizationType: 'school',
    ownershipType: 'private',
    attendanceType: 'class_based',
    country: 'Somalia',
    city: 'Mogadishu',
    address: 'QA Road',
    phone: '+252610000001',
    email: 'schedule-school@test.local',
    principalName: 'QA Principal',
    establishedYear: 2020,
    createdBy: platformAdmin._id,
  });
  const otherSchool = await School.create({
    name: 'Other QA School',
    institutionType: 'school',
    organizationType: 'school',
    ownershipType: 'private',
    attendanceType: 'class_based',
    country: 'Somalia',
    city: 'Mogadishu',
    address: 'Other Road',
    phone: '+252610000002',
    email: 'other-school@test.local',
    principalName: 'Other Principal',
    establishedYear: 2021,
    createdBy: platformAdmin._id,
  });

  const orgAdminUser = await User.create({
    email: 'schedule-orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id,
  });
  const otherOrgAdminUser = await User.create({
    email: 'other-orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: otherSchool._id,
  });
  const orgToken = tokenFor(orgAdminUser._id.toString(), 'org_admin', school._id.toString());
  const otherOrgToken = tokenFor(otherOrgAdminUser._id.toString(), 'org_admin', otherSchool._id.toString());

  async function createPerson(email: string, role: 'teacher' | 'student', firstName: string, lastName: string) {
    const user = await User.create({ email, password: 'Password123!', role, organizationId: school._id });
    const profile = await Profile.create({ user: user._id, firstName, lastName, gender: 'male' });
    return { user, profile };
  }

  const t1Person = await createPerson('teacher.one@test.local', 'teacher', 'Teacher', 'One');
  const t2Person = await createPerson('teacher.two@test.local', 'teacher', 'Teacher', 'Two');
  const teacher1 = await Teacher.create({
    user: t1Person.user._id, profile: t1Person.profile._id, school: school._id,
    teacherId: 'TCH-2026-9001', courses: [], joiningDate: new Date('2026-01-01'), status: 'active',
  });
  const teacher2 = await Teacher.create({
    user: t2Person.user._id, profile: t2Person.profile._id, school: school._id,
    teacherId: 'TCH-2026-9002', courses: [], joiningDate: new Date('2026-01-01'), status: 'active',
  });
  const teacher1Token = tokenFor(t1Person.user._id.toString(), 'teacher', school._id.toString());
  const teacher2Token = tokenFor(t2Person.user._id.toString(), 'teacher', school._id.toString());

  const classA = await ClassModel.create({
    school: school._id, title: 'Grade 10', section: 'A', room: 'R-101', shiftMode: 'Morning',
    gradeLevel: 10, academicYear: '2026/27', status: 'active',
  });
  const classB = await ClassModel.create({
    school: school._id, title: 'Grade 10', section: 'B', room: 'R-102', shiftMode: 'Virtual',
    gradeLevel: 10, academicYear: '2026/27', status: 'active',
  });
  const classC = await ClassModel.create({
    school: school._id, title: 'Grade 9', section: 'A', room: 'R-101', shiftMode: 'Afternoon',
    gradeLevel: 9, academicYear: '2026/27', status: 'active',
  });

  async function createCourse(slug: string, title: string, cls: any, teacher: any) {
    return Course.create({
      title: { en: title, so: '', ar: '' },
      courseCode: slug.toUpperCase(),
      slug,
      description: { en: '', so: '', ar: '' },
      category: '',
      level: 'beginner',
      duration: 1,
      fee: 0,
      teacher: teacher?._id || null,
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
  }

  const mathA = await createCourse('qa-math-a', 'Mathematics', classA, teacher1);
  const scienceA = await createCourse('qa-science-a', 'Science', classA, teacher2);
  const englishB = await createCourse('qa-english-b', 'English', classB, teacher1);
  const historyB = await createCourse('qa-history-b', 'History', classB, teacher2);
  const geographyC = await createCourse('qa-geography-c', 'Geography', classC, teacher2);

  await Teacher.findByIdAndUpdate(teacher1._id, { courses: [mathA._id, englishB._id] });
  await Teacher.findByIdAndUpdate(teacher2._id, { courses: [scienceA._id, historyB._id, geographyC._id] });

  const studentPerson = await createPerson('schedule-student@test.local', 'student', 'Student', 'One');
  const student = await Student.create({
    user: studentPerson.user._id,
    profile: studentPerson.profile._id,
    studentId: 'QA-STU-001',
    school: school._id,
    class: classA._id,
    status: 'active',
    approvalStatus: 'approved',
    enrollmentDate: new Date('2026-09-01'),
    enrolledCourses: [mathA._id, scienceA._id],
  });
  const studentToken = tokenFor(studentPerson.user._id.toString(), 'student', school._id.toString());

  // -----------------------------------------------------------------------
  section('PERIODS & BREAKS — defaults, validation, save and tenant isolation');
  // -----------------------------------------------------------------------
  const defaultPeriods = await request(app)
    .get('/api/v1/class-schedules/school/period-settings')
    .set('Authorization', `Bearer ${orgToken}`);
  assert(defaultPeriods.status === 200, `default period settings load (status ${defaultPeriods.status})`);
  assert(Array.isArray(defaultPeriods.body?.data?.periods) && defaultPeriods.body.data.periods.some((p: any) => p.isBreak), 'default settings include a Break row');

  const customPeriods = [
    { label: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
    { label: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
    { label: 'Break', startTime: '09:30', endTime: '09:50', isBreak: true },
    { label: 'Period 3', startTime: '09:50', endTime: '10:35', isBreak: false },
    { label: 'Period 4', startTime: '10:35', endTime: '11:20', isBreak: false },
  ];
  const savePeriods = await request(app)
    .put('/api/v1/class-schedules/school/period-settings')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({ periods: customPeriods });
  assert(savePeriods.status === 200, `custom Period/Break settings save (status ${savePeriods.status})`);

  const overlapPeriods = await request(app)
    .put('/api/v1/class-schedules/school/period-settings')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({ periods: [
      { label: 'P1', startTime: '08:00', endTime: '09:00', isBreak: false },
      { label: 'P2', startTime: '08:30', endTime: '09:30', isBreak: false },
    ] });
  assert(overlapPeriods.status === 400 && /overlap/i.test(messageOf(overlapPeriods)), `overlapping periods rejected (${messageOf(overlapPeriods)})`);

  const otherSave = await request(app)
    .put('/api/v1/class-schedules/school/period-settings')
    .set('Authorization', `Bearer ${otherOrgToken}`)
    .send({ periods: [{ label: 'Other P1', startTime: '07:00', endTime: '07:40', isBreak: false }] });
  assert(otherSave.status === 200, 'other organization can save its own settings');

  const teacherPeriods = await request(app)
    .get('/api/v1/class-schedules/school/period-settings')
    .query({ school: otherSchool._id.toString() })
    .set('Authorization', `Bearer ${teacher1Token}`);
  assert(teacherPeriods.status === 200, `teacher can read period settings (status ${teacherPeriods.status})`);
  assert(String(teacherPeriods.body?.data?.school) === school._id.toString(), 'teacher period read ignores another tenant id and stays scoped to own school');
  assert(teacherPeriods.body?.data?.periods?.[0]?.label === 'Period 1', 'teacher receives own school period settings');

  const studentPeriods = await request(app)
    .get('/api/v1/class-schedules/school/period-settings')
    .query({ school: otherSchool._id.toString() })
    .set('Authorization', `Bearer ${studentToken}`);
  assert(studentPeriods.status === 200 && String(studentPeriods.body?.data?.school) === school._id.toString(), 'student period read is scoped to own school');

  // -----------------------------------------------------------------------
  section('ADD SCHEDULE — successful creation and populated response');
  // -----------------------------------------------------------------------
  const createMath = await request(app)
    .post('/api/v1/class-schedules/school')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({
      class: classA._id.toString(), course: mathA._id.toString(), teacher: teacher1._id.toString(),
      dayOfWeek: 1, startTime: '08:00', endTime: '08:45', isActive: true,
    });
  assert(createMath.status === 201, `Add Schedule succeeds (status ${createMath.status}: ${messageOf(createMath)})`);
  const mathScheduleId = String(createMath.body?.data?._id || '');
  assert(Boolean(mathScheduleId), 'created schedule returns an id');

  // -----------------------------------------------------------------------
  section('CONFLICT DETECTION — class, teacher and room');
  // -----------------------------------------------------------------------
  const classConflict = await request(app)
    .post('/api/v1/class-schedules/school')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({
      class: classA._id.toString(), course: scienceA._id.toString(), teacher: teacher2._id.toString(),
      dayOfWeek: 1, startTime: '08:10', endTime: '08:40', isActive: true,
    });
  assert(classConflict.status === 400 && /class conflict/i.test(messageOf(classConflict)), `same class / two subjects is blocked as Class conflict (${messageOf(classConflict)})`);

  const teacherConflict = await request(app)
    .post('/api/v1/class-schedules/school')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({
      class: classB._id.toString(), course: englishB._id.toString(), teacher: teacher1._id.toString(),
      dayOfWeek: 1, startTime: '08:00', endTime: '08:45', isActive: true,
    });
  assert(teacherConflict.status === 400 && /teacher conflict/i.test(messageOf(teacherConflict)), `same teacher / two classes is blocked (${messageOf(teacherConflict)})`);

  const roomConflict = await request(app)
    .post('/api/v1/class-schedules/school')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({
      class: classC._id.toString(), course: geographyC._id.toString(), teacher: teacher2._id.toString(),
      dayOfWeek: 1, startTime: '08:00', endTime: '08:45', isActive: true,
    });
  assert(roomConflict.status === 400 && /room conflict/i.test(messageOf(roomConflict)), `same room / same time is blocked (${messageOf(roomConflict)})`);

  const inactiveOverlap = await request(app)
    .post('/api/v1/class-schedules/school')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({
      class: classB._id.toString(), course: englishB._id.toString(), teacher: teacher1._id.toString(),
      dayOfWeek: 1, startTime: '08:00', endTime: '08:45', isActive: false,
    });
  assert(inactiveOverlap.status === 201, `inactive schedule may overlap without blocking active timetable (status ${inactiveOverlap.status})`);

  // -----------------------------------------------------------------------
  section('EDIT & DELETE — safe school schedule CRUD');
  // -----------------------------------------------------------------------
  const createEditable = await request(app)
    .post('/api/v1/class-schedules/school')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({
      class: classB._id.toString(), course: historyB._id.toString(), teacher: teacher2._id.toString(),
      dayOfWeek: 1, startTime: '09:50', endTime: '10:35', isActive: true,
    });
  assert(createEditable.status === 201, `editable schedule created (status ${createEditable.status}: ${messageOf(createEditable)})`);
  const editableId = String(createEditable.body?.data?._id || '');

  const editSchedule = await request(app)
    .put(`/api/v1/class-schedules/school/${editableId}`)
    .set('Authorization', `Bearer ${orgToken}`)
    .send({
      class: classB._id.toString(), course: historyB._id.toString(), teacher: teacher2._id.toString(),
      dayOfWeek: 1, startTime: '10:35', endTime: '11:20', isActive: true,
    });
  assert(editSchedule.status === 200 && editSchedule.body?.data?.startTime === '10:35', `Edit Schedule updates period (status ${editSchedule.status}: ${messageOf(editSchedule)})`);

  const deleteSchedule = await request(app)
    .delete(`/api/v1/class-schedules/${editableId}`)
    .set('Authorization', `Bearer ${orgToken}`);
  assert(deleteSchedule.status === 200, `Delete Schedule succeeds (status ${deleteSchedule.status})`);
  assert(!(await ClassSchedule.exists({ _id: editableId })), 'deleted schedule is removed from storage');

  // -----------------------------------------------------------------------
  section('TEACHER & STUDENT PORTALS — correct schedule visibility');
  // -----------------------------------------------------------------------
  const teacherPortal = await request(app)
    .get('/api/v1/class-schedules/my-teaching')
    .set('Authorization', `Bearer ${teacher1Token}`);
  assert(teacherPortal.status === 200, `teacher schedule portal loads (status ${teacherPortal.status})`);
  const teacherRows: any[] = teacherPortal.body?.data || [];
  assert(teacherRows.some((row) => String(row._id) === mathScheduleId), 'teacher sees own active Math lesson');
  assert(!teacherRows.some((row) => String(row.teacher?._id || row.teacher) === teacher2._id.toString()), 'teacher does not see another teacher’s lessons');

  // Create a non-conflicting active lesson for Teacher Two in the explicitly
  // Virtual class, then confirm shiftMode is populated rather than inferred.
  const teacher2Lesson = await request(app)
    .post('/api/v1/class-schedules/school')
    .set('Authorization', `Bearer ${orgToken}`)
    .send({
      class: classB._id.toString(), course: historyB._id.toString(), teacher: teacher2._id.toString(),
      dayOfWeek: 2, startTime: '08:45', endTime: '09:30', isActive: true,
    });
  assert(teacher2Lesson.status === 201, 'Teacher Two portal fixture created');
  const teacher2Portal = await request(app)
    .get('/api/v1/class-schedules/my-teaching')
    .set('Authorization', `Bearer ${teacher2Token}`);
  const virtualRow = (teacher2Portal.body?.data || []).find((row: any) => String(row._id) === String(teacher2Lesson.body?.data?._id));
  assert(teacher2Portal.status === 200 && virtualRow?.class?.shiftMode === 'Virtual', 'teacher portal receives the class configured shiftMode');

  const studentPortal = await request(app)
    .get('/api/v1/class-schedules/my')
    .set('Authorization', `Bearer ${studentToken}`);
  assert(studentPortal.status === 200, `student schedule portal loads (status ${studentPortal.status})`);
  const studentRows: any[] = studentPortal.body?.data || [];
  assert(studentRows.some((row) => String(row._id) === mathScheduleId), 'student sees active schedule for own class');
  assert(!studentRows.some((row) => String(row.class?._id || row.class || '') === classB._id.toString()), 'student does not receive another class timetable');

  // -----------------------------------------------------------------------
  section('PERIOD ATTENDANCE — schedule-linked date, roster and lock');
  // -----------------------------------------------------------------------
  const wrongDayAttendance = await request(app)
    .post('/api/v1/attendance')
    .set('Authorization', `Bearer ${teacher1Token}`)
    .send({
      course: mathA._id.toString(), schedule: mathScheduleId, date: '2026-09-15',
      records: [{ student: student._id.toString(), status: 'present' }],
    });
  assert(wrongDayAttendance.status === 400 && /does not meet/i.test(messageOf(wrongDayAttendance)), `attendance on wrong weekday is rejected (${messageOf(wrongDayAttendance)})`);

  const correctAttendance = await request(app)
    .post('/api/v1/attendance')
    .set('Authorization', `Bearer ${teacher1Token}`)
    .send({
      course: mathA._id.toString(), schedule: mathScheduleId, date: '2026-09-14',
      records: [{ student: student._id.toString(), status: 'present' }],
    });
  assert(correctAttendance.status === 200, `period attendance saves on the schedule's weekday (status ${correctAttendance.status}: ${messageOf(correctAttendance)})`);
  assert(correctAttendance.body?.data?.completion === 'complete' && correctAttendance.body?.data?.locked === true, 'full school period roster completes and locks attendance');

  const attendanceSession = await AttendanceSession.findOne({ schedule: mathScheduleId, date: new Date('2026-09-14T00:00:00') }).lean();
  assert(Boolean(attendanceSession) && attendanceSession?.status === 'complete' && attendanceSession?.locked === true, 'AttendanceSession is keyed to schedule + date and stored complete/locked');

  const attendanceRead = await request(app)
    .get('/api/v1/attendance/course')
    .query({ courseId: mathA._id.toString(), date: '2026-09-14', schedule: mathScheduleId })
    .set('Authorization', `Bearer ${teacher1Token}`);
  assert(attendanceRead.status === 200, `period attendance can be read back by course/date/schedule (status ${attendanceRead.status})`);
  const attendanceRows = attendanceRead.body?.data || [];
  assert(attendanceRows.length === 1 && attendanceRows[0]?.status === 'present', 'saved period attendance record is returned correctly');

  console.log(`\n${'='.repeat(68)}`);
  if (failures === 0) console.log('ALL CLASS SCHEDULE & TIMETABLE A-Z CHECKS PASSED (0 failures)');
  else console.log(`${failures} CLASS SCHEDULE/TIMETABLE CHECK(S) FAILED`);
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
