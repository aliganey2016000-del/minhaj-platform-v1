/**
 * CSV/formula-injection regression — export/report round (2026-10-04).
 *
 * The gradebook (`GET /gradebook/:courseId/export?format=csv`) and learning
 * activity (`GET /activity/export/:studentId?format=csv`) CSV exports built
 * each row as `"${String(cell).replace(/"/g, '""')}"` with no check on the
 * cell's own content. CSV carries no per-cell type information, so when the
 * downloaded file is opened in Excel/Sheets/LibreOffice, any cell starting
 * with `=`, `+`, `-` or `@` is evaluated as a formula rather than shown as
 * text — quoting does NOT prevent this. Both exports place user-controlled
 * text straight into a cell: a student's own profile name (gradebook "Name"
 * column) and a `resourceName` taken verbatim from a learning-activity event
 * (e.g. a forum thread's title, logged on `message_sent` — see
 * forum.controller.ts `createMessage` / learning-activity-logger.ts), so any
 * student can plant a formula an admin later executes just by opening their
 * own exported report.
 *
 * Fixed by routing every CSV cell through utils/csv-sanitize.ts'
 * `buildCsv()`, which prefixes a leading `=`/`+`/`-`/`@` (or tab/CR) with a
 * single quote so the cell round-trips as inert text (the standard OWASP
 * CSV-injection mitigation). XLSX exports are unaffected by this issue (and
 * so untouched): SheetJS writes each cell with an explicit string type,
 * which Excel renders as text regardless of its leading character.
 *
 * Runs the REAL Express app against a real database — mongodb-memory-server
 * by default, or TEST_MONGODB_URI (e.g. the sandbox's FerretDB at
 * mongodb://127.0.0.1:27018) when the binary can't be downloaded.
 * Repeatable: `npm run test:csv-injection`.
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

/** A cell is safe once opened in a spreadsheet app if it does NOT start with a formula-triggering character. */
function isSafeCell(raw: string): boolean {
  return !/^[=+\-@]/.test(raw);
}

/** Pulls the N-th comma-split, quote-unwrapped field out of a single CSV data line (good enough — none of our test values contain a comma). */
function field(line: string, index: number): string {
  return line.split(',')[index].replace(/^"/, '').replace(/"$/, '').replace(/""/g, '"');
}

