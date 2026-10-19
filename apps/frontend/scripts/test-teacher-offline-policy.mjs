import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/teacher-offline-attendance.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

let policy = { maxOfflineDays: 7, organizationId: 'school-a' };
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
const { OFFLINE_TEACHER_IDENTITY_KEY, saveVerifiedTeacherIdentity, verifiedOfflineTeacherIdentity, offlineAttendanceOwner, getOfflineAttendanceAccessWindow } = context.exports;
for (const days of [1, 3, 7, 14, 30]) {
  policy = { maxOfflineDays: days, organizationId: 'school-a' };
  const before = Date.now();
  await saveVerifiedTeacherIdentity(user);
  const identity = verifiedOfflineTeacherIdentity();
  assert.ok(identity, 'Teacher identity should be prepared with server policy');
  const windowForTeacher = getOfflineAttendanceAccessWindow();
  assert.ok(windowForTeacher, 'Prepared identity must expose the display window');
  assert.equal(windowForTeacher.maxOfflineDays, days);
  assert.equal(windowForTeacher.from, identity.verifiedAt);
  assert.equal(windowForTeacher.to, identity.expiresAt);
  assert.equal(windowForTeacher.expired, false);
  assert.equal(windowForTeacher.to - windowForTeacher.from, days * 86400000);
  assert.equal(identity.maxOfflineDays, days);
  assert.ok(identity.expiresAt >= before + days * 86400000);
  assert.ok(identity.expiresAt <= Date.now() + days * 86400000 + 1000);
  assert.ok(offlineAttendanceOwner()?.includes('school-a:teacher-a'));
}
assert.equal(policyCalls, 5);

const previous = localStorage.getItem(OFFLINE_TEACHER_IDENTITY_KEY);
policy = { maxOfflineDays: 14, organizationId: 'other-school' };
await assert.rejects(saveVerifiedTeacherIdentity(user), /policy could not be verified/);
assert.equal(localStorage.getItem(OFFLINE_TEACHER_IDENTITY_KEY), previous, 'Reject a cross-tenant policy');
policy = { maxOfflineDays: 999, organizationId: 'school-a' };
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
localStorage.setItem(OFFLINE_TEACHER_IDENTITY_KEY, JSON.stringify(expired));
assert.equal(verifiedOfflineTeacherIdentity(), null, 'Expired access must lock');
const expiredDisplay = getOfflineAttendanceAccessWindow();
assert.ok(expiredDisplay?.expired, 'Expired grants should still show expiry to the teacher');
assert.equal(expiredDisplay?.to, expired.expiresAt);
console.log('PASS: admin duration choices, local access window, expiry display, tenant scoping, no offline extension');
