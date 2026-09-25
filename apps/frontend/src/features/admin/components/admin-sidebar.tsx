/** Admin portal navigation with tenant visibility and responsive collapse support. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, Award, BadgePercent, BarChart3, BookOpen, Building2,
  CalendarCheck, CalendarClock, CalendarRange, CircleHelp, ClipboardEdit,
  ClipboardList, Compass, CreditCard, Database, FileBarChart, FileCheck2, FileQuestion,
  FileText, GraduationCap, History, Image, KeyRound, LayoutDashboard, ListChecks, LogOut,
  Megaphone, MessagesSquare, Newspaper, NotebookPen, Palette, PanelLeftClose, PanelLeftOpen,
  PartyPopper, PieChart, Presentation, Receipt, School, ScrollText, Settings,
  ShieldCheck, Trash2, TrendingUp, User, UserCog, UserRound, Users, Zap,
} from 'lucide-react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

interface NavLeaf { path: string; label: string; icon: LucideIcon; key?: string; }
interface NavGroup { label: string; icon: LucideIcon; key?: string; children: NavLeaf[]; }
type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup { return 'children' in entry; }
function keyForPath(path: string): string { return path.replace(/^\//, ''); }

const navSections: { title: string; items: NavEntry[] }[] = [
  {
    title: 'INSTITUTION MANAGEMENT',
    items: [
      { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/admin/schools', label: 'Organization Management', icon: Building2 },
      { path: '/admin/hr?tab=structure', label: 'Institution Structure', icon: Building2 },
      { path: '/admin/users', label: 'User Management', icon: UserCog },
      { path: '/admin/teachers', label: 'Manage Teachers', icon: Presentation },
      { path: '/admin/students', label: 'Manage Students', icon: GraduationCap },
      { path: '/admin/parents', label: 'Manage Parents', icon: Users },
      { path: '/admin/courses', label: 'Manage Courses', icon: BookOpen },
      { path: '/admin/classes', label: 'Manage Classes', icon: School },
      { path: '/admin/activity', label: 'Student Activity', icon: Activity },
    ],
  },
  {
    title: 'Academic',
    items: [
      { path: '/admin/schedules', label: 'Class Schedules', icon: CalendarClock },
      { path: '/admin/attendance', label: 'Attendance', icon: CalendarCheck },
      {
        key: 'group:learning-assessments', label: 'Learning & Assessments', icon: BookOpen,
        children: [
          { path: '/admin/analytics', label: 'Overview', icon: BarChart3 },
          { path: '/admin/analytics?tab=lessons', label: 'Lessons', icon: BookOpen },
          { path: '/admin/analytics?tab=quizzes', label: 'Quizzes', icon: CircleHelp },
          { path: '/admin/analytics?tab=questions', label: 'Question Bank', icon: Database },
          { path: '/admin/assignments', label: 'Assignments', icon: ClipboardList },
          { path: '/admin/analytics?tab=performance', label: 'Learning Results', icon: TrendingUp },
        ],
      },
      {
        key: 'group:exam-management', label: 'Examinations', icon: NotebookPen,
        children: [
          { path: '/admin/exams', label: 'Overview', icon: LayoutDashboard },
          { path: '/admin/exams/schedule', label: 'Exam Schedule', icon: CalendarRange },
          { path: '/admin/results/enter', label: 'Marks Entry', icon: ClipboardEdit },
          { path: '/admin/exams/review', label: 'Review & Approval', icon: FileCheck2 },
          { path: '/admin/results', label: 'Results', icon: BarChart3 },
        ],
      },
      { path: '/admin/certificates', label: 'Certificates', icon: Award },
    ],
  },
  {
    title: 'Payments',
    items: [
      { path: '/admin/payments', label: 'Overview', icon: PieChart },
      { path: '/admin/payments/fee-structures', label: 'Fee Structures', icon: FileText },
      { path: '/admin/payments/invoices', label: 'Invoices', icon: Receipt },
      { path: '/admin/payments/record', label: 'Record Payment', icon: CreditCard },
      { path: '/admin/payments/bulk', label: 'Bulk Collect', icon: Zap },
      { path: '/admin/payments/balances', label: 'Student Balances', icon: BarChart3 },
      { path: '/admin/payments/discounts', label: 'Discounts & Scholarships', icon: BadgePercent },
      { path: '/admin/payments/history', label: 'Payment History', icon: History },
      { path: '/admin/payments/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
  {
    title: 'Communication',
    items: [
      { path: '/admin/forum', label: 'Forum', icon: MessagesSquare },
      { path: '/admin/whatsapp', label: 'WhatsApp', icon: MessagesSquare },
      { path: '/admin/telegram', label: 'Telegram', icon: MessagesSquare },
    ],
  },
  {
    title: 'Content',
    items: [
      { path: '/admin/announcements', label: 'Announcements', icon: Megaphone },
      { path: '/admin/news', label: 'News', icon: Newspaper },
      { path: '/admin/events', label: 'Events', icon: PartyPopper },
      { path: '/admin/gallery', label: 'Gallery', icon: Image },
    ],
  },
  {
    title: 'HR Management',
    items: [
      { path: '/admin/staff', label: 'Staff Directory', icon: UserRound },
      { path: '/admin/hr/access', label: 'Access & Permissions', icon: ShieldCheck },
    ],
  },
  {
    title: 'System',
    items: [
      { path: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck },
      { path: '/admin/settings', label: 'Settings', icon: Settings },
      { path: '/admin/settings/sidebar', label: 'Tenant Sidebar Config', icon: Compass },
      { path: '/admin/analytics?tab=overview', label: 'Institution Analytics', icon: TrendingUp },
      { path: '/admin/logs', label: 'Activity Logs', icon: ScrollText },
      { path: '/admin/trash', label: 'Trash', icon: Trash2 },
      { path: '/admin/profile', label: 'Profile', icon: User },
    ],
  },
];

function CollapsedGroupIcon({ item, active, isActive, onNavigate }: {
  item: NavGroup; active: boolean; isActive: (path: string) => boolean; onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!flyoutRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative">
      <button ref={buttonRef} type="button" title={item.label} aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`mb-0.5 flex w-full items-center justify-center rounded-xl p-2.5 transition-colors ${active || open ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
        <item.icon className="h-5 w-5" strokeWidth={1.75} />
      </button>
      {open && buttonRef.current && createPortal(
        <div ref={flyoutRef} style={{ position: 'fixed', top: buttonRef.current.getBoundingClientRect().top, left: buttonRef.current.getBoundingClientRect().right + 8, zIndex: 100 }} className="w-60 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-1.5 shadow-elevated">
          <p className="px-3.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{item.label}</p>
          {item.children.map((child) => <Link key={child.path} to={child.path} onClick={() => { setOpen(false); onNavigate(); }} className={`flex items-center gap-2.5 px-3.5 py-2 text-[13px] ${isActive(child.path) ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><child.icon className="h-4 w-4" /><span className="truncate">{child.label}</span></Link>)}
        </div>, document.body,
      )}
    </div>
  );
}

interface AdminSidebarProps { collapsed?: boolean; onToggleCollapsed?: () => void; }

export function AdminSidebar({ collapsed = false, onToggleCollapsed }: AdminSidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [organizationLogo, setOrganizationLogo] = useState('');
  const [visibility, setVisibility] = useState<Record<string, boolean> | null>(null);
  const isSuperAdmin = user?.role === 'admin';

  useEffect(() => {
    if (isSuperAdmin || !user?.role) return;
    (async () => {
      try {
        const { data } = await api.get('/sidebar-settings/mine', { params: { portal: 'admin' } });
        const map: Record<string, boolean> = {};
        for (const item of data.data?.items || []) map[item.key] = item.visible;
        setVisibility(map);
      } catch { setVisibility({}); }
    })();
  }, [isSuperAdmin, user?.role]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.organizationId || !['org_admin', 'teacher', 'staff'].includes(user.role)) {
      setOrganizationLogo('');
      return;
    }
    (async () => {
      try {
        const { data } = await api.get(`/schools/${user.organizationId}/branding`);
        if (!cancelled) setOrganizationLogo(data.data?.school?.branding?.logo || '');
      } catch { if (!cancelled) setOrganizationLogo(''); }
    })();
    return () => { cancelled = true; };
  }, [user?.organizationId, user?.role]);

  const isVisible = (key: string) => isSuperAdmin || visibility?.[key] !== false;
  const staffSidebar = (key: string) => user?.role !== 'staff' || user.sidebarAccess.includes(key);
  const staffRead = (module: string, page?: string) => user?.role !== 'staff' || user.permissions.some((permission) => permission.module === module && permission.actions.includes('read') && (!permission.page || permission.page === page));
  const moduleForPath = (path: string) => {
    if (/\/admin\/(payments|fee-structures|invoices)/.test(path)) return 'finance';
    if (/\/admin\/(exams|results|certificates)/.test(path)) return 'exams';
    if (/\/admin\/students/.test(path)) return 'admissions';
    if (/\/admin\/(courses|analytics|assignments)/.test(path)) return 'courses';
    return null;
  };

  const sections = navSections.map((section) => {
    if (section.title !== 'System') return section;
    const items = [...section.items];
    if (isSuperAdmin) items.push({ path: '/admin/settings/org-sidebar', label: 'Org Admin Sidebar Manager', icon: KeyRound } as NavLeaf);
    if (isSuperAdmin || user?.role === 'org_admin') items.push({ path: '/admin/settings/branding', label: 'Organization Branding', icon: Palette } as NavLeaf);
    return { ...section, items };
  }).map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (isGroup(item)) {
        if (item.key && (!isVisible(item.key) || !staffSidebar(item.key))) return null;
        const children = item.children.filter((child) => {
          const key = keyForPath(child.path);
          const module = moduleForPath(child.path);
          return isVisible(key) && staffSidebar(key) && (!module || staffRead(module, key));
        });
        return children.length ? { ...item, children } : null;
      }
      if (item.path === '/admin/website' && !['admin', 'org_admin'].includes(user?.role || '')) return null;
      const key = keyForPath(item.path);
      const module = moduleForPath(item.path);
      return isVisible(key) && staffSidebar(key) && (!module || staffRead(module, key)) ? item : null;
    }).filter((item): item is NavEntry => item !== null),
  })).filter((section) => section.items.length > 0);

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    if (path === '/admin/exams' || path === '/admin/results') return location.pathname === path;
    if (path.includes('?')) return `${location.pathname}${location.search}` === path;
    if (path === '/admin/analytics') return location.pathname === path && (!location.search || location.search === '?tab=learning');
    return location.pathname.startsWith(path);
  };
  const groupActive = (group: NavGroup) => group.children.some((child) => isActive(child.path));
  const sectionActive = (section: { items: NavEntry[] }) => section.items.some((item) => isGroup(item) ? groupActive(item) : isActive(item.path));

  const [openSection, setOpenSection] = useState<string | null>(() => navSections.find(sectionActive)?.title || null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    for (const section of navSections) for (const item of section.items) if (isGroup(item) && groupActive(item)) state[item.label] = true;
    return state;
  });

  useEffect(() => {
    const active = sections.find(sectionActive);
    if (active) setOpenSection(active.title);
    setOpenGroups((current) => {
      const next = { ...current };
      for (const section of sections) for (const item of section.items) if (isGroup(item) && groupActive(item)) next[item.label] = true;
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  const renderContent = (isCollapsed: boolean) => (
    <aside className="flex h-full flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
      <div className={`flex items-center gap-3 border-b border-[var(--color-border-subtle)] ${isCollapsed ? 'justify-center px-2 py-5' : 'px-5 py-5'}`}>
        <Link to="/" className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-gold-500 to-gold-700 text-white shadow-gold-sm">{organizationLogo ? <img src={organizationLogo} alt="Organization logo" className="h-full w-full bg-white object-contain p-1" onError={() => setOrganizationLogo('')} /> : <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5z" /></svg>}</Link>
        {!isCollapsed && <div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--color-text-primary)]">Admin Portal</p><p className="truncate text-xs text-[var(--color-text-tertiary)]">{user?.email}</p></div>}
      </div>
      {onToggleCollapsed && <button type="button" onClick={onToggleCollapsed} className={`hidden items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2.5 text-xs text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] lg:flex ${isCollapsed ? 'justify-center' : ''}`}>{isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /><span>Collapse</span></>}</button>}

      {isCollapsed ? (
        <nav className="hide-scrollbar flex-1 overflow-y-auto px-2 py-3">{sections.map((section, index) => <div key={section.title} className={index ? 'mt-2 border-t border-[var(--color-border-subtle)] pt-2' : ''}>{section.items.map((item) => isGroup(item) ? <CollapsedGroupIcon key={item.label} item={item} active={groupActive(item)} isActive={isActive} onNavigate={() => setIsMobileOpen(false)} /> : <Link key={item.path} to={item.path} title={item.label} className={`mb-0.5 flex items-center justify-center rounded-xl p-2.5 ${isActive(item.path) ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><item.icon className="h-5 w-5" /></Link>)}</div>)}</nav>
      ) : (
        <nav className="hide-scrollbar flex-1 overflow-y-auto px-3 py-3">{sections.map((section) => {
          const open = openSection === section.title;
          return <div key={section.title} className="mb-1"><button type="button" onClick={() => setOpenSection((value) => value === section.title ? null : section.title)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest ${sectionActive(section) ? 'text-primary-600 dark:text-primary-400' : 'text-[var(--color-text-tertiary)]'}`}><span className="flex-1 text-left">{section.title}</span><span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span></button><AnimatePresence initial={false}>{open && <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-3 space-y-0.5 overflow-hidden">{section.items.map((item) => {
            if (isGroup(item)) {
              const groupOpen = !!openGroups[item.label];
              return <li key={item.label}><button type="button" onClick={() => setOpenGroups((state) => ({ ...state, [item.label]: !state[item.label] }))} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium ${groupActive(item) ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><item.icon className="h-[18px] w-[18px]" /><span className="flex-1 truncate text-left">{item.label}</span><span className={`transition-transform ${groupOpen ? 'rotate-90' : ''}`}>›</span></button><AnimatePresence initial={false}>{groupOpen && <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="ml-4 mt-0.5 space-y-0.5 overflow-hidden border-l border-[var(--color-border-subtle)] pl-2">{item.children.map((child) => <li key={child.path}><Link to={child.path} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] ${isActive(child.path) ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><child.icon className="h-4 w-4" /><span className="truncate">{child.label}</span>{isActive(child.path) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500" />}</Link></li>)}</motion.ul>}</AnimatePresence></li>;
            }
            return <li key={item.path}><Link to={item.path} onClick={() => setIsMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] ${isActive(item.path) ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><item.icon className="h-[18px] w-[18px]" /><span className="truncate">{item.label}</span>{isActive(item.path) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500" />}</Link></li>;
          })}</motion.ul>}</AnimatePresence></div>;
        })}</nav>
      )}

      <div className="border-t border-[var(--color-border-subtle)] px-3 py-3"><button onClick={logout} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 ${isCollapsed ? 'justify-center' : ''}`}><LogOut className="h-[18px] w-[18px]" />{!isCollapsed && <span>Logout</span>}</button></div>
    </aside>
  );

  return <><button onClick={() => setIsMobileOpen(true)} className="fixed left-3 top-3 z-50 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2.5 shadow-lg lg:hidden" aria-label="Open menu"><span className="text-lg">☰</span></button><div className={`fixed bottom-0 left-0 top-0 z-40 hidden transition-[width] duration-200 lg:block ${collapsed ? 'w-[76px]' : 'w-72'}`}>{renderContent(collapsed)}</div><AnimatePresence>{isMobileOpen && <><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setIsMobileOpen(false)} /><motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 28, stiffness: 280 }} className="fixed bottom-0 left-0 top-0 z-50 w-72 max-w-[85vw] lg:hidden">{renderContent(false)}</motion.div></>}</AnimatePresence></>;
}

export default AdminSidebar;
