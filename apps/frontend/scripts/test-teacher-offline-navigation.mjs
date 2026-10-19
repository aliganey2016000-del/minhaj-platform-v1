import assert from 'node:assert/strict';
import fs from 'node:fs';

const attendance = fs.readFileSync(new URL('../src/features/teacher/pages/teacher-school-attendance.tsx', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../src/routes/index.tsx', import.meta.url), 'utf8');
const permissions = fs.readFileSync(new URL('../src/features/teacher/components/teacher-sidebar-access.ts', import.meta.url), 'utf8');

assert.match(attendance, /view = 'list'/, 'Student Attendance must use normal list view by default');
assert.match(attendance, /to="\/teacher\/attendance\/offline"/, 'Title action must navigate to dedicated offline page');
assert.match(attendance, /if \(view === 'offline'\)/, 'Offline panel must be rendered on its own page');
assert.match(attendance, /to="\/teacher\/attendance"/, 'New page must have a back link to Student Attendance');
assert.match(attendance, /\{offlinePanel\}/, 'Separate page must render the original offline card');
assert.match(attendance, /Prepare Offline/, 'Preparation action must remain available');
assert.match(attendance, /Sync Now/, 'Manual sync action must remain available');
assert.match(attendance, /offlineAccessTimeLeft/, 'Admin expiry countdown must be retained');

const mainReturn = attendance.indexOf('  return (\n    <div className="mx-auto w-full max-w-7xl');
assert.ok(mainReturn > 0, 'Attendance list render must exist');
assert.ok(!attendance.slice(mainReturn).includes('{offlinePanel}'), 'Offline card must not appear inline with class cards');
assert.match(routes, /path: 'attendance\/offline', element: L\(<TeacherOfflineAttendance view="offline" \/>\)/,
  'Offline page must be registered within guarded teacher routes');
assert.match(permissions, /starts\(p, '\/teacher\/attendance'\)/,
  'Offline settings route must inherit existing teacher attendance permission');
console.log('PASS: teacher attendance title shortcut, separate guarded page, back link, original offline panel and actions');
