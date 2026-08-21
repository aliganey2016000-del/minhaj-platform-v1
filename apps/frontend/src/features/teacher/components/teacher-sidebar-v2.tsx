import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Teaching',
    items: [
      { path: '/teacher', label: 'Dashboard', icon: '🏠' },
      { path: '/teacher/courses', label: 'My Courses', icon: '📚' },
      { path: '/teacher/schedule', label: 'My Schedule', icon: '🕐' },
      { path: '/teacher/quizzes', label: 'Quizzes', icon: '❓' },
      { path: '/teacher/gradebook', label: 'Gradebook', icon: '📊' },
    ],
  },
  {
    title: 'Students',
    items: [
      { path: '/teacher/students', label: 'My Students', icon: '🎓' },
      { path: '/teacher/analytics', label: 'Class Analytics', icon: '📈' },
      { path: '/teacher/gamification', label: 'Gamification', icon: '🏆' },
    ],
  },
];

export function TeacherSidebarV2() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) =>
    path === '/teacher' ? location.pathname === path : location.pathname.startsWith(path);

  const content = (
    <aside className="flex h-full flex-col bg-[var(--color-surface-primary)] border-r border-[var(--color-border-subtle)]">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-border-subtle)]">
        <Link to="/teacher" onClick={() => setMobileOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm" aria-label="Teacher dashboard">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5z" />
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">Teacher Portal</p>
          <p className="text-xs text-[var(--color-text-tertiary)] truncate">{user?.email}</p>
        </div>
      </div>

      <nav aria-label="Teacher navigation" className="flex-1 overflow-y-auto py-4 px-3">
        {sections.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="px-3 mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
              {section.title}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-sm'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      <span className="w-7 text-center text-lg" aria-hidden="true">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--color-border-subtle)] px-3 py-3">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <span className="w-7 text-center text-lg" aria-hidden="true">🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 rounded-xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-2.5 shadow-lg lg:hidden"
        aria-label="Open teacher menu"
      >
        <svg className="h-5 w-5 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-64 z-40">{content}</div>

      {mobileOpen && (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85vw]">{content}</div>
        </div>
      )}
    </>
  );
}

export default TeacherSidebarV2;
