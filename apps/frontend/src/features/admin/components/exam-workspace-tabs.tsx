import { NavLink } from 'react-router-dom';
import { Building2, CalendarDays, ClipboardCheck, ClipboardEdit, UserCheck } from 'lucide-react';

const tabs = [
  { to: '/admin/exams/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/admin/exams/rooms', label: 'Rooms', icon: Building2 },
  { to: '/admin/exams/invigilators', label: 'Invigilator', icon: UserCheck },
  { to: '/admin/exams/attendance', label: 'Attendance', icon: ClipboardCheck },
  { to: '/admin/results/enter', label: 'Enter Results', icon: ClipboardEdit },
] as const;

export function ExamWorkspaceTabs() {
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
              to={tab.to}
              end
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
