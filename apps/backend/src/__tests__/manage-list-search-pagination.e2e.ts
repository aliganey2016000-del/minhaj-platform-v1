/**
 * GET /students, /teachers, /classes — search correctness + tenant scope.
 *
 * All three list endpoints paginate at the database level, then (for
 * students/teachers) filter that one page's results in memory by search
 * text — so a matching record sitting on any page other than the one
 * requested was invisible, and `total` only ever reported how many of that
 * one page matched (students instead loaded the WHOLE scoped roster on
 * every search, which was correct but meant populating every student in
 * the school on every keystroke). All three now match and paginate in a
 * single aggregation, so a match is found regardless of sort position, the
 * reported total is the real match count, and only one page is populated.
 *
 * Runs against an ephemeral in-memory MongoDB. `npm run test:list-search`.
 */

// The controllers type req.user via the global Express augmentation, which
// only the auth middleware declares; reference it without loading it.
/// <reference path="../middleware/auth.middleware.ts" />

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}

async function call(handler: (req: any, res: any) => Promise<unknown>, req: any) {
  let body: any;
  const res: any = { status() { return res; }, json(payload: any) { body = payload; return res; } };
  await handler(req, res);
  return body;
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: School } = await import('../models/school.model');
  const { default: Student } = await import('../models/student.model');
  const { default: Teacher } = await import('../models/teacher.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const studentController = await import('../controllers/student.controller');
  const teacherController = await import('../controllers/teacher.controller');
  const classController = await import('../controllers/class.controller');

  const id = () => new mongoose.Types.ObjectId();
  const schoolA = id();
  const schoolB = id();
  await School.collection.insertMany([
    { _id: schoolA, name: 'School A', institutionType: 'school' },
    { _id: schoolB, name: 'School B', institutionType: 'school' },
  ]);

  const orgAdmin = (school: mongoose.Types.ObjectId) => ({
    userId: String(id()), role: 'org_admin', organizationId: String(school),
  });

  // ---------------------------------------------------------------------
  // Students: 15 ordinary students (newest-first default sort puts them
  // ahead of the one we search for) + the one we're searching for, named
  // distinctively and created first (so default sort pushes it onto page 2).
  // ---------------------------------------------------------------------
  console.log('\n=== GET /students search ===');
  {
    const makeStudent = async (school: mongoose.Types.ObjectId, firstName: string, lastName: string, studentId: string, createdAt: Date) => {
      const userDoc = id(); const profileDoc = id();
      await User.collection.insertOne({ _id: userDoc, email: `${studentId.toLowerCase()}@test.local`, phone: '', role: 'student', isActive: true, isVerified: true });
      await Profile.collection.insertOne({ _id: profileDoc, user: userDoc, firstName, lastName, gender: 'male' });
      await Student.collection.insertOne({
        _id: id(), user: userDoc, profile: profileDoc, studentId, school, status: 'active', approvalStatus: 'approved',
        enrollmentDate: new Date(), enrolledCourses: [], enrollmentHistory: [], createdAt,
      });
    };

    const base = Date.UTC(2026, 0, 1);
    await makeStudent(schoolA, 'Zahra', 'Distinctive-Needle', 'A-NEEDLE', new Date(base)); // oldest -> last under createdAt desc
    for (let i = 0; i < 15; i += 1) {
      await makeStudent(schoolA, `Filler${i}`, 'Student', `A-FILL-${i}`, new Date(base + (i + 1) * 60_000));
    }
    // Same distinctive name in the OTHER school — must never leak across.
    await makeStudent(schoolB, 'Zahra', 'Distinctive-Needle', 'B-NEEDLE', new Date(base + 999 * 60_000));

    const page1 = await call(studentController.getAll as any, { user: orgAdmin(schoolA), query: { search: 'Distinctive-Needle', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the match even though it sorts onto a later page (got ${page1?.data?.length} rows)`);
    assert(page1?.meta?.total === 1, `total reflects the real match count, not the page size (got ${page1?.meta?.total})`);
    assert(page1?.data?.[0]?.studentId === 'A-NEEDLE', 'the matched row is School A\'s own student, not School B\'s');

    const digits = await call(studentController.getAll as any, { user: orgAdmin(schoolA), query: { search: '555123', page: '1', limit: '5' } });
    assert((digits?.data || []).length === 0, 'an unrelated digit search matches nothing (sanity check, not a crash)');
  }

  // ---------------------------------------------------------------------
  // Teachers: same shape — a distinctively-named teacher pushed past page 1.
  // ---------------------------------------------------------------------
  console.log('\n=== GET /teachers search ===');
  {
    const makeTeacher = async (school: mongoose.Types.ObjectId, firstName: string, lastName: string, teacherId: string, createdAt: Date) => {
      const userDoc = id(); const profileDoc = id();
      await User.collection.insertOne({ _id: userDoc, email: `${teacherId.toLowerCase()}@test.local`, phone: '', role: 'teacher', isActive: true, isVerified: true });
      await Profile.collection.insertOne({ _id: profileDoc, user: userDoc, firstName, lastName, gender: 'female' });
      await Teacher.collection.insertOne({ _id: id(), user: userDoc, profile: profileDoc, school, teacherId, status: 'active', courses: [], createdAt });
    };

    const base = Date.UTC(2026, 0, 1);
    await makeTeacher(schoolA, 'Hodan', 'Needle-Teacher', 'A-TNEEDLE', new Date(base));
    for (let i = 0; i < 12; i += 1) {
      await makeTeacher(schoolA, `TFiller${i}`, 'Teacher', `A-TFILL-${i}`, new Date(base + (i + 1) * 60_000));
    }

    const page1 = await call(teacherController.getAll as any, { user: orgAdmin(schoolA), query: { search: 'Needle-Teacher', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the teacher even though it sorts onto a later page (got ${page1?.data?.length} rows)`);
    const total = page1?.meta?.total;
    assert(total === 1, `total reflects the real match count, not the page size (got ${total})`);
  }

  // ---------------------------------------------------------------------
  // Classes: distinctive room name pushed past page 1.
  // ---------------------------------------------------------------------
  console.log('\n=== GET /classes search ===');
  {
    const base = Date.UTC(2026, 0, 1);
    await ClassModel.collection.insertOne({
      _id: id(), school: schoolA, title: 'Grade 5', section: 'A', room: 'Needle-Room', shiftMode: 'Morning', status: 'active', createdAt: new Date(base),
    });
    const fillers = Array.from({ length: 12 }, (_, i) => ({
      _id: id(), school: schoolA, title: `Grade ${i}`, section: 'A', room: `Room-${i}`, shiftMode: 'Morning', status: 'active',
      createdAt: new Date(base + (i + 1) * 60_000),
    }));
    await ClassModel.collection.insertMany(fillers);

    const page1 = await call(classController.getAll as any, { user: orgAdmin(schoolA), query: { search: 'Needle-Room', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the class even though it sorts onto a later page (got ${page1?.data?.length} rows)`);
    const total = page1?.meta?.total;
    assert(total === 1, `total reflects the real match count, not the page size (got ${total})`);
    assert(page1?.data?.[0]?.room === 'Needle-Room', 'the matched row is the right class');
  }

  await mongoose.disconnect();
  await mongod.stop();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL LIST SEARCH/PAGINATION CHECKS PASSED (0 failures)');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
