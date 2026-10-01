import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/features/admin/pages/staff-attendance.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('settings.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['loadSettings', 'saveSettings'].includes(node.name.getText(tree))) declarations.push('const ' + node.getText(tree) + ';');
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(declarations.length, 2);
const code = ts.transpileModule(declarations.join('\n') + '\nexports.load = loadSettings; exports.save = saveSettings;', { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const requests = [];
const state = { settings: null, error: '', message: '', loading: false };
const context = { exports: {}, settingsLoading: false, settingsSaving: false, selectedOrganization: 'B', settings: { organizationId: 'A', latitude: 1 }, activeOrganization: { current: 'B' },
  setSettings: value => { state.settings = value; }, setSettingsError: value => { state.error = value; },
  setSettingsLoading: value => { state.loading = value; }, setSettingsSaving() {}, setMessage: value => { state.message = value; },
  api: { get: () => new Promise(resolve => requests.push(resolve)), put: (...args) => new Promise(resolve => requests.push({ resolve, args })) },
};
vm.runInNewContext(code, context);
const first = new AbortController(), second = new AbortController();
const old = context.exports.load('A', first.signal); first.abort();
const fresh = context.exports.load('B', second.signal);
requests[1]({ data: { data: { organizationId: 'B' } } }); await fresh;
requests[0]({ data: { data: { organizationId: 'A' } } }); await old;
assert.equal(state.settings.organizationId, 'B', 'Late old response must not overwrite current organization');
await context.exports.save(); assert.equal(requests.length, 2, 'Mismatched settings must never be submitted');
context.settings = { organizationId: 'B', latitude: 2 };
const saving = context.exports.save(); assert.equal(requests[2].args[1].organizationId, 'B');
context.activeOrganization.current = 'C';
requests[2].resolve({ data: { data: { organizationId: 'B', latitude: 2 } } }); await saving;
assert.equal(state.message, '', 'Late save must not show success in another organization');
assert.equal(state.settings.latitude, undefined, 'Late save must not replace current settings');
console.log('PASS: out-of-order settings, cross-organization save guard, late save response');
