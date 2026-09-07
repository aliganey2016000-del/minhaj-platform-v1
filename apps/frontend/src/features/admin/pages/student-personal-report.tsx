import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, BookOpenCheck, CalendarCheck, Loader2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';

type Section = 'attendance' | 'exams';
type Student = { _id: string; studentId: string; profile?: { firstName?: string; lastName?: string }; class?: { title?: string; section?: string } };
type AttendanceSummary = { total: number; present: number; late: number; absent: number; excused: number; percentage: number };
type Result = { _id: string; exam?: { title?: string }; score?: number; totalMarks?: number; grade?: string; status?: string; createdAt?: string };

export function StudentPersonalReport() {
  const { studentId } = useParams<{ studentId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const initialSection = (location.state as { section?: Section } | null)?.section || 'attendance';
  const [section, setSection] = useState<Section>(initialSection);
  const [student, setStudent] = useState<Student | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      setLoading(true); setError('');
      try {
        const [studentResponse, attendanceResponse, resultsResponse] = await Promise.all([
          api.get(`/students/${studentId}`),
          api.get(`/attendance/student/${studentId}`),
          api.get('/results', { params: { studentId, page: 1, limit: 100 } }),
        ]);
        setStudent(studentResponse.data.data);
        setAttendance(attendanceResponse.data.data || attendanceResponse.data);
        setResults(resultsResponse.data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load student report.');
      } finally { setLoading(false); }
    })();
  }, [studentId]);

  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;
  if (error || !student) return <div className="p-6 pt-20 lg:p-10 lg:pt-10"><div className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-600">{error || 'Student not found'}</div></div>;

  const name = `${student.profile?.firstName || ''} ${student.profile?.lastName || ''}`.trim() || student.studentId;
  return <div className="min-h-screen bg-[var(--color-surface-secondary)] p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10"><div className="mx-auto max-w-6xl space-y-6">
    <button type="button" onClick={() => navigate('/admin/students')} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-primary-600"><ArrowLeft className="h-4 w-4" /> Back to students</button>
    <header><p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Student report</p><h1 className="mt-1 text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">{name}</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{student.studentId}{student.class?.title ? ` · ${student.class.title}` : ''}</p></header>
    <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2"><button onClick={() => setSection('attendance')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${section === 'attendance' ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}><CalendarCheck className="h-4 w-4" /> Attendance</button><button onClick={() => setSection('exams')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${section === 'exams' ? 'bg-sky-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}><BookOpenCheck className="h-4 w-4" /> Exams & grades</button><button onClick={() => navigate(`/admin/payments/balances/${student._id}`)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"><BarChart3 className="h-4 w-4" /> Payment statement</button></div>
    {section === 'attendance' && <section className="space-y-4"><div className="grid gap-4 sm:grid-cols-5">{[['Total', attendance?.total ?? 0], ['Present', attendance?.present ?? 0], ['Late', attendance?.late ?? 0], ['Absent', attendance?.absent ?? 0], ['Rate', `${attendance?.percentage ?? 0}%`]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5"><p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">{label}</p><p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{value}</p></div>)}</div><div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6"><h2 className="text-lg font-bold text-[var(--color-text-primary)]">Attendance report</h2><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">This report contains attendance records for {name} only.</p></div></section>}
    {section === 'exams' && <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6"><h2 className="text-lg font-bold text-[var(--color-text-primary)]">Exam and grade report</h2>{results.length === 0 ? <p className="mt-6 text-sm text-[var(--color-text-tertiary)]">No exam results found for this student.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-xs uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Exam</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th></tr></thead><tbody>{results.map(result => <tr key={result._id} className="border-t border-[var(--color-border-subtle)]"><td className="px-4 py-3 font-semibold">{result.exam?.title || 'Exam'}</td><td className="px-4 py-3">{result.score ?? '-'}{result.totalMarks ? ` / ${result.totalMarks}` : ''}</td><td className="px-4 py-3">{result.grade || '-'}</td><td className="px-4 py-3">{result.status || '-'}</td><td className="px-4 py-3 text-xs text-[var(--color-text-tertiary)]">{result.createdAt ? new Date(result.createdAt).toLocaleDateString() : '-'}</td></tr>)}</tbody></table></div>}</section>}
  </div></div>;
}

export default StudentPersonalReport;
