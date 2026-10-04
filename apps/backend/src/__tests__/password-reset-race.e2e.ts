/**
 * Regression: concurrent completions of the same password-reset token.
 *
 * resetPassword() used to be a plain findOne() (check the token/expiry)
 * followed later by a save() that cleared the token. That leaves a window
 * between the read and the write: two requests presenting the SAME valid
 * token (the user double-clicking the emailed link in two tabs, or an
 * attacker racing a victim who is completing the same reset) could both
 * pass the findOne() check before either saved, so whichever save() landed
 * second would silently win and the other requester would see a false
 * "success" for a password that is no longer the account's actual password
 * — and the token would never get a chance to look "already used" to the
 * loser, since both read it as valid.
 *
 * The fix makes token consumption atomic via findOneAndUpdate (the same
 * check-and-remove pattern already used for refresh-token rotation in
 * auth.controller.ts): the filter requires the token/expiry to still match,
 * and the $unset clears them in the SAME atomic operation, so at most one
 * of two concurrent requests for the same token can ever match.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import crypto from 'crypto';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('password-reset-race');
  try {
    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');

    // -----------------------------------------------------------------
    section('Concurrent reset-password completions for the same token');
    // -----------------------------------------------------------------
    {
      const user = await User.create({
        email: 'reset-race@example.com',
        password: 'OriginalPass123!',
        role: 'admin',
      });

      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordResetToken: hashedToken,
            passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
          },
        }
      );

      // Two requests racing on the exact same reset token, setting two
      // DIFFERENT new passwords — exactly one must win.
      const [a, b] = await Promise.all([
        request(app).post(`/api/v1/auth/reset-password/${rawToken}`).send({ password: 'FirstNewPass123!', confirmPassword: 'FirstNewPass123!' }),
        request(app).post(`/api/v1/auth/reset-password/${rawToken}`).send({ password: 'SecondNewPass123!', confirmPassword: 'SecondNewPass123!' }),
      ]);
      const statuses = [a.status, b.status].sort();
      assert(
        statuses[0] === 200 && statuses[1] === 400,
        `concurrent resets on the same token: exactly one succeeds, the other is rejected (got ${a.status}, ${b.status})`
      );

      // Whichever one succeeded, its password must be the one now active —
      // not silently overwritten by the loser, and the loser's password
      // must NOT work.
      const winningPassword = a.status === 200 ? 'FirstNewPass123!' : 'SecondNewPass123!';
      const losingPassword = a.status === 200 ? 'SecondNewPass123!' : 'FirstNewPass123!';

      const loginWithWinner = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: winningPassword });
      assert(loginWithWinner.status === 200, `the winning request's new password actually works (got ${loginWithWinner.status})`);

      const loginWithLoser = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: losingPassword });
      assert(loginWithLoser.status === 401, `the losing request's password was never applied (got ${loginWithLoser.status})`);

      // The token is now consumed — a third attempt with the same token
      // must fail, even though it was never raced against.
      const replay = await request(app)
        .post(`/api/v1/auth/reset-password/${rawToken}`)
        .send({ password: 'ThirdPass123!', confirmPassword: 'ThirdPass123!' });
      assert(replay.status === 400, `the already-consumed token cannot be replayed afterward (got ${replay.status})`);
    }

    // -----------------------------------------------------------------
    section('Sequential: expired/invalid token is still rejected');
    // -----------------------------------------------------------------
    {
      const user = await User.create({
        email: 'reset-expired@example.com',
        password: 'OriginalPass123!',
        role: 'admin',
      });
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordResetToken: hashedToken,
            passwordResetExpires: new Date(Date.now() - 1000), // already expired
          },
        }
      );

      const res = await request(app)
        .post(`/api/v1/auth/reset-password/${rawToken}`)
        .send({ password: 'NewPass123!', confirmPassword: 'NewPass123!' });
      assert(res.status === 400, `an expired reset token is rejected (got ${res.status})`);

      const badToken = await request(app)
        .post(`/api/v1/auth/reset-password/not-a-real-token`)
        .send({ password: 'NewPass123!', confirmPassword: 'NewPass123!' });
      assert(badToken.status === 400, `a bogus reset token is rejected (got ${badToken.status})`);
    }
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll password-reset race checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
