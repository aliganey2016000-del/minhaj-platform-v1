/** Student Portal sidebar — artifact-inspired glass navigation with responsive/RTL support. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Armchair,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  CreditCard,
  FileText,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  Smartphone,
  TrendingUp,
  Trophy,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

interface NavItem { path: string; label: string; icon: LucideIcon; }
interface NavSection { title: string; icon: LucideIcon; items: NavItem[]; accent?: 'emerald' | 'slate'; }

function keyForPath(path: string): string { return path.replace(/^\//, ''); }

export function StudentSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean> | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);

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

  const isVisible = (path: string) => {
    const key = keyForPath(path);
    if (key.startsWith('student/exams') && visibility?.['group:exams'] === false) return false;
    return visibility?.[key] !== false;
  };

  const navSections: NavSection[] = useMemo(() => [
    {
      title: 'Guuldoon',
      icon: Trophy,
      accent: 'emerald',
      items: [
        { path: '/student/global-courses', label: 'Courses', icon: BookOpen },
        { path: '/student/guuldoon/performance', label: 'My Progress', icon: TrendingUp },
        { path: '/student/guuldoon/subscriptions', label: 'My Subscription', icon: CreditCard },
        { path: '/student/guuldoon/devices', label: 'My Device', icon: Smartphone },
      ],
    },
    {
      title: 'Learning',
      icon: GraduationCap,
      items: [
        { path: '/student/courses', label: 'Courses', icon: Library },
        { path: '/student/available', label: 'Browse Courses', icon: Search },
        { path: '/student/schedule', label: 'Schedule', icon: Clock3 },
        { path: '/student/attendance', label: 'Attendance', icon: ClipboardCheck },
        { path: '/student/assignments', label: 'Assignments', icon: FileText },
      ],
    },
    {
      title: 'Results & Performance',
      icon: BarChart3,
      items: [
        { path: '/student/exams', label: 'Exam Schedule', icon: CalendarDays },
        { path: '/student/exams/active', label: 'Active Exams', icon: FlaskConical },
        { path: '/student/exams/seating', label: 'Seat & Hall', icon: Armchair },
        { path: '/student/exams/attendance', label: 'Attendance History', icon: ClipboardCheck },
        { path: '/student/exams/results', label: 'Exam Results & Grades', icon: BarChart3 },
        { path: '/student/analytics', label: 'Quiz & Lesson Performance', icon: TrendingUp },
        { path: '/student/exams/appeals', label: 'Academic Appeals', icon: FileText },
        { path: '/student/certificates', label: 'Certificates', icon: Award },
      ],
    },
    {
      title: 'Finance',
      icon: WalletCards,
      items: [{ path: '/student/payments', label: 'Fees & Payments', icon: CreditCard }],
    },
    {
      title: 'Communication',
      icon: MessageCircle,
      items: [
        { path: '/student/forum', label: 'Forum', icon: MessageCircle },
        { path: '/student/notifications', label: 'Notifications', icon: Bell },
      ],
    },
    {
      title: 'Account',
      icon: UserRound,
      items: [
        { path: '/student/profile', label: 'Profile', icon: UserRound },
        { path: '/student/settings', label: 'Settings', icon: Settings },
      ],
    },
  ], []);

  const visibleSections = navSections
    .filter(section => section.title !== 'Guuldoon' || visibility?.['group:guuldoon'] !== false)
    .map(section => ({ ...section, items: section.items.filter(item => isVisible(item.path)) }))
    .filter(section => section.items.length > 0);

  const isActive = (path: string) => {
    if (path === '/student') return location.pathname === '/student' || location.pathname === '/student/';
    if (path === '/student/exams') return location.pathname === '/student/exams' || location.pathname === '/student/exams/';
    return location.pathname.startsWith(path);
  };
  const sectionActive = (section: NavSection) => section.items.some(item => isActive(item.path));

  useEffect(() => {
    const active = navSections.find(section => section.items.some(item => {
      if (item.path === '/student/exams') return location.pathname === '/student/exams' || location.pathname === '/student/exams/';
      return location.pathname.startsWith(item.path);
    }));
    if (active) setOpenSection(active.title);
  }, [location.pathname, navSections]);

  const closeMobile = () => setIsMobileOpen(false);
  const toggleSection = (title: string) => setOpenSection(current => current === title ? null : title);
  const orgName = user?.organizationName || 'Sahal Education';
  const orgLogo = user?.organizationLogo || '';
  const firstName = user?.firstName || user?.email?.split('@')[0] || 'Student';

  const sidebarContent = (
    <aside className="student-sidebar-surface flex h-full flex-col border-e border-[var(--color-border-subtle)]">
      <div className="px-4 pb-3 pt-5">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] p-3">
          <Link to="/" onClick={closeMobile} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 shadow-[0_8px_28px_rgba(16,185,129,.18)]">
            {orgLogo ? <img src={orgLogo} alt="" className="h-full w-full bg-white object-contain p-1" /> : <GraduationCap className="h-5 w-5" strokeWidth={2.2} />}
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-black uppercase tracking-[.18em] text-emerald-500">Student Portal</p>
            <p className="truncate text-sm font-black text-[var(--color-text-primary)]">{orgName}</p>
          </div>
        </div>
      </div>

      <nav className="hide-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {visibility?.student !== false && (
          <Link
            to="/student"
            onClick={closeMobile}
            className={`student-sidebar-link mb-2 ${isActive('/student') ? 'student-sidebar-link-active' : ''}`}
          >
            <span className="student-sidebar-icon"><LayoutDashboard className="h-[18px] w-[18px]" /></span>
            <span className="flex-1">Dashboard</span>
            {isActive('/student') && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.9)]" />}
          </Link>
        )}

        {visibleSections.map(section => {
          const open = openSection === section.title;
          const active = sectionActive(section);
          const SectionIcon = section.icon;
          return (
            <div key={section.title} className="mb-1.5">
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                aria-expanded={open}
                className={`student-sidebar-section ${active ? 'student-sidebar-section-active' : ''}`}
              >
                <span className={`student-sidebar-icon ${section.accent === 'emerald' ? 'text-emerald-400' : ''}`}>
                  <SectionIcon className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-start">{section.title}</span>
                <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="ms-5 mt-1.5 space-y-1 overflow-hidden border-s border-emerald-400/10 ps-2"
                  >
                    {section.items.map(item => {
                      const ItemIcon = item.icon;
                      const itemActive = isActive(item.path);
                      return (
                        <li key={item.path}>
                          <Link
                            to={item.path}
                            onClick={closeMobile}
                            className={`student-sidebar-link py-2.5 ${itemActive ? 'student-sidebar-link-active' : ''}`}
                          >
                            <span className="student-sidebar-icon"><ItemIcon className="h-4 w-4" /></span>
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {itemActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
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

      <div className="border-t border-[var(--color-border-subtle)] p-3">
        <div className="mb-2 flex items-center gap-3 rounded-2xl bg-[var(--color-surface-tertiary)]/70 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-xs font-black text-emerald-400">
            {firstName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[var(--color-text-primary)]">{firstName}</p>
            <p className="truncate text-[10px] text-[var(--color-text-tertiary)]">{user?.email}</p>
          </div>
        </div>
        <button onClick={logout} className="student-sidebar-link w-full text-red-400 hover:!bg-red-500/10 hover:!text-red-300">
          <span className="student-sidebar-icon"><LogOut className="h-[18px] w-[18px]" /></span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="fixed inset-y-0 start-0 z-40 hidden w-72 lg:block">{sidebarContent}</div>

      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        className="student-mobile-menu fixed start-4 top-3.5 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] shadow-lg lg:hidden"
        aria-label="Open student navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close student navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMobile}
              className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed inset-y-0 start-0 z-50 w-72 max-w-[88vw] lg:hidden"
            >
              <button
                type="button"
                onClick={closeMobile}
                className="absolute end-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]"
                aria-label="Close student navigation"
              >
                <X className="h-4 w-4" />
              </button>
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default StudentSidebar;
