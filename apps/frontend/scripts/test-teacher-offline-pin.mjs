import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

// Execute the actual helper (not a copy of the algorithm) against a
// deterministic verified teacher and in-memory browser storage.
const source = fs.readFileSync(new URL('../src/lib/offline-teacher-pin.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const memory = new Map();
const localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};
let identity = { role: 'teacher', id: 'teacher-1', organizationId: 'school-a', hostname: 'balcad.schoolapp.so',
  loginSessionId: 'session-1', expiresAt: Date.now() + 72 * 60 * 60 * 1000 };
let serverCalls = 0;
const api = {
  async get(path) {
    assert.equal(path, '/auth/me');
    serverCalls++;
    return { data: { data: { user: { _id: identity.id, role: identity.role, organizationId: identity.organizationId } } } };
  },
};
const context = {
  exports: {}, localStorage, crypto: webcrypto, TextEncoder, Date,
  navigator: { onLine: true },
  require(path) {
    if (path === './axios') return api;
    if (path === './teacher-offline-attendance') return { verifiedOfflineTeacherIdentity: () => identity, saveVerifiedTeacherIdentity: async () => {} };
    throw new Error('Unexpected import: ' + path);
  },
};
vm.runInNewContext(compiled, context);
const { isOfflinePinReady, setupOfflinePin, unlockTeacherWithPin, clearOfflinePin } = context.exports;

assert.equal(isOfflinePinReady(), false, 'A session alone must not unlock offline');
await assert.rejects(setupOfflinePin('111111'), /six different-enough digits/);
context.navigator.onLine = false;
await assert.rejects(setupOfflinePin('123456'), /Connect to the internet/);
context.navigator.onLine = true;
await setupOfflinePin('123456');
assert.equal(serverCalls, 1, 'PIN setup must verify current backend role/account');
assert.equal(isOfflinePinReady(), true);
assert.ok(!JSON.stringify([...memory]).includes('123456'), 'PIN must never be stored as cleartext');
assert.equal((await unlockTeacherWithPin('123456')).id, 'teacher-1');

for (let i = 0; i < 5; i++) await assert.rejects(unlockTeacherWithPin('654321'), /Incorrect PIN|locked for 15 minutes/);
await assert.rejects(unlockTeacherWithPin('123456'), /Wait 15 minutes/);

identity = { ...identity, id: 'teacher-2' };
assert.equal(isOfflinePinReady(), false, 'PIN must not unlock another teacher');
await assert.rejects(unlockTeacherWithPin('123456'), /not configured/);
identity = { ...identity, id: 'teacher-1', hostname: 'another.schoolapp.so' };
assert.equal(isOfflinePinReady(), false, 'PIN must not unlock another hostname');
identity = { ...identity, hostname: 'balcad.schoolapp.so', expiresAt: Date.now() - 1000 };
assert.equal(isOfflinePinReady(), false, 'Expired verified identity must fail closed');

clearOfflinePin();
assert.equal(isOfflinePinReady(), false, 'Logout/reset must wipe the PIN credential');
console.log('PASS: teacher PIN setup, server verification, hash-only storage, wrong PIN lockout, tenant/account isolation, expiry and reset');
