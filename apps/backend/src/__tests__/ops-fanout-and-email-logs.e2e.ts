/**
 * Operational hardening regressions (ported from the second production-readiness audit).
 *
 * F1  Bulk fan-out (notifications, balance recalculation) must be bounded:
 *     `Promise.all` over thousands of items opened thousands of simultaneous
 *     database operations. `mapLimit` keeps at most N in flight.
 * M1  With SMTP unconfigured, production must not write a password-reset or
 *     verification link to the logs (the link is a credential); development
 *     still prints it so the flow can be tested locally.
 *
 * No database is needed.
 */

process.env.JWT_ACCESS_SECRET = 'ops-test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'ops-test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASSWORD;

import assert from 'node:assert/strict';

async function captureConsole(run: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const originals = { log: console.log, error: console.error, warn: console.warn };
  const sink = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  console.log = sink; console.error = sink; console.warn = sink;
  try { await run(); } finally { Object.assign(console, originals); }
  return lines.join('\n');
}

async function main() {
  // ---------------------------------------------------------------- F1
  const { mapLimit } = await import('../utils/map-limit');
  let inFlight = 0;
  let peak = 0;
  const mapped = await mapLimit(Array.from({ length: 100 }, (_, i) => i), 7, async (n) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight -= 1;
    return n * 2;
  });
  assert.ok(peak <= 7 && peak > 1, `never more than 7 operations in flight (peak ${peak})`);
  assert.equal(mapped.length, 100);
  assert.equal(mapped[0], 0);
  assert.equal(mapped[99], 198, 'results keep their input order');
  assert.deepEqual(await mapLimit([], 5, async (n: number) => n), [], 'an empty list is fine');
  assert.deepEqual(await mapLimit([1, 2, 3], 50, async (n) => n + 1), [2, 3, 4], 'a limit above the list size is fine');
  let rejected = false;
  await mapLimit([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('boom'); return n; }).catch(() => { rejected = true; });
  assert.ok(rejected, 'an error still rejects like Promise.all');

  // ---------------------------------------------------------------- M1
  const { sendPasswordResetEmail, sendVerificationEmail } = await import('../services/email.service');
  const secretToken = 'SECRET-RESET-TOKEN-0123456789';

  process.env.NODE_ENV = 'production';
  const productionLog = await captureConsole(async () => {
    await sendPasswordResetEmail('someone@example.com', 'Sam', secretToken);
    await sendVerificationEmail('someone@example.com', 'Sam', secretToken);
  });
  assert.ok(!productionLog.includes(secretToken), 'production logs never contain the reset/verification token');
  assert.ok(!/https?:\/\//i.test(productionLog), 'production logs never contain a link');
  assert.ok(/SMTP is not configured/i.test(productionLog), 'production still records that nothing was sent');

  process.env.NODE_ENV = 'development';
  const developmentLog = await captureConsole(async () => {
    await sendPasswordResetEmail('someone@example.com', 'Sam', secretToken);
  });
  assert.ok(developmentLog.includes(secretToken), 'development still prints the link so it can be tested locally');

  console.log('Fan-out bounding and production e-mail log regressions passed.');
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
