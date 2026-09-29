import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  ListChecks,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const items = [
  { path: '/teacher/exams', label: 'Exam Workspace', shortLabel: 'Workspace', icon: LayoutDashboard },
  { path: '/teacher/exam-attendance', label: 'Invigilation', shortLabel: 'Invigilation', icon: ClipboardCheck },
  { path: '/teacher/exam-papers', label: 'Exam Papers', shortLabel: 'Papers', icon: FileText },
  { path: '/teacher/exam-incidents', label: 'Incidents', shortLabel: 'Incidents', icon: AlertTriangle },
  { path: '/teacher/results/enter', label: 'Enter Results', shortLabel: 'Results', icon: ListChecks },
];

export function TeacherExamWorkflowNav() {
  const location = useLocation();

  const active = (path: string) => {
    if (path === '/teacher/exams') {
      return location.pathname === path || /^\/teacher\/exams\/[^/]+\/(attendance|paper)$/.test(location.pathname);
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="overflow-x-auto pb-1">
      <nav className="grid min-w-[620px] grid-cols-5 gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 shadow-sm" aria-label="Teacher exam workflow">
        {items.map(({ path, label, shortLabel, icon: Icon }) => {
          const selected = active(path);
          return (
            <Link
              key={path}
              to={path}
              className={
                'flex min-h-16 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-center text-xs font-bold transition sm:text-sm ' +
                (selected
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]')
              }
              aria-current={selected ? 'page' : undefined}
              title={label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default TeacherExamWorkflowNav;
