/**
 * Parent Sidebar — Premium World-Class Navigation
 *
 * Parent portal with child-centered navigation:
 * - Collapsible mobile drawer (Framer Motion)
 * - Fixed desktop sidebar
 * - Active route highlighting
 * - Islamic green/gold premium accents
 */

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Navigation Items
// ---------------------------------------------------------------------------

const navItems = [
  { path: '/parent',              label: 'Dashboard',         icon: '🏠' },
  { path: '/parent/children',     label: 'My Children',       icon: '👨‍👩‍👧‍👦' },
  { path: '/parent/attendance',   label: 'Attendance',        icon: '📅' },
  { path: '/parent/results',      label: 'Results & Grades',  icon: '📊' },
  { path: '/parent/fees',         label: 'Fees & Payments',   icon: '💰' },
  { path: '/parent/teachers',     label: 'Teachers',          icon: '👨‍🏫' },
  { path: '/parent/events',       label: 'Events',     icon: '🎉' },
  { path: '/parent/forum',        label: 'Forum',             icon: '💬' },
  { path: '/parent/notifications',label: 'Notifications',     icon: '🔔' },
  { path: '/parent/messages',     label: 'Messages',          icon: '💬' },
  { path: '/parent/profile',      label: 'Profile',           icon: '👤' },
  { path: '/parent/settings',     label: 'Settings',          icon: '⚙️' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParentSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/parent') return location.pathname === '/parent';
    return location.pathname.startsWith(path);
  };

  const sidebarContent = (
    <aside className="flex h-full flex-col bg-[var(--color-surface-primary)] border-r border-[var(--color-border-subtle)]">
      {/* ── Logo / Header ── */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-border-subtle)]">
        <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-gold-600 text-white flex-shrink-0">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5z"/>
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">Parent Portal</p>
          <p className="text-xs text-[var(--color-text-tertiary)] truncate">{user?.email}</p>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 hide-scrollbar">
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                  ${isActive(item.path)
                    ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                  }`}
              >
                <span className="text-lg flex-shrink-0 w-7 text-center">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {isActive(item.path) && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Logout ── */}
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
      {/* ── Mobile Hamburger ── */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-3 left-3 z-50 rounded-xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] p-2.5 shadow-lg lg:hidden"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* ── Desktop Sidebar (fixed) ── */}
      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-64 z-40">
        {sidebarContent}
      </div>

      {/* ── Mobile Drawer ── */}
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

export default ParentSidebar;