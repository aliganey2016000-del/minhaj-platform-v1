import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/teacher-offline-attendance.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const HOUR = 3600000;
const DAY = 24 * HOUR;
function serverPolicy(days, organizationId = 'school-a') {
  const now = Date.now();
  const school = new Date(now + 3 * HOUR);
  const daysSinceSaturday = (school.getUTCDay() + 1) % 7;
  const weeklyStart = Date.UTC(school.getUTCFullYear(), school.getUTCMonth(),
    school.getUTCDate() - daysSinceSaturday) - 3 * HOUR;
  const start = days === 7 ? weeklyStart : now;
  return {
    maxOfflineDays: days, organizationId,
    timezone: 'Africa/Mogadishu',
    calendarAligned: days === 7,
    verifiedAt: new Date(now).toISOString(),
    periodStart: new Date(start).toISOString(),
    periodEndExclusive: new Date(start + days * DAY).toISOString(),
  };
}
let policy = serverPolicy(7);
let policyCalls = 0;
const user = { id: 'teacher-a', role: 'teacher', organizationId: 'school-a', email: 'teacher@school-a.test' };
const storage = new Map([['loginSessionId', 'session-a'], ['accessToken', 'valid-access']]);
const localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
const window = { location: { hostname: 'school-a.schoolapp.so' } };
const navigator = { onLine: true };
const api = {
  async get(path) {
    assert.equal(path, '/attendance/offline-policy');
    policyCalls++;
    return { data: { data: policy } };
  },
};
const context = {
  exports: {}, window, navigator, localStorage, Date,
  require(path) {
    if (path === './axios') return api;
    if (path === './offline-store') return {};
    throw new Error('Unexpected dependency ' + path);
  },
};
vm.runInNewContext(code, context);
const { OFFLINE_TEACHER_IDENTITY_KEY, saveVerifiedTeacherIdentity, verifiedOfflineTeacherIdentity, offlineAttendanceOwner, getOfflineAttendanceAccessWindow, preparedAttendanceDates } = context.exports;
for (const days of [1, 3, 7, 14, 30]) {
  policy = serverPolicy(days);
  const before = Date.now();
  await saveVerifiedTeacherIdentity(user);
  const identity = verifiedOfflineTeacherIdentity();
  assert.ok(identity, 'Teacher identity should be prepared with server policy');
  const windowForTeacher = getOfflineAttendanceAccessWindow();
  assert.ok(windowForTeacher, 'Prepared identity must expose the display window');
  assert.equal(windowForTeacher.maxOfflineDays, days);
  assert.equal(windowForTeacher.from, days === 7 ? Date.parse(policy.periodStart) : identity.verifiedAt);
  assert.equal(windowForTeacher.to, identity.expiresAt);
  assert.equal(windowForTeacher.calendarAligned, days === 7);
  assert.equal(windowForTeacher.expired, false);
  assert.equal(windowForTeacher.to - windowForTeacher.from, days * DAY);
  assert.equal(identity.maxOfflineDays, days);
  const prepared = preparedAttendanceDates(windowForTeacher, '2026-10-19');
  assert.equal(prepared.length, days === 7 ? 7 : 1);
  if (days === 7) {
    const first = new Date(windowForTeacher.from + 3 * HOUR).toISOString().slice(0, 10);
    const last = new Date(windowForTeacher.from + 6 * DAY + 3 * HOUR).toISOString().slice(0, 10);
    assert.equal(prepared[0], first);
    assert.equal(prepared[6], last);
    assert.equal(new Date(prepared[0] + 'T00:00:00Z').getUTCDay(), 6, 'weekly roster download starts Saturday');
    assert.equal(new Date(prepared[6] + 'T00:00:00Z').getUTCDay(), 5, 'weekly roster download ends Friday');
    assert.equal(identity.expiresAt, Date.parse(policy.periodEndExclusive),
      '7 days expires NEXT SATURDAY, never on the rolling verification day');
    assert.ok(identity.expiresAt <= before + 7 * DAY);
    assert.ok(windowForTeacher.from <= before);
  } else {
    assert.ok(identity.expiresAt >= before + days * DAY);
    assert.ok(identity.expiresAt <= Date.now() + days * DAY + 1000);
  }
  assert.ok(offlineAttendanceOwner()?.includes('school-a:teacher-a'));
}
assert.equal(policyCalls, 5);

const previous = localStorage.getItem(OFFLINE_TEACHER_IDENTITY_KEY);
policy = serverPolicy(14, 'other-school');
await assert.rejects(saveVerifiedTeacherIdentity(user), /policy could not be verified/);
assert.equal(localStorage.getItem(OFFLINE_TEACHER_IDENTITY_KEY), previous, 'Reject a cross-tenant policy');
policy = serverPolicy(999);
await assert.rejects(saveVerifiedTeacherIdentity(user), /policy could not be verified/);
assert.equal(localStorage.getItem(OFFLINE_TEACHER_IDENTITY_KEY), previous, 'Reject tampered policy duration');
navigator.onLine = false;
await saveVerifiedTeacherIdentity(user);
assert.equal(localStorage.getItem(OFFLINE_TEACHER_IDENTITY_KEY), previous, 'Offline state cannot extend TTL');
navigator.onLine = true;
window.location.hostname = 'school-b.schoolapp.so';
assert.equal(verifiedOfflineTeacherIdentity(), null, 'Teacher grant must be host-specific');
window.location.hostname = 'school-a.schoolapp.so';

const expired = JSON.parse(previous);
expired.expiresAt = Date.now() - 1;
expired.verifiedAt = expired.expiresAt - expired.maxOfflineDays * 86400000;
localStorage.setItem(OFFLINE_TEACHER_IDENTITY_KEY, JSON.stringify(expired));
assert.equal(verifiedOfflineTeacherIdentity(), null, 'Expired access must lock');
const expiredDisplay = getOfflineAttendanceAccessWindow();
assert.ok(expiredDisplay?.expired, 'Expired grants should still show expiry to the teacher');
assert.equal(expiredDisplay?.to, expired.expiresAt);
console.log('PASS: Saturday weekly grant and renewal, rolling nonweekly periods, expiry, tenant scoping, no offline extension');
