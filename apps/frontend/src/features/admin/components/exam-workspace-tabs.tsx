import { NavLink } from 'react-router-dom';
import { Building2, CalendarDays, ClipboardCheck, Percent } from 'lucide-react';

const tabs = [
  { to: '/admin/exams/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/admin/exams/rooms', label: 'Room Assignment', icon: Building2 },
  { to: '/admin/exams/attendance', label: 'Attendance', icon: ClipboardCheck },
  { to: '/admin/exams/grading-rules', label: 'Grading Rules', icon: Percent },
] as const;

export function ExamWorkspaceTabs() {
  return (
    <nav
      aria-label="Exam management sections"
      className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--color-surface-secondary)] p-1 sm:grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                'flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ' +
                (isActive
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]')
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default ExamWorkspaceTabs;
