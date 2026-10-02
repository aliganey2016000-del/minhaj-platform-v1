/**
 * Admin dashboard aggregations stay scoped to one school.
 *
 * These pipelines used to start from every school's rows and $lookup each one
 * into students before filtering to the caller's school (all attendance in the
 * early-warning window, all completed payments for revenue, a class/school
 * join per student for stats). They now start from the school's own students.
 * This seeds two schools and checks every number only counts the caller's.
 *
 * Runs against an ephemeral in-memory MongoDB. `npm run test:dashboard-aggregations`.
 */

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
  return body?.data;
}

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: Student } = await import('../models/student.model');
  const { default: School } = await import('../models/school.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Attendance } = await import('../models/attendance.model');
  const { default: Payment } = await import('../models/payment.model');
  const { default: Refund } = await import('../models/refund.model');
  const { getSchoolDashboard } = await import('../controllers/daily-attendance.controller');
  const { getDashboardStats } = await import('../controllers/analytics.controller');
  const { getStats } = await import('../controllers/student.controller');

  const id = () => new mongoose.Types.ObjectId();
  const schoolA = id();
  const schoolB = id();
  await School.collection.insertMany([
    { _id: schoolA, name: 'School A', institutionType: 'school' },
    { _id: schoolB, name: 'School B', institutionType: 'school' },
  ]);
  const classA = id();
  const classB = id();
  await ClassModel.collection.insertMany([
    { _id: classA, school: schoolA, title: 'Grade 5', section: 'A', room: '1' },
    { _id: classB, school: schoolB, title: 'Grade 6', section: 'B', room: '2' },
  ]);

  const student = (school: mongoose.Types.ObjectId, cls: mongoose.Types.ObjectId, studentId: string) => ({
    _id: id(), user: id(), profile: id(), studentId, school, class: cls,
    status: 'active', approvalStatus: 'approved', enrolledCourses: [], enrollmentHistory: [], enrollmentDate: new Date(),
  });
  const a1 = student(schoolA, classA, 'A1');
  const a2 = student(schoolA, classA, 'A2');
  const b1 = student(schoolB, classB, 'B1');
  await Student.collection.insertMany([a1, a2, b1]);

  // Five recent school days: A1 always absent, A2 always present, and B1
  // always absent in the other school.
  const course = id();
  const rows: any[] = [];
  for (let back = 1; back <= 5; back += 1) {
    const date = new Date();
    date.setDate(date.getDate() - back);
    date.setHours(0, 0, 0, 0);
    rows.push({ course, student: a1._id, date, status: 'absent', markedBy: id() });
    rows.push({ course, student: a2._id, date, status: 'present', markedBy: id() });
    rows.push({ course, student: b1._id, date, status: 'absent', markedBy: id() });
  }
  await Attendance.collection.insertMany(rows);

  await Payment.collection.insertMany([
    { student: a1._id, school: schoolA, amount: 100, discount: 10, status: 'completed' },
    { student: a2._id, school: null, amount: 50, status: 'completed' },
    { student: a2._id, school: null, amount: 999, status: 'pending' },
    { student: b1._id, school: schoolB, amount: 700, status: 'completed' },
    { student: b1._id, school: null, amount: 300, status: 'completed' },
  ]);
  await Refund.collection.insertMany([
    { student: a2._id, school: null, amount: 20, status: 'completed' },
    { student: b1._id, school: schoolB, amount: 400, status: 'completed' },
  ]);

  const orgAdmin = (school: mongoose.Types.ObjectId) => ({ userId: String(id()), role: 'org_admin', organizationId: String(school) });

  console.log('\n=== attendance early warning ===');
  const dashboard = await call(getSchoolDashboard as any, {
    user: orgAdmin(schoolA),
    query: { date: localDate(new Date()), days: 30, threshold: 90 },
    body: {},
  });
  const atRisk = dashboard?.earlyWarning?.students || [];
  assert(atRisk.length === 1 && atRisk[0].studentId === 'A1', `only School A's absent student is flagged (got ${atRisk.map((s: any) => s.studentId).join(',')})`);
  assert(atRisk[0]?.total === 5 && atRisk[0]?.absent === 5 && atRisk[0]?.rate === 0, 'their window totals are counted correctly');

  console.log('\n=== dashboard revenue ===');
  const statsA = await call(getDashboardStats as any, { user: orgAdmin(schoolA), query: {} });
  assert(statsA?.totalRevenue === 120, `School A revenue = 90 + legacy 50 - legacy refund 20 (got ${statsA?.totalRevenue})`);
  const statsB = await call(getDashboardStats as any, { user: orgAdmin(schoolB), query: {} });
  assert(statsB?.totalRevenue === 600, `School B revenue = 700 + legacy 300 - refund 400 (got ${statsB?.totalRevenue})`);

  console.log('\n=== student stats ===');
  const studentStats = await call(getStats as any, { user: orgAdmin(schoolA), query: {} });
  assert(studentStats?.total === 2, 'School A has 2 students');
  assert(studentStats?.byClass?.length === 1 && studentStats.byClass[0].label === 'Grade 5 A' && studentStats.byClass[0].count === 2, 'class breakdown is grouped and labelled');
  assert(studentStats?.byOrganization?.length === 1 && studentStats.byOrganization[0].name === 'School A' && studentStats.byOrganization[0].count === 2, 'organization breakdown is grouped and labelled');

  await mongoose.disconnect();
  await mongod.stop();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL DASHBOARD AGGREGATION CHECKS PASSED (0 failures)');
  process.exit(failures ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
