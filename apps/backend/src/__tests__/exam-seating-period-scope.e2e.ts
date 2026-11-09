/**
 * Room Allocation belongs to the exam period it was opened from.
 *
 * Reported on MONTHLY EXAM I:
 *  - The page asked for Mid/Final and saved under "2026-2027", while the
 *    period (and Invigilator/Attendance) use "2026/27" — allocations were
 *    never found again, and a period named neither Mid nor Final broke the
 *    Invigilator page.
 *  - "Assigned" showed 1225 for ~500 students: rows of deleted / inactive
 *    students (test data) were counted and never cleaned up.
 *  - There was no way to reset an allocation.
 *
 * Repeatable: `npm run test:exam-seating-period-scope`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import mongoose from 'mongoose';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const db = await startTestDb('exam-seating-period-scope');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { repairExamSeatingIndexes } = await import('../scripts/repair-exam-seating-indexes');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Student } = await import('../models/student.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Exam } = await import('../models/exam.model');
    const { default: ExamPeriod } = await import('../models/exam-period.model');
    const { default: ExamRoom } = await import('../models/exam-room.model');
    const { default: ExamSeatingPlan } = await import('../models/exam-seating-plan.model');

    const admin = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Balcad Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: 'b@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const orgAdmin = await User.create({ email: 'org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const auth = { Authorization: `Bearer ${generateAccessToken({ userId: orgAdmin._id.toString(), role: 'org_admin', permissions: [], organizationId: school._id.toString() })}` };

    const room = await ExamRoom.create({ name: 'Room A', capacity: 30, school: school._id, createdBy: admin._id });
    const cls = await ClassModel.create({ school: school._id, title: 'Grade 5', section: 'A', room: 'R' });
    let seq = 0;
    const mkStudent = async (status = 'active') => {
      seq += 1;
      const user = await User.create({ email: `s${seq}@test.local`, password: 'Password123!', role: 'student', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: 'S', lastName: String(seq), gender: 'male' });
      return Student.create({ user: user._id, profile: profile._id, school: school._id, class: cls._id, studentId: `ST${String(seq).padStart(4, '0')}`, status });
    };
    for (let i = 0; i < 3; i += 1) await mkStudent();
    const inactive = await mkStudent('inactive');

    const monthly1 = await ExamPeriod.create({ school: school._id, name: 'MONTHLY EXAM I', academicYear: '2026/27', startDate: new Date('2026-11-11'), endDate: new Date('2026-11-18'), createdBy: admin._id });
    const monthly2 = await ExamPeriod.create({ school: school._id, name: 'MONTHLY EXAM II', academicYear: '2026/27', startDate: new Date('2026-12-09'), endDate: new Date('2026-12-16'), createdBy: admin._id });
    const course = await Course.create({
      title: { en: 'Arabic' }, slug: `ar-${Date.now()}`, category: 'general', level: 'beginner',
      duration: 8, maxStudents: 50, school: school._id, class: cls._id, status: 'published',
    });
    await Exam.create({
      title: 'MONTHLY EXAM I', course: course._id, school: school._id, period: monthly1._id,
      examDate: new Date('2026-11-11T00:00:00.000Z'), startTime: '08:00', endTime: '08:50',
      duration: 50, totalMarks: 100, passingMarks: 50, createdBy: admin._id,
    });

    // Leftover test data in this period: an inactive student and a deleted one.
    await ExamSeatingPlan.create([
      { student: inactive._id, room: room._id, deskNumber: '__ROOM_ONLY__a', academicYear: '2026/27', examType: 'mid', period: monthly1._id, school: school._id },
      { student: new mongoose.Types.ObjectId(), room: room._id, deskNumber: '__ROOM_ONLY__b', academicYear: '2026/27', examType: 'mid', period: monthly1._id, school: school._id },
    ]);

    // -------------------------------------------------------------------
    section('Stats count only active students');
    // -------------------------------------------------------------------
    const before = await request(app).get('/api/v1/exams/seating-plan/stats').query({ periodId: String(monthly1._id) }).set(auth);
    assert(before.status === 200, `stats load by period (status ${before.status}: ${before.body?.message || ''})`);
    assert(before.body?.data?.totalStudents === 3 && before.body?.data?.assigned === 0, `3 active, 0 assigned — leftovers ignored (got ${JSON.stringify(before.body?.data)})`);

    // -------------------------------------------------------------------
    section('Generate inside the period — no Mid/Final, period year, leftovers removed');
    // -------------------------------------------------------------------
    const gen = await request(app).post('/api/v1/exams/seating-plan/auto-generate').set(auth).send({ periodId: String(monthly1._id), overwrite: true });
    assert(gen.status === 200, `generate succeeds with only periodId (status ${gen.status}: ${gen.body?.message || ''})`);
    const rows = await ExamSeatingPlan.find({ period: monthly1._id }).lean() as any[];
    assert(rows.length === 3, `exactly the 3 active students are seated (got ${rows.length})`);
    assert(rows.every(row => row.academicYear === '2026/27'), `rows use the period's year "2026/27" (got ${[...new Set(rows.map(r => r.academicYear))].join(', ')})`);
    const after = await request(app).get('/api/v1/exams/seating-plan/stats').query({ periodId: String(monthly1._id) }).set(auth);
    assert(after.body?.data?.assigned === 3 && after.body?.data?.unassigned === 0, `stats now 3 assigned (got ${JSON.stringify(after.body?.data)})`);

    // -------------------------------------------------------------------
    section('A second period in the same year has its own allocation');
    // -------------------------------------------------------------------
    const gen2 = await request(app).post('/api/v1/exams/seating-plan/auto-generate').set(auth).send({ periodId: String(monthly2._id), overwrite: true });
    assert(gen2.status === 200, `MONTHLY EXAM II generates too (status ${gen2.status}: ${gen2.body?.message || ''})`);
    const list1 = await request(app).get('/api/v1/exams/seating-plan').query({ periodId: String(monthly1._id) }).set(auth);
    assert((list1.body?.data || []).length === 3, `period I list shows only its 3 rows (got ${(list1.body?.data || []).length})`);

    // -------------------------------------------------------------------
    section('Invigilator reads the period allocation');
    // -------------------------------------------------------------------
    const ctx = await request(app).get('/api/v1/exams/invigilators/context').query({ periodId: String(monthly1._id) }).set(auth);
    assert(ctx.status === 200, `context loads for a period named neither Mid nor Final (status ${ctx.status}: ${ctx.body?.message || ''})`);
    const sessionRooms = (ctx.body?.data?.sessions?.[0]?.rooms || []) as any[];
    assert(sessionRooms.length === 1 && sessionRooms[0].students === 3, `Room A holds the 3 students in the session (got ${JSON.stringify(sessionRooms.map(r => r.students))})`);

    // -------------------------------------------------------------------
    section('Reset removes the period allocation only');
    // -------------------------------------------------------------------
    await ExamSeatingPlan.updateOne({ period: monthly1._id }, { $set: { locked: true } });
    const reset = await request(app).post('/api/v1/exams/seating-plan/reset').set(auth).send({ periodId: String(monthly1._id) });
    assert(reset.status === 200 && reset.body?.data?.deleted === 3, `reset removes all 3 rows, locked included (status ${reset.status}, ${JSON.stringify(reset.body?.data)})`);
    assert(await ExamSeatingPlan.countDocuments({ period: monthly2._id }) === 3, 'MONTHLY EXAM II is untouched');

    // -------------------------------------------------------------------
    section('Boot repair drops the old period-less unique indexes');
    // -------------------------------------------------------------------
    const collection = mongoose.connection.collection('examseatingplans');
    await collection.createIndex({ school: 1, academicYear: 1, examType: 1, student: 1 }, { name: 'school_1_academicYear_1_examType_1_student_1' });
    await repairExamSeatingIndexes();
    const names = (await collection.indexes()).map(index => index.name);
    assert(!names.includes('school_1_academicYear_1_examType_1_student_1'), 'legacy index removed');
    assert(names.includes('seating_period_student_unique'), 'period-aware index present');

    console.log(`\n${'='.repeat(60)}`);
    console.log(failures === 0 ? 'ALL CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
    console.log('='.repeat(60));
  } finally {
    await db.stop();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
