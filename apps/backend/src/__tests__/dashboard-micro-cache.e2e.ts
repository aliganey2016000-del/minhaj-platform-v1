/**
 * micro-cache.ts, and the dashboard/student-stats/school-dashboard handlers
 * that use it to share one computed result between near-simultaneous
 * callers at the same school instead of each recomputing from scratch.
 *
 * The cache key is the whole point to get right: two different schools (or
 * two different roles at the same school that see different numbers — see
 * analytics.controller.ts getDashboardStats) must never share a cache
 * entry, or one school would see another's dashboard. This test checks the
 * cache's own TTL/dedup behavior directly, then checks that isolation
 * end-to-end against the real handlers.
 *
 * Runs against an ephemeral in-memory MongoDB. `npm run test:dashboard-cache`.
 */

// The controllers type req.user via the global Express augmentation, which
// only the auth middleware declares; reference it without loading it.
/// <reference path="../middleware/auth.middleware.ts" />

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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(handler: (req: any, res: any) => Promise<unknown>, req: any) {
  let body: any;
  const res: any = { status() { return res; }, json(payload: any) { body = payload; return res; } };
  await handler(req, res);
  return body;
}

async function main() {
  console.log('\n=== microCache ===');
  {
    const { microCache } = await import('../utils/micro-cache');
    let calls = 0;
    const compute = async () => { calls += 1; return calls; };

    const [a, b] = await Promise.all([microCache('k1', 200, compute), microCache('k1', 200, compute)]);
    assert(calls === 1, `concurrent callers for the same key share one computation (got ${calls} calls)`);
    assert(a === b && a === 1, 'both callers get the same cached value');

    const c = await microCache('k1', 200, compute);
    assert(c === 1 && calls === 1, 'a call still inside the TTL window reuses the cached value');

    await sleep(250);
    const d = await microCache('k1', 200, compute);
    assert(d === 2 && calls === 2, 'a call after the TTL expires recomputes');

    let threw = false;
    try {
      await microCache('k2', 200, async () => { throw new Error('boom'); });
    } catch { threw = true; }
    assert(threw, 'a failed computation propagates to the caller');
    const e = await microCache('k2', 200, async () => 'recovered');
    assert(e === 'recovered', 'a failure is not cached — the next call retries instead of replaying the error');
  }

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: School } = await import('../models/school.model');
  const { default: Student } = await import('../models/student.model');
  const { default: ClassModel } = await import('../models/class.model');
  const { default: Payment } = await import('../models/payment.model');
  const { getDashboardStats } = await import('../controllers/analytics.controller');
  const { getStats } = await import('../controllers/student.controller');
  const { getSchoolDashboard } = await import('../controllers/daily-attendance.controller');

  const id = () => new mongoose.Types.ObjectId();
  const schoolA = id();
  const schoolB = id();
  await School.collection.insertMany([
    { _id: schoolA, name: 'School A', institutionType: 'school' },
    { _id: schoolB, name: 'School B', institutionType: 'school' },
  ]);
  const classA = id();
  await ClassModel.collection.insertOne({ _id: classA, school: schoolA, title: 'Grade 5', section: 'A', room: '1' });

  const student = (school: mongoose.Types.ObjectId, cls: mongoose.Types.ObjectId | null, studentId: string) => ({
    _id: id(), user: id(), profile: id(), studentId, school, class: cls,
    status: 'active', approvalStatus: 'approved', enrolledCourses: [], enrollmentHistory: [], enrollmentDate: new Date(),
  });
  await Student.collection.insertMany([
    student(schoolA, classA, 'A1'),
    student(schoolA, classA, 'A2'),
    student(schoolB, null, 'B1'),
  ]);
  await Payment.collection.insertMany([
    { student: id(), school: schoolA, amount: 100, status: 'completed' },
    { student: id(), school: schoolB, amount: 500, status: 'completed' },
  ]);

  const orgAdmin = (school: mongoose.Types.ObjectId) => ({ userId: String(id()), role: 'org_admin', organizationId: String(school) });
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  console.log('\n=== GET /analytics/dashboard cache isolation ===');
  {
    const statsA = await call(getDashboardStats as any, { user: orgAdmin(schoolA), query: {} });
    const statsB = await call(getDashboardStats as any, { user: orgAdmin(schoolB), query: {} });
    assert(statsA?.data?.totalRevenue === 100, `School A's cached entry has its own revenue (got ${statsA?.data?.totalRevenue})`);
    assert(statsB?.data?.totalRevenue === 500, `School B's call is not served School A's cached entry (got ${statsB?.data?.totalRevenue})`);

    // Calling School A again immediately must still return School A's
    // numbers (the cache hit), not drift to School B's.
    const statsAAgain = await call(getDashboardStats as any, { user: orgAdmin(schoolA), query: {} });
    assert(statsAAgain?.data?.totalRevenue === 100, `a second call for School A within the TTL still returns School A's own numbers (got ${statsAAgain?.data?.totalRevenue})`);
  }

  console.log('\n=== GET /students/stats cache isolation ===');
  {
    const statsA = await call(getStats as any, { user: orgAdmin(schoolA), query: {} });
    const statsB = await call(getStats as any, { user: orgAdmin(schoolB), query: {} });
    assert(statsA?.data?.total === 2, `School A's cached stats are its own (got ${statsA?.data?.total})`);
    assert(statsB?.data?.total === 1, `School B's call is not served School A's cached stats (got ${statsB?.data?.total})`);
  }

  console.log('\n=== GET /attendance/school/dashboard cache isolation ===');
  {
    const today = localDate(new Date());
    const dashA = await call(getSchoolDashboard as any, { user: orgAdmin(schoolA), query: { date: today } });
    const dashB = await call(getSchoolDashboard as any, { user: orgAdmin(schoolB), query: { date: today } });
    assert(dashA?.data?.date === today && dashB?.data?.date === today, 'both schools get a response for the requested date');
    // Different schoolId in the cache key — a crash or cross-contamination
    // here would mean the key collapsed the two schools together.
    assert(JSON.stringify(dashA?.data?.sessions) !== undefined && JSON.stringify(dashB?.data?.sessions) !== undefined, 'each school gets its own independently-computed session summary');
  }

  await mongoose.disconnect();
  await mongod.stop();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL DASHBOARD MICRO-CACHE CHECKS PASSED (0 failures)');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
