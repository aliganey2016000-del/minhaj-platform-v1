/**
 * Teacher Sidebar — Sandboxed Navigation
 *
 * Mirrors the AdminSidebar visual shell (Framer Motion, collapsible sections,
 * active highlighting) but restricts links to teacher-scoped routes ONLY.
 * No Financials, Tenant Settings, User Management, School Admin, or System Config.
 */

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Navigation Items — teacher-scoped only
// ---------------------------------------------------------------------------

interface NavLeaf { path: string; label: string; icon: string; key?: string; }
interface NavGroup { label: string; icon: string; key?: string; children: NavLeaf[]; }

type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

function keyForPath(path: string): string {
  return path.replace(/^\//, '');
}

const navSections: { title: string; items: NavEntry[] }[] = [
  {
    title: 'Teaching',
    items: [
      { path: '/teacher',              label: 'Dashboard',          icon: '🏠' },
      { path: '/teacher/courses',      label: 'My Courses',         icon: '📚' },
      { path: '/teacher/schedule',     label: 'My Schedule',        icon: '🕐' },
      { path: '/teacher/assignments',  label: 'Assignments',        icon: '📝' },
      {
        key: 'group:quizzes', label: 'Quiz Builder', icon: '❓',
        children: [
          { path: '/teacher/quizzes',            label: 'All Quizzes',         icon: '📋' },
          { path: '/teacher/quizzes/create',     label: 'Create Quiz',         icon: '➕' },
        ],
      },
      {
        key: 'group:gradebook', label: 'Gradebook', icon: '📊',
        children: [
          { path: '/teacher/gradebook',           label: 'Submissions',         icon: '📬' },
          { path: '/teacher/gradebook/review',    label: 'Review Queue',        icon: '🔍' },
        ],
      },
    ],
  },
  {
    title: 'Students',
    items: [
      { path: '/teacher/students',    label: 'My Students',       icon: '🎓' },
      { path: '/teacher/gamification',label: 'Gamification',      icon: '🏆' },
      { path: '/teacher/analytics',   label: 'Class Analytics',   icon: '📈' },
    ],
  },
  {
    title: 'Content',
    items: [
      { path: '/teacher/forum',       label: 'Forum',             icon: '💬' },
    ],
  },
  {
    title: 'Account',
    items: [
      { path: '/teacher/profile',     label: 'Profile',           icon: '👤' },
      { path: '/teacher/settings',    label: 'Settings',          icon: '⚙️' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeacherSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isTeacher = user?.role === 'teacher';

  const [visibility, setVisibility] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!isTeacher) return;
    (async () => {
      try {
        const { data } = await api.get('/sidebar-settings/mine', { params: { portal: 'admin' } });
        const items: { key: string; visible: boolean }[] = data.data?.items || [];
        const map: Record<string, boolean> = {};
        items.forEach((i) => { map[i.key] = i.visible; });
        setVisibility(map);
      } catch {
        setVisibility({});
      }
    })();
  }, [isTeacher]);

  const isVisible = (key: string) => visibility?.[key] !== false;

  const visibleSections = navSections
    .map((section) => ({
      title: section.title,
      items: section.items
        .map((item) => {
          if (isGroup(item)) {
            if (item.key && !isVisible(item.key)) return null;
            const children = item.children.filter((c) => isVisible(keyForPath(c.path)));
            return children.length > 0 ? { ...item, children } : null;
          }
          return isVisible(keyForPath(item.path)) ? item : null;
        })
        .filter((item): item is NavEntry => item !== null),
    }))
    .filter((section) => section.items.length > 0);

  const isActive = (path: string) => {
    if (path === '/teacher') return location.pathname === '/teacher';
    return location.pathname.startsWith(path);
  };

  const groupHasActiveChild = (group: NavGroup) => group.children.some((c) => isActive(c.path));
  const sectionHasActiveItem = (section: { items: NavEntry[] }) =>
    section.items.some((item) => (isGroup(item) ? groupHasActiveChild(item) : isActive(item.path)));

  const [openSection, setOpenSection] = useState<string | null>(() => {
    const active = navSections.find(sectionHasActiveItem);
    return active?.title ?? null;
  });

  const toggleSection = (title: string) => setOpenSection((prev) => (prev === title ? null : title));

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of navSections) {
      for (const item of section.items) {
        if (isGroup(item) && groupHasActiveChild(item)) initial[item.label] = true;
      }
    }
    return initial;
  });

  const toggleGroup = (label: string) => setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const sidebarContent = (
    <aside className="flex h-full flex-col bg-[var(--color-surface-primary)] border-r border-[var(--color-border-subtle)]">
      {/* Logo / Header */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-border-subtle)]">
        <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex-shrink-0 shadow-emerald-sm">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5z"/>
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">Teacher Portal</p>
          <p className="text-xs text-[var(--color-text-tertiary)] truncate">{user?.email}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 hide-scrollbar">
        {visibleSections.map((section) => {
          const sectionOpen = openSection === section.title;
          const sectionActive = sectionHasActiveItem(section);
          return (
            <div key={section.title} className="mb-1">
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  sectionActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
                aria-expanded={sectionOpen}
              >
                <span className="flex-1 text-start">{section.title}</span>
                <svg className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${sectionOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <AnimatePresence initial={false}>
                {sectionOpen && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-0.5 mb-3"
                  >
                    {section.items.map((item) => {
                      if (isGroup(item)) {
                        const open = !!openGroups[item.label];
                        const active = groupHasActiveChild(item);
                        return (
                          <li key={item.label}>
                            <button
                              type="button"
                              onClick={() => toggleGroup(item.label)}
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                                ${active
                                  ? 'text-emerald-700 dark:text-emerald-300'
                                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                                }`}
                              aria-expanded={open}
                            >
                              <span className="text-lg flex-shrink-0 w-7 text-center">{item.icon}</span>
                              <span className="truncate flex-1 text-left">{item.label}</span>
                              <svg className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                                  className="overflow-hidden ms-4 border-s border-[var(--color-border-subtle)] ps-2 mt-0.5 space-y-0.5"
                                >
                                  {item.children.map((child) => (
                                    <li key={child.path}>
                                      <Link
                                        to={child.path}
                                        onClick={() => setIsMobileOpen(false)}
                                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200
                                          ${isActive(child.path)
                                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-sm'
                                            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                                          }`}
                                      >
                                        <span className="text-base flex-shrink-0 w-6 text-center">{child.icon}</span>
                                        <span className="truncate">{child.label}</span>
                                        {isActive(child.path) && (
                                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                        )}
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
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                              ${isActive(item.path)
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-sm'
                                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                              }`}
                          >
                            <span className="text-lg flex-shrink-0 w-7 text-center">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                            {isActive(item.path) && (
                              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            )}
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
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <span className="text-lg flex-shrink-0 w-7 text-center">🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile Hamburger */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-3 left-3 z-50 rounded-xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-2.5 shadow-lg lg:hidden"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Desktop Sidebar (fixed) */}
      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-64 z-40">
        {sidebarContent}
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85vw] lg:hidden"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default TeacherSidebar;