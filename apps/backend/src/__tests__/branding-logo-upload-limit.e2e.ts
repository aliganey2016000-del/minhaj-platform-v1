/**
 * Round 14 upload-safety regression.
 *
 * The organization branding logo route's multer instance had no `limits`
 * at all, unlike every other upload route in the backend (10-25MB caps).
 * Because the storage is `multer.memoryStorage()`, an oversized request
 * body would be buffered entirely in process memory before
 * `validateLogo()` ever runs — any org_admin could OOM the whole API with
 * one large POST to /api/v1/schools/:id/branding/logo.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
delete process.env.CLOUDINARY_URL;
delete process.env.CLOUDINARY_CLOUD_NAME;

import request from 'supertest';
import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('branding-logo-limit');
  try {
    const { default: app } = await import('../app');
    const { generateAccessToken } = await import('../utils/jwt');
    const { default: User } = await import('../models/user.model');
    const { default: School } = await import('../models/school.model');

    const token = (user: any) => generateAccessToken({
      userId: user._id.toString(), role: user.role, permissions: [],
      organizationId: user.organizationId ? user.organizationId.toString() : undefined,
    });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const admin = await User.create({ email: 'logo-admin@test.local', password: 'Password123!', role: 'admin' });
    const school = await School.create({
      name: 'Logo Limit School', organizationType: 'private', country: 'Somalia', city: 'Mogadishu', address: '1 St',
      phone: '+000', email: 'logo-limit@test.local', principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });
    const orgAdmin = await User.create({ email: 'logo-org-admin@test.local', password: 'Password123!', role: 'org_admin', organizationId: school._id });

    section('oversized logo uploads are rejected before buffering unbounded data');
    // One byte over the 10MB cap: this would previously be buffered whole in
    // process memory with no limit at all.
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    let res = await request(app)
      .post(`/api/v1/schools/${school._id}/branding/logo`)
      .set(auth(token(orgAdmin)))
      .attach('file', oversized, { filename: 'logo.png', contentType: 'image/png' });
    assert(res.status === 400 || res.status === 413, `an oversized logo is rejected (got ${res.status})`);

    section('a real, in-limit PNG logo still uploads');
    const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const validPng = Buffer.concat([pngHeader, Buffer.alloc(1024, 1)]);
    res = await request(app)
      .post(`/api/v1/schools/${school._id}/branding/logo`)
      .set(auth(token(orgAdmin)))
      .attach('file', validPng, { filename: 'logo.png', contentType: 'image/png' });
    assert(res.status === 200, `a valid, small PNG logo is accepted (got ${res.status}, body ${JSON.stringify(res.body)})`);
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll branding logo upload-limit checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
