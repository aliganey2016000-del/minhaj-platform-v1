import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

interface NavLeaf { path: string; label: string; icon: string; }
interface NavGroup { label: string; icon: string; key: string; children: NavLeaf[]; }
type NavEntry = NavLeaf | NavGroup;
const isGroup = (x: NavEntry): x is NavGroup => 'children' in x;
const pathKey = (path: string) => path.replace(/^\//, '');

const navSections: { title: string; items: NavEntry[] }[] = [
  { title: 'Teaching', items: [
    { path: '/teacher', label: 'Dashboard', icon: '🏠' },
    { path: '/teacher/courses', label: 'My Courses', icon: '📚' },
    { path: '/teacher/schedule', label: 'My Schedule', icon: '🕐' },
    { path: '/teacher/attendance', label: 'Attendance', icon: '🗓️' },
    { path: '/teacher/assignments', label: 'Assignments', icon: '📝' },
    { key: 'group:exams', label: 'Exams', icon: '🧪', children: [
      { path: '/teacher/exams', label: 'Exam Schedule', icon: '📅' },
      { path: '/teacher/exam-attendance', label: 'Exam Attendance', icon: '✅' },
      { path: '/teacher/exam-papers', label: 'My Exam Papers', icon: '📄' },
      { path: '/teacher/exam-incidents', label: 'Incidents & Issues', icon: '⚠️' },
    ] },
    { key: 'group:quizzes', label: 'Quiz Builder', icon: '❓', children: [
      { path: '/teacher/quizzes', label: 'All Quizzes', icon: '📋' },
      { path: '/teacher/quizzes/create', label: 'Create Quiz', icon: '➕' },
    ] },
    { key: 'group:gradebook', label: 'Gradebook', icon: '📊', children: [
      { path: '/teacher/gradebook', label: 'Submissions', icon: '📬' },
      { path: '/teacher/gradebook/review', label: 'Review Queue', icon: '🔍' },
      { path: '/teacher/results/enter', label: 'Enter Results', icon: '📝' },
    ] },
  ] },
  { title: 'Students', items: [
    { path: '/teacher/students', label: 'My Students', icon: '🎓' },
    { path: '/teacher/activity', label: 'Student Activity', icon: '📊' },
    { path: '/teacher/gamification', label: 'Gamification', icon: '🏆' },
    { path: '/teacher/analytics', label: 'Class Analytics', icon: '📈' },
  ] },
  { title: 'Content', items: [{ path: '/teacher/forum', label: 'Forum', icon: '💬' }] },
  { title: 'Account', items: [
    { path: '/teacher/profile', label: 'Profile', icon: '👤' },
    { path: '/teacher/settings', label: 'Settings', icon: '⚙️' },
  ] },
];

export function TeacherSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [openSection, setOpenSection] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user?.role !== 'teacher') return;
    api.get('/sidebar-settings/mine', { params: { portal: 'admin' } })
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        (data.data?.items || []).forEach((item: { key: string; visible: boolean }) => { map[item.key] = item.visible; });
        setVisibility(map);
      })
      .catch(() => setVisibility({}));
  }, [user?.role]);

  const visible = (key: string) => visibility[key] !== false;
  const isActive = (path: string) => path === '/teacher' ? location.pathname === path : location.pathname.startsWith(path);
  const filtered = navSections.map((section) => ({ ...section, items: section.items.map((item) => {
    if (isGroup(item)) {
      if (!visible(item.key)) return null;
      const children = item.children.filter((child) => visible(pathKey(child.path)));
      return children.length ? { ...item, children } : null;
    }
    return visible(pathKey(item.path)) ? item : null;
  }).filter(Boolean) as NavEntry[] })).filter((s) => s.items.length);

  useEffect(() => {
    const active = filtered.find((s) => s.items.some((item) => isGroup(item) ? item.children.some((c) => isActive(c.path)) : isActive(item.path)));
    if (active) setOpenSection(active.title);
    filtered.forEach((s) => s.items.forEach((item) => { if (isGroup(item) && item.children.some((c) => isActive(c.path))) setOpenGroups((p) => ({ ...p, [item.label]: true })); }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const content = <aside className="flex h-full flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
    <div className="border-b border-[var(--color-border-subtle)] px-5 py-5"><div className="flex items-center gap-3"><Link to="/" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white">🎓</Link><div className="min-w-0"><p className="truncate text-sm font-bold">Teacher Portal</p><p className="truncate text-xs text-[var(--color-text-tertiary)]">{user?.email}</p></div></div></div>
    <nav className="flex-1 overflow-y-auto px-3 py-3">
      {filtered.map((section) => <div key={section.title} className="mb-1"><button onClick={() => setOpenSection((p) => p === section.title ? '' : section.title)} className={`flex w-full items-center rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest ${openSection === section.title ? 'text-emerald-600' : 'text-[var(--color-text-tertiary)]'}`}><span className="flex-1 text-left">{section.title}</span><span>{openSection === section.title ? '⌄' : '›'}</span></button><AnimatePresence initial={false}>{openSection === section.title && <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-0.5 pb-2">{section.items.map((item) => isGroup(item) ? <li key={item.label}><button onClick={() => setOpenGroups((p) => ({ ...p, [item.label]: !p[item.label] }))} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${item.children.some((c) => isActive(c.path)) ? 'text-emerald-600' : 'text-[var(--color-text-secondary)]'}`}><span>{item.icon}</span><span className="flex-1 text-left">{item.label}</span><span>{openGroups[item.label] ? '⌄' : '›'}</span></button><AnimatePresence initial={false}>{openGroups[item.label] && <motion.ul initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="ml-5 space-y-0.5 overflow-hidden border-l border-[var(--color-border-subtle)] pl-2">{item.children.map((child) => <li key={child.path}><Link to={child.path} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${isActive(child.path) ? 'bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><span>{child.icon}</span><span className="truncate">{child.label}</span></Link></li>)}</motion.ul>}</AnimatePresence></li> : <li key={item.path}><Link to={item.path} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive(item.path) ? 'bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}><span>{item.icon}</span><span className="truncate">{item.label}</span></Link></li>)}</motion.ul>}</AnimatePresence></div>)}
    </nav>
    <div className="border-t border-[var(--color-border-subtle)] p-3"><button onClick={logout} className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">🚪 Logout</button></div>
  </aside>;

  return <><button onClick={() => setMobileOpen(true)} className="fixed left-3 top-3 z-50 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2.5 shadow-lg lg:hidden" aria-label="Open menu">☰</button><div className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{content}</div><AnimatePresence>{mobileOpen && <><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} /><motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] lg:hidden">{content}</motion.div></>}</AnimatePresence></>;
}

export default TeacherSidebar;
