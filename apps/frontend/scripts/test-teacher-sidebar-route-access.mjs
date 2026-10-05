import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const helperPath = path.resolve('src/features/teacher/components/teacher-sidebar-access.ts');
const source = fs.readFileSync(helperPath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;

const tempPath = path.resolve('.tmp-teacher-sidebar-access-test.mjs');
fs.writeFileSync(tempPath, output);

try {
  const {
    isTeacherRouteAllowed,
    firstAllowedTeacherRoute,
    requiredTeacherSidebarKeys,
  } = await import(`${pathToFileURL(tempPath).href}?t=${Date.now()}`);

  const assert = (condition, message) => {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`PASS: ${message}`);
  };

  assert(isTeacherRouteAllowed('/teacher', {}), 'default config allows teacher dashboard');
  assert(isTeacherRouteAllowed('/teacher/courses/abc/builder', {}), 'default config allows mapped course detail tools');

  assert(!isTeacherRouteAllowed('/teacher', { teacher: false }), 'disabled dashboard cannot be opened directly');
  assert(firstAllowedTeacherRoute({ teacher: false }) === '/teacher/courses', 'disabled dashboard redirects to first enabled teacher page');

  assert(!isTeacherRouteAllowed('/teacher/courses/abc', { 'teacher/courses': false }), 'disabled My Courses blocks course detail routes');
  assert(!isTeacherRouteAllowed('/teacher/assignments/123/review', { 'teacher/assignments': false }), 'disabled Assignments blocks review detail routes');
  assert(!isTeacherRouteAllowed('/teacher/attendance/session/123', { 'teacher/attendance': false }), 'disabled Student Attendance blocks attendance session routes');

  assert(!isTeacherRouteAllowed('/teacher/exams', { 'group:teacher-exams': false }), 'disabled Exam Workspace group blocks exam workspace');
  assert(!isTeacherRouteAllowed('/teacher/exam-attendance/123', { 'teacher/exam-attendance': false }), 'disabled Exam Attendance blocks assignment detail route');
  assert(!isTeacherRouteAllowed('/teacher/exams/123/attendance', { 'teacher/exam-attendance': false }), 'disabled Exam Attendance blocks exam roster route');
  assert(!isTeacherRouteAllowed('/teacher/exams/123/paper', { 'teacher/exam-papers': false }), 'disabled Exam Papers blocks paper detail route');
  assert(isTeacherRouteAllowed('/teacher/exams/periods/123', { 'teacher/exam-attendance': false }), 'disabling Exam Attendance does not disable Exam Workspace');

  assert(!isTeacherRouteAllowed('/teacher/quizzes/create', { 'group:quizzes': false }), 'disabled Quiz Builder group blocks child routes');
  assert(!isTeacherRouteAllowed('/teacher/courses/abc/quizzes/q1/edit', { 'teacher/quizzes': false }), 'disabled quiz list blocks course quiz editor');

  assert(!isTeacherRouteAllowed('/teacher/gradebook/review', { 'group:gradebook': false }), 'disabled Gradebook group blocks review queue');
  assert(!isTeacherRouteAllowed('/teacher/courses/abc/gradebook', { 'teacher/gradebook': false }), 'disabled Submissions blocks course gradebook');
  assert(!isTeacherRouteAllowed('/teacher/results/enter', { 'teacher/results/enter': false }), 'disabled Result Entry blocks direct result entry');

  assert(requiredTeacherSidebarKeys('/teacher/new-unmapped-page') === null, 'unknown teacher route is not silently mapped');
  assert(!isTeacherRouteAllowed('/teacher/new-unmapped-page', {}), 'unknown teacher route fails closed');

  console.log('Teacher sidebar route-access regression passed.');
} finally {
  fs.rmSync(tempPath, { force: true });
}
