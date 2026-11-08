/**
 * Exam timetable — Department Shift Assignment is honoured everywhere.
 *
 * Reported: Scheduling Rules assigned Shift 1/2 to Primary and Shift 3/4 to
 * Secondary, yet the timetable showed Secondary in Shift 1/2.
 *  - Auto Generate refused to run at all because an empty helper class
 *    ("Public Class": no department, no courses) tripped the department
 *    check, so the old pre-fix timetable stayed on screen.
 *  - Manual placement (Department view cell, Table Grid edit) never checked
 *    the department's shifts, so a subject could be dropped into any shift.
 *  - The Department view sends its own column number, which is not the
 *    Scheduling Rules shift index; the cell's time is now the source of truth.
 *  - Edit Department (day/shift) always failed: its id regex was /[a-f\\d]/,
 *    which rejects every ObjectId containing a digit.
 *
 * Repeatable: `npm run test:exam-department-shifts`.
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

const SHIFTS = [
  { name: 'Shift 1', startTime: '08:00', endTime: '08:50' },
  { name: 'Shift 2', startTime: '09:00', endTime: '09:50' },
  { name: 'Shift 3', startTime: '10:00', endTime: '10:50' },
  { name: 'Shift 4', startTime: '11:00', endTime: '11:50' },
];

async function main() {
  const db = await startTestDb('exam-department-shifts');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Exam } = await import('../models/exam.model');
    const { default: ExamPeriod } = await import('../models/exam-period.model');

    const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
    const primaryDept = new mongoose.Types.ObjectId();
    const secondaryDept = new mongoose.Types.ObjectId();
    const school = await School.create({
      name: 'Balcad Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: 'b@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: adminUser._id,
      examSchedulingRules: {
        examShiftCount: 4,
        examShifts: SHIFTS,
        maxExamsPerClassPerDay: 2,
        minimumGapMinutes: 0,
        allowedExamDays: [0, 1, 2, 3, 6],
        departmentShiftAssignments: [
          { departmentId: String(primaryDept), shiftIndexes: [0, 1] },
          { departmentId: String(secondaryDept), shiftIndexes: [2, 3] },
        ],
      },
    });
    const orgAdmin = await User.create({ email: 'org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const token = generateAccessToken({ userId: orgAdmin._id.toString(), role: 'org_admin', permissions: [], organizationId: school._id.toString() });
    const auth = { Authorization: `Bearer ${token}` };

    const mkClass = (title: string, department: mongoose.Types.ObjectId | null) =>
      ClassModel.create({ school: school._id, title, section: 'A', room: 'R1', department });
    const grade5 = await mkClass('Grade 5', primaryDept);
    const grade10 = await mkClass('Grade 10', secondaryDept);
    // Empty helper class: no department and no courses. Must not block generation.
    await mkClass('Public Class', null);

    let slug = 0;
    const mkCourse = (title: string, cls: any) => Course.create({
      title: { en: title }, slug: `c-${Date.now()}-${slug++}`, category: 'general', level: 'beginner',
      duration: 8, maxStudents: 50, school: school._id, class: cls._id, status: 'published',
    });
    for (const subject of ['Arabic', 'English', 'Somali']) await mkCourse(subject, grade5);
    for (const subject of ['Arabic', 'Biology', 'Physics']) await mkCourse(subject, grade10);

    const period = await ExamPeriod.create({
      school: school._id, name: 'MONTHLY EXAM I', academicYear: '2026/27',
      startDate: new Date('2026-11-14T00:00:00.000Z'), endDate: new Date('2026-11-18T00:00:00.000Z'), createdBy: orgAdmin._id,
    });

    // -------------------------------------------------------------------
    section('Auto Generate — empty class without a department does not block it');
    // -------------------------------------------------------------------
    const gen = await request(app).post(`/api/v1/exams/periods/${period._id}/auto-generate`).set(auth).send({});
    assert(gen.status === 200, `auto-generate succeeds (status ${gen.status}: ${gen.body?.message || ''})`);

    const exams = await Exam.find({ period: period._id }).populate('course', 'class').lean() as any[];
    const primaryTimes = new Set(SHIFTS.slice(0, 2).map((s) => s.startTime));
    const secondaryTimes = new Set(SHIFTS.slice(2).map((s) => s.startTime));
    const g5 = exams.filter((e) => String(e.course?.class) === String(grade5._id));
    const g10 = exams.filter((e) => String(e.course?.class) === String(grade10._id));
    assert(g5.length === 3 && g10.length === 3, `all 6 papers generated (got ${g5.length} + ${g10.length})`);
    assert(g5.every((e) => primaryTimes.has(e.startTime)), `Primary only in Shift 1/2 (${g5.map((e) => e.startTime).join(', ')})`);
    assert(g10.every((e) => secondaryTimes.has(e.startTime)), `Secondary only in Shift 3/4 (${g10.map((e) => e.startTime).join(', ')})`);

    // -------------------------------------------------------------------
    section('Auto Generate — a class WITH courses but no department is still reported');
    // -------------------------------------------------------------------
    const orphan = await mkClass('Grade 7', null);
    await mkCourse('History', orphan);
    const genBad = await request(app).post(`/api/v1/exams/periods/${period._id}/auto-generate`).set(auth).send({ overwrite: true });
    assert(genBad.status === 400, `rejected with 400 (got ${genBad.status})`);
    assert(/Grade 7/.test(genBad.body?.message || ''), `message names the class (got "${genBad.body?.message}")`);
    await Course.deleteMany({ class: orphan._id });
    await ClassModel.deleteOne({ _id: orphan._id });

    // -------------------------------------------------------------------
    section('Department cell placement — a Secondary subject cannot go into Shift 1');
    // -------------------------------------------------------------------
    const biology = g10.find((e) => true)!;
    const wrong = await request(app).post(`/api/v1/exams/periods/${period._id}/assign-schedule-cell`).set(auth).send({
      examIds: [String(biology._id)], targetDate: '2026-11-18', targetShiftIndex: 0,
      targetStartTime: '08:00', targetEndTime: '08:50',
    });
    assert(wrong.status === 409, `rejected with 409 (got ${wrong.status})`);
    assert(/Shift 3, Shift 4/.test(wrong.body?.message || ''), `message lists allowed shifts (got "${wrong.body?.message}")`);

    // -------------------------------------------------------------------
    section('Department cell placement — the cell time wins over the column number');
    // -------------------------------------------------------------------
    // Department view column 0 for Secondary is 10:00 (its first own time),
    // but Scheduling Rules index 0 is 08:00. The time must be used.
    const right = await request(app).post(`/api/v1/exams/periods/${period._id}/assign-schedule-cell`).set(auth).send({
      examIds: [String(biology._id)], targetDate: '2026-11-18', targetShiftIndex: 0,
      targetStartTime: '11:00', targetEndTime: '11:50',
    });
    assert(right.status === 200, `placed (status ${right.status}: ${right.body?.message || ''})`);
    const moved = await Exam.findById(biology._id).lean() as any;
    assert(moved?.startTime === '11:00' && moved?.endTime === '11:50', `placed at 11:00–11:50 (got ${moved?.startTime}–${moved?.endTime})`);
    assert(right.body?.data?.shiftIndex === 3, `resolved to Shift 4 / index 3 (got ${right.body?.data?.shiftIndex})`);

    // -------------------------------------------------------------------
    section('Table Grid edit — placing a Secondary course into Shift 2 is rejected');
    // -------------------------------------------------------------------
    const physics = await Course.findOne({ class: grade10._id, 'title.en': 'Physics' }).lean() as any;
    const grid = await request(app).post('/api/v1/exams/schedule-grid').set(auth).send({
      periodId: String(period._id), examDate: '2026-11-17',
      cells: [{ key: 'k1', classId: String(grade10._id), shiftIndex: 1, courseId: String(physics._id) }],
    });
    const failed = (grid.body?.data?.failures || []) as any[];
    const gridRejected = grid.status >= 400 || failed.some((f) => /not assigned/.test(f.message));
    assert(gridRejected, `grid cell rejected (status ${grid.status}, ${JSON.stringify(grid.body?.data?.failures || grid.body?.message)})`);

    // -------------------------------------------------------------------
    section('Edit Department schedule — ObjectIds with digits are accepted');
    // -------------------------------------------------------------------
    const edit = await request(app).post(`/api/v1/exams/periods/${period._id}/edit-department-schedule`).set(auth).send({
      editType: 'shift', examIds: [String(biology._id)], startTime: '11:00', endTime: '11:45',
    });
    assert(!/valid Exam is required|ids are invalid/i.test(edit.body?.message || ''), `ids accepted (status ${edit.status}: ${edit.body?.message || ''})`);
    assert(edit.status === 200, `edit succeeds (status ${edit.status})`);

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
