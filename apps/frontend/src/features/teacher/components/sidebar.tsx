/**
 * Teacher Sidebar Navigation
 *
 * Adds Exam Portal link to teacher portal sidebar.
 * Links: Dashboard, Results Entry, Exam Portal (NEW)
 */

import { Link, useLocation } from 'react-router-dom';
import { BarChart3, BookOpen, Calendar } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

export function TeacherSidebar() {
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/teacher',
      icon: <BarChart3 className="h-5 w-5" />,
    },
    {
      label: 'Results Entry',
      href: '/teacher/results/enter',
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      label: 'Exam Portal',
      href: '/teacher/exams',
      icon: <Calendar className="h-5 w-5" />,
      badge: 'NEW',
    },
  ];

  const isActive = (href: string) => {
    if (href === '/teacher') {
      return location.pathname === '/teacher';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <nav className="space-y-1">
      {navItems.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
            isActive(item.href)
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
          }`}
        >
          <span className="flex items-center gap-3">
            {item.icon}
            {item.label}
          </span>
          {item.badge && (
            <span className="rounded-full bg-primary-500 px-2 py-0.5 text-xs font-semibold text-white">
              {item.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export default TeacherSidebar;
