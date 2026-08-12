/** Teacher-scoped student directory, including the linked guardian contact. */
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Mail, Search, Users } from 'lucide-react';
import api from '../../../lib/axios';

interface Student {
  _id: string;
  studentId: string;
  status: string;
  attendancePercentage?: number;
  gpa?: number;
  profile?: { firstName?: string; lastName?: string; avatar?: string };
  user?: { email?: string };
  class?: { title?: string; section?: string };
  enrolledCourses?: { _id: string; title?: { en?: string } }[];
  parent?: {
    relationship?: string;
    user?: { email?: string; phone?: string };
    profile?: { firstName?: string; lastName?: string };
  };
}

export function TeacherStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // The API applies the teacher's course scope server-side, so a teacher
        // can never expand this list to another teacher's students.
        const { data } = await api.get('/students', { params: { limit: 100, status: 'active' } });
        setStudents(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load your students');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredStudents = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => {
      const name = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`;
      const guardian = `${student.parent?.profile?.firstName || ''} ${student.parent?.profile?.lastName || ''}`;
      return [name, guardian, student.studentId, student.user?.email].some((value) => value?.toLowerCase().includes(term));
    });
  }, [query, students]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" /></div>;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--color-text-primary)]">My Students</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Students enrolled in your assigned courses and their guardian contacts.</p>
        </div>
        <label className="relative block w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students or guardians" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-9 pr-3 text-sm" />
        </label>
      </div>

      {error && <div className="mb-4 flex gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {!error && <div className="mb-4 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"><Users className="h-4 w-4 text-emerald-600" />{filteredStudents.length} student{filteredStudents.length === 1 ? '' : 's'}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        {filteredStudents.map((student) => {
          const name = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || 'Unnamed student';
          const guardianName = `${student.parent?.profile?.firstName || ''} ${student.parent?.profile?.lastName || ''}`.trim();
          return <article key={student._id} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">{name.charAt(0)}</div>
              <div className="min-w-0 flex-1"><h2 className="truncate font-bold text-[var(--color-text-primary)]">{name}</h2><p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId} · {student.class ? `${student.class.title} ${student.class.section || ''}` : 'No class assigned'}</p></div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">{student.status}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-[var(--color-text-tertiary)]">Attendance</p><p className="font-semibold">{student.attendancePercentage ?? '—'}{student.attendancePercentage !== undefined ? '%' : ''}</p></div><div><p className="text-[var(--color-text-tertiary)]">GPA</p><p className="font-semibold">{student.gpa ?? '—'}</p></div></div>
            <div className="mt-4 border-t border-[var(--color-border-subtle)] pt-3"><p className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--color-text-secondary)]"><BookOpen className="h-3.5 w-3.5" /> Your courses</p><p className="text-xs text-[var(--color-text-tertiary)]">{student.enrolledCourses?.map((course) => course.title?.en || 'Untitled course').join(', ') || 'No course data'}</p></div>
            <div className="mt-4 rounded-xl bg-[var(--color-surface-secondary)] p-3"><p className="text-xs font-semibold text-[var(--color-text-secondary)]">Guardian</p>{guardianName ? <><p className="mt-1 text-sm font-medium">{guardianName}{student.parent?.relationship ? ` (${student.parent.relationship})` : ''}</p><p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]"><Mail className="h-3.5 w-3.5" />{student.parent?.user?.email || student.parent?.user?.phone || 'No contact details'}</p></> : <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">No guardian linked by the administrator.</p>}</div>
          </article>;
        })}
      </div>
      {!error && filteredStudents.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">No students match your search or are enrolled in your courses yet.</div>}
    </div>
  );
}

export default TeacherStudents;
