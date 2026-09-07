/**
 * Recovery: restore `enrolledCourses` for students whose current-course link
 * was silently wiped by a bug in Student.findOne()'s read-time
 * normalization (src/models/student.model.ts, introduced 2026-09-06,
 * fixed 2026-09-07).
 *
 * What happened: that hook derived `enrolledCourses` ONLY from the newest
 * *active* entry in `enrollmentHistory`. Students without such an entry
 * (enrolled before enrollmentHistory tracking existed, or enrolled via any
 * path that set enrolledCourses without also pushing a history entry) had
 * it forced to `[]` on every read. Because ensureStudentRecord()/update()
 * fetch a real (non-lean) Student document, the very next unrelated
 * `student.save()` — e.g. an admin editing any other field on the Students
 * Manage page — PERSISTED that empty array, permanently erasing the real
 * enrolledCourses field in MongoDB.
 *
 * The bug itself is already fixed in student.model.ts (it now falls back to
 * the raw stored enrolledCourses when there is no active history entry).
 * This script ONLY repairs students who were already wiped-and-saved before
 * that fix was deployed — the code fix alone cannot bring those back
 * because their stored enrolledCourses field is genuinely `[]` now.
 *
 * Recovery source, per affected student:
 *   1. The `progress` collection — a (student, course) pair only ever gets
 *      created when that student actually opened/worked a course. This is
 *      durable proof of real enrollment, stored in a separate collection
 *      the bug never touched.
 *   2. Any course id ever recorded anywhere in enrollmentHistory (any
 *      status, not just "active") — supplementary signal.
 * Both are filtered down to courses that still exist. A student with no
 * signal in either place is left untouched (nothing to recover — may be a
 * genuinely new/unenrolled student, not a bug victim).
 *
 * This only ever WRITES to `enrolledCourses` (and, for touched courses,
 * recalculates the cached `enrolledStudents` seat count). It never touches
 * enrollmentHistory, grades, attendance, or anything else.
 *
 * Usage (dry run by default — nothing is written):
 *   MONGO_URI="mongodb://..." node src/scripts/recover-wiped-enrollments.js
 *
 * Apply the fix for real:
 *   MONGO_URI="mongodb://..." node src/scripts/recover-wiped-enrollments.js --commit
 *
 * Restrict to one student while verifying (recommended first pass):
 *   MONGO_URI="mongodb://..." STUDENT_EMAIL="someone@example.com" node src/scripts/recover-wiped-enrollments.js
 */

const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Set MONGO_URI to the target database connection string.');
  const commit = process.argv.includes('--commit');
  const onlyEmail = process.env.STUDENT_EMAIL ? String(process.env.STUDENT_EMAIL).toLowerCase().trim() : null;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const students = db.collection('students');
  const users = db.collection('users');
  const progress = db.collection('progress');
  const courses = db.collection('courses');

  let studentFilter = {
    status: 'active',
    $or: [{ enrolledCourses: { $exists: false } }, { enrolledCourses: { $size: 0 } }],
  };

  if (onlyEmail) {
    const user = await users.findOne({ email: onlyEmail });
    if (!user) {
      console.log(`No user found with email ${onlyEmail}`);
      await client.close();
      return;
    }
    studentFilter = { user: user._id };
  }

  const candidates = await students.find(studentFilter).toArray();
  console.log(`Checking ${candidates.length} student(s)${onlyEmail ? ` (filtered to ${onlyEmail})` : ' (active, zero current courses)'}.\n`);

  let restoredCount = 0;
  let untouchedCount = 0;
  const touchedCourseIds = new Set();

  for (const s of candidates) {
    const fromProgress = await progress.distinct('course', { student: s._id });
    const fromHistory = (s.enrollmentHistory || []).flatMap((e) => e.courses || []);
    const candidateIds = [...new Set([...fromProgress, ...fromHistory].map((id) => String(id)))];

    if (candidateIds.length === 0) {
      console.log(`  [skip] ${s.studentId || s._id} — no progress records or history to recover from.`);
      untouchedCount++;
      continue;
    }

    const existing = await courses
      .find({ _id: { $in: candidateIds.map((id) => new ObjectId(id)) } })
      .project({ _id: 1 })
      .toArray();
    const existingIds = existing.map((c) => c._id);

    if (existingIds.length === 0) {
      console.log(`  [skip] ${s.studentId || s._id} — candidate course(s) no longer exist.`);
      untouchedCount++;
      continue;
    }

    console.log(
      `  [${commit ? 'RESTORE' : 'would restore'}] ${s.studentId || s._id}: ${existingIds.length} course(s) ` +
      `(${fromProgress.length} from progress, ${fromHistory.length} raw history refs, currently stored: ${(s.enrolledCourses || []).length})`
    );

    if (commit) {
      await students.updateOne({ _id: s._id }, { $set: { enrolledCourses: existingIds } });
    }
    existingIds.forEach((id) => touchedCourseIds.add(String(id)));
    restoredCount++;
  }

  if (commit && touchedCourseIds.size > 0) {
    console.log(`\nRecalculating seat counts for ${touchedCourseIds.size} touched course(s)...`);
    for (const courseId of touchedCourseIds) {
      const enrolledStudents = await students.countDocuments({ enrolledCourses: new ObjectId(courseId), status: 'active' });
      await courses.updateOne({ _id: new ObjectId(courseId) }, { $set: { enrolledStudents } });
    }
  }

  console.log(`\n${commit ? 'Restored' : 'Would restore'}: ${restoredCount}`);
  console.log(`No recoverable signal (left as-is): ${untouchedCount}`);
  if (!commit) console.log('\nDry run only — nothing was written. Re-run with --commit to apply.');

  await client.close();
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
