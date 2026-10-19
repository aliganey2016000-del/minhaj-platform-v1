import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Pure formatting regression. Set an explicit local timezone so CI machines
// in UTC cannot mask incorrect UTC-date truncation at midnight.
process.env.TZ = 'Africa/Mogadishu';
const source = fs.readFileSync(new URL('../src/lib/teacher-offline-window-display.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const scope = { exports: {}, Date, Intl, Math };
vm.runInNewContext(js, scope);
const { formatOfflineAccessDate, offlineAccessTimeLeft } = scope.exports;

const from = Date.parse('2026-10-19T07:15:00+03:00');
const to = from + 7 * 24 * 60 * 60_000;
const fromLabel = formatOfflineAccessDate(from, 'en-GB');
const toLabel = formatOfflineAccessDate(to, 'en-GB');
assert.match(fromLabel, /19 Oct 2026/);
assert.match(fromLabel, /07:15/);
assert.match(toLabel, /26 Oct 2026/);
assert.match(toLabel, /07:15/);
assert.equal(offlineAccessTimeLeft(to, from), '7 days remaining');
assert.equal(offlineAccessTimeLeft(to, from + 3 * 86400000), '4 days remaining');
assert.equal(offlineAccessTimeLeft(to, to - 90 * 60000), '1 hr, 30 min remaining');
assert.equal(offlineAccessTimeLeft(to, to - 60 * 1000), '1 min remaining');
assert.match(offlineAccessTimeLeft(to, to), /Expired/);
assert.match(offlineAccessTimeLeft(to, to + 86400000), /Expired/);
console.log('PASS: local From/Until dates, admin 7-day window, remaining clock, expired state');