async function main() {
  const db = await startTestDb('csv-injection');
  try {
    // ---------------------------------------------------------------
    section('Unit: buildCsv / sanitizeCsvCell neutralize formula-leading cells');
    // ---------------------------------------------------------------
    {
      const { buildCsv, sanitizeCsvCell } = await import('../utils/csv-sanitize');
      assert(sanitizeCsvCell('=cmd|\'/c calc\'!A0') === "'=cmd|'/c calc'!A0", 'leading "=" gets a neutralizing apostrophe prefix');
      assert(sanitizeCsvCell('+1-234-555-0100') === "'+1-234-555-0100", 'leading "+" (e.g. a phone number) gets neutralized too');
      assert(sanitizeCsvCell('@SUM(1+1)') === "'@SUM(1+1)", 'leading "@" gets neutralized');
      assert(sanitizeCsvCell('Ahmed Hassan') === 'Ahmed Hassan', 'an ordinary value is left untouched');
      assert(sanitizeCsvCell(null) === '' && sanitizeCsvCell(undefined) === '', 'null/undefined become an empty string, not "null"/"undefined"');

      const csv = buildCsv(['Name'], [['=HYPERLINK("http://evil.test","click")']]);
      const dataLine = csv.split('\n')[1];
      assert(isSafeCell(field(dataLine, 0)), `buildCsv's own output is safe (got ${JSON.stringify(dataLine)})`);
    }

    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: Profile } = await import('../models/profile.model');
    const { default: School } = await import('../models/school.model');
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: Course } = await import('../models/course.model');
    const { default: Student } = await import('../models/student.model');
    const { default: LearningActivity } = await import('../models/learning-activity.model');

    function tokenFor(userId: string, role: string, organizationId?: string) {
      return generateAccessToken({ userId, role, permissions: [], organizationId });
    }

    const adminUser = await User.create({ email: 'csv-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'CSV Injection Test School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu',
      address: '1 St', phone: '+000', email: 'csv-school@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: adminUser._id,
    });
    const orgAdminUser = await User.create({ email: 'csv-orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });
    const orgAdminToken = tokenFor(orgAdminUser._id.toString(), 'org_admin', school._id.toString());

    const teacherUser = await User.create({ email: 'csv-teacher@test.local', password: 'Password123!', role: 'teacher' });
    const teacherProfile = await Profile.create({ user: teacherUser._id, firstName: 'Liban', lastName: 'Hassan', gender: 'male' });
    const teacher = await Teacher.create({ user: teacherUser._id, profile: teacherProfile._id, school: school._id });

    const course = await Course.create({
      title: { en: 'CSV Injection Course' },
      slug: 'csv-injection-course-' + Date.now(),
      category: 'islamic-studies', level: 'beginner', duration: 8, maxStudents: 50,
      school: school._id, teacher: teacher._id, status: 'published',
    });

    // The student's own profile name is attacker-controlled (set at
    // self-registration / profile edit) and lands directly in the
    // gradebook export's "Name" column.
    const studentUser = await User.create({ email: 'csv-student@test.local', password: 'Password123!', role: 'student' });
    const maliciousName = "=cmd|'/c calc'!A0";
    const studentProfile = await Profile.create({ user: studentUser._id, firstName: maliciousName, lastName: 'Attacker', gender: 'male' });
    const student = await Student.create({
      user: studentUser._id, profile: studentProfile._id, school: school._id,
      class: new (await import('mongoose')).default.Types.ObjectId(),
      studentId: 'CSV-001', enrolledCourses: [course._id],
    });

    // A forum reply's title, logged verbatim as a learning-activity
    // resourceName (forum.controller.ts createMessage -> message_sent),
    // lands directly in the activity-timeline export's "Resource" column.
    await LearningActivity.create({
      user: studentUser._id, student: student._id, school: school._id, course: course._id,
      type: 'message_sent', resourceName: '@SUM(1+9)*DANGER', createdAt: new Date(),
    });

    // -----------------------------------------------------------------
    section('Gradebook export: a student\'s own profile name can no longer plant a formula');
    // -----------------------------------------------------------------
    {
      const res = await request(app)
        .get(`/api/v1/gradebook/${course._id}/export`)
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${orgAdminToken}`);
      assert(res.status === 200, `gradebook CSV export succeeds (status ${res.status})`);
      const csvText: string = res.text;
      const dataLine = csvText.split('\n').find((l) => l.includes('Attacker'));
      assert(!!dataLine, `exported CSV contains the malicious student's row (got ${JSON.stringify(csvText)})`);
      if (dataLine) {
        const nameCell = field(dataLine, 1);
        assert(nameCell.startsWith("'="), `the dangerous "=" is now prefixed with a neutralizing apostrophe (got ${JSON.stringify(nameCell)})`);
        assert(isSafeCell(nameCell), `name cell no longer starts with a formula-triggering character (got ${JSON.stringify(nameCell)})`);
      }
    }

    // -----------------------------------------------------------------
    section('Activity export: a forum-reply title logged as resourceName can no longer plant a formula');
    // -----------------------------------------------------------------
    {
      const res = await request(app)
        .get(`/api/v1/activity/export/${student._id}`)
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${orgAdminToken}`);
      assert(res.status === 200, `activity CSV export succeeds (status ${res.status})`);
      const csvText: string = res.text;
      const dataLine = csvText.split('\n').find((l) => l.includes('DANGER'));
      assert(!!dataLine, `exported CSV contains the malicious resourceName row (got ${JSON.stringify(csvText)})`);
      if (dataLine) {
        const resourceCell = field(dataLine, 2);
        assert(resourceCell.startsWith("'@"), `the dangerous "@" is now prefixed with a neutralizing apostrophe (got ${JSON.stringify(resourceCell)})`);
        assert(isSafeCell(resourceCell), `resource cell no longer starts with a formula-triggering character (got ${JSON.stringify(resourceCell)})`);
      }
    }

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
