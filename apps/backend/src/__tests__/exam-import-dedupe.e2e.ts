/**
 * Exam bulk import — duplicate-prevention verification.
 *
 * Reproduces the reported bug: every subject's Final Exam appeared TWICE on
 * a student's exam schedule. Root cause found by inspecting exam.controller.ts:
 * bulkImport had NO duplicate check at all (Exam.insertMany blindly inserts
 * every row every time) — importing the same spreadsheet twice, or two
 * overlapping files (a re-exported timetable re-imported after edits),
 * silently created a second identical Exam per row.
 *
 * Runs the REAL Express app against a real, ephemeral in-memory MongoDB
 * (mongodb-memory-server) — never touches the dev/production database.
 * Repeatable: `npm run test:exam-dedupe`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import * as XLSX from 'xlsx';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to in-memory MongoDB:', process.env.MONGODB_URI);

  const { default: app } = await import('../app');
  const { generateAccessToken } = await import('../utils/jwt');
  const { default: User } = await import('../models/user.model');
  const { default: School } = await import('../models/school.model');
  const { default: Course } = await import('../models/course.model');
  const { default: Exam } = await import('../models/exam.model');

  const adminUser = await User.create({ email: 'admin@test.local', password: 'Password123!', role: 'admin' });
  const adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: 'admin', permissions: [] });

  const school = await School.create({
    name: 'Tusma Primary and Secondary School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
    address: '123 St', phone: '+000', email: 'school@test.local', principalName: 'Principal',
    establishedYear: 2020, createdBy: adminUser._id,
  });

  const course = await Course.create({
    title: { en: 'English - Grade 9' }, slug: 'english-grade-9-' + Date.now(),
    category: 'general', level: 'beginner', duration: 8, maxStudents: 50,
    school: school._id, status: 'published',
  });

  function buildImportFile(rows: any[][]) {
    const headers = ['Organization', 'Course', 'Exam Title', 'Exam Date', 'Start Time', 'End Time', 'Duration', 'Total Marks', 'Passing Marks', 'Room'];
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  const oneRow = [[school.name, 'English - Grade 9', 'Final Exam', '2026-08-24', '11:00', '13:00', '120', '100', '50', '']];

  // -------------------------------------------------------------------
  section('FIRST IMPORT — creates the exam');
  // -------------------------------------------------------------------
  const first = await request(app).post('/api/v1/exams/import').set('Authorization', `Bearer ${adminToken}`).attach('file', buildImportFile(oneRow), 'exams.xlsx');
  assert(first.status === 200, `first import succeeds (status ${first.status})`);
  assert(first.body?.data?.created === 1, `first import creates exactly 1 exam (got ${JSON.stringify(first.body?.data)})`);

  // -------------------------------------------------------------------
  section('SAME FILE RE-IMPORTED — this is the reported bug scenario');
  // -------------------------------------------------------------------
  const second = await request(app).post('/api/v1/exams/import').set('Authorization', `Bearer ${adminToken}`).attach('file', buildImportFile(oneRow), 'exams.xlsx');
  assert(second.status === 200, `re-import request succeeds (status ${second.status})`);
  assert(second.body?.data?.created === 0, `re-importing the SAME file creates 0 new exams, not a duplicate (got ${JSON.stringify(second.body?.data)})`);
  assert(second.body?.data?.failed === 1 && /already exists/i.test(second.body?.data?.errors?.[0]?.message || ''), `re-import reports a clear "already exists" error (got ${JSON.stringify(second.body?.data)})`);

  const examCountAfterReimport = await Exam.countDocuments({ course: course._id, title: 'Final Exam' });
  assert(examCountAfterReimport === 1, `exactly 1 "Final Exam" exists in the database after re-importing the same file (got ${examCountAfterReimport})`);

  // -------------------------------------------------------------------
  section('DUPLICATE ROW WITHIN THE SAME FILE');
  // -------------------------------------------------------------------
  const dupWithinFile = [
    [school.name, 'English - Grade 9', 'Mid Exam', '2026-09-01', '09:00', '11:00', '120', '100', '50', ''],
    [school.name, 'English - Grade 9', 'Mid Exam', '2026-09-01', '09:00', '11:00', '120', '100', '50', ''], // exact duplicate row
  ];
  const withinFileRes = await request(app).post('/api/v1/exams/import').set('Authorization', `Bearer ${adminToken}`).attach('file', buildImportFile(dupWithinFile), 'exams.xlsx');
  assert(withinFileRes.body?.data?.created === 1, `a file with the same row pasted twice creates only 1 exam (got ${JSON.stringify(withinFileRes.body?.data)})`);
  assert(withinFileRes.body?.data?.failed === 1, `the second identical row within the file is reported as skipped (got ${JSON.stringify(withinFileRes.body?.data)})`);

  // -------------------------------------------------------------------
  section('DIFFERENT EXAM ON THE SAME COURSE/DATE IS STILL ALLOWED');
  // -------------------------------------------------------------------
  const differentTitle = [[school.name, 'English - Grade 9', 'Retake Exam', '2026-08-24', '14:00', '16:00', '120', '100', '50', '']];
  const diffRes = await request(app).post('/api/v1/exams/import').set('Authorization', `Bearer ${adminToken}`).attach('file', buildImportFile(differentTitle), 'exams.xlsx');
  assert(diffRes.body?.data?.created === 1, `a genuinely different exam (different title, same course+date) is NOT blocked as a false-positive duplicate (got ${JSON.stringify(diffRes.body?.data)})`);

  // -------------------------------------------------------------------
  section('MANUAL "SCHEDULE EXAM" DOUBLE-SUBMIT IS ALSO BLOCKED');
  // -------------------------------------------------------------------
  const manualPayload = {
    course: course._id.toString(), title: 'Practical Exam', examDate: '2026-10-01', startTime: '10:00', endTime: '12:00',
    duration: 120, totalMarks: 100, passingMarks: 50, autoSchedule: false,
  };
  const manual1 = await request(app).post('/api/v1/exams').set('Authorization', `Bearer ${adminToken}`).send(manualPayload);
  assert(manual1.status === 201, `first manual create succeeds (status ${manual1.status})`);
  const manual2 = await request(app).post('/api/v1/exams').set('Authorization', `Bearer ${adminToken}`).send(manualPayload);
  assert(manual2.status === 409, `an accidental double-submit of the same manual exam is rejected with 409 (got ${manual2.status})`);

  // -------------------------------------------------------------------
  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) {
    console.log('ALL CHECKS PASSED (0 failures)');
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
  }
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
