/**
 * Round 12 — JWT organizationId claim staleness after an org reassignment.
 *
 * authMiddleware already force-401s a token within AUTH_STATE_TTL_MS when
 * the account is deactivated, its role changes, or (for staff) its granted
 * permissions change (see utils/auth-state.ts, added in an earlier round).
 * It did NOT re-check the token's `organizationId` claim against the
 * account's current organizationId: every tenant-scoped controller trusts
 * `req.user.organizationId`, which comes straight from the access token,
 * not a fresh DB read. So a platform admin moving a user (e.g. an org_admin
 * or staff member) from School A to School B used to leave that user's
 * already-issued access token acting on School A for up to the full access
 * token lifetime (15 minutes), even though the account no longer belongs
 * there.
 *
 * This test proves:
 *   1. Before the fix: a token minted for School A, after the account is
 *      reassigned to School B, still carries organizationId=A and
 *      authMiddleware accepted it unchanged (tokenMismatch returned null).
 *   2. After the fix: tokenMismatch rejects it (forcing a 401 -> refresh),
 *      and a real request through authMiddleware is rejected too.
 *   3. A user whose organization has NOT changed is unaffected.
 *   4. A role with no organization at all (e.g. platform admin) is
 *      unaffected (undefined === undefined stays a match).
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';

import express from 'express';
import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('auth-org-reassignment');
  try {
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');
    const { generateAccessToken } = await import('../utils/jwt');
    const { tokenMismatch, getAuthState, invalidateAuthState } = await import('../utils/auth-state');
    const { authMiddleware } = await import('../middleware/auth.middleware');

    const admin = await User.create({ email: 'reassign-admin@test.local', password: 'Password123!', role: 'admin' });
    const schoolA = await School.create({
      name: 'School A', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St',
      phone: '+000', email: 'a@test.local', principalName: 'Principal A', establishedYear: 2020, createdBy: admin._id,
    });
    const schoolB = await School.create({
      name: 'School B', organizationType: 'private', country: 'Somalia', city: 'Hargeisa', address: '2 St',
      phone: '+001', email: 'b@test.local', principalName: 'Principal B', establishedYear: 2021, createdBy: admin._id,
    });

    section('1: token minted for School A, account later moved to School B');
    const orgAdmin = await User.create({
      email: 'reassign-orgadmin@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id,
    });
    const tokenForA = generateAccessToken({
      userId: String(orgAdmin._id), role: 'org_admin', permissions: [], organizationId: String(schoolA._id),
    });

    // Sanity: the token is accepted while nothing has changed.
    const freshState = await getAuthState(String(orgAdmin._id));
    assert(tokenMismatch(freshState, { role: 'org_admin', organizationId: String(schoolA._id) }) === null,
      'unreassigned token still matches its account');

    // Platform admin reassigns the account to School B (mirrors
    // controllers/user.controller.ts update(), which also invalidates the
    // cached auth state on an organizationId change).
    // Plain save() rather than findByIdAndUpdate: FerretDB (this sandbox's
    // local Mongo-compatible DB) does not implement findAndModify combined
    // with User's default field-exclusion projection — unrelated to the bug
    // under test.
    orgAdmin.organizationId = schoolB._id as any;
    await orgAdmin.save();
    invalidateAuthState(orgAdmin._id);

    const reassignedState = await getAuthState(String(orgAdmin._id));
    assert(reassignedState.organizationId === String(schoolB._id), 'auth state reflects the new organization');
    const mismatch = tokenMismatch(reassignedState, { role: 'org_admin', organizationId: String(schoolA._id) });
    assert(mismatch !== null, 'a token still claiming the OLD organization is rejected after reassignment');

    section('2: authMiddleware actually 401s the stale-organization token');
    const app = express();
    app.get('/whoami', authMiddleware, (req, res) => res.json({ organizationId: req.user?.organizationId }));
    const staleResponse = await request(app).get('/whoami').set('Authorization', `Bearer ${tokenForA}`);
    assert(staleResponse.status === 401, 'request with the pre-reassignment token is rejected (expected 401, got ' + staleResponse.status + ')');

    const freshToken = generateAccessToken({
      userId: String(orgAdmin._id), role: 'org_admin', permissions: [], organizationId: String(schoolB._id),
    });
    const freshResponse = await request(app).get('/whoami').set('Authorization', `Bearer ${freshToken}`);
    assert(freshResponse.status === 200 && freshResponse.body.organizationId === String(schoolB._id),
      'a freshly minted token for the NEW organization is accepted');

    section('3: a user whose organization never changed is unaffected');
    const stableState = await getAuthState(String(admin._id));
    assert(tokenMismatch(stableState, { role: 'admin', organizationId: undefined }) === null,
      'a platform admin token (no organization on either side) still matches');

    const stableOrgUser = await User.create({
      email: 'reassign-stable@test.local', password: 'Password123!', role: 'org_admin', organizationId: schoolA._id,
    });
    const stableState2 = await getAuthState(String(stableOrgUser._id));
    assert(tokenMismatch(stableState2, { role: 'org_admin', organizationId: String(schoolA._id) }) === null,
      'an org_admin token for the SAME organization still matches');

    console.log(failures === 0
      ? '\nPASS: an organizationId reassignment revokes the stale access token instead of lasting until it expires'
      : '\nFAIL: see above');
  } finally {
    await db.stop();
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
