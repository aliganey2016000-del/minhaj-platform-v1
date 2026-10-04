/**
 * Email templates (services/email.service.ts) interpolate a profile's
 * firstName directly into an HTML email body with no escaping. firstName
 * is only ever validated as "a string up to 50 characters" (see
 * validators/auth.validator.ts's registerSchema) — nothing stops a user
 * from registering with firstName = '<img src=x onerror=alert(1)>' or a
 * value that closes the surrounding <p> early and injects their own
 * markup into the verification/password-reset email sent to their inbox.
 *
 * This matters even though the email always goes to the account's own
 * address: webmail clients render the HTML body, and HTML/attribute
 * injection in a "transactional" email from a trusted sender is exactly
 * the kind of thing a phishing/tracking payload rides on, plus it can
 * simply break the template's layout (e.g. a firstName containing `</a>`
 * truncating the Verify Email button's link).
 *
 * Fix: services/email.service.ts now HTML-escapes firstName before
 * interpolating it into the greeting line.
 *
 * Runs the REAL Express app via POST /api/v1/auth/register, with
 * nodemailer's createTransport monkey-patched to capture the exact HTML
 * body that would have been sent, instead of hitting a real SMTP server.
 *
 * Repeatable: `npm run test:email-html-injection`.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
// Make smtpConfigured() true so email.service.ts actually builds the
// Nodemailer transport (and its HTML body) instead of short-circuiting to
// the console-log fallback used when SMTP isn't configured.
process.env.SMTP_HOST = 'smtp.test.local';
process.env.SMTP_USER = 'no-reply@test.local';
process.env.SMTP_PASSWORD = 'not-a-real-password';

import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('email-html-injection');
  try {
    // Monkey-patch nodemailer's createTransport BEFORE app/email.service is
    // imported, so the module-level `import nodemailer from 'nodemailer'`
    // in email.service.ts resolves to this same patched module object (CJS
    // property access at call time, not a destructured binding).
    const nodemailerModule: any = await import('nodemailer');
    const nodemailer = nodemailerModule.default ?? nodemailerModule;
    const sent: Array<{ to: string; subject: string; html: string; text: string }> = [];
    nodemailer.createTransport = () => ({
      sendMail: async (opts: any) => { sent.push({ to: opts.to, subject: opts.subject, html: opts.html, text: opts.text }); return { messageId: 'fake' }; },
    });

    const { default: app } = await import('../app');
    const { default: User } = await import('../models/user.model');

    section('Registration email — firstName containing an HTML/script payload');
    const payload = '<img src=x onerror=alert(1)>';
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'html-injection@example.com',
      password: 'Password123!',
      firstName: payload,
      lastName: 'Tester',
      gender: 'male',
    });
    assert(res.status === 201, `registration succeeds (got ${res.status}, body=${JSON.stringify(res.body)})`);
    assert(Boolean(await User.findOne({ email: 'html-injection@example.com' })), 'the account was actually created');

    assert(sent.length === 1, `exactly one verification email was sent (got ${sent.length})`);
    const mail = sent[0];
    assert(mail?.to === 'html-injection@example.com', `sent to the registered address (got ${mail?.to})`);

    const rawPayloadInHtml = mail?.html?.includes(payload) ?? true;
    assert(!rawPayloadInHtml, `the raw <img onerror=...> tag is NOT present verbatim in the email HTML (html contained: ${rawPayloadInHtml})`);
    assert((mail?.html || '').includes('&lt;img') && (mail?.html || '').includes('&gt;'), 'the firstName is HTML-escaped (angle brackets entity-encoded) in the email HTML body');
    // The escaped text still contains the literal characters "onerror=" as
    // inert text (inside the entity-encoded &lt;img ...&gt;), which is
    // fine — what matters is that there is no live, parseable <img ...>
    // element, which the &lt;/&gt; checks above already establish.
    assert(!/<img[^>]*onerror=/i.test(mail?.html || ''), 'no live <img onerror=...> element reaches the rendered HTML (only inert escaped text does)');

    section('A normal firstName still renders a plain greeting');
    const sent2count = sent.length;
    const res2 = await request(app).post('/api/v1/auth/register').send({
      email: 'normal-name@example.com',
      password: 'Password123!',
      firstName: 'Amina',
      lastName: 'Tester',
      gender: 'female',
    });
    assert(res2.status === 201, `registration succeeds (got ${res2.status})`);
    assert(sent.length === sent2count + 1, 'a second verification email was sent');
    assert((sent[sent.length - 1]?.html || '').includes('Hi Amina,'), `the greeting still reads "Hi Amina," for an ordinary name (html snippet: ${(sent[sent.length - 1]?.html || '').slice(0, 400)})`);
  } finally {
    await db.stop();
  }

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) console.log('ALL CHECKS PASSED (0 failures)');
  else console.log(`${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
