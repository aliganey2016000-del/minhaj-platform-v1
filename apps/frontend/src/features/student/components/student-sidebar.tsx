/**
 * Student Sidebar — standard student navigation with responsive/RTL support.
 * Tenant-scoped visibility remains fail-open via /sidebar-settings/mine.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../lib/axios';

interface NavItem { path: string; label: string; icon: string; }
interface NavSection { title: string; items: NavItem[]; }

function keyForPath(path: string): string {
  return path.replace(/^\//, '');
}

export function StudentSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/sidebar-settings/mine');
        const items: { key: string; visible: boolean }[] = data.data?.items || [];
        const map: Record<string, boolean> = {};
        items.forEach((item) => { map[item.key] = item.visible; });
        setVisibility(map);
      } catch {
        setVisibility({});
      }
    })();
  }, []);

  const isVisible = (path: string) => visibility?.[keyForPath(path)] !== false;
  const navSections: NavSection[] = [
    {
      title: 'LEARNING',
      items: [
        { path: '/student/courses', label: 'Courses', icon: '📚' },
        { path: '/student/available', label: 'Browse Courses', icon: '🆕' },
        { path: '/student/schedule', label: 'Schedule', icon: '🕐' },
        { path: '/student/attendance', label: 'Attendance', icon: '📅' },
        { path: '/student/assignments', label: 'Assignments', icon: '📝' },
      ],
    },
    {
      title: 'EXAMS',
      items: [
        { path: '/student/exams', label: 'Exam Schedule', icon: '🗓️' },
        { path: '/student/exams/seating', label: 'Exam Seat', icon: '🪑' },
        { path: '/student/exams/attendance', label: 'Exam Attendance', icon: '✅' },
        { path: '/student/exams/results', label: 'Results', icon: '📊' },
        { path: '/student/exams/appeals', label: 'Appeals', icon: '⚖️' },
        { path: '/student/certificates', label: 'Certificates', icon: '🏆' },
      ],
    },
    {
      title: 'FINANCE',
      items: [{ path: '/student/payments', label: 'Fees & Payments', icon: '💰' }],
    },
    {
      title: 'COMMUNICATION',
      items: [
        { path: '/student/forum', label: 'Forum', icon: '💬' },
        { path: '/student/notifications', label: 'Notifications', icon: '🔔' },
      ],
    },
    {
      title: 'ACCOUNT',
      items: [
        { path: '/student/profile', label: 'Profile', icon: '👤' },
        { path: '/student/settings', label: 'Settings', icon: '⚙️' },
      ],
    },
  ];

  const visibleSections = navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => isVisible(item.path)) }))
    .filter((section) => section.items.length > 0);

  const isActive = (path: string) => {
    if (path === '/student') return location.pathname === '/student' || location.pathname === '/student/';
    if (path === '/student/exams') return location.pathname === '/student/exams' || location.pathname === '/student/exams/';
    return location.pathname.startsWith(path);
  };

  const sidebarContent = (
    <aside className="flex h-full flex-col border-e border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
      <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-5 py-5">
        <Link to="/" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5z" /></svg>
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--color-text-primary)]">Student Portal</p>
          <p className="truncate text-xs text-[var(--color-text-tertiary)]">{user?.email}</p>
        </div>
      </div>

      <nav className="hide-scrollbar flex-1 overflow-y-auto px-3 py-3">
        <Link
          to="/student"
          onClick={() => setIsMobileOpen(false)}
          className={`mb-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive('/student') ? 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-950/40 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'}`}
        >
          <span className="w-7 flex-shrink-0 text-center text-lg">🏠</span>
          <span>Dashboard</span>
        </Link>

        {visibleSections.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={() => setIsMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive(item.path) ? 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-950/40 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'}`}
                  >
                    <span className="w-7 flex-shrink-0 text-center text-lg">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                    {isActive(item.path) && <span className="ms-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-500" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--color-border-subtle)] px-3 py-3">
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
          <span className="w-7 text-center text-lg">🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="fixed inset-y-0 start-0 z-40 hidden w-64 lg:block">{sidebarContent}</div>
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        className="fixed start-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] shadow-sm lg:hidden"
        aria-label="Open student navigation"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close student navigation"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] lg:hidden"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default StudentSidebar;
