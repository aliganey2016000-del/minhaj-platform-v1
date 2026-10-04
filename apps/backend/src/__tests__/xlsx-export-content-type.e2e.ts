/**
 * Several xlsx download endpoints set the Content-Type header with a typo:
 * "application/vnd.openxmlformats-officedocument/spreadsheetml.sheet" (a
 * slash where the real MIME type has a dot before "spreadsheetml"). Some
 * browsers/Excel builds refuse to auto-recognize the malformed type and the
 * file downloads as a generic blob instead of opening directly in Excel.
 *
 * Fixed locations (slash -> dot):
 *   student.controller.ts, learning-activity.controller.ts,
 *   course-content.controller.ts (x2), gradebook.controller.ts (x2),
 *   parent.controller.ts (x2), content-blocks-import.controller.ts
 *
 * This regression hits a couple of the fixed endpoints end-to-end and
 * asserts the header is exactly the correct MIME type.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import { startTestDb } from './support/test-db';

const CORRECT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

async function main() {
  const db = await startTestDb('xlsx-content-type');
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

    const admin = await User.create({ email: 'xlsx-admin@test.local', password: 'Password123!', role: 'admin' });
    const adminToken = token(admin);
    const school = await School.create({
      name: 'XLSX Content-Type School', organizationType: 'private', country: 'Somalia',
      city: 'Mogadishu', address: '1 St', phone: '+000', email: 'school-xlsx@test.local',
      principalName: 'Principal', establishedYear: 2020, createdBy: admin._id,
    });

    section('GET /api/v1/parents/template — parent.controller.downloadTemplate');
    const parentTplRes = await request(app)
      .get('/api/v1/parents/template')
      .set(auth(adminToken));
    assert(parentTplRes.status === 200, `request succeeds (status ${parentTplRes.status})`);
    assert(
      parentTplRes.headers['content-type'] === CORRECT_TYPE,
      `Content-Type is exactly "${CORRECT_TYPE}" (got "${parentTplRes.headers['content-type']}")`,
    );

    section('GET /api/v1/parents/export — parent.controller.exportParents');
    const parentExportRes = await request(app)
      .get('/api/v1/parents/export')
      .set(auth(adminToken));
    assert(parentExportRes.status === 200, `request succeeds (status ${parentExportRes.status})`);
    assert(
      parentExportRes.headers['content-type'] === CORRECT_TYPE,
      `Content-Type is exactly "${CORRECT_TYPE}" (got "${parentExportRes.headers['content-type']}")`,
    );

    section('GET /api/v1/teachers/template — teacher.controller.downloadTemplate (was already correct — control case)');
    const teacherTplRes = await request(app)
      .get('/api/v1/teachers/template')
      .set(auth(adminToken));
    assert(teacherTplRes.status === 200, `request succeeds (status ${teacherTplRes.status})`);
    assert(
      teacherTplRes.headers['content-type'] === CORRECT_TYPE,
      `Content-Type is exactly "${CORRECT_TYPE}" (got "${teacherTplRes.headers['content-type']}")`,
    );

    // Guard against the exact typo string ever reappearing in the header.
    for (const [label, res] of [
      ['parents/template', parentTplRes],
      ['parents/export', parentExportRes],
      ['teachers/template', teacherTplRes],
    ] as const) {
      assert(
        !String(res.headers['content-type']).includes('officedocument/spreadsheetml'),
        `${label}: header does not contain the slash typo`,
      );
    }

    void school;
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll xlsx export Content-Type checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
