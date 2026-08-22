import { BookOpen, ClipboardCheck, FileText, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

type Props = { courseId: string };

export default function CourseDetailsQuickLinks({ courseId }: Props) {
  const links = [
    { label: 'Students', icon: Users, to: `/teacher/courses/${courseId}/students` },
    { label: 'Content', icon: BookOpen, to: `/teacher/courses/${courseId}/content` },
    { label: 'Assignments', icon: FileText, to: `/teacher/assignments?course=${courseId}` },
    { label: 'Gradebook', icon: ClipboardCheck, to: `/teacher/gradebook?course=${courseId}` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {links.map(({ label, icon: Icon, to }) => (
        <Link
          key={label}
          to={to}
          className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 transition hover:border-emerald-400 hover:shadow-sm"
        >
          <Icon className="h-5 w-5 text-emerald-600" />
          <span className="mt-3 block text-sm font-semibold text-[var(--color-text-primary)]">{label}</span>
        </Link>
      ))}
    </div>
  );
}
