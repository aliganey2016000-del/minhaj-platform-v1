/**
 * Exam create/update — passingMarks must not exceed totalMarks.
 *
 * Reported gap: neither the Exam schema (just `min: 1` on each field) nor
 * the controllers for POST /exams, PATCH /exams/:id, or the CSV bulk-import
 * exam flow ever checked passingMarks against totalMarks. An admin/teacher
 * could schedule e.g. totalMarks: 50, passingMarks: 100 — an exam no
 * student could ever pass, and whose "Passing Marks (Math.round(passing /
 * total * 100))" detail-view percentage would render as 200%. The frontend
 * form (exams-manage.tsx) had the same gap: a number input with min={1} and
 * no upper bound tied to totalMarks, so the bad value sailed straight
 * through the UI too.
 *
 * Fixed by adding an explicit cross-field check in exam.controller.ts's
 * create(), update() (merging with the existing document for a partial
 * PATCH) and the CSV import row validator, each throwing a friendly
 * BadRequestError/Error rather than silently accepting it. The frontend
 * form now also blocks submission and shows an inline error (verified by
 * reading exams-manage.tsx's handleSubmit — no second test harness exists
 * for pure frontend logic beyond build+lint).
 *
 * Runs the REAL Express app against a real database (mongodb-memory-server
 * in CI, or TEST_MONGODB_URI — e.g. the sandbox's FerretDB — locally).
 * Repeatable: `npm run test:exam-passing-marks-bound`.
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

async function main() {
  const db = await startTestDb('exam-passing-marks-bound');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Exam } = await import('../models/exam.model');

    const tokenFor = (userId: string, role: string, organizationId?: string) =>
      generateAccessToken({ userId, role, permissions: [], organizationId });

    const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
    });
    const orgAdminUser = await User.create({ email: 'orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const orgAdminToken = tokenFor(orgAdminUser._id.toString(), 'org_admin', school._id.toString());

    const teacherUser = await User.create({ email: 'teacher@test.local', password: 'Password123!', role: 'teacher' });
    const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'Liban', lastName: 'Hassan', gender: 'male' });
    const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id });

    const course = await Course.create({
      title: { en: 'Matn Safiinat An-Najaah' }, slug: 'matn-' + Date.now().toString().slice(-8),
      category: 'islamic-studies', level: 'beginner', duration: 8, maxStudents: 50,
      school: school._id, teacher: teacher._id, status: 'published',
    });

    // -------------------------------------------------------------------
    section('POST /exams — rejects passingMarks > totalMarks with a friendly error, not a raw cast/schema error');
    // -------------------------------------------------------------------
    const createRes = await request(app).post('/api/v1/exams').set('Authorization', `Bearer ${orgAdminToken}`).send({
      title: 'Impossible Exam', course: course._id.toString(),
      examDate: new Date().toISOString(), startTime: '09:00', endTime: '10:00',
      duration: 60, totalMarks: 50, passingMarks: 100,
    });
    assert(createRes.status === 400, `request is rejected with 400 (got ${createRes.status})`);
    assert(/passing marks/i.test(createRes.body?.message || ''), `error message names the real problem (got "${createRes.body?.message}")`);
    const examCount = await Exam.countDocuments({ title: 'Impossible Exam' });
    assert(examCount === 0, `no exam document was created (found ${examCount})`);

    // -------------------------------------------------------------------
    section('POST /exams — a valid passingMarks <= totalMarks still succeeds');
    // -------------------------------------------------------------------
    const okRes = await request(app).post('/api/v1/exams').set('Authorization', `Bearer ${orgAdminToken}`).send({
      title: 'Fair Exam', course: course._id.toString(),
      examDate: new Date().toISOString(), startTime: '11:00', endTime: '12:00',
      duration: 60, totalMarks: 50, passingMarks: 25,
    });
    assert(okRes.status === 201, `request succeeds (status ${okRes.status})`);
    const examId = okRes.body?.data?._id;
    assert(!!examId, 'created exam id is present');

    // -------------------------------------------------------------------
    section('PATCH /exams/:id — raising passingMarks above the EXISTING totalMarks (not sent in this request) is still rejected');
    // -------------------------------------------------------------------
    const patchRes = await request(app).patch(`/api/v1/exams/${examId}`).set('Authorization', `Bearer ${orgAdminToken}`).send({
      passingMarks: 999,
    });
    assert(patchRes.status === 400, `request is rejected with 400 (got ${patchRes.status})`);
    assert(/passing marks/i.test(patchRes.body?.message || ''), `error message names the real problem (got "${patchRes.body?.message}")`);
    const unchanged = await Exam.findById(examId).lean();
    assert((unchanged as any)?.passingMarks === 25, `the exam's passingMarks was left untouched at 25 (got ${(unchanged as any)?.passingMarks})`);

    // -------------------------------------------------------------------
    section('PATCH /exams/:id — lowering totalMarks below the EXISTING passingMarks (not sent) is also rejected');
    // -------------------------------------------------------------------
    const patchRes2 = await request(app).patch(`/api/v1/exams/${examId}`).set('Authorization', `Bearer ${orgAdminToken}`).send({
      totalMarks: 10,
    });
    assert(patchRes2.status === 400, `request is rejected with 400 (got ${patchRes2.status})`);
    const stillUnchanged = await Exam.findById(examId).lean();
    assert((stillUnchanged as any)?.totalMarks === 50, `the exam's totalMarks was left untouched at 50 (got ${(stillUnchanged as any)?.totalMarks})`);

    // -------------------------------------------------------------------
    section('PATCH /exams/:id — raising both together to a still-valid pair succeeds');
    // -------------------------------------------------------------------
    const patchRes3 = await request(app).patch(`/api/v1/exams/${examId}`).set('Authorization', `Bearer ${orgAdminToken}`).send({
      totalMarks: 200, passingMarks: 150,
    });
    assert(patchRes3.status === 200, `request succeeds (status ${patchRes3.status})`);

    // -------------------------------------------------------------------
    console.log(`\n${'='.repeat(60)}`);
    if (failures === 0) {
      console.log('ALL CHECKS PASSED (0 failures)');
    } else {
      console.log(`${failures} CHECK(S) FAILED`);
    }
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
