import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Fresh processes ensure the host/CI timezone cannot hide a regression.
const cases = [
  ['Africa/Mogadishu', '2026-10-04T00:30:00+03:00', '2026-10-04', '2026-10-04', '2026-10-01'],
  ['Africa/Mogadishu', '2026-10-04T12:00:00+03:00', '2026-10-04', '2026-10-04', '2026-10-01'],
  ['Africa/Mogadishu', '2027-01-01T00:30:00+03:00', '2027-01-01', '2026-12-27', '2027-01-01'],
  ['Africa/Mogadishu', '2024-03-01T00:30:00+03:00', '2024-03-01', '2024-02-25', '2024-03-01'],
  ['America/Los_Angeles', '2026-10-03T23:30:00-07:00', '2026-10-03', '2026-09-27', '2026-10-01'],
  ['America/New_York', '2026-03-09T00:30:00-04:00', '2026-03-09', '2026-03-08', '2026-03-01'],
  ['America/New_York', '2026-11-02T00:30:00-05:00', '2026-11-02', '2026-11-01', '2026-11-01'],
  ['Pacific/Kiritimati', '2026-10-01T00:30:00+14:00', '2026-10-01', '2026-09-27', '2026-10-01'],
  ['UTC', '2026-10-04T00:30:00Z', '2026-10-04', '2026-10-04', '2026-10-01'],
];
if (!process.env.ATTENDANCE_DATE_CASE) {
  for (const testCase of cases) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, TZ: testCase[0], ATTENDANCE_DATE_CASE: JSON.stringify(testCase) }, encoding: 'utf8',
    });
    assert.equal(child.status, 0, `${testCase.join(' ')}\n${child.stdout}\n${child.stderr}`);
    process.stdout.write(child.stdout);
  }
  console.log('PASS: defaults, presets, schedule reset, custom range, query and save dates');
} else {
  const [zone, instant, today, weekStart, monthStart] = JSON.parse(process.env.ATTENDANCE_DATE_CASE);
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return new Date(instant).getTime(); }
  }
  const compile = (path) => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const helper = { exports: {}, Date: FrozenDate };
  vm.runInNewContext(compile('../src/lib/local-calendar-date.ts'), helper);
  // Run the actual TSX with deterministic hooks/JSX and API fixtures, following
  // the existing VM-based frontend regression scripts. No browser layout claims.
  const slots = [], effects = [], calls = [];
  let cursor = 0, dirty = false, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value) => {
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; }
      }];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i], deps)) { slots[i] = deps; effects.push(fn); }
    },
  };
  const api = {
    async get(url, options) {
      calls.push({ method: 'get', url, params: options?.params });
      let data = [];
      if (url === '/attendance/insights') data = { mostAbsentDay: null, topAttenders: [] };
      if (url === '/class-schedules') data = [{ _id: 'session-1', course: { _id: 'course-1', title: { en: 'Math' } }, startTime: '08:00', endTime: '09:00' }];
      if (url === '/courses/course-1/students') data = [{ _id: 'student-1', studentId: 'S1', profile: { firstName: 'Test', lastName: 'Student' }, enrolledCourses: ['course-1'] }];
      return { data: { data } };
    },
    async post(url, body) { calls.push({ method: 'post', url, body }); return { data: {} }; },
  };
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {}, Date: FrozenDate, setTimeout: () => 0,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name.endsWith('/axios')) return { default: api };
      if (name.endsWith('/local-calendar-date')) return helper.exports;
      if (name.endsWith('/auth-context')) return { useAuth: () => ({ user: { role: 'admin' } }) };
      if (name.endsWith('/course-category-visuals')) return { categoryLabels: {}, levelColors: {}, statusColors: {}, inferCategoryIcon: () => 'icon', inferCategoryColor: () => '' };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(compile('../src/features/admin/pages/attendance-manage-legacy.tsx'), context);
  async function render() {
    for (let pass = 0; pass < 30; pass++) {
      cursor = 0; dirty = false; tree = context.exports.AttendanceManage();
      for (const effect of effects.splice(0)) effect();
      await new Promise((resolve) => setImmediate(resolve));
      if (!dirty) return;
    }
    throw new Error('Component did not settle');
  }
  function nodes(value) {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object') return [];
    return [value, ...nodes(value.props?.children ?? null)];
  }
  function text(value) {
    if (Array.isArray(value)) return value.map(text).join('');
    if (value && typeof value === 'object') return text(value.props?.children);
    return value == null || typeof value === 'boolean' ? '' : String(value);
  }
  async function click(label) {
    const button = nodes(tree).find((n) => n.type === 'button' && text(n) === label);
    assert.ok(button, `Missing button ${label}`);
    assert.ok(!button.props.disabled, `${label} disabled`);
    await button.props.onClick(); await render();
  }
  const inputs = () => nodes(tree).filter((n) => n.type === 'input' && n.props.type === 'date');
  const range = (from, to) => assert.deepEqual(inputs().map((n) => n.props.value), [from, to]);
  await render(); range(today, today);
  for (const [label, start] of [['This Month', monthStart], ['This Week', weekStart], ['Today', today]]) {
    await click(label); range(start, today);
  }
  inputs()[0].props.onChange({ target: { value: '2024-02-28' } }); await render();
  range('2024-02-28', today);
  const card = nodes(tree).find((n) => n.type === 'div' && n.props.onClick && text(n).includes('Take Attendance'));
  assert.ok(card, 'Schedule card must load');
  card.props.onClick(); await render(); range(today, today);
  const courseCall = calls.findLast((c) => c.url === '/attendance/course');
  assert.equal(courseCall.params.date, today);
  assert.equal(courseCall.params.schedule, 'session-1');
  await click('💾 Save Attendance');
  assert.equal(calls.findLast((c) => c.method === 'post').body.date, today);
  await click('View Records');
  inputs()[0].props.onChange({ target: { value: '2024-02-28' } }); await render();
  inputs()[1].props.onChange({ target: { value: '2024-02-29' } }); await render();
  range('2024-02-28', '2024-02-29');
  await click('This Month');
  const rangeCall = calls.findLast((c) => c.url === '/attendance/course');
  assert.equal(rangeCall.params.dateFrom, monthStart);
  assert.equal(rangeCall.params.dateTo, today);
  await click('Report');
  for (const url of ['/attendance/report', '/attendance/insights']) {
    const call = calls.findLast((c) => c.url === url);
    assert.equal(call.params.dateFrom, monthStart); assert.equal(call.params.dateTo, today);
  }
  console.log(`PASS: ${zone} ${instant}`);
}
