/**
 * Results Management — Admin
 * Enter exam results (bulk or individual), view, filter, search
 *
 * Fixes:
 *   1. % calculation: (obtainedMarks / totalMarks) * 100 — computed server-side
 *   2. Grade: dynamically assigned based on percentage (A+, A, B, C, D, F)
 *   3. Stats cards: dynamically counted from results
 *   4. Status column: pulled from Exam Attendance records (present/absent/late/excused)
 */
import { useEffect, useState, useCallback } from 'react';
import { Search, Trash2, CheckCircle2, XCircle, UserX, LayoutGrid } from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';

interface ExamBrief {
  _id: string;
  title: string;
  examDate: string;
  totalMarks: number;
  passingMarks: number;
  resultsPublished?: boolean;
  autoSchedule?: boolean;
  school?: { name: string } | null;
  course?: {
    _id: string;
    title: { en: string };
    slug: string;
    category: string;
    class?: { title: string; section: string; department?: { name: string } | null } | null;
  };
}

function formatExamDate(exam: ExamBrief): string {
  if (exam.autoSchedule || !exam.examDate) return 'Self-Paced Exam';
  const d = new Date(exam.examDate);
  if (isNaN(d.getTime())) return 'Self-Paced Exam';
  return d.toLocaleDateString();
}

function initials(first?: string, last?: string): string {
  return `${(first || '?').charAt(0)}${(last || '').charAt(0)}`.toUpperCase();
}

const AVATAR_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500'];
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface StudentBrief { _id: string; studentId: string; department?: string; class?: { title: string; section: string } | null; profile?: { firstName: string; lastName: string }; }

interface ResultRow {
  _id: string;
  exam: ExamBrief;
  student: StudentBrief;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  remarks: string;
  status: 'passed' | 'failed' | 'absent';
  attendanceStatus?: 'present' | 'absent' | 'late' | 'excused'; // from ExamAttendance model
  enteredBy?: { _id: string; email: string };
  createdAt: string;
}

function ResultStatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    passed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    absent: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c[status] || 'bg-gray-100'}`}>{status}</span>;
}

function AttendanceBadge({ status }: { status?: string }) {
  const c: Record<string, string> = {
    present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    excused: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };
  const label = status || 'unknown';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c[label] || 'bg-gray-100 text-gray-600'}`}>{label}</span>;
}

