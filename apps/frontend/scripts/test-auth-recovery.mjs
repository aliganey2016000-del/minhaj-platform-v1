import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/axios.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
function setup(refresh) {
  let requestHandler, errorHandler;
  const storage = new Map([['accessToken', 'old'], ['loginSessionId', 'session']]);
  const location = { pathname: '/admin/exams', search: '', href: '' };
  const calls = [];
  const api = async config => { calls.push(config); return { status: 200 }; };
  api.interceptors = { request: { use: fn => { requestHandler = fn; } }, response: { use: (_, fn) => { errorHandler = fn; } } };
  let refreshCount = 0;
  const axios = { create: () => api, isAxiosError: err => !!err.isAxiosError, post: (...args) => { refreshCount++; return refresh(...args); } };
  vm.runInNewContext(code, { exports: {}, require: () => axios, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, window: { location }, Intl });
  return { request: config => requestHandler(config), fail: error => errorHandler(error), storage, location, calls, refreshCount: () => refreshCount };
}
const unauthorized = () => ({ response: { status: 401 }, config: { url: '/classes', headers: { Authorization: 'Bearer old' } } });
for (const status of [undefined, 429, 500, 503]) {
  const error = { isAxiosError: true, response: status ? { status } : undefined };
  const test = setup(async () => { throw error; });
  await assert.rejects(test.fail(unauthorized()), err => err === error);
  assert.equal(test.storage.get('accessToken'), 'old');
  assert.equal(test.location.href, '');
}
const expired = setup(async () => { throw { isAxiosError: true, response: { status: 401 } }; });
await assert.rejects(expired.fail(unauthorized()));
assert.equal(expired.storage.has('accessToken'), false);
assert.ok(expired.location.href.startsWith('/auth/login?from='));
const late = setup(async () => { throw new Error('Refresh should not run'); });
late.storage.set('accessToken', 'new');
await late.fail(unauthorized());
assert.equal(late.refreshCount(), 0);
assert.equal(late.calls[0].headers.Authorization, 'Bearer new');
let finish;
const concurrent = setup(() => new Promise(resolve => { finish = resolve; }));
const first = concurrent.fail(unauthorized()), second = concurrent.fail(unauthorized());
assert.equal(concurrent.refreshCount(), 1);
finish({ data: { data: { accessToken: 'fresh' } } });
await Promise.all([first, second]);
assert.equal(concurrent.calls.length, 2);
assert.equal(concurrent.storage.get('accessToken'), 'fresh');
assert.equal(concurrent.request({ method: 'get', headers: {}, timeout: 0 }).timeout, 30000);
assert.equal(concurrent.request({ method: 'get', headers: {}, timeout: 15000 }).timeout, 15000);
assert.equal(concurrent.request({ method: 'post', headers: {}, timeout: 0 }).timeout, 0);
console.log('PASS: transient recovery, invalid session logout, late 401 reuse, concurrent refresh and bounded reads');

const authSource = fs.readFileSync(new URL('../src/store/auth-context.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('auth.tsx', authSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let checkSource;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'checkAuth') checkSource = 'const ' + node.getText(ast) + '; exports.check = checkAuth;';
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(checkSource);
const checkCode = ts.transpileModule(checkSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
for (const status of [undefined, 401, 500]) {
  const state = { cleared: false, retry: false, loading: true };
  const context = { exports: {}, controller: new AbortController(), navigator: { onLine: true }, listPreparedTeachers: () => [], api: { get: async () => { throw { response: status ? { status } : undefined }; } }, localStorage: { getItem: () => 'token' }, setIsLoading: value => { state.loading = value; }, setSessionError: value => { state.retry = value; }, clearAuthStorage: () => { state.cleared = true; }, setUser() {} };
  vm.runInNewContext(checkCode, context);
  await context.exports.check();
  assert.equal(state.cleared, status === 401);
  assert.equal(state.retry, status !== 401);
  assert.equal(state.loading, false);
}
console.log('PASS: startup keeps session on connection/server failure and offers retry; invalid credentials still clear');

const offlineState = { loading: true, retry: false, user: undefined, calls: 0 };
const offlineContext = {
  exports: {}, controller: new AbortController(), navigator: { onLine: false },
  localStorage: { getItem: () => 'token' },
  setUser: value => { offlineState.user = value; },
  setIsLoading: value => { offlineState.loading = value; },
  setSessionError: value => { offlineState.retry = value; },
  api: { get: async () => { offlineState.calls++; throw new Error('No offline request allowed'); } },
};
vm.runInNewContext(checkCode, offlineContext);
await offlineContext.exports.check();
assert.equal(offlineState.calls, 0, 'A cold offline launch must not request /auth/me');
assert.equal(offlineState.user, null, 'A cached identity must not silently restore an authenticated teacher');
assert.equal(offlineState.loading, false);
assert.equal(offlineState.retry, false);
console.log('PASS: cold offline launch requires explicit PIN unlock');
