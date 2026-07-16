/**
 * Student Sidebar — Premium Responsive Navigation with RTL support
 *
 * Accordion behavior: parent menus (Learning, Performance, Communication,
 * Account) are collapsed by default — only their titles show. Clicking one
 * expands it and auto-collapses whichever other section was open, so at
 * most one section is expanded at a time. The section containing the
 * current route auto-expands on load.
 *
 * Tenant-scoped visibility: items can be hidden per-organization by an
 * admin via the Sidebar Settings manager (GET /sidebar-settings/mine).
 * Items with no override are visible by default (fail-open).
 *
 * Uses logical CSS properties (start/end, ms/me, border-e) for Arabic RTL compatibility.
 */

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../store/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../lib/axios';

interface NavLeaf { path: string; label: string; icon: string; }
interface NavGroup { key: string; label: string; icon: string; children: NavLeaf[]; }
type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

/** Strips the leading slash to match the backend's sidebar-item key format. */
function keyForPath(path: string): string {
  return path.replace(/^\//, '');
}

export function StudentSidebar() {
  const { t } = useTranslation('common');
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
        items.forEach((i) => { map[i.key] = i.visible; });
        setVisibility(map);
      } catch {
        setVisibility({}); // fail-open — show everything if settings can't be loaded
      }
    })();
  }, []);

  const isVisible = (key: string) => visibility?.[key] !== false;

  const navSections: { title: string; items: NavEntry[] }[] = [
    {
      title: t('learning'),
      items: [
        { path: '/student/courses', label: t('my_courses'), icon: '📚' },
        { path: '/student/schedule', label: 'My Schedule', icon: '🕐' },
        { path: '/student/available', label: t('browse_courses'), icon: '🆕' },
        { path: '/student/assignments', label: t('assignments'), icon: '📝' },
        { path: '/student/downloads', label: t('downloads'), icon: '📥' },
      ],
    },
    {
      title: t('performance'),
      items: [
        {
          key: 'group:exams', label: t('exams'), icon: '📖',
          children: [
            { path: '/student/exams',            label: 'My Exam Schedule',       icon: '🗓️' },
            { path: '/student/exams/seating',     label: 'Seat & Hall Allocation', icon: '🪑' },
            { path: '/student/exams/active',      label: 'Active Exams',           icon: '⏱️' },
            { path: '/student/exams/attendance',  label: 'Attendance History',     icon: '✅' },
            { path: '/student/exams/results',     label: 'Exam Results & Grades',  icon: '📊' },
            { path: '/student/exams/appeals',     label: 'Academic Appeals',       icon: '⚖️' },
          ],
        },
        { path: '/student/attendance', label: t('attendance'), icon: '📅' },
        { path: '/student/certificates', label: t('certificates'), icon: '🏆' },
        { path: '/student/bookmarks', label: t('bookmarks'), icon: '🔖' },
        { path: '/student/payments', label: 'My Fees & Payments', icon: '💰' },
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

  // Apply tenant visibility: drop hidden leaves, hidden groups, and any
  // group left with no visible children; drop sections left with no items.
  const visibleSections = navSections
    .map((section) => ({
      title: section.title,
      items: section.items
        .map((item) => {
          if (isGroup(item)) {
            if (!isVisible(item.key)) return null;
            const children = item.children.filter((c) => isVisible(keyForPath(c.path)));
            return children.length > 0 ? { ...item, children } : null;
          }
          return isVisible(keyForPath(item.path)) ? item : null;
        })
        .filter((item): item is NavEntry => item !== null),
    }))
    .filter((section) => section.items.length > 0);

  const isActive = (path: string) => {
    if (path === '/student') return location.pathname === '/student';
    return location.pathname.startsWith(path);
  };

  const groupHasActiveChild = (group: NavGroup) => group.children.some((c) => isActive(c.path));
  const sectionHasActiveItem = (section: { items: NavEntry[] }) =>
    section.items.some((item) => (isGroup(item) ? groupHasActiveChild(item) : isActive(item.path)));

  // ── Accordion state: at most one section open, at most one group open ──
  const [openSection, setOpenSection] = useState<string | null>(() => {
    const active = navSections.find(sectionHasActiveItem);
    return active?.title ?? null;
  });
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (isGroup(item) && groupHasActiveChild(item)) return item.key;
      }
    }
    return null;
  });

  const toggleSection = (title: string) => setOpenSection((prev) => (prev === title ? null : title));
  const toggleGroup = (key: string) => setOpenGroup((prev) => (prev === key ? null : key));

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
        {/* Dashboard — always visible, not part of the accordion */}
        <Link
          to="/student"
          onClick={() => setIsMobileOpen(false)}
          className={`mb-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            isActive('/student')
              ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <span className="text-lg flex-shrink-0 w-7 text-center">🏠</span>
          <span className="truncate">{t('student_dashboard')}</span>
        </Link>

        {visibleSections.map((section) => {
          const open = openSection === section.title;
          const active = sectionHasActiveItem(section);
          return (
            <div key={section.title} className="mb-1">
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  active ? 'text-primary-600 dark:text-primary-400' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
                aria-expanded={open}
              >
                <span className="flex-1 text-start">{section.title}</span>
                <svg className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-0.5 mb-3"
                  >
                    {section.items.map((item) => {
                      if (isGroup(item)) {
                        const groupOpen = openGroup === item.key;
                        const groupActive = groupHasActiveChild(item);
                        return (
                          <li key={item.key}>
                            <button
                              type="button"
                              onClick={() => toggleGroup(item.key)}
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                                groupActive
                                  ? 'text-primary-700 dark:text-primary-300'
                                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                              }`}
                              aria-expanded={groupOpen}
                            >
                              <span className="text-lg flex-shrink-0 w-7 text-center">{item.icon}</span>
                              <span className="truncate flex-1 text-start">{item.label}</span>
                              <svg className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${groupOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                            <AnimatePresence initial={false}>
                              {groupOpen && (
                                <motion.ul
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden ms-4 border-s border-[var(--color-border-subtle)] ps-2 mt-0.5 space-y-0.5"
                                >
                                  {item.children.map((child) => (
                                    <li key={child.path}>
                                      <Link
                                        to={child.path}
                                        onClick={() => setIsMobileOpen(false)}
                                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                                          isActive(child.path)
                                            ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 shadow-sm'
                                            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                                        }`}
                                      >
                                        <span className="text-base flex-shrink-0 w-6 text-center">{child.icon}</span>
                                        <span className="truncate">{child.label}</span>
                                        {isActive(child.path) && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-primary-500 flex-shrink-0" />}
                                      </Link>
                                    </li>
                                  ))}
                                </motion.ul>
                              )}
                            </AnimatePresence>
                          </li>
                        );
                      }

                      return (
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
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          );
        })}
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
