/**
 * Admin Sidebar — Premium World-Class Navigation
 *
 * Full admin portal navigation with:
 * - Collapsible mobile drawer (Framer Motion spring)
 * - Fixed desktop sidebar
 * - Collapsible nested sub-menus (e.g. Exam Management)
 * - Active route highlighting
 * - Islamic green/gold premium accents
 * - Section grouping for main management, content, and system
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../lib/axios';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, GraduationCap, Activity, Users, UserCog, Presentation, BookOpen, UserRound,
  Building2, School, CalendarClock, CalendarCheck, ClipboardList, NotebookPen,
  CalendarRange, Building, CheckCircle2, FileCheck2, BarChart3, AlertTriangle,
  PieChart, CreditCard, History, Zap, Award, MessagesSquare, Megaphone,
  Newspaper, PartyPopper, Image, ShieldCheck, Settings, Compass, TrendingUp,
  ScrollText, User, KeyRound, LogOut, Percent, ClipboardEdit, PanelLeftClose, PanelLeftOpen,
  Trash2, FileText, Receipt, FileBarChart, BadgePercent, Landmark,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Navigation Items — grouped by section; items may nest a `children` list
// to render as a collapsible sub-menu instead of a direct link. Icons are
// lucide-react components (uniform stroke width/size), not emoji.
// ---------------------------------------------------------------------------

interface NavLeaf { path: string; label: string; icon: LucideIcon; key?: string; }
interface NavGroup { label: string; icon: LucideIcon; key?: string; children: NavLeaf[]; }
type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

/** Strips the leading /admin/ (or /admin) to match the backend's sidebar-item key format. */
function keyForPath(path: string): string {
  return path.replace(/^\//, '');
}

const navSections: { title: string; items: NavEntry[] }[] = [
  {
    title: 'Main',
    items: [
      { path: '/admin',              label: 'Dashboard',          icon: LayoutDashboard },
      { path: '/admin/students',     label: 'Manage Students',    icon: GraduationCap },
      { path: '/admin/activity',     label: 'Student Activity',   icon: Activity },
      { path: '/admin/parents',      label: 'Manage Parents',     icon: Users },
      { path: '/admin/teachers',     label: 'Manage Teachers',    icon: Presentation },
      { path: '/admin/staff',        label: 'Manage Staff',       icon: UserRound },
      { path: '/admin/courses',      label: 'Manage Courses',     icon: BookOpen },
      { path: '/admin/schools',      label: 'Organization Management',  icon: Building2 },
      { path: '/admin/users',        label: 'User Management',    icon: UserCog },
      { path: '/admin/classes',      label: 'Manage Classes',     icon: School },
    ],
  },
  {
    title: 'Academic',
    items: [
      { path: '/admin/schedules',    label: 'Class Schedules',    icon: CalendarClock },
      { path: '/admin/attendance',   label: 'Attendance',         icon: CalendarCheck },
      { path: '/admin/assignments',  label: 'Manage Assignments', icon: ClipboardList },
      {
        key: 'group:exam-management', label: 'Exam Management', icon: NotebookPen,
        children: [
          { path: '/admin/exams',             label: 'Exam Scheduling',      icon: CalendarRange },
          { path: '/admin/exams/rooms',        label: 'Room Allocation',      icon: Building },
          { path: '/admin/exams/attendance',   label: 'Exam Attendance',      icon: CheckCircle2 },
          { path: '/admin/exams/papers',       label: 'Papers & Approval',    icon: FileCheck2 },
          { path: '/admin/results',           label: 'View Results',         icon: BarChart3 },
          { path: '/admin/results/enter',      label: 'Enter Results',        icon: ClipboardEdit },
          { path: '/admin/exams/compliance',   label: 'Compliances & Issues', icon: AlertTriangle },
          { path: '/admin/exams/grading-rules', label: 'Grading Rules',      icon: Percent },
        ],
      },
      { path: '/admin/certificates', label: 'Certificates',       icon: Award },
    ],
  },
  {
    title: 'Payments',
    items: [
      { path: '/admin/payments',                label: 'Overview',         icon: PieChart },
      { path: '/admin/payments/fee-structures', label: 'Fee Structures',  icon: FileText },
      { path: '/admin/payments/invoices',       label: 'Invoices',        icon: Receipt },
      { path: '/admin/payments/record',         label: 'Record Payment',  icon: CreditCard },
      { path: '/admin/payments/bulk',           label: 'Bulk Collect',    icon: Zap },
      { path: '/admin/payments/balances',       label: 'Student Balances', icon: BarChart3 },
      { path: '/admin/payments/discounts',      label: 'Discounts & Scholarships', icon: BadgePercent },
      { path: '/admin/payments/history',        label: 'Payment History', icon: History },
      { path: '/admin/payments/reports',        label: 'Reports',         icon: FileBarChart },
      { path: '/admin/payments?view=accounting', label: 'Accounting Center', icon: Landmark },
    ],
  },
  {
    title: 'Communication',
    items: [
      { path: '/admin/forum',        label: 'Forum',              icon: MessagesSquare },
      { path: '/admin/whatsapp',     label: 'WhatsApp',           icon: MessagesSquare },
      { path: '/admin/telegram',     label: 'Telegram',           icon: MessagesSquare },
    ],
  },
  {
    title: 'Content',
    items: [
      { path: '/admin/announcements',label: 'Announcements',      icon: Megaphone },
      { path: '/admin/news',         label: 'News',               icon: Newspaper },
      { path: '/admin/events',       label: 'Events',             icon: PartyPopper },
      { path: '/admin/gallery',      label: 'Gallery',            icon: Image },
    ],
  },
  {
    title: 'System',
    items: [
      { path: '/admin/roles',        label: 'Roles & Permissions',icon: ShieldCheck },
      { path: '/admin/settings',     label: 'Settings',           icon: Settings },
      { path: '/admin/settings/sidebar', label: 'Tenant Sidebar Config', icon: Compass },
      { path: '/admin/analytics',    label: 'Analytics',          icon: TrendingUp },
      { path: '/admin/logs',         label: 'Activity Logs',      icon: ScrollText },
      { path: '/admin/trash',        label: 'Trash',              icon: Trash2 },
      { path: '/admin/profile',      label: 'Profile',            icon: User },
    ],
  },
];

// ---------------------------------------------------------------------------
// Collapsed-mode group icon — a bare icon button that opens a flyout
// popover (portaled, positioned off its own rect) listing the group's
// children, since there's no room for an inline accordion at icon width.
// ---------------------------------------------------------------------------

function CollapsedGroupIcon({ item, active, isActive, onNavigate }: {
  item: NavGroup; active: boolean; isActive: (path: string) => boolean; onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={item.label}
        aria-expanded={open}
        className={`flex w-full items-center justify-center rounded-xl p-2.5 mb-0.5 transition-colors ${
          active || open
            ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        <item.icon className="h-5 w-5 flex-shrink-0" strokeWidth={1.75} />
      </button>
      {open && btnRef.current && createPortal(
        <div
          ref={flyoutRef}
          style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().top, left: btnRef.current.getBoundingClientRect().right + 8, zIndex: 100 }}
          className="w-56 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated py-1.5"
        >
          <p className="px-3.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{item.label}</p>
          {item.children.map((child) => (
            <Link
              key={child.path}
              to={child.path}
              onClick={() => { setOpen(false); onNavigate(); }}
              className={`flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors ${
                isActive(child.path)
                  ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-semibold'
                  : 'font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <child.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              <span className="truncate">{child.label}</span>
            </Link>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AdminSidebarProps {
  /** Icon-only desktop rail instead of the full 288px sidebar — mobile drawer ignores this and always renders expanded. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function AdminSidebar({ collapsed = false, onToggleCollapsed }: AdminSidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isSuperAdmin = user?.role === 'admin';
  const hasStaffRead = (module: string, page?: string) => user?.role !== 'staff' || user.permissions.some((permission) => (
    permission.module === module && permission.actions.includes('read') && (!permission.page || permission.page === page)
  ));
  const moduleForPath = (path: string) => {
    if (/\/admin\/(payments|fee-structures|invoices)/.test(path)) return 'finance';
    if (/\/admin\/(exams|results|certificates)/.test(path)) return 'exams';
    if (/\/admin\/students/.test(path)) return 'admissions';
    if (/\/admin\/courses/.test(path)) return 'courses';
    return null;
  };

  // Tenant-scoped visibility for org_admin/teacher, configured by a super
  // admin via the Org Admin Sidebar Manager. Super admin always sees
  // everything unfiltered — they're not scoped to any org's restrictions.
  const [visibility, setVisibility] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (isSuperAdmin || !user?.role) return;
    (async () => {
      try {
        const { data } = await api.get('/sidebar-settings/mine', { params: { portal: 'admin' } });
        const items: { key: string; visible: boolean }[] = data.data?.items || [];
        const map: Record<string, boolean> = {};
        items.forEach((i) => { map[i.key] = i.visible; });
        setVisibility(map);
      } catch {
        setVisibility({}); // fail-open — show everything if settings can't be loaded
      }
    })();
  }, [isSuperAdmin, user?.role]);

  const isVisible = (key: string) => isSuperAdmin || visibility?.[key] !== false;
  const hasStaffSidebarAccess = (key: string) => user?.role !== 'staff' || user.sidebarAccess.includes(key);

  // Super admin gets one extra System item: the tool that configures other
  // orgs' admin/teacher sidebars. org_admin/teacher never see it.
  const effectiveSections: { title: string; items: NavEntry[] }[] = navSections.map((section) => {
    if (section.title !== 'System' || !isSuperAdmin) return section;
    return {
      ...section,
      items: [
        ...section.items,
        { path: '/admin/settings/org-sidebar', label: 'Org Admin Sidebar Manager', icon: KeyRound } as NavLeaf,
      ],
    };
  });

  const visibleSections = effectiveSections
    .map((section) => ({
      title: section.title,
      items: section.items
        .map((item) => {
          if (isGroup(item)) {
            if (item.key && (!isVisible(item.key) || !hasStaffSidebarAccess(item.key))) return null;
            const children = item.children.filter((c) => isVisible(keyForPath(c.path)) && hasStaffSidebarAccess(keyForPath(c.path)) && (!moduleForPath(c.path) || hasStaffRead(moduleForPath(c.path)!, keyForPath(c.path))));
            return children.length > 0 ? { ...item, children } : null;
          }
          return isVisible(keyForPath(item.path)) && hasStaffSidebarAccess(keyForPath(item.path)) && (!moduleForPath(item.path) || hasStaffRead(moduleForPath(item.path)!, keyForPath(item.path))) ? item : null;
        })
        .filter((item): item is NavEntry => item !== null),
    }))
    .filter((section) => section.items.length > 0);

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    if (path.includes('?')) return `${location.pathname}${location.search}` === path;
    return location.pathname.startsWith(path);
  };

  const groupHasActiveChild = (group: NavGroup) => group.children.some((c) => isActive(c.path));
  const sectionHasActiveItem = (section: { items: NavEntry[] }) =>
    section.items.some((item) => (isGroup(item) ? groupHasActiveChild(item) : isActive(item.path)));

  // ── Section accordion: at most one section open at a time ──
  const [openSection, setOpenSection] = useState<string | null>(() => {
    const active = navSections.find(sectionHasActiveItem);
    return active?.title ?? null;
  });

  const toggleSection = (title: string) => setOpenSection((prev) => (prev === title ? null : title));

  // ── Nested group accordion (independent per group) ──
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

  function renderSidebarContent(isCollapsed: boolean) {
    return (
    <aside className="flex h-full flex-col bg-[var(--color-surface-primary)] border-r border-[var(--color-border-subtle)]">
      {/* ── Logo / Header ── */}
      <div className={`flex items-center gap-3 border-b border-[var(--color-border-subtle)] ${isCollapsed ? 'justify-center px-2 py-5' : 'px-5 py-5'}`}>
        <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-gold-700 text-white flex-shrink-0 shadow-gold-sm">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5z"/>
          </svg>
        </Link>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">Admin Portal</p>
            <p className="text-xs text-[var(--color-text-tertiary)] truncate">{user?.email}</p>
          </div>
        )}
      </div>

      {/* ── Collapse toggle — desktop only (mobile drawer never passes isCollapsed) ── */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden lg:flex items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2.5 text-xs font-medium text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors ${isCollapsed ? 'justify-center' : ''}`}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} /> : <><PanelLeftClose className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} /><span>Collapse</span></>}
        </button>
      )}

      {/* ── Navigation ── */}
      {isCollapsed ? (
        <nav className="flex-1 overflow-y-auto py-3 px-2 hide-scrollbar">
          {visibleSections.map((section, si) => (
            <div key={section.title} className={si > 0 ? 'mt-2 pt-2 border-t border-[var(--color-border-subtle)]' : ''}>
              {section.items.map((item) => {
                if (isGroup(item)) {
                  return (
                    <CollapsedGroupIcon key={item.label} item={item} active={groupHasActiveChild(item)} isActive={isActive} onNavigate={() => setIsMobileOpen(false)} />
                  );
                }
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileOpen(false)}
                    title={item.label}
                    className={`flex items-center justify-center rounded-xl p-2.5 mb-0.5 transition-colors ${
                      isActive(item.path)
                        ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" strokeWidth={1.75} />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      ) : (
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
                  sectionActive ? 'text-primary-600 dark:text-primary-400' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
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
                              title={item.label}
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200
                                ${active
                                  ? 'text-primary-700 dark:text-primary-300'
                                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                                }`}
                              aria-expanded={open}
                            >
                              <item.icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.75} />
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
                                        title={child.label}
                                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-all duration-200
                                          ${isActive(child.path)
                                            ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-semibold'
                                            : 'font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                                          }`}
                                      >
                                        <child.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
                                        <span className="truncate">{child.label}</span>
                                        {isActive(child.path) && (
                                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500 flex-shrink-0" />
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
                            title={item.label}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all duration-200
                              ${isActive(item.path)
                                ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-semibold'
                                : 'font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]'
                              }`}
                          >
                            <item.icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.75} />
                            <span className="truncate">{item.label}</span>
                            {isActive(item.path) && (
                              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500 flex-shrink-0" />
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
      )}

      {/* ── Logout ── */}
      <div className="border-t border-[var(--color-border-subtle)] px-3 py-3">
        <button
          onClick={logout}
          title="Logout"
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.75} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
    );
  }

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
      <div className={`hidden lg:block fixed top-0 left-0 bottom-0 z-40 transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-72'}`}>
        {renderSidebarContent(collapsed)}
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
              {renderSidebarContent(false)}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default AdminSidebar;
