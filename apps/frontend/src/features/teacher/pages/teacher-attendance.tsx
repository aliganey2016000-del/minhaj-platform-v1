import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarCheck, Check, Loader2, Save } from 'lucide-react';
import api from '../../../lib/axios';

interface Course { _id: string; title?: { en?: string }; }
interface Student { _id: string; studentId?: string; profile?: { firstName?: string; lastName?: string }; }
interface AttendanceRecord { student: { _id: string }; status: string; locked?: boolean; }
type Status = 'present' | 'absent' | 'late' | 'excused';
const statuses: { value: Status; label: string; key: string }[] = [
  { value: 'present', label: 'Present', key: 'P' }, { value: 'absent', label: 'Absent', key: 'A' },
  { value: 'late', label: 'Late', key: 'L' }, { value: 'excused', label: 'Excused', key: 'E' },
];

export function TeacherAttendance() {
  const [courses, setCourses] = useState<Course[]>([]); const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<string, Status>>({}); const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true); const [rosterLoading, setRosterLoading] = useState(false); const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');

  useEffect(() => { (async () => { try { const { data } = await api.get('/teacher-portal/dashboard'); const active = data.data?.activeCourses || []; setCourses(active); if (active[0]?._id) setCourseId(active[0]._id); } catch (err: any) { setError(err.response?.data?.message || 'Failed to load your courses'); } finally { setLoading(false); } })(); }, []);

  useEffect(() => { if (!courseId) return; (async () => { setRosterLoading(true); setError(''); setMessage(''); try {
    const [rosterResponse, attendanceResponse] = await Promise.all([
      api.get(`/teacher-portal/courses/${courseId}/attendance-roster`), api.get('/attendance/course', { params: { courseId, date } }),
    ]); const roster: Student[] = rosterResponse.data?.data || []; const existing: AttendanceRecord[] = attendanceResponse.data?.data || [];
    const next: Record<string, Status> = {}; existing.forEach((record) => { if (record.student?._id) next[record.student._id] = record.status as Status; });
    setStudents(roster); setRecords(next); setLocked(existing.some((record) => record.locked));
  } catch (err: any) { setError(err.response?.data?.message || 'Failed to load attendance roster'); setStudents([]); setRecords({}); } finally { setRosterLoading(false); } })(); }, [courseId, date]);

  const markedCount = useMemo(() => Object.keys(records).length, [records]);
  const setStatus = (studentId: string, status: Status) => { setRecords((prev) => ({ ...prev, [studentId]: status })); setMessage(''); };
  const markAll = (status: Status) => { const next: Record<string, Status> = {}; students.forEach((student) => { next[student._id] = status; }); setRecords(next); setMessage(''); };
  const save = async () => { if (!courseId || students.length === 0) return; if (markedCount !== students.length) { setError(`Please mark all ${students.length} students before saving.`); return; }
    setSaving(true); setError(''); setMessage(''); try { await api.post('/attendance', { course: courseId, date, records: students.map((student) => ({ student: student._id, status: records[student._id] })) }); setLocked(true); setMessage('Attendance saved and locked successfully.'); } catch (err: any) { setError(err.response?.data?.message || 'Failed to save attendance'); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>;
  return <div className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 flex items-center gap-2 text-emerald-600"><CalendarCheck className="h-5 w-5" /><span className="text-sm font-semibold">Teacher Attendance</span></div><h1 className="text-2xl font-extrabold text-[var(--color-text-primary)]">Take Attendance</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Mark your assigned course roster. Submitted sessions are locked.</p></div><div className="flex flex-col gap-2 sm:flex-row"><select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">{courses.map((course) => <option key={course._id} value={course._id}>{course.title?.en || 'Untitled course'}</option>)}</select><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" /></div></div>
    {error && <div className="mb-4 flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div>}{message && <div className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
    {courses.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">You have no active courses assigned yet.</div> : <div className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-[var(--color-text-primary)]">{students.length} students · {markedCount} marked</p>{locked && <p className="mt-1 text-xs text-amber-600">This session is locked.</p>}</div><div className="flex flex-wrap gap-2">{statuses.map((status) => <button key={status.value} type="button" disabled={locked || rosterLoading} onClick={() => markAll(status.value)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">All {status.label}</button>)}<button type="button" onClick={save} disabled={locked || saving || rosterLoading || students.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save Attendance'}</button></div></div>
      {rosterLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div> : <div className="divide-y divide-[var(--color-border-subtle)]">{students.map((student, index) => { const name = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || 'Unnamed student'; const value = records[student._id]; return <div key={student._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="w-6 text-xs text-[var(--color-text-tertiary)]">{index + 1}</span><div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700">{name.charAt(0)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{student.studentId || 'No student ID'}</p></div></div><div className="flex gap-1.5" role="group" aria-label={`Attendance for ${name}`}>{statuses.map((status) => <button key={status.value} type="button" disabled={locked} aria-pressed={value === status.value} onClick={() => setStatus(student._id, status.value)} className={`h-9 min-w-9 rounded-lg border px-2 text-xs font-bold transition ${value === status.value ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'} disabled:opacity-50`}>{status.key}</button>)}{value && <Check className="ml-1 h-4 w-4 self-center text-emerald-600" />}</div></div>; })}{students.length === 0 && <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No students are enrolled in this course.</div>}</div>}
    </div>}
  </div>;
}
export default TeacherAttendance;