function GradeBadge({ grade }: { grade: string }) {
  const c: Record<string, string> = {
    'A+': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    'A': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'B': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'C': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    'D': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    'F': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    'N/A': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c[grade] || 'bg-gray-100 text-gray-600'}`}>{grade}</span>;
}

export function ResultsManage() {
  const [tab, setTab] = useState<'view' | 'enter'>('view');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [students, setStudents] = useState<StudentBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Bulk entry state
  const [selectedExam, setSelectedExam] = useState('');
  const [examStudents, setExamStudents] = useState<StudentBrief[]>([]);
  const [marks, setMarks] = useState<Record<string, { obtained: string; remarks: string; feedback: string; status: string }>>({});
  const [selectedExamObj, setSelectedExamObj] = useState<ExamBrief | null>(null);
  const [existingResults, setExistingResults] = useState<ResultRow[]>([]);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => { fetchExams(); }, []);

  const fetchExams = async () => {
    try { const { data } = await api.get('/exams'); setExams(data.data || []); } catch {}
  };

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/results', { params });
      setResults(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load results');
    } finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const loadExamForEntry = async (examId: string) => {
    if (!examId) return;
    setSelectedExam(examId);
    setLoading(true);
    try {
      const exam = exams.find(e => e._id === examId);
      setSelectedExamObj(exam || null);

      // Get students enrolled in this course
      const { data: studentData } = await api.get(`/courses/${exam?.course?._id}/students`);
      const enrolled: StudentBrief[] = studentData.data || [];
      setExamStudents(enrolled);

      // Get existing results for this exam to pre-fill
      const { data: resultData } = await api.get(`/results?examId=${examId}&limit=200`);
      const existing: ResultRow[] = resultData.data || [];
      setExistingResults(existing);

      const m: Record<string, { obtained: string; remarks: string; feedback: string; status: string }> = {};
      enrolled.forEach(s => {
        const existingR = existing.find(r => r.student?._id === s._id);
        m[s._id] = {
          obtained: existingR ? String(existingR.marksObtained) : '',
          remarks: existingR ? existingR.remarks || '' : '',
          feedback: existingR ? (existingR as any).feedback || '' : '',
          status: existingR ? (existingR.attendanceStatus || existingR.status || 'present') : 'present',
        };
      });
      setMarks(m);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load students');
    } finally { setLoading(false); }
  };

  const handleMarkChange = (studentId: string, field: string, value: string) => {
    setMarks(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value },
    }));
  };

  const handleBulkSubmit = async () => {
    if (!selectedExam || examStudents.length === 0) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const resultsArray = examStudents.map(s => ({
        student: s._id,
        marksObtained: marks[s._id]?.status === 'absent' ? 0 : Number(marks[s._id]?.obtained || 0),
        totalMarks: selectedExamObj?.totalMarks,
        remarks: marks[s._id]?.remarks || '',
        feedback: marks[s._id]?.feedback || '',
        status: marks[s._id]?.status || 'present',
      }));

      await api.post('/results/bulk', { exam: selectedExam, results: resultsArray });
      setMessage(`✅ Results saved for ${examStudents.length} students!`);
      fetchResults();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save results');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this result?')) return;
    try { await api.delete(`/results/${id}`); fetchResults(); } catch (err: any) { alert(err.response?.data?.message || 'Failed'); }
  };

  const handleTogglePublish = async () => {
    if (!selectedExamObj) return;
    setPublishing(true);
    setError('');
    try {
      const nextPublished = !selectedExamObj.resultsPublished;
      await api.patch(`/exams/${selectedExamObj._id}/publish-results`, { published: nextPublished });
      setSelectedExamObj({ ...selectedExamObj, resultsPublished: nextPublished });
      setExams(prev => prev.map(e => (e._id === selectedExamObj._id ? { ...e, resultsPublished: nextPublished } : e)));
      setMessage(nextPublished ? '✅ Results published — students can now see their marks.' : 'Results hidden from students.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update publish status');
    } finally { setPublishing(false); }
  };

  // ── Dynamic stats from the current results ──
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const absent = results.filter(r => r.status === 'absent').length;

  if (loading && results.length === 0 && tab === 'view') {
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className={`mx-auto space-y-6 ${tab === 'enter' ? 'max-w-none' : 'max-w-7xl'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <BackButton fallback="/admin/exams" />
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mt-1">📊 Manage Results</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{results.length} total — {passed} passed, {failed} failed, {absent} absent</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 border-b border-[var(--color-border-subtle)] pb-0">
          {(['view', 'enter'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-t-xl px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${tab === t ? 'bg-[var(--color-surface-primary)] text-primary-600 border-primary-600' : 'text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]'}`}>
              {t === 'view' ? '📋 View Results' : '📝 Enter Results'}
            </button>
          ))}
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600"><p>{error}</p><button onClick={fetchResults} className="text-primary-600 font-medium text-xs mt-1 hover:underline">Retry</button></div>}

        {/* ── View Results Tab ── */}
        {tab === 'view' && (
          <>
            {/* Stats — gradient tiles doubling as status filter tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {([
                { key: '', label: 'All', count: results.length, icon: LayoutGrid, gradient: 'from-slate-500 to-slate-600' },
                { key: 'passed', label: 'Passed', count: passed, icon: CheckCircle2, gradient: 'from-green-500 to-emerald-600' },
                { key: 'failed', label: 'Failed', count: failed, icon: XCircle, gradient: 'from-red-500 to-rose-600' },
                { key: 'absent', label: 'Absent', count: absent, icon: UserX, gradient: 'from-gray-500 to-slate-600' },
              ] as const).map((s) => (
                <button
                  key={s.key || 'all'}
                  type="button"
                  onClick={() => setStatusFilter(s.key)}
                  className={`rounded-2xl bg-gradient-to-br ${s.gradient} p-4 text-white shadow-sm relative overflow-hidden text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${
                    statusFilter === s.key ? 'ring-2 ring-offset-2 ring-offset-[var(--color-surface-primary)] ring-slate-900 dark:ring-white' : ''
                  }`}
                >
                  <s.icon className="absolute -right-2 -bottom-2 h-16 w-16 opacity-20" strokeWidth={1.5} />
                  <p className="text-2xl font-bold relative">{s.count}</p>
                  <p className="text-xs text-white/85 relative">{s.label}</p>
                </button>
              ))}
            </div>

            {/* Search & Filter — combined panel */}
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={2} />
                <input
                  type="text"
                  placeholder="Search by student name, ID, or exam title..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </div>
              {statusFilter && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('')}
                  className="inline-flex items-center gap-1 self-start sm:self-center rounded-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                  Clear filter
                </button>
              )}
            </div>

            {/* Table — floating rounded card rows */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate" style={{ borderSpacing: '0 0.5rem' }}>
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                    <th className="text-left px-5 py-2 font-semibold">Student</th>
                    <th className="text-left px-5 py-2 font-semibold hidden md:table-cell">Exam</th>
                    <th className="text-center px-5 py-2 font-semibold">Marks</th>
                    <th className="text-center px-5 py-2 font-semibold hidden sm:table-cell">%</th>
                    <th className="text-center px-5 py-2 font-semibold">Grade</th>
                    <th className="text-center px-5 py-2 font-semibold">Attendance</th>
                    <th className="text-center px-5 py-2 font-semibold hidden sm:table-cell">Result</th>
                    <th className="text-center px-5 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">📊 No results found</p><p className="text-sm">Switch to "Enter Results" to add exam results.</p></td></tr>
                  ) : results.map(r => {
                    const fullName = `${r.student?.profile?.firstName || ''} ${r.student?.profile?.lastName || ''}`.trim() || 'Unknown Student';
                    return (
                      <tr key={r._id} className="shadow-sm hover:shadow-md transition-shadow bg-[var(--color-surface-primary)]">
                        <td className="px-5 py-4 rounded-l-2xl border-y border-l border-[var(--color-border-default)]">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(r.student?._id || fullName)}`}>
                              {initials(r.student?.profile?.firstName, r.student?.profile?.lastName)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{fullName}</p>
                              <p className="text-xs text-[var(--color-text-tertiary)]">{r.student?.studentId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell border-y border-[var(--color-border-default)]">
                          <p className="text-sm font-medium" dir="auto">{r.exam?.title}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{r.exam?.course?.title?.en}</p>
                        </td>
                        <td className="px-5 py-4 text-center border-y border-[var(--color-border-default)]">
                          <span className="font-mono text-sm font-bold">{r.marksObtained}<span className="text-[var(--color-text-tertiary)] font-normal">/{r.totalMarks}</span></span>
                        </td>
                        <td className="px-5 py-4 text-center hidden sm:table-cell border-y border-[var(--color-border-default)]">
                          <span className={`text-sm font-bold ${r.percentage >= 50 ? 'text-green-600' : 'text-red-600'}`}>{r.percentage}%</span>
                        </td>
                        <td className="px-5 py-4 text-center border-y border-[var(--color-border-default)]"><GradeBadge grade={r.grade} /></td>
                        <td className="px-5 py-4 text-center border-y border-[var(--color-border-default)]">
                          <AttendanceBadge status={r.attendanceStatus} />
                        </td>
                        <td className="px-5 py-4 text-center hidden sm:table-cell border-y border-[var(--color-border-default)]">
                          <ResultStatusBadge status={r.status} />
                        </td>
                        <td className="px-5 py-4 text-center rounded-r-2xl border-y border-r border-[var(--color-border-default)]">
                          <button onClick={() => handleDelete(r._id)} className="inline-flex items-center justify-center rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete">
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Enter Results Tab ── */}
        {tab === 'enter' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Select Exam</label>
              <select value={selectedExam} onChange={e => loadExamForEntry(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                <option value="">Choose an exam...</option>
                {exams.map(e => (
                  <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en} ({formatExamDate(e)})</option>
                ))}
              </select>
              {selectedExamObj && (
                <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                  Total Marks: <strong>{selectedExamObj.totalMarks}</strong> | Passing: <strong>{selectedExamObj.passingMarks}</strong> ({Math.round((selectedExamObj.passingMarks / selectedExamObj.totalMarks) * 100)}%)
                </p>
              )}
            </div>

            {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

            {selectedExam && examStudents.length > 0 && !loading && (
              <>
                <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col style={{ width: '22%' }} />
                        <col className="hidden sm:table-column" style={{ width: '15%' }} />
                        <col className="hidden md:table-column" style={{ width: '15%' }} />
                        <col className="hidden md:table-column" style={{ width: '11%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '12%' }} />
                        <col className="hidden lg:table-column" style={{ width: '15%' }} />
                      </colgroup>
                      <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                        <tr>
                          <th className="text-left px-4 py-1.5 font-semibold">Student Name / ID</th>
                          <th className="text-left px-4 py-1.5 font-semibold hidden sm:table-cell">Organization / Department</th>
                          <th className="text-left px-4 py-1.5 font-semibold hidden md:table-cell">Course / Class</th>
                          <th className="text-left px-4 py-1.5 font-semibold hidden md:table-cell">Exam Type</th>
                          <th className="text-left px-4 py-1.5 font-semibold">Marks</th>
                          <th className="text-left px-4 py-1.5 font-semibold">Attendance</th>
                          <th className="text-left px-4 py-1.5 font-semibold hidden lg:table-cell">Feedback</th>
                        </tr>
                      </thead>
                      <tbody>
                        {examStudents.map((s, i) => {
                          const fullName = `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim() || 'Unknown Student';
                          const classLabel = s.class ? `${s.class.title} (${s.class.section})` : '';
                          const examClass = selectedExamObj?.course?.class;
                          const orgLabel = selectedExamObj?.school?.name || '';
                          const deptLabel = examClass?.department?.name || s.department || '';
                          const courseLabel = selectedExamObj?.course?.title?.en || '';
                          const courseClassLabel = examClass ? `${examClass.title} (${examClass.section})` : classLabel;
                          return (
                            <tr key={s._id} className={`border-b border-[var(--color-border-subtle)] ${i % 2 === 1 ? 'bg-[var(--color-surface-secondary)]/50' : ''}`}>
                              <td className="px-4 py-1">
                                <div className="flex items-center gap-2">
                                  <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor(s._id)}`}>
                                    {initials(s.profile?.firstName, s.profile?.lastName)}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="font-medium truncate leading-tight">{fullName}</p>
                                    <code className="text-[10px] text-[var(--color-text-tertiary)]">{s.studentId}</code>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-1 hidden sm:table-cell text-xs text-[var(--color-text-secondary)] truncate">
                                {orgLabel}{orgLabel && deptLabel ? ' · ' : ''}{deptLabel}
                              </td>
                              <td className="px-4 py-1 hidden md:table-cell text-xs text-[var(--color-text-secondary)] truncate">
                                {courseLabel}{courseLabel && courseClassLabel ? ' · ' : ''}{courseClassLabel}
                              </td>
                              <td className="px-4 py-1 hidden md:table-cell text-xs text-[var(--color-text-secondary)] truncate" dir="auto">{selectedExamObj?.title || ''}</td>
                              <td className="px-4 py-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={selectedExamObj?.totalMarks || 100}
                                  value={marks[s._id]?.obtained || ''}
                                  onChange={e => handleMarkChange(s._id, 'obtained', e.target.value)}
                                  disabled={marks[s._id]?.status === 'absent'}
                                  className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs text-left font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-30 placeholder:text-slate-500 dark:placeholder:text-slate-400"
                                  placeholder={`/ ${selectedExamObj?.totalMarks || 100}`}
                                />
                              </td>
                              <td className="px-4 py-1">
                                <select value={marks[s._id]?.status || 'present'} onChange={e => handleMarkChange(s._id, 'status', e.target.value)} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium text-left cursor-pointer">
                                  <option value="present">Present</option>
                                  <option value="absent">Absent</option>
                                  <option value="late">Late</option>
                                  <option value="excused">Excused</option>
                                </select>
                              </td>
                              <td className="px-4 py-1 hidden lg:table-cell">
                                <input type="text" value={marks[s._id]?.feedback || ''} onChange={e => handleMarkChange(s._id, 'feedback', e.target.value)} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1 text-xs text-left placeholder:text-slate-500 dark:placeholder:text-slate-400" placeholder="Shown to student" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] flex items-center justify-between">
                    <p className="text-xs text-[var(--color-text-tertiary)]">{examStudents.length} students</p>
                    <div className="flex items-center gap-2">
                      {selectedExamObj && (
                        <button
                          onClick={handleTogglePublish}
                          disabled={publishing}
                          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 shadow-sm ${
                            selectedExamObj.resultsPublished
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {selectedExamObj.resultsPublished ? '✅ Published to Students' : '🔓 Publish to Students'}
                        </button>
                      )}
                      <button onClick={handleBulkSubmit} disabled={loading} className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors shadow-md">
                        {loading ? 'Saving...' : '💾 Save All Results'}
                      </button>
                    </div>
                  </div>
                </div>

                {existingResults.length > 0 && (
                  <div className="text-xs text-[var(--color-text-tertiary)] text-center">
                    ℹ️ Existing results are pre-filled. Saving will update them.
                  </div>
                )}
              </>
            )}

            {selectedExam && examStudents.length === 0 && !loading && (
              <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">No students enrolled in this course.</p></div>
            )}

            {!selectedExam && (
              <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">👆 Select an exam above to enter results</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ResultsManage;