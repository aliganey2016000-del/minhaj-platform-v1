/**
 * GET /users — search correctness.
 *
 * getAll() had an `if (search) filter.$or = [{ email: regex }]` applied to
 * the SAME `filter` object used for the "fetch every candidate" DB query,
 * before an in-memory pass that was supposed to additionally match by full
 * name. That DB-level `$or` silently excluded any user whose email didn't
 * contain the search term — including ones whose NAME matched it — so
 * searching the Users page (whose placeholder literally reads "Search by
 * name or email...") by name alone always returned zero rows. Fixed by
 * dropping that premature `$or` and letting the DB query hand back every
 * role/status/org-scoped candidate, same as the in-memory filter already
 * expects.
 *
 * Uses the shared `test-db` helper (FerretDB via TEST_MONGODB_URI locally,
 * MongoMemoryServer in CI). `npm run test:user-search`.
 */

// The controllers type req.user via the global Express augmentation, which
// only the auth middleware declares; reference it without loading it.
/// <reference path="../middleware/auth.middleware.ts" />

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import mongoose from 'mongoose';
import { startTestDb } from './support/test-db';

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
  const db = await startTestDb('user-search-by-name');

  const { default: School } = await import('../models/school.model');
  const { default: User } = await import('../models/user.model');
  const { default: Profile } = await import('../models/profile.model');
  const userController = await import('../controllers/user.controller');

  const id = () => new mongoose.Types.ObjectId();
  const schoolA = id();
  await School.collection.insertOne({ _id: schoolA, name: 'School A', institutionType: 'school' });

  const admin = { userId: String(id()), role: 'admin' };

  // The user we're searching for: a distinctive NAME but an email that does
  // NOT contain the search term at all. A dozen unrelated filler users sit
  // ahead of/around it so the bug (and any pagination regression) would show.
  const target = id();
  await User.collection.insertOne({
    _id: target, email: 'unrelated-address@test.local', role: 'teacher',
    isActive: true, isVerified: true, createdAt: new Date(2026, 0, 1),
  });
  await Profile.collection.insertOne({ user: target, firstName: 'Zahra', lastName: 'Distinctive-Needle', gender: 'female' });

  for (let i = 0; i < 12; i += 1) {
    const u = id();
    await User.collection.insertOne({
      _id: u, email: `filler-${i}@test.local`, role: 'teacher',
      isActive: true, isVerified: true, createdAt: new Date(2026, 0, i + 2),
    });
    await Profile.collection.insertOne({ user: u, firstName: `Filler${i}`, lastName: 'User', gender: 'male' });
  }

  console.log('\n=== GET /users search by name ===');
  {
    const byName = await call(userController.getAll as any, { user: admin, query: { search: 'Distinctive-Needle', page: '1', limit: '5' } });
    assert(byName?.data?.length === 1, `finds the user by full name alone (got ${byName?.data?.length} rows)`);
    assert(byName?.meta?.total === 1, `total reflects the real match count (got ${byName?.meta?.total})`);
  }

  console.log('\n=== GET /users search by email still works ===');
  {
    const byEmail = await call(userController.getAll as any, { user: admin, query: { search: 'unrelated-address', page: '1', limit: '5' } });
    assert(byEmail?.data?.length === 1, `still finds the user by email (got ${byEmail?.data?.length} rows)`);
  }

  console.log('\n=== GET /users search AND role filter ===');
  {
    const wrongRole = await call(userController.getAll as any, { user: admin, query: { search: 'Distinctive-Needle', role: 'student', page: '1', limit: '5' } });
    assert((wrongRole?.data?.length || 0) === 0, `a name match outside the role filter is excluded (got ${wrongRole?.data?.length} rows)`);

    const rightRole = await call(userController.getAll as any, { user: admin, query: { search: 'Distinctive-Needle', role: 'teacher', page: '1', limit: '5' } });
    assert(rightRole?.data?.length === 1, `a name match within the role filter is still found (got ${rightRole?.data?.length} rows)`);
  }

  await db.stop();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL USER SEARCH-BY-NAME CHECKS PASSED (0 failures)');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
