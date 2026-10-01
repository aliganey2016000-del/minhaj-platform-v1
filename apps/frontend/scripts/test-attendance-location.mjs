import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/attendance-location.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function setup() {
  let success, failure, deadline, cleared = false;
  const context = { exports: {}, Date, Number, Error,
    navigator: { geolocation: { watchPosition(ok, fail) { success = ok; failure = fail; return 7; }, clearWatch(id) { assert.equal(id, 7); cleared = true; } } },
    window: { setTimeout(fn) { deadline = fn; return 1; }, clearTimeout() {} },
  };
  vm.runInNewContext(code, context);
  return { read: context.exports.getAttendanceLocation, fix: (accuracy, age = 0) => success({ coords: { latitude: 2.04, longitude: 45.34, accuracy }, timestamp: Date.now() - age }), deny: () => failure({ code: 1 }), expire: () => deadline(), cleared: () => cleared };
}
let test = setup(); let result = test.read(100); test.fix(300); test.fix(20); assert.equal((await result).accuracy, 20); assert.ok(test.cleared());
test = setup(); result = test.read(100); test.fix(80); test.fix(90); test.expire(); assert.equal((await result).accuracy, 80);
test = setup(); result = test.read(100); test.fix(500); test.expire(); await assert.rejects(result, /accuracy/); assert.ok(test.cleared());
test = setup(); result = test.read(100); test.fix(10, 60000); test.expire(); await assert.rejects(result, /could not be read/);
test = setup(); result = test.read(100); test.deny(); await assert.rejects(result, /permission/); assert.ok(test.cleared());
test = setup(); const abort = new AbortController(); result = test.read(100, abort.signal); abort.abort(); await assert.rejects(result, /cancelled/); assert.ok(test.cleared());
console.log('PASS: precise fix, best fix, poor accuracy, stale GPS, permission denied and cancellation');
