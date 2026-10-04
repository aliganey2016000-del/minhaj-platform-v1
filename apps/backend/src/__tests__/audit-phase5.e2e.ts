/**
 * Second production-readiness audit (2026-10-04) regressions.
 *
 * R1  A result could be written for another school's student (and rewrote
 *     that student's GPA); PATCH accepted percentage/grade directly.
 * A1  GET /assignments/:id was readable by any signed-in user of any school.
 * AT1 A student could read a whole course's attendance roster.
 * C1  A course could be linked to another school's teacher or class.
 * E1  Seat accounting was read-modify-write: a full course kept accepting.
 * S1  Org admins could read/clear every school's activity log and read/write
 *     platform settings.
 * G1  The leaderboard ranked every school's students together.
 * N1  Org admins could notify any user of any school, with any link.
 * P1  A payment idempotency key replayed across students returned another
 *     student's payment.
 * AU1 Password reset / verification e-mail endpoints were not rate limited.
 * J1  Tokens signed with another algorithm were accepted.
 * T1  Public branding exposed the internal logo storage key.
 * X1  Category names were used as raw regular expressions.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
process.env.BASE_DOMAIN = 'sahaledu.com';
delete process.env.TENANT_PROXY_SECRET;

import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
// FerretDB (used only where the MongoDB binary cannot be downloaded) lacks
// $lookup, $expr and pipeline updates. Real MongoDB (CI) supports them, so a
// response that fails for that reason is reported as skipped, never as passed.
function emulatorLimited(res: { status: number; body?: any }): boolean {
  const message = String(res.body?.message || '');
  return res.status === 500 && /not (implemented|supported)/i.test(message);
}
function skip(label: string) { console.log(`  SKIP ${label} (database emulator limitation)`); }
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('audit-phase5');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Student } = await import('../models/student.model');
    const { default: Exam } = await import('../models/exam.model');
    const { default: Result } = await import('../models/result.model');
    const { default: Assignment } = await import('../models/assignment.model');
    const { default: ActivityLog } = await import('../models/activity-log.model');
    const { default: Setting } = await import('../models/setting.model');
    const { default: Gamification } = await import('../models/gamification.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: Invoice } = await import('../models/invoice.model');

    const token = (user: any, organizationId?: string) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions: [],
      organizationId: organizationId ?? (user.organizationId ? user.organizationId.toString() : undefined),
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const admin = await User.create({ email: 'a5-admin@example.com', password: 'Password123!', role: 'admin' });
    const makeSchool = (name: string, subdomain: string) => School.create({
      name, organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St', phone: '+000',
      email: `${subdomain}@example.com`, principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
      subdomain, status: 'active', branding: { logo: 'https://cdn.example/logo.png', logoStorageKey: 'secret/key.png', themeColor: '#123456' },
    });
    const schoolA = await makeSchool('Audit School A', 'a5-alpha');
    const schoolB = await makeSchool('Audit School B', 'a5-beta');

    const orgAdminA = await User.create({ email: 'a5-oa@example.com', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id });
    const orgAdminB = await User.create({ email: 'a5-ob@example.com', password: 'Password123!', role: 'org_admin', organizationId: schoolB._id });
    const tokA = token(orgAdminA);
    const tokB = token(orgAdminB);

    const makeTeacher = async (email: string, school: any) => {
      const user = await User.create({ email, password: 'Password123!', role: 'teacher', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: 'T', lastName: email.slice(0, 4), gender: 'male' });
      const teacher = await Teacher.create({ user: user._id, profile: profile._id, school: school._id });
      return { user, teacher };
    };
    const tA = await makeTeacher('a5-ta@example.com', schoolA);
    const tB = await makeTeacher('a5-tb@example.com', schoolB);

    const makeStudent = async (email: string, school: any, sid: string) => {
      const user = await User.create({ email, password: 'Password123!', role: 'student', organizationId: school._id });
      const profile = await Profile.create({ user: user._id, firstName: 'S', lastName: sid, gender: 'male' });
      const student = await Student.create({
        user: user._id, profile: profile._id, studentId: sid, school: school._id, status: 'active', approvalStatus: 'approved',
      });
      return { user, student };
    };
    const sA = await makeStudent('a5-sa@example.com', schoolA, 'A5-A-1');
    const sA2 = await makeStudent('a5-sa2@example.com', schoolA, 'A5-A-2');
    const sB = await makeStudent('a5-sb@example.com', schoolB, 'A5-B-1');

    const courseA = await Course.create({
      title: { en: 'A5 Math A' }, slug: 'a5-math-a', category: 'general', level: 'beginner', duration: 8, maxStudents: 1,
      school: schoolA._id, teacher: tA.teacher._id, status: 'published',
    });
    sA.student.enrolledCourses = [courseA._id];
    await sA.student.save();

    // ---------------------------------------------------------------- R1
    section('R1: results only for the exam\'s own school; PATCH cannot write derived fields');
    const examA = await Exam.create({
      title: 'A5 Exam', course: courseA._id, school: schoolA._id, examDate: new Date(), startTime: '09:00', endTime: '10:00',
      duration: 60, totalMarks: 100, passingMarks: 50, createdBy: orgAdminA._id,
    });
    let res = await request(app).post('/api/v1/results').set(auth(tokA)).send({ exam: examA._id, student: sB.student._id, marksObtained: 90 });
    assert(res.status === 400, `result for another school's student is refused (got ${res.status})`);
    assert((await Result.countDocuments({ student: sB.student._id })) === 0, 'no result row was created for the foreign student');
    const gpaBefore = (await Student.findById(sB.student._id).lean() as any)?.gpa;
    res = await request(app).post('/api/v1/results/bulk').set(auth(tokA)).send({ exam: examA._id, results: [{ student: sB.student._id, marksObtained: 90 }] });
    assert(res.status === 400, `bulk result for another school's student is refused (got ${res.status})`);
    assert(((await Student.findById(sB.student._id).lean()) as any)?.gpa === gpaBefore, "the foreign student's GPA was not touched");
    res = await request(app).post('/api/v1/results').set(auth(tokA)).send({ exam: examA._id, student: sA.student._id, marksObtained: 40 });
    assert(res.status === 201 && res.body?.data?.percentage === 40, `own student's result works (got ${res.status}, ${res.body?.data?.percentage})`);
    const resultId = res.body?.data?._id;
    res = await request(app).patch(`/api/v1/results/${resultId}`).set(auth(tokA)).send({ percentage: 100, grade: 'A+', remarks: 'edited' });
    let row: any = await Result.findById(resultId).lean();
    assert(res.status === 200 && row.percentage === 40 && row.grade !== 'A+' && row.remarks === 'edited', `percentage/grade cannot be written directly (got ${row?.percentage}/${row?.grade})`);
    res = await request(app).patch(`/api/v1/results/${resultId}`).set(auth(tokA)).send({ marksObtained: 80 });
    row = await Result.findById(resultId).lean();
    assert(res.status === 200 && row.percentage === 80, 'changing the marks still recomputes the percentage');
    res = await request(app).patch(`/api/v1/results/${resultId}`).set(auth(tokB)).send({ marksObtained: 1 });
    assert(res.status === 403 || res.status === 404, `another school's admin cannot edit it (got ${res.status})`);

    // ---------------------------------------------------------------- A1
    section('A1: an assignment is only readable by its own course audience');
    const assignment = await Assignment.create({ title: 'A5 homework', course: courseA._id, dueDate: new Date(Date.now() + 86400000), createdBy: tA.user._id });
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(tokB));
    assert(res.status === 403, `another school's admin is refused (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(tB.user)));
    assert(res.status === 403, `another school's teacher is refused (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(sB.user)));
    assert(res.status === 403, `another school's student is refused (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(tokA));
    assert(res.status === 200, `the course's own org admin can read it (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(tA.user)));
    assert(res.status === 200, `the course teacher can read it (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(sA.user)));
    assert(res.status === 200, `an enrolled student can read it (got ${res.status})`);
    res = await request(app).get(`/api/v1/assignments/${assignment._id}`).set(auth(token(sA2.user)));
    assert(res.status === 403, `a same-school student who is not enrolled is refused (got ${res.status})`);
    res = await request(app).patch(`/api/v1/assignments/${assignment._id}/status`).set(auth(tokA)).send({ status: 'bogus' });
    assert(res.status === 400, `an invalid status is rejected (got ${res.status})`);

    // ---------------------------------------------------------------- AT1
    section('AT1: course-wide attendance is staff-only');
    const today = new Date().toISOString().slice(0, 10);
    res = await request(app).get(`/api/v1/attendance/course?courseId=${courseA._id}&date=${today}`).set(auth(token(sA.user)));
    assert(res.status === 403, `a student cannot read the course attendance roster (got ${res.status})`);
    res = await request(app).get(`/api/v1/attendance/report?courseId=${courseA._id}`).set(auth(token(sA.user)));
    assert(res.status === 403, `a student cannot read the course attendance report (got ${res.status})`);
    res = await request(app).get(`/api/v1/attendance/course?courseId=${courseA._id}&date=${today}`).set(auth(token(tA.user)));
    assert(res.status === 200, `the course teacher still can (got ${res.status})`);

    // ---------------------------------------------------------------- C1
    section('C1: a course only links teachers and classes of its own school');
    const classB = await ClassModel.create({ school: schoolB._id, title: 'B Class', section: 'A', room: 'R1', academicYear: '2026/27' } as any);
    const base = { title: { en: 'A5 New Course' }, level: 'beginner', duration: 8, maxStudents: 10, fee: 0 };
    res = await request(app).post('/api/v1/courses').set(auth(tokA)).send({ ...base, teacher: tB.teacher._id });
    assert(res.status === 400, `a foreign teacher is refused (got ${res.status} ${res.body?.message})`);
    res = await request(app).post('/api/v1/courses').set(auth(tokA)).send({ ...base, title: { en: 'A5 New Course 2' }, class: classB._id });
    assert(res.status === 400, `a foreign class is refused (got ${res.status} ${res.body?.message})`);
    res = await request(app).post('/api/v1/courses').set(auth(tokA)).send({ ...base, title: { en: 'A5 New Course 3' }, teacher: tA.teacher._id });
    assert(res.status === 201, `an own-school teacher is accepted (got ${res.status} ${res.body?.message})`);
    const newCourseId = res.body?.data?._id;
    res = await request(app).patch(`/api/v1/courses/${newCourseId}`).set(auth(tokA)).send({ teacher: tB.teacher._id });
    assert(res.status === 400, `re-assigning to a foreign teacher is refused (got ${res.status})`);

    // ---------------------------------------------------------------- E1
    section('E1: enrolment cannot exceed the seat limit');
    const seatCourse: any = await Course.create({
      title: { en: 'A5 Seat' }, slug: 'a5-seat', category: 'general', level: 'beginner', duration: 8, maxStudents: 1,
      school: schoolA._id, teacher: tA.teacher._id, status: 'published',
    });
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/v1/courses/${seatCourse._id}/self-enroll`).set(auth(token(sA2.user))),
      request(app).post(`/api/v1/courses/${seatCourse._id}/self-enroll`).set(auth(token(sA.user))),
    ]);
    const statuses = [r1.status, r2.status].sort();
    const seat: any = await Course.findById(seatCourse._id).lean();
    assert(statuses.filter((s) => s === 200).length === 1 && statuses.filter((s) => s === 400).length === 1, `exactly one of two simultaneous enrolments gets the last seat (got ${statuses.join(',')})`);
    assert(seat.enrolledStudents === 1, `the counter matches the roster (got ${seat.enrolledStudents}/${seat.maxStudents})`);
    const enrolledCount = await Student.countDocuments({ enrolledCourses: seatCourse._id });
    assert(enrolledCount === 1, `only one student actually holds the seat (got ${enrolledCount})`);


    // ---------------------------------------------------------------- GR1 / EA1 / UP1
    section('GR1: manual grades respect school, category and teacher visibility');
    const { default: GradingScheme } = await import('../models/grading-scheme.model');
    await GradingScheme.create({
      course: courseA._id,
      categories: [
        { key: 'quiz', label: 'Quiz', weight: 50, sourceType: 'manual', teacherVisible: true },
        { key: 'final', label: 'Final', weight: 50, sourceType: 'manual', teacherVisible: false },
      ],
    } as any);
    const tTeacherA = token(tA.user);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sA.student._id}`).set(auth(tTeacherA)).send({ categoryKey: 'quiz', score: 80 });
    assert(res.status === 200, `a teacher can grade a visible category (got ${res.status} ${res.body?.message})`);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sA.student._id}`).set(auth(tTeacherA)).send({ categoryKey: 'final', score: 80 });
    assert(res.status === 403, `a teacher cannot grade an admin-only category (got ${res.status})`);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sA.student._id}`).set(auth(tokA)).send({ categoryKey: 'final', score: 80 });
    assert(res.status === 200, `the org admin can (got ${res.status})`);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sA.student._id}`).set(auth(tokA)).send({ categoryKey: 'nope', score: 80 });
    assert(res.status === 400, `an unknown category is refused (got ${res.status})`);
    res = await request(app).put(`/api/v1/gradebook/${courseA._id}/manual/${sB.student._id}`).set(auth(tokA)).send({ categoryKey: 'quiz', score: 80 });
    assert(res.status === 400, `another school's student is refused (got ${res.status})`);

    section('EA1: exam attendance only for the exam\'s own students');
    res = await request(app).post(`/api/v1/exams/${examA._id}/attendance`).set(auth(tokA)).send({ records: [{ student: sB.student._id, status: 'absent' }] });
    assert(res.status === 400, `another school's student cannot be marked (got ${res.status})`);
    res = await request(app).post(`/api/v1/exams/${examA._id}/attendance`).set(auth(tokA)).send({ records: [{ student: sA.student._id, status: 'present' }] });
    assert(res.status === 200 || res.status === 201, `an own student can (got ${res.status} ${res.body?.message})`);

    section('UP1: assignment attachments stay inside the organization\'s own uploads');
    const mk = (attachments: any[]) => request(app).post('/api/v1/assignments').set(auth(tTeacherA))
      .send({ title: 'A5 attach', course: courseA._id, dueDate: new Date(Date.now() + 86400000).toISOString(), attachments });
    res = await mk([{ url: '/uploads/student-documents/x/y/secret.pdf', name: 's.pdf' }]);
    assert(res.status === 400, `a private document folder is refused (got ${res.status})`);
    res = await mk([{ url: `/uploads/assignments/${schoolB._id}/file.pdf`, name: 'f.pdf' }]);
    assert(res.status === 400, `another school's upload folder is refused (got ${res.status})`);
    res = await mk([{ url: `/uploads/assignments/${schoolA._id}/../../x.pdf`, name: 'f.pdf' }]);
    assert(res.status === 400, `a traversal path is refused (got ${res.status})`);
    res = await mk([{ url: `/uploads/assignments/${schoolA._id}/file.pdf`, name: 'f.pdf' }, { url: 'https://example.com/doc.pdf', name: 'doc.pdf' }]);
    assert(res.status === 201, `own folder and external links are accepted (got ${res.status} ${res.body?.message})`);
    res = await request(app).post('/api/v1/assignments').set(auth(tTeacherA))
      .send({ title: 'A5 class', course: courseA._id, class: classB._id, dueDate: new Date(Date.now() + 86400000).toISOString() });
    assert(res.status === 400, `a foreign class is refused for an assignment (got ${res.status})`);


    section('R2: installment reminders are batched and sent once per day');
    const { sendInstallmentReminders } = await import('../services/installment-reminder.service');
    const { default: Notification } = await import('../models/notification.model');
    const soon = new Date(Date.now() + 86400000);
    for (const [student, period] of [[sA.student, 'r2-a'], [sA2.student, 'r2-b'], [sB.student, 'r2-c']] as const) {
      await Invoice.create({
        student: (student as any)._id, school: student === sB.student ? schoolB._id : schoolA._id, title: 'Term fees', period,
        lineItems: [{ description: 'Fees', amount: 100 }], amount: 100, discount: 0, amountPaid: 0, status: 'pending', paymentType: 'tuition',
        dueDate: soon, issueDate: new Date(), generatedBy: admin._id,
        installments: [{ number: 1, dueDate: soon, amount: 50, paidAmount: 0, status: 'pending' }, { number: 10, dueDate: new Date(Date.now() + 40 * 86400000), amount: 50, paidAmount: 0, status: 'pending' }],
      } as any);
    }
    const before = await Notification.countDocuments({ link: '/student/payments' });
    const first = await sendInstallmentReminders();
    const second = await sendInstallmentReminders();
    const created = (await Notification.countDocuments({ link: '/student/payments' })) - before;
    assert(first === 3 && created === 3, `one reminder per student on the first run (sent ${first}, created ${created})`);
    assert(second === 0, `a second run the same day sends nothing (sent ${second})`);


    section('R3: bulk fan-out is bounded');
    const { mapLimit } = await import('../utils/map-limit');
    let inFlight = 0;
    let peak = 0;
    const mapped = await mapLimit(Array.from({ length: 100 }, (_, i) => i), 7, async (n) => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return n * 2;
    });
    assert(peak <= 7 && peak > 1, `never more than 7 operations in flight (peak ${peak})`);
    assert(mapped.length === 100 && mapped[99] === 198 && mapped[0] === 0, 'results keep their order');
    let rejected = false;
    await mapLimit([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('boom'); return n; }).catch(() => { rejected = true; });
    assert(rejected, 'an error still rejects like Promise.all');


    section('X2: exports neutralise spreadsheet formulas');
    const { safeCell } = await import('../utils/spreadsheet-safe');
    const { buildXlsxBuffer } = await import('../utils/xlsx-buffer');
    assert(safeCell("=HYPERLINK(\"http://evil\",\"x\")") === "'=HYPERLINK(\"http://evil\",\"x\")", 'a formula is turned into text');
    assert(safeCell('@SUM(A1)') === "'@SUM(A1)" && safeCell('+cmd|calc') === "'+cmd|calc" && safeCell('-2+3') === "'-2+3" && safeCell('-5') === '-5', 'other triggers are handled; a plain negative number is not changed');
    assert(safeCell('+252 61 000 0000') === '+252 61 000 0000' && safeCell(42) === 42 && safeCell('Ali') === 'Ali', 'phone numbers, numbers and names are untouched');
    const XLSX = await import('xlsx');
    const book = XLSX.read(buildXlsxBuffer(['Name'], [['=1+1'], ['Ali']], 'T'), { type: 'buffer' });
    const cells = XLSX.utils.sheet_to_json<any>(book.Sheets.T, { header: 1 });
    assert(cells[1][0] === "'=1+1" && book.Sheets.T.A2.t === 's', 'the exported workbook stores it as a string, not a formula');

    // ---------------------------------------------------------------- S1
    section('S1: activity logs and settings are not shared between organizations');
    await ActivityLog.create([
      { user: orgAdminA._id, action: 'delete', resource: 'Student', school: schoolA._id, details: 'a-entry' },
      { user: orgAdminB._id, action: 'delete', resource: 'Student', school: schoolB._id, details: 'b-entry' },
      { user: admin._id, action: 'delete', resource: 'Student', details: 'legacy-entry' },
    ]);
    res = await request(app).get('/api/v1/system/logs').set(auth(tokA));
    let details = (res.body?.data || []).map((l: any) => l.details).sort();
    assert(res.status === 200 && details.length === 1 && details[0] === 'a-entry', `org admin A sees only its own log (got ${details.join(',')})`);
    res = await request(app).get('/api/v1/system/logs?search=entry').set(auth(tokA));
    if (emulatorLimited(res)) skip('searching logs stays inside the organization');
    else {
      details = (res.body?.data || []).map((l: any) => l.details).sort();
      assert(details.length === 1 && details[0] === 'a-entry', `searching stays inside the organization (got ${details.join(',')})`);
    }
    res = await request(app).get('/api/v1/system/logs').set(auth(token(admin)));
    assert((res.body?.data || []).length === 3, 'the platform admin still sees every entry');
    res = await request(app).delete('/api/v1/system/logs').set(auth(tokA));
    assert(res.status === 200 && (await ActivityLog.countDocuments({})) === 2, 'an org admin clears only its own entries');
    await Setting.create({ key: 'platform.secret', value: 'x' });
    res = await request(app).get('/api/v1/system/settings').set(auth(tokA));
    assert(res.status === 200 && (res.body?.data || []).length === 0, 'an org admin does not see platform settings');
    res = await request(app).put('/api/v1/system/settings').set(auth(tokA)).send({ settings: [{ key: 'platform.secret', value: 'hacked' }] });
    assert(res.status === 403 && ((await Setting.findOne({ key: 'platform.secret' }).lean()) as any)?.value === 'x', `an org admin cannot change platform settings (got ${res.status})`);
    res = await request(app).get('/api/v1/system/settings').set(auth(token(admin)));
    assert((res.body?.data || []).length === 1, 'the platform admin still reads settings');

    // ---------------------------------------------------------------- G1
    section('G1: the leaderboard stays inside the caller\'s school');
    await Gamification.create({ student: sA.student._id, user: sA.user._id, xp: 100 } as any);
    await Gamification.create({ student: sB.student._id, user: sB.user._id, xp: 900 } as any);
    res = await request(app).get('/api/v1/gamification/leaderboard').set(auth(token(sA.user)));
    const ids = (res.body?.data || []).map((e: any) => e.studentId);
    assert(res.status === 200 && ids.length === 1 && ids[0] === 'A5-A-1', `a student ranks only their own school (got ${ids.join(',')})`);
    res = await request(app).get(`/api/v1/gamification/leaderboard?school=${schoolB._id}`).set(auth(token(sA.user)));
    assert((res.body?.data || []).every((e: any) => e.studentId !== 'A5-B-1'), '?school= cannot reach another school');

    // ---------------------------------------------------------------- N1
    section('N1: notifications only reach the sender\'s own users, with in-app links');
    res = await request(app).post('/api/v1/notifications').set(auth(tokA)).send({ user: sB.user._id, title: 'Hi', message: 'Hello' });
    assert(res.status === 404, `notifying another school's user is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/notifications').set(auth(tokA)).send({ user: sA.user._id, title: 'Hi', message: 'Hello', link: 'https://evil.example/login' });
    assert(res.status === 400, `an external link is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/notifications').set(auth(tokA)).send({ user: sA.user._id, title: 'Hi', message: 'Hello', link: '//evil.example' });
    assert(res.status === 400, `a protocol-relative link is refused (got ${res.status})`);
    res = await request(app).post('/api/v1/notifications').set(auth(tokA)).send({ user: sA.user._id, title: 'Hi', message: 'Hello', link: '/student/assignments' });
    assert(res.status === 201, `an own user with an in-app link works (got ${res.status})`);
    res = await request(app).post('/api/v1/notifications').set(auth(token(admin))).send({ user: sB.user._id, title: 'Hi', message: 'Hello' });
    assert(res.status === 201, `the platform admin can still notify anyone (got ${res.status})`);

    // ---------------------------------------------------------------- P1
    section('P1: an idempotency key cannot replay another student\'s payment');
    const key = 'a5-shared-key-0001';
    const makeInvoice = (school: any, student: any, period: string) => Invoice.create({
      student: student._id, school: school._id, title: 'Fees', period, lineItems: [{ description: 'Fees', amount: 100 }],
      amount: 100, discount: 0, amountPaid: 0, status: 'pending', paymentType: 'tuition', dueDate: new Date(), issueDate: new Date(),
      generatedBy: admin._id,
    } as any);
    const invA = await makeInvoice(schoolA, sA.student, 'a5-2026-10');
    const invB = await makeInvoice(schoolB, sB.student, 'a5-2026-10');
    const { default: Payment } = await import('../models/payment.model');
    const firstPayment = await Payment.create({
      student: sA.student._id, school: schoolA._id, amount: 10, discount: 0, refundedAmount: 0, currency: 'USD', type: 'tuition',
      method: 'cash', status: 'completed', recordedBy: orgAdminA._id, invoice: invA._id, idempotencyKey: key,
    } as any);
    const firstPaymentId = String(firstPayment._id);
    res = await request(app).post('/api/v1/payments').set(auth(tokA)).send({ studentId: sA.student._id, invoiceId: invA._id, amount: 10, method: 'cash', idempotencyKey: key });
    assert(res.status === 201 && res.body?.data?.payment?._id === firstPaymentId, `a genuine retry returns the stored payment (got ${res.status})`);
    res = await request(app).post('/api/v1/payments').set(auth(tokB)).send({ studentId: sB.student._id, invoiceId: invB._id, amount: 10, method: 'cash', idempotencyKey: key });
    assert(res.status === 400 && !JSON.stringify(res.body).includes('A5-A-1'), `the other school's replay is refused without leaking (got ${res.status})`);

    // ---------------------------------------------------------------- AU1
    section('AU1: e-mail sending endpoints are rate limited and look the same for unknown accounts');
    const mail = 'a5-nobody@example.com';
    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const r = await request(app).post('/api/v1/auth/forgot-password').send({ email: mail });
      codes.push(r.status);
    }
    assert(codes.slice(0, 5).every((c) => c === 200) && codes[6] === 429, `the sixth request for one address is limited (got ${codes.join(',')})`);
    const known = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a5-oa@example.com' });
    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a5-other@example.com' });
    assert(known.status === unknown.status && known.body.message === unknown.body.message, 'known and unknown accounts get the same answer');

    // ---------------------------------------------------------------- J1
    section('J1: only HS256 access tokens are accepted');
    const forged = jwt.sign({ userId: admin._id.toString(), role: 'admin', permissions: [] }, process.env.JWT_ACCESS_SECRET!, { algorithm: 'HS512', expiresIn: '5m' });
    res = await request(app).get('/api/v1/auth/me').set(auth(forged));
    assert(res.status === 401, `an HS512 token is refused (got ${res.status})`);
    res = await request(app).get('/api/v1/auth/me').set(auth(token(admin)));
    assert(res.status === 200, `a normal token works (got ${res.status})`);

    // ---------------------------------------------------------------- T1
    section('T1: public branding hides internal storage keys');
    res = await request(app).get('/api/v1/tenant/current').set('X-Tenant-Host', 'a5-alpha.sahaledu.com');
    assert(res.status === 200 && res.body?.data?.branding?.logo === 'https://cdn.example/logo.png' && !JSON.stringify(res.body).includes('secret/key.png'), 'tenant/current has no logoStorageKey');
    res = await request(app).get(`/api/v1/tenant/${schoolA.slug}/branding`);
    assert(res.status === 200 && !JSON.stringify(res.body).includes('secret/key.png'), 'tenant/:slug/branding has no logoStorageKey');

    // ---------------------------------------------------------------- X1
    section('X1: category names are literal text, not regular expressions');
    res = await request(app).post('/api/v1/course-categories').set(auth(tokA)).send({ name: 'Maths' });
    assert(res.status === 201, `a category is created (got ${res.status} ${res.body?.message})`);
    res = await request(app).post('/api/v1/course-categories').set(auth(tokA)).send({ name: 'M.*' });
    assert(res.status === 201, `a regex-looking name is not treated as a match for "Maths" (got ${res.status})`);
    res = await request(app).post('/api/v1/course-categories').set(auth(tokA)).send({ name: '(a+)+$(' });
    assert(res.status === 201, `an invalid regex does not crash the request (got ${res.status})`);
    res = await request(app).post('/api/v1/course-categories').set(auth(tokA)).send({ name: 'maths' });
    assert(res.status === 409, `a true duplicate is still refused (got ${res.status})`);
  } finally {
    await db.stop();
  }

  console.log(failures ? `\n${failures} assertion(s) failed` : '\nPASS: audit phase 5 regressions');
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
