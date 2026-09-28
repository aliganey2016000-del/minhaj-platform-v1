import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Building2, CalendarDays, ClipboardCheck, UserCheck } from 'lucide-react';

const tabs = [
  { to: '/admin/exams/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/admin/exams/rooms', label: 'Rooms', icon: Building2 },
  { to: '/admin/exams/invigilators', label: 'Invigilator', icon: UserCheck },
  { to: '/admin/exams/attendance', label: 'Attendance', icon: ClipboardCheck },
] as const;

const preloaders: Record<(typeof tabs)[number]['to'], () => Promise<unknown>> = {
  '/admin/exams/schedule': () => import('../pages/exams-manage'),
  '/admin/exams/rooms': () => import('../pages/exam-rooms-manage'),
  '/admin/exams/invigilators': () => import('../pages/exam-invigilators-manage'),
  '/admin/exams/attendance': () => import('../pages/exam-attendance-manage'),
};

const preloadTab = (to: (typeof tabs)[number]['to']) => {
  void preloaders[to]().catch(() => undefined);
};

type ExamWorkspaceContext = {
  periodId?: string;
  examName?: string;
  academicYear?: string;
  examType?: 'mid' | 'final' | '';
  startDate?: string;
  endDate?: string;
};

export function ExamWorkspaceTabs({ context }: { context?: ExamWorkspaceContext }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);

  if (context) {
    const values: Record<string, string | undefined> = {
      periodId: context.periodId,
      examName: context.examName,
      academicYear: context.academicYear,
      examType: context.examType || undefined,
      startDate: context.startDate,
      endDate: context.endDate,
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) search.set(key, value);
      else search.delete(key);
    });
  }

  const query = search.toString();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      tabs.forEach((tab) => preloadTab(tab.to));
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <nav
      aria-label="Exam management sections"
      className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm"
    >
      <div className="flex w-full gap-1.5 overflow-x-auto rounded-xl bg-[var(--color-surface-secondary)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={query ? `${tab.to}?${query}` : tab.to}
              end
              onPointerEnter={() => preloadTab(tab.to)}
              onFocus={() => preloadTab(tab.to)}
              onTouchStart={() => preloadTab(tab.to)}
              className={({ isActive }) =>
                'flex min-w-max flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold transition-all sm:min-w-0 sm:shrink ' +
                (isActive
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]')
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default ExamWorkspaceTabs;
