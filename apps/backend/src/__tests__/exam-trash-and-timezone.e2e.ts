/**
 * Exams — deletes go to Trash, and exam windows run on the school's clock.
 *
 *  - DELETE /exams/:id and POST /exams/bulk-delete used to hard-delete the
 *    exam with its paper, attempts, results and attendance. They now snapshot
 *    everything into Trash first, and POST /trash/:id/restore brings it back.
 *  - Exam start/end are Africa/Mogadishu wall-clock times. The backend used to
 *    read them on the server's UTC clock, so an 08:00 exam opened at 11:00 in
 *    Mogadishu.
 *
 * Repeatable: `npm run test:exam-trash-timezone`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

const mogadishuClock = (ms: number) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Mogadishu', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(ms));
const utcClock = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const mogadishuDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Mogadishu' }).format(new Date());

async function main() {
  const db = await startTestDb('exam-trash-timezone');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { schoolWallTimeToDate } = await import('../utils/school-date');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Exam } = await import('../models/exam.model');
    const { default: ExamPaper } = await import('../models/exam-paper.model');
    const { default: ExamAttendance } = await import('../models/exam-attendance.model');
    const { default: Result } = await import('../models/result.model');
    const { default: Trash } = await import('../models/trash.model');

    const admin = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Balcad Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: 'b@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const orgAdmin = await User.create({ email: 'org@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const orgToken = generateAccessToken({ userId: orgAdmin._id.toString(), role: 'org_admin', permissions: [], organizationId: school._id.toString() });
    const auth = { Authorization: `Bearer ${orgToken}` };

    const course = await Course.create({
      title: { en: 'Biology' }, slug: `bio-${Date.now()}`, category: 'general', level: 'beginner',
      duration: 8, maxStudents: 50, school: school._id, status: 'published',
    });
    const studentUser = await User.create({ email: 'student@test.local', password: 'Password123!', role: 'student', organizationId: school._id });
    const profile = await Profile.create({ user: studentUser._id, firstName: 'Leyla', lastName: 'Isaaq', gender: 'female' });
    const student = await Student.create({ user: studentUser._id, profile: profile._id, school: school._id, enrolledCourses: [course._id] });
    const studentToken = generateAccessToken({ userId: studentUser._id.toString(), role: 'student', permissions: [], organizationId: school._id.toString() });

    const mkExam = (title: string, startTime = '08:00', endTime = '08:50') => Exam.create({
      title, course: course._id, school: school._id, examDate: new Date(`${mogadishuDay()}T00:00:00.000Z`),
      startTime, endTime, duration: 50, totalMarks: 100, passingMarks: 50, createdBy: admin._id,
    });

    // -------------------------------------------------------------------
    section('DELETE /exams/:id — the exam and its records go to Trash');
    // -------------------------------------------------------------------
    const exam = await mkExam('Monthly Exam I');
    await ExamPaper.create({ exam: exam._id, title: 'Paper', status: 'approved', submittedBy: admin._id, questions: [] });
    await Result.create({ exam: exam._id, student: student._id, marksObtained: 72, totalMarks: 100, enteredBy: admin._id });
    await ExamAttendance.create({ exam: exam._id, student: student._id, status: 'present', markedBy: admin._id, school: school._id });

    const del = await request(app).delete(`/api/v1/exams/${exam._id}`).set(auth);
    assert(del.status === 204 || del.status === 200, `delete succeeds (status ${del.status})`);
    assert(!(await Exam.exists({ _id: exam._id })), 'exam is removed from the live collection');
    assert(!(await Result.exists({ exam: exam._id })), 'its result is removed from the live collection');

    const trashed = await Trash.findOne({ entityType: 'Exam' }).lean() as any;
    assert(!!trashed, 'a Trash entry of type Exam exists');
    const models = (trashed?.snapshots || []).map((s: any) => s.modelName).sort();
    assert(['Exam', 'ExamAttendance', 'ExamPaper', 'Result'].every((m) => models.includes(m)), `snapshots hold exam, paper, result and attendance (got ${models.join(', ')})`);
    assert(/Monthly Exam I/.test(trashed?.label || '') && String(trashed?.school) === String(school._id), `label and school are set (got "${trashed?.label}")`);

    // -------------------------------------------------------------------
    section('POST /trash/:id/restore — everything comes back');
    // -------------------------------------------------------------------
    const adminToken = generateAccessToken({ userId: admin._id.toString(), role: 'admin', permissions: [] });
    const restore = await request(app).post(`/api/v1/trash/${trashed?._id}/restore`).set({ Authorization: `Bearer ${adminToken}` });
    assert(restore.status === 200, `restore succeeds (status ${restore.status}: ${restore.body?.message || ''})`);
    assert(restore.body?.data?.entityId === String(exam._id), `restore reports the exam id for Undo (got ${restore.body?.data?.entityId})`);
    const restoredResult = await Result.findOne({ exam: exam._id, student: student._id }).lean() as any;
    assert(!!(await Exam.exists({ _id: exam._id })), 'exam is back');
    assert(restoredResult?.marksObtained === 72, `result is back with its marks (got ${restoredResult?.marksObtained})`);
    assert(!!(await ExamAttendance.exists({ exam: exam._id, student: student._id })), 'attendance is back');
    assert(!!(await ExamPaper.exists({ exam: exam._id })), 'paper is back');

    // -------------------------------------------------------------------
    section('POST /exams/bulk-delete — each exam is trashed, grouped as one batch');
    // -------------------------------------------------------------------
    const e1 = await mkExam('Bulk A', '09:00', '09:50');
    const e2 = await mkExam('Bulk B', '10:00', '10:50');
    const bulk = await request(app).post('/api/v1/exams/bulk-delete').set(auth).send({ ids: [String(e1._id), String(e2._id)] });
    assert(bulk.status === 200 && bulk.body?.data?.deleted === 2, `bulk delete reports 2 (status ${bulk.status}, ${JSON.stringify(bulk.body?.data)})`);
    const bulkEntries = await Trash.find({ entityType: 'Exam', label: /^Bulk/ }).lean() as any[];
    assert(bulkEntries.length === 2 && !!bulkEntries[0].batchId && String(bulkEntries[0].batchId) === String(bulkEntries[1].batchId),
      `two Trash entries sharing one batch (got ${bulkEntries.length})`);

    // -------------------------------------------------------------------
    section('schoolWallTimeToDate — Mogadishu wall clock to UTC');
    // -------------------------------------------------------------------
    assert(schoolWallTimeToDate('2026-11-11', '08:00')?.toISOString() === '2026-11-11T05:00:00.000Z', '08:00 Mogadishu is 05:00 UTC');
    assert(schoolWallTimeToDate('2026-11-11', '01:30')?.toISOString() === '2026-11-10T22:30:00.000Z', '01:30 Mogadishu is 22:30 UTC the day before');
    assert(schoolWallTimeToDate('2026-11-11', '25:00') === null, 'malformed time is rejected');

    // -------------------------------------------------------------------
    section('attempt/start — the window opens on the Mogadishu clock, not UTC');
    // -------------------------------------------------------------------
    const now = Date.now();
    // Avoid a window that would wrap past midnight in either clock.
    const mogMinutes = Number(mogadishuClock(now).slice(0, 2)) * 60 + Number(mogadishuClock(now).slice(3));
    if (mogMinutes < 5 || mogMinutes > 23 * 60 + 20) {
      console.log('  SKIP within 40 minutes of Mogadishu midnight — window would wrap');
    } else {
      const liveExam = await mkExam('Live Now', mogadishuClock(now - 2 * 60000), mogadishuClock(now + 30 * 60000));
      await ExamPaper.create({ exam: liveExam._id, title: 'Live Paper', status: 'approved', submittedBy: admin._id, questions: [] });
      const live = await request(app).post(`/api/v1/exams/${liveExam._id}/attempt/start`).set({ Authorization: `Bearer ${studentToken}` });
      assert(live.status === 200, `an exam live on the Mogadishu clock can be started (status ${live.status}: ${live.body?.message || ''})`);

      // The same times read on the UTC clock are 3 hours earlier in Mogadishu,
      // so this window is already over (or not yet open) for the school.
      const utcExam = await mkExam('UTC Clock', utcClock(now - 2 * 60000), utcClock(now + 30 * 60000));
      await ExamPaper.create({ exam: utcExam._id, title: 'UTC Paper', status: 'approved', submittedBy: admin._id, questions: [] });
      const utc = await request(app).post(`/api/v1/exams/${utcExam._id}/attempt/start`).set({ Authorization: `Bearer ${studentToken}` });
      assert(utc.status === 400, `an exam timed on the UTC clock is not live in Mogadishu (status ${utc.status})`);
    }

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
