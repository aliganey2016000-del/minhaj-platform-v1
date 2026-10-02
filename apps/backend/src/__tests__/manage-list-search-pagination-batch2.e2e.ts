/**
 * GET /parents, /invoices, /payments, /schools, /certificates, content
 * (announcements/news/events/gallery), /exams, /results, /assignments,
 * /system/logs — search correctness.
 *
 * All ten paginated (skip/limit) BEFORE filtering that one page by the
 * search term in memory — a match outside the requested page was invisible,
 * and `total` only ever reported how many of that one page matched. All
 * now match and paginate in a single aggregation, same as
 * students/teachers/classes (see manage-list-search-pagination.e2e.ts and
 * student.controller.ts getAll).
 *
 * Runs against an ephemeral in-memory MongoDB. `npm run test:list-search-2`.
 */

// The controllers type req.user via the global Express augmentation, which
// only the auth middleware declares; reference it without loading it.
/// <reference path="../middleware/auth.middleware.ts" />

// Some of the controllers under test (invoice/payment via billing.service,
// exam, etc.) transitively import utils/jwt.ts, which throws at module load
// if these aren't set — set them before any of those imports run.
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

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
  const { default: Course } = await import('../models/course.model');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const { default: Parent } = await import('../models/parent.model');
  const { default: Invoice } = await import('../models/invoice.model');
  const { default: Payment } = await import('../models/payment.model');
  const { default: Certificate } = await import('../models/certificate.model');
  const { default: Announcement } = await import('../models/announcement.model');
  const { default: Exam } = await import('../models/exam.model');
  const { default: Result } = await import('../models/result.model');
  const { default: Assignment } = await import('../models/assignment.model');
  const { default: ActivityLog } = await import('../models/activity-log.model');

  const parentController = await import('../controllers/parent.controller');
  const invoiceController = await import('../controllers/invoice.controller');
  const paymentController = await import('../controllers/payment.controller');
  const schoolController = await import('../controllers/school.controller');
  const certificateController = await import('../controllers/certificate.controller');
  const contentController = await import('../controllers/content.controller');
  const examController = await import('../controllers/exam.controller');
  const resultController = await import('../controllers/result.controller');
  const assignmentController = await import('../controllers/assignment.controller');
  const systemController = await import('../controllers/system.controller');

  const id = () => new mongoose.Types.ObjectId();
  const schoolA = id();
  await School.collection.insertMany([
    { _id: schoolA, name: 'School A', institutionType: 'school', email: 'a@school.test', principalName: 'Principal A', address: '1 Main St' },
    { _id: id(), name: 'Unrelated Filler School', institutionType: 'school' },
  ]);
  const admin = { userId: String(id()), role: 'admin' };
  const orgAdmin = { userId: String(id()), role: 'org_admin', organizationId: String(schoolA) };

  const makeUserProfile = async (firstName: string, lastName: string, email: string) => {
    const userDoc = id(); const profileDoc = id();
    await User.collection.insertOne({ _id: userDoc, email, phone: '', role: 'student', isActive: true, isVerified: true });
    await Profile.collection.insertOne({ _id: profileDoc, user: userDoc, firstName, lastName, gender: 'male' });
    return { userDoc, profileDoc };
  };

  const base = Date.UTC(2026, 0, 1);
  const filler = (i: number) => new Date(base + (i + 1) * 60_000);

  // A student + course that the finance/exam records below reference.
  const { profileDoc: studentProfile, userDoc: studentUser } = await makeUserProfile('Zahra', 'Distinctive-Needle', 'needle-student@test.local');
  const theStudent = id();
  await Student.collection.insertOne({
    _id: theStudent, user: studentUser, profile: studentProfile, studentId: 'A-NEEDLE', school: schoolA,
    status: 'active', approvalStatus: 'approved', enrollmentDate: new Date(), enrolledCourses: [], enrollmentHistory: [],
  });
  const fillerStudents: mongoose.Types.ObjectId[] = [];
  for (let i = 0; i < 12; i += 1) {
    const { profileDoc, userDoc } = await makeUserProfile(`Filler${i}`, 'Student', `filler-student-${i}@test.local`);
    const sid = id();
    await Student.collection.insertOne({
      _id: sid, user: userDoc, profile: profileDoc, studentId: `A-FILL-${i}`, school: schoolA,
      status: 'active', approvalStatus: 'approved', enrollmentDate: new Date(), enrolledCourses: [], enrollmentHistory: [],
    });
    fillerStudents.push(sid);
  }
  const theCourse = id();
  await Course.collection.insertOne({ _id: theCourse, title: { en: 'Needle Course' }, slug: 'needle-course', category: 'general', duration: 4, maxStudents: 30, school: schoolA, status: 'published' });

  // -----------------------------------------------------------------------
  console.log('\n=== GET /parents search ===');
  {
    const { profileDoc, userDoc } = await makeUserProfile('Amina', 'Needle-Parent', 'needle-parent@test.local');
    await Parent.collection.insertOne({ _id: id(), user: userDoc, profile: profileDoc, parentId: 'A-PNEEDLE', school: schoolA, children: [], createdAt: new Date(base) });
    for (let i = 0; i < 12; i += 1) {
      const p = await makeUserProfile(`PFiller${i}`, 'Parent', `pfiller-${i}@test.local`);
      await Parent.collection.insertOne({ _id: id(), user: p.userDoc, profile: p.profileDoc, parentId: `A-PFILL-${i}`, school: schoolA, children: [], createdAt: filler(i) });
    }
    const page1 = await call(parentController.getAll as any, { user: orgAdmin, query: { search: 'Needle-Parent', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the parent even though it sorts onto a later page (got ${page1?.data?.length})`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);
  }

  // -----------------------------------------------------------------------
  console.log('\n=== GET /invoices search ===');
  {
    await Invoice.collection.insertOne({ _id: id(), student: theStudent, school: schoolA, title: 'Needle-Invoice', period: '2026-01', amount: 100, balance: 100, status: 'pending', dueDate: new Date(), installments: [], createdAt: new Date(base) });
    for (let i = 0; i < 12; i += 1) {
      await Invoice.collection.insertOne({ _id: id(), student: fillerStudents[i], school: schoolA, title: `Invoice ${i}`, period: '2026-01', amount: 50, balance: 50, status: 'pending', dueDate: new Date(), installments: [], createdAt: filler(i) });
    }
    const page1 = await call(invoiceController.getAll as any, { user: orgAdmin, query: { search: 'Needle-Invoice', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the invoice even though it sorts onto a later page (got ${page1?.data?.length})`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);

    const byStudentName = await call(invoiceController.getAll as any, { user: orgAdmin, query: { search: 'Distinctive-Needle', page: '1', limit: '5' } });
    assert(byStudentName?.data?.length === 1, `also finds it by the student's name (got ${byStudentName?.data?.length})`);
  }

  // -----------------------------------------------------------------------
  console.log('\n=== GET /payments search ===');
  {
    const recordedBy = id();
    await Payment.collection.insertOne({ _id: id(), student: theStudent, school: schoolA, amount: 100, type: 'tuition', method: 'cash', status: 'completed', notes: 'Needle-Payment note', recordedBy, createdAt: new Date(base) });
    for (let i = 0; i < 12; i += 1) {
      await Payment.collection.insertOne({ _id: id(), student: fillerStudents[i], school: schoolA, amount: 50, type: 'tuition', method: 'cash', status: 'completed', notes: '', recordedBy, createdAt: filler(i) });
    }
    const page1 = await call(paymentController.getAll as any, { user: orgAdmin, query: { search: 'Needle-Payment', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the payment even though it sorts onto a later page (got ${page1?.data?.length})`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);
  }

  // -----------------------------------------------------------------------
  console.log('\n=== GET /schools search ===');
  {
    for (let i = 0; i < 12; i += 1) {
      await School.collection.insertOne({ _id: id(), name: `Filler School ${i}`, institutionType: 'school', createdAt: filler(i) });
    }
    await School.collection.updateOne({ _id: schoolA }, { $set: { createdAt: new Date(base) } });
    const page1 = await call(schoolController.getAll as any, { user: admin, query: { search: 'School A', page: '1', limit: '5' } });
    assert((page1?.data || []).some((s: any) => String(s._id) === String(schoolA)), `finds School A even though it sorts onto a later page (got ${page1?.data?.length} rows)`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);
  }

  // -----------------------------------------------------------------------
  console.log('\n=== GET /certificates search ===');
  {
    const issuedBy = id();
    await Certificate.collection.insertOne({ _id: id(), title: 'Needle-Certificate', student: theStudent, course: theCourse, issueDate: new Date(), certificateNumber: 'CERT-NEEDLE', status: 'issued', issuedBy, createdAt: new Date(base) });
    for (let i = 0; i < 12; i += 1) {
      await Certificate.collection.insertOne({ _id: id(), title: `Certificate ${i}`, student: fillerStudents[i], course: theCourse, issueDate: new Date(), certificateNumber: `CERT-${i}`, status: 'issued', issuedBy, createdAt: filler(i) });
    }
    const page1 = await call(certificateController.getAll as any, { user: admin, query: { search: 'Needle-Certificate', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the certificate even though it sorts onto a later page (got ${page1?.data?.length})`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);
  }

  // -----------------------------------------------------------------------
  console.log('\n=== GET /content (announcements) search ===');
  {
    const createdBy = id();
    await Announcement.collection.insertOne({ _id: id(), title: 'Needle-Announcement', content: 'body', status: 'published', createdBy, createdAt: new Date(base) });
    for (let i = 0; i < 12; i += 1) {
      await Announcement.collection.insertOne({ _id: id(), title: `Announcement ${i}`, content: 'body', status: 'published', createdBy, createdAt: filler(i) });
    }
    const page1 = await call(contentController.getAll('Announcement') as any, { user: admin, query: { search: 'Needle-Announcement', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the announcement even though it sorts onto a later page (got ${page1?.data?.length})`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);

    // Gallery is attributed via `uploadedBy`, not `createdBy` (the other
    // three models) — getAll used to populate both unconditionally, which
    // threw StrictPopulateError on every single call for whichever model
    // doesn't have that path (i.e. every model, every call).
    const { default: Gallery } = await import('../models/gallery.model');
    await Gallery.collection.insertOne({ _id: id(), title: 'A Photo', imageUrl: 'https://example.test/a.jpg', uploadedBy: createdBy, status: 'published', createdAt: new Date(base) });
    const galleryPage = await call(contentController.getAll('Gallery') as any, { user: admin, query: { page: '1', limit: '5' } });
    assert(galleryPage?.data?.length === 1, `Gallery list does not throw on its own uploadedBy field (got ${galleryPage?.data?.length} rows)`);
  }

  // -----------------------------------------------------------------------
  console.log('\n=== GET /exams search ===');
  {
    const createdBy = id();
    await Exam.collection.insertOne({ _id: id(), title: 'Needle-Exam', course: theCourse, school: schoolA, examDate: new Date(base), startTime: '08:00', duration: 60, totalMarks: 100, passingMarks: 50, status: 'scheduled', createdBy });
    for (let i = 0; i < 12; i += 1) {
      await Exam.collection.insertOne({ _id: id(), title: `Exam ${i}`, course: theCourse, school: schoolA, examDate: new Date(base + (i + 2) * 86_400_000), startTime: '08:00', duration: 60, totalMarks: 100, passingMarks: 50, status: 'scheduled', createdBy });
    }
    const page1 = await call(examController.getAll as any, { user: orgAdmin, query: { search: 'Needle-Exam', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the exam even though it sorts onto a later page (got ${page1?.data?.length})`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);
  }

  // -----------------------------------------------------------------------
  console.log('\n=== GET /results search ===');
  {
    const enteredBy = id();
    const theExam = id();
    await Exam.collection.insertOne({ _id: theExam, title: 'Results Exam', course: theCourse, school: schoolA, examDate: new Date(), startTime: '08:00', duration: 60, totalMarks: 100, passingMarks: 50, status: 'completed', createdBy: enteredBy });
    await Result.collection.insertOne({ _id: id(), exam: theExam, student: theStudent, marksObtained: 90, totalMarks: 100, status: 'passed', enteredBy, createdAt: new Date(base) });
    for (let i = 0; i < 12; i += 1) {
      await Result.collection.insertOne({ _id: id(), exam: theExam, student: fillerStudents[i], marksObtained: 80, totalMarks: 100, status: 'passed', enteredBy, createdAt: filler(i) });
    }
    const page1 = await call(resultController.getAll as any, { user: admin, query: { search: 'Distinctive-Needle', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the result by student name even though it sorts onto a later page (got ${page1?.data?.length})`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);
  }

  // -----------------------------------------------------------------------
  console.log('\n=== GET /assignments search ===');
  {
    const createdBy = id();
    await Assignment.collection.insertOne({ _id: id(), title: 'Needle-Assignment', description: '', course: theCourse, dueDate: new Date(base + 365 * 86_400_000), totalMarks: 100, createdBy, createdAt: new Date(base) });
    for (let i = 0; i < 12; i += 1) {
      await Assignment.collection.insertOne({ _id: id(), title: `Assignment ${i}`, description: '', course: theCourse, dueDate: new Date(base + (365 + i + 1) * 86_400_000), totalMarks: 100, createdBy, createdAt: filler(i) });
    }
    const page1 = await call(assignmentController.getAll as any, { user: admin, query: { search: 'Needle-Assignment', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the assignment even though it sorts onto a later page (got ${page1?.data?.length})`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);
  }

  // -----------------------------------------------------------------------
  console.log('\n=== GET /system/logs search ===');
  {
    await ActivityLog.collection.insertOne({ _id: id(), action: 'update', resource: 'Needle-Resource', details: '', createdAt: new Date(base) });
    for (let i = 0; i < 12; i += 1) {
      await ActivityLog.collection.insertOne({ _id: id(), action: 'update', resource: `Resource ${i}`, details: '', createdAt: filler(i) });
    }
    const page1 = await call(systemController.getLogs as any, { query: { search: 'Needle-Resource', page: '1', limit: '5' } });
    assert(page1?.data?.length === 1, `finds the log entry even though it sorts onto a later page (got ${page1?.data?.length})`);
    assert(page1?.meta?.total === 1, `total reflects the real match count (got ${page1?.meta?.total})`);
  }

  await mongoose.disconnect();
  await mongod.stop();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL LIST SEARCH/PAGINATION (BATCH 2) CHECKS PASSED (0 failures)');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
