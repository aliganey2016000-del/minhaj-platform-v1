/**
 * Student Sidebar — Premium Responsive Navigation with RTL support
 * Section-grouped like admin sidebar, with active route highlighting
 * Uses logical CSS properties (start/end, ms/me, border-e) for Arabic RTL compatibility
 */

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../store/auth-context';
import { motion, AnimatePresence } from 'framer-motion';

export function StudentSidebar() {
  const { t } = useTranslation('common');
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navSections = [
    {
      title: t('learning'),
      items: [
        { path: '/student', label: t('student_dashboard'), icon: '🏠' },
        { path: '/student/courses', label: t('my_courses'), icon: '📚' },
        { path: '/student/available', label: t('browse_courses'), icon: '🆕' },
        { path: '/student/assignments', label: t('assignments'), icon: '📝' },
        { path: '/student/downloads', label: t('downloads'), icon: '📥' },
      ],
    },
    {
      title: t('performance'),
      items: [
        { path: '/student/exams', label: t('exams'), icon: '📖' },
        { path: '/student/attendance', label: t('attendance'), icon: '📅' },
        { path: '/student/certificates', label: t('certificates'), icon: '🏆' },
        { path: '/student/bookmarks', label: t('bookmarks'), icon: '🔖' },
      ],
    },
    {
      title: 'Communication',
      items: [
        { path: '/student/forum', label: 'Forum', icon: '💬' },
      ],
    },
    {
      title: t('account'),
      items: [
        { path: '/student/notifications', label: t('notifications'), icon: '🔔' },
        { path: '/student/profile', label: t('profile'), icon: '👤' },
        { path: '/student/settings', label: t('settings'), icon: '⚙️' },
      ],
    },
  ];

  const isActive = (path: string) => {
    if (path === '/student') return location.pathname === '/student';
    return location.pathname.startsWith(path);
  };

  const sidebarContent = (
    <aside className="flex h-full flex-col bg-[var(--color-surface-primary)] border-e border-[var(--color-border-subtle)]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-border-subtle)]">
        <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex-shrink-0 shadow-sm">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5z"/></svg>
        </Link>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{t('student_dashboard')}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] truncate">{user?.email}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 hide-scrollbar">
        {navSections.map(section => (
          <div key={section.title} className="mb-4">
            <p className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map(item => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={() => setIsMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      isActive(item.path)
                        ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 shadow-sm'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <span className="text-lg flex-shrink-0 w-7 text-center">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                    {isActive(item.path) && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-primary-500 flex-shrink-0" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="border-t border-[var(--color-border-subtle)] px-3 py-3">
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
          <span className="text-lg flex-shrink-0 w-7 text-center">🚪</span><span>{t('logout')}</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile burger — uses start-3 (logical start) for RTL auto-flip */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-3 start-3 z-50 rounded-xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-2.5 shadow-lg lg:hidden"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Desktop sidebar — uses start-0 (logical start) for RTL auto-flip */}
      <div className="hidden lg:block fixed top-0 start-0 bottom-0 w-64 z-40">{sidebarContent}</div>

      {/* Mobile drawer — uses start-0 for RTL */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed top-0 start-0 bottom-0 z-50 w-72 max-w-[85vw] lg:hidden"
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