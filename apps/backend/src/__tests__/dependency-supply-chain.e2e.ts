/**
 * Round 3 supply-chain regression: exceljs's transitive `uuid` dependency.
 *
 * exceljs@4.4.0 depends on uuid@^8.3.0, which has a moderate-severity
 * "missing buffer bounds check" advisory (GHSA-w5hq-g745-h8pq) in its v3/v5/v6
 * namespace-based UUID functions. No newer exceljs release bumps this
 * dependency, so package.json pins it with an npm "overrides" entry instead:
 *
 *   "overrides": { "exceljs": { "uuid": "^11.1.1" } }
 *
 * This guards two things a careless future dependency bump could silently
 * undo:
 *   1. The uuid version actually resolved under node_modules/exceljs stays
 *      >= 11.1.1 (not the vulnerable 8.x line).
 *   2. exceljs itself still works end-to-end against that newer uuid (same
 *      named CJS exports), so the override is a safe, non-breaking pin and
 *      not just a version bump that happens to satisfy npm audit.
 *
 * No Express app/MongoDB needed — this inspects the installed dependency
 * tree and exercises exceljs directly. `npx ts-node src/__tests__/dependency-supply-chain.e2e.ts`.
 */

import fs from 'fs';
import path from 'path';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

/** Minimal semver-ish "is >= major.minor.patch" check, good enough for X.Y.Z. */
function isAtLeast(version: string, min: [number, number, number]): boolean {
  const parts = version.split('.').map((p) => parseInt(p, 10));
  for (let i = 0; i < 3; i += 1) {
    const v = parts[i] || 0;
    const m = min[i];
    if (v > m) return true;
    if (v < m) return false;
  }
  return true;
}

async function main() {
  section('package.json pins exceljs\'s uuid via overrides');

  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const overriddenUuidRange = pkg.overrides?.exceljs?.uuid;
  assert(
    typeof overriddenUuidRange === 'string' && overriddenUuidRange.length > 0,
    'package.json has an "overrides" entry pinning exceljs\'s uuid dependency'
  );

  section('the uuid package actually resolved under exceljs is >= 11.1.1');

  // Resolve exactly what exceljs's own `require('uuid')` would get, the same
  // way Node's own resolution does — this is what matters for the advisory,
  // not just what package.json *asks* for.
  let resolvedUuidVersion: string | null = null;
  try {
    const uuidPkgPath = require.resolve('uuid/package.json', {
      paths: [path.dirname(require.resolve('exceljs/package.json'))],
    });
    resolvedUuidVersion = JSON.parse(fs.readFileSync(uuidPkgPath, 'utf8')).version;
  } catch {
    resolvedUuidVersion = null;
  }
  assert(resolvedUuidVersion !== null, 'uuid resolves from exceljs\'s dependency tree');
  assert(
    resolvedUuidVersion !== null && isAtLeast(resolvedUuidVersion, [11, 1, 1]),
    `resolved uuid version (${resolvedUuidVersion}) is >= 11.1.1 (GHSA-w5hq-g745-h8pq is fixed in 11.1.1)`
  );

  section('exceljs still produces a valid workbook with the pinned uuid');

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Regression');
  sheet.addRow(['id', 'name']);
  sheet.addRow([1, 'Supply chain check']);

  const buffer = await workbook.xlsx.writeBuffer();
  assert(buffer.byteLength > 0, 'workbook.xlsx.writeBuffer() produces a non-empty buffer');

  const readBack = new ExcelJS.Workbook();
  await readBack.xlsx.load(buffer as any);
  const readSheet = readBack.getWorksheet('Regression');
  assert(Boolean(readSheet), 'the written workbook round-trips through exceljs on read');
  assert(
    readSheet?.getRow(2).getCell(2).value === 'Supply chain check',
    'round-tripped cell data matches what was written'
  );

  console.log(`\n${'='.repeat(60)}`);
  console.log(failures === 0 ? 'ALL DEPENDENCY SUPPLY-CHAIN CHECKS PASSED (0 failures)' : `${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));
  if (failures > 0) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
