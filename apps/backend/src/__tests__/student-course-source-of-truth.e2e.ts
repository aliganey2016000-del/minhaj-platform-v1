/**
 * Student current-course source-of-truth regression test.
 *
 * Verifies the read-side guard added to Student.findOne():
 * - active students derive current courses from the newest active enrollment
 *   history entry;
 * - duplicate course ids are removed;
 * - deleted/dangling course ids are filtered from the returned current list;
 * - inactive/suspended/graduated students expose no current courses;
 * - the read normalization does NOT mutate the persisted enrollment history.
 *
 * Runs against an ephemeral mongodb-memory-server instance.
 * Repeatable: `npm run test:student-course-source-of-truth`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else {
    console.log(`  FAIL ${label}`);
    failures++;
  }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to in-memory MongoDB:', process.env.MONGODB_URI);

  const { default: Course } = await import('../models/course.model');
  const { default: Student } = await import('../models/student.model');

  const liveCourse = await Course.create({
    title: { en: 'Current Semester Course' },
    slug: `current-semester-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    category: 'islamic-studies',
    level: 'beginner',
    duration: 8,
    maxStudents: 50,
  });
  const olderCourse = await Course.create({
    title: { en: 'Older Semester Course' },
    slug: `older-semester-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    category: 'islamic-studies',
    level: 'beginner',
    duration: 8,
    maxStudents: 50,
  });
  const danglingCourseId = new mongoose.Types.ObjectId();

  const classOne = new mongoose.Types.ObjectId();
  const classTwo = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const profileId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  const student = await Student.create({
    _id: studentId,
    user: userId,
    profile: profileId,
    school: new mongoose.Types.ObjectId(),
    class: classTwo,
    studentId: 'STU-SOURCE-001',
    status: 'active',
    enrolledCourses: [olderCourse._id, liveCourse._id, liveCourse._id, danglingCourseId],
    enrollmentHistory: [
      {
        academicYear: '2025-2026',
        class: classOne,
        studyYear: 1,
        semesterNumber: 1,
        semesterInYear: 1,
        courses: [olderCourse._id],
        status: 'completed',
        startedAt: new Date('2025-09-01T00:00:00.000Z'),
        endedAt: new Date('2026-01-15T00:00:00.000Z'),
      },
      {
        academicYear: '2025-2026',
        class: classTwo,
        studyYear: 1,
        semesterNumber: 2,
        semesterInYear: 2,
        courses: [liveCourse._id, liveCourse._id, danglingCourseId],
        status: 'active',
        startedAt: new Date('2026-01-16T00:00:00.000Z'),
      },
    ],
  });

  section('ACTIVE STUDENT — current courses come from newest active enrollment history');
  const activeRead: any = await Student.findOne({ _id: student._id });
  const activeCourseIds = (activeRead.enrolledCourses || []).map((id: any) => String(id));
  assert(activeCourseIds.length === 1, `only one valid current course remains after dedupe/dangling filtering (got ${JSON.stringify(activeCourseIds)})`);
  assert(activeCourseIds[0] === String(liveCourse._id), `current course is the newest active semester course (got ${activeCourseIds[0]})`);
  assert(!activeCourseIds.includes(String(olderCourse._id)), 'older completed-semester course is not exposed as current');
  assert(!activeCourseIds.includes(String(danglingCourseId)), 'deleted/dangling course id is not exposed as current');

  section('PERSISTENCE — read normalization does not erase enrollment history');
  const raw = await Student.collection.findOne({ _id: student._id });
  const rawActiveHistory = (raw?.enrollmentHistory || []).find((entry: any) => entry.status === 'active') as any;
  const rawHistoryCourseIds = (rawActiveHistory?.courses || []).map((id: any) => String(id));
  const rawCurrentCourseIds = (raw?.enrolledCourses || []).map((id: any) => String(id));
  assert(rawHistoryCourseIds.length === 3, `raw active enrollment history still preserves all original course links (got ${JSON.stringify(rawHistoryCourseIds)})`);
  assert(rawHistoryCourseIds.includes(String(danglingCourseId)), 'raw enrollment history preserves the dangling course reference for historical integrity');
  assert(rawCurrentCourseIds.length === 4, `read-time normalization did not mutate persisted enrolledCourses (got ${JSON.stringify(rawCurrentCourseIds)})`);

  section('NON-ACTIVE STUDENTS — no current courses are exposed');
  for (const status of ['inactive', 'suspended', 'graduated'] as const) {
    const nonActiveStudentId = new mongoose.Types.ObjectId();
    await Student.create({
      _id: nonActiveStudentId,
      user: new mongoose.Types.ObjectId(),
      profile: new mongoose.Types.ObjectId(),
      school: new mongoose.Types.ObjectId(),
      class: classTwo,
      studentId: `STU-${status.toUpperCase()}-001`,
      status,
      enrolledCourses: [liveCourse._id],
      enrollmentHistory: [
        {
          academicYear: '2025-2026',
          class: classTwo,
          studyYear: 1,
          semesterNumber: 2,
          semesterInYear: 2,
          courses: [liveCourse._id],
          status: 'active',
          startedAt: new Date('2026-01-16T00:00:00.000Z'),
        },
      ],
    });

    const read: any = await Student.findOne({ _id: nonActiveStudentId });
    assert((read.enrolledCourses || []).length === 0, `${status} student exposes zero current courses`);
  }

  section('LEGACY STUDENT — no active enrollment-history entry falls back to raw enrolledCourses');
  {
    // Reproduces real students enrolled before enrollmentHistory tracking
    // existed (or via any path that sets enrolledCourses without pushing a
    // history entry). The read normalization must NOT treat "no active
    // history entry" as "zero courses" — that previously wiped real
    // enrollment data on the next unrelated student.save().
    const legacyStudentId = new mongoose.Types.ObjectId();
    await Student.create({
      _id: legacyStudentId,
      user: new mongoose.Types.ObjectId(),
      profile: new mongoose.Types.ObjectId(),
      school: new mongoose.Types.ObjectId(),
      class: classTwo,
      studentId: 'STU-LEGACY-001',
      status: 'active',
      enrolledCourses: [liveCourse._id, danglingCourseId],
      enrollmentHistory: [],
    });

    const legacyRead: any = await Student.findOne({ _id: legacyStudentId });
    const legacyCourseIds = (legacyRead.enrolledCourses || []).map((id: any) => String(id));
    assert(legacyCourseIds.length === 1, `legacy student's real course is preserved, not wiped (got ${JSON.stringify(legacyCourseIds)})`);
    assert(legacyCourseIds[0] === String(liveCourse._id), 'legacy student current course falls back to raw enrolledCourses');
    assert(!legacyCourseIds.includes(String(danglingCourseId)), 'dangling course id is still filtered out for legacy students');

    // Same legacy student, but read through .populate('enrolledCourses') —
    // the real path getMyCourses()/getMyDashboard() use. Population resolves
    // BEFORE this post('findOne') hook runs, so by the time the fallback
    // reads student.enrolledCourses, each entry is already a populated
    // Course document, not a bare ObjectId. A prior fix regressed exactly
    // this: it treated the populated documents as opaque ids, deduped them
    // all into one bogus key, failed the existence lookup, and wiped the
    // list back to [] — passing the unpopulated case above while silently
    // breaking the one real callers actually use.
    const legacyPopulated: any = await Student.findOne({ _id: legacyStudentId }).populate('enrolledCourses', 'title');
    const legacyPopulatedIds = (legacyPopulated.enrolledCourses || []).map((c: any) => String(c._id || c));
    assert(legacyPopulatedIds.length === 1, `legacy student's course survives a populated read (got ${JSON.stringify(legacyPopulatedIds)})`);
    assert(legacyPopulatedIds[0] === String(liveCourse._id), 'populated legacy student course is the real course, not lost');

    // A second regression, one layer deeper: the fix for the above wiped
    // the populated *document* itself when it reassigned enrolledCourses
    // from the id list it had just computed, instead of the original
    // populated entries — ids stayed correct, but title/slug/etc were
    // silently dropped, so real callers (course cards, "continue learning"
    // links) rendered "Untitled" and navigated to /undefined.
    const populatedTitle = legacyPopulated.enrolledCourses?.[0]?.title?.en;
    assert(populatedTitle === 'Current Semester Course', `populated fields (title) survive the fallback, not just the id (got ${JSON.stringify(populatedTitle)})`);
  }

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) console.log('ALL CHECKS PASSED (0 failures)');
  else console.log(`${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('FATAL ERROR:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
