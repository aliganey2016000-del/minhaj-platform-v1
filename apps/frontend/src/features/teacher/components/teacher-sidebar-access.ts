export type TeacherSidebarVisibility = Record<string, boolean>;

type RouteRule = {
  matches: (pathname: string) => boolean;
  keys: string[];
};

const starts = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const rules: RouteRule[] = [
  { matches: (p) => starts(p, '/teacher/global-courses'), keys: ['teacher/global-courses'] },
  { matches: (p) => p === '/teacher' || p === '/teacher/', keys: ['teacher'] },

  // Course-specific tools inherit the parent course access and, where
  // applicable, the feature menu that owns the capability.
  { matches: (p) => /^\/teacher\/courses\/[^/]+\/gradebook(?:\/|$)/.test(p), keys: ['teacher/courses', 'group:gradebook', 'teacher/gradebook'] },
  { matches: (p) => /^\/teacher\/courses\/[^/]+\/gate-report(?:\/|$)/.test(p), keys: ['teacher/courses', 'group:gradebook', 'teacher/gradebook'] },
  { matches: (p) => /^\/teacher\/courses\/[^/]+\/quizzes\/[^/]+\/edit(?:\/|$)/.test(p), keys: ['teacher/courses', 'group:quizzes', 'teacher/quizzes'] },
  { matches: (p) => starts(p, '/teacher/courses'), keys: ['teacher/courses'] },

  { matches: (p) => p === '/teacher/quizzes/create' || starts(p, '/teacher/quizzes/create'), keys: ['group:quizzes', 'teacher/quizzes/create'] },
  { matches: (p) => starts(p, '/teacher/quizzes'), keys: ['group:quizzes', 'teacher/quizzes'] },

  { matches: (p) => starts(p, '/teacher/gradebook/review'), keys: ['group:gradebook', 'teacher/gradebook/review'] },
  { matches: (p) => starts(p, '/teacher/gradebook'), keys: ['group:gradebook', 'teacher/gradebook'] },
  { matches: (p) => starts(p, '/teacher/results/enter'), keys: ['group:gradebook', 'teacher/results/enter'] },

  // Exam detail routes must respect the specific child control, not only the
  // generic /teacher/exams prefix.
  { matches: (p) => /^\/teacher\/exams\/[^/]+\/paper(?:\/|$)/.test(p), keys: ['group:teacher-exams', 'teacher/exam-papers'] },
  { matches: (p) => /^\/teacher\/exams\/[^/]+\/attendance(?:\/|$)/.test(p), keys: ['group:teacher-exams', 'teacher/exam-attendance'] },
  { matches: (p) => starts(p, '/teacher/exam-attendance'), keys: ['group:teacher-exams', 'teacher/exam-attendance'] },
  { matches: (p) => starts(p, '/teacher/exam-papers'), keys: ['group:teacher-exams', 'teacher/exam-papers'] },
  { matches: (p) => starts(p, '/teacher/exam-incidents'), keys: ['group:teacher-exams', 'teacher/exam-incidents'] },
  { matches: (p) => starts(p, '/teacher/exams'), keys: ['group:teacher-exams', 'teacher/exams'] },

  { matches: (p) => starts(p, '/teacher/attendance'), keys: ['teacher/attendance'] },
  { matches: (p) => starts(p, '/teacher/my-attendance'), keys: ['teacher/my-attendance'] },
  { matches: (p) => starts(p, '/teacher/assignments'), keys: ['teacher/assignments'] },
  { matches: (p) => starts(p, '/teacher/schedule'), keys: ['teacher/schedule'] },
  { matches: (p) => starts(p, '/teacher/students'), keys: ['teacher/students'] },
  { matches: (p) => starts(p, '/teacher/activity'), keys: ['teacher/activity'] },
  { matches: (p) => starts(p, '/teacher/gamification'), keys: ['teacher/gamification'] },
  { matches: (p) => starts(p, '/teacher/analytics'), keys: ['teacher/analytics'] },
  { matches: (p) => starts(p, '/teacher/forum'), keys: ['teacher/forum'] },
  { matches: (p) => starts(p, '/teacher/profile'), keys: ['teacher/profile'] },
  { matches: (p) => starts(p, '/teacher/settings'), keys: ['teacher/settings'] },
];

const fallbackCandidates: Array<{ path: string; keys: string[] }> = [
  { path: '/teacher', keys: ['teacher'] },
  { path: '/teacher/courses', keys: ['teacher/courses'] },
  { path: '/teacher/schedule', keys: ['teacher/schedule'] },
  { path: '/teacher/attendance', keys: ['teacher/attendance'] },
  { path: '/teacher/my-attendance', keys: ['teacher/my-attendance'] },
  { path: '/teacher/assignments', keys: ['teacher/assignments'] },
  { path: '/teacher/exams', keys: ['group:teacher-exams', 'teacher/exams'] },
  { path: '/teacher/exam-attendance', keys: ['group:teacher-exams', 'teacher/exam-attendance'] },
  { path: '/teacher/exam-papers', keys: ['group:teacher-exams', 'teacher/exam-papers'] },
  { path: '/teacher/exam-incidents', keys: ['group:teacher-exams', 'teacher/exam-incidents'] },
  { path: '/teacher/quizzes', keys: ['group:quizzes', 'teacher/quizzes'] },
  { path: '/teacher/quizzes/create', keys: ['group:quizzes', 'teacher/quizzes/create'] },
  { path: '/teacher/gradebook', keys: ['group:gradebook', 'teacher/gradebook'] },
  { path: '/teacher/gradebook/review', keys: ['group:gradebook', 'teacher/gradebook/review'] },
  { path: '/teacher/results/enter', keys: ['group:gradebook', 'teacher/results/enter'] },
  { path: '/teacher/students', keys: ['teacher/students'] },
  { path: '/teacher/activity', keys: ['teacher/activity'] },
  { path: '/teacher/gamification', keys: ['teacher/gamification'] },
  { path: '/teacher/analytics', keys: ['teacher/analytics'] },
  { path: '/teacher/forum', keys: ['teacher/forum'] },
  { path: '/teacher/profile', keys: ['teacher/profile'] },
  { path: '/teacher/settings', keys: ['teacher/settings'] },
  { path: '/teacher/global-courses', keys: ['teacher/global-courses'] },
];

export function requiredTeacherSidebarKeys(pathname: string): string[] | null {
  const rule = rules.find((candidate) => candidate.matches(pathname));
  return rule?.keys || null;
}

export function teacherSidebarKeysAllowed(keys: string[], visibility: TeacherSidebarVisibility): boolean {
  return keys.every((key) => visibility[key] !== false);
}

export function isTeacherRouteAllowed(pathname: string, visibility: TeacherSidebarVisibility): boolean {
  const keys = requiredTeacherSidebarKeys(pathname);
  // Fail closed for an unmapped /teacher route so newly-added pages cannot
  // accidentally bypass the tenant's Teacher Sidebar configuration.
  return !!keys && teacherSidebarKeysAllowed(keys, visibility);
}

export function firstAllowedTeacherRoute(visibility: TeacherSidebarVisibility): string | null {
  return fallbackCandidates.find((candidate) => teacherSidebarKeysAllowed(candidate.keys, visibility))?.path || null;
}
