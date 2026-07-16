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
import api from '../../../lib/axios';

interface ExamBrief { _id: string; title: string; examDate: string; totalMarks: number; passingMarks: number; resultsPublished?: boolean; course?: { _id: string; title: { en: string }; slug: string; category: string }; }

interface StudentBrief { _id: string; studentId: string; profile?: { firstName: string; lastName: string }; }

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
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📊 Manage Results</h1>
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
            {/* Stats — dynamically computed */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{passed}</p>
                <p className="text-xs text-green-600 dark:text-green-400">Passed</p>
              </div>
              <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{failed}</p>
                <p className="text-xs text-red-600 dark:text-red-400">Failed</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 p-4 text-center">
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{absent}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">Absent</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" placeholder="Search by student name, ID, or exam title..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                <option value="">All Status</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="absent">Absent</option>
              </select>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                    <tr>
                      <th className="text-left px-5 py-3 font-semibold">Student</th>
                      <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Exam</th>
                      <th className="text-center px-5 py-3 font-semibold">Marks</th>
                      <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">%</th>
                      <th className="text-center px-5 py-3 font-semibold">Grade</th>
                      <th className="text-center px-5 py-3 font-semibold">Attendance</th>
                      <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Result</th>
                      <th className="text-center px-5 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">📊 No results found</p><p className="text-sm">Switch to "Enter Results" to add exam results.</p></td></tr>
                    ) : results.map(r => (
                      <tr key={r._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-semibold">{r.student?.profile?.firstName} {r.student?.profile?.lastName}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{r.student?.studentId}</p>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <p className="text-sm font-medium">{r.exam?.title}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{r.exam?.course?.title?.en}</p>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className="font-mono text-sm font-bold">{r.marksObtained}<span className="text-[var(--color-text-tertiary)] font-normal">/{r.totalMarks}</span></span>
                        </td>
                        <td className="px-5 py-4 text-center hidden sm:table-cell">
                          <span className={`text-sm font-bold ${r.percentage >= 50 ? 'text-green-600' : 'text-red-600'}`}>{r.percentage}%</span>
                        </td>
                        <td className="px-5 py-4 text-center"><GradeBadge grade={r.grade} /></td>
                        <td className="px-5 py-4 text-center">
                          <AttendanceBadge status={r.attendanceStatus} />
                        </td>
                        <td className="px-5 py-4 text-center hidden sm:table-cell">
                          <ResultStatusBadge status={r.status} />
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button onClick={() => handleDelete(r._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                  <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en} ({new Date(e.examDate).toLocaleDateString()})</option>
                ))}
              </select>
              {selectedExamObj && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Total Marks: <strong>{selectedExamObj.totalMarks}</strong> | Passing: <strong>{selectedExamObj.passingMarks}</strong> ({Math.round((selectedExamObj.passingMarks / selectedExamObj.totalMarks) * 100)}%)
                  </p>
                  <button
                    onClick={handleTogglePublish}
                    disabled={publishing}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                      selectedExamObj.resultsPublished
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200'
                        : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
                    }`}
                  >
                    {selectedExamObj.resultsPublished ? '✅ Published to Students' : '🔒 Publish Results to Students'}
                  </button>
                </div>
              )}
            </div>

            {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

            {selectedExam && examStudents.length > 0 && !loading && (
              <>
                <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                        <tr>
                          <th className="text-left px-5 py-3 font-semibold">#</th>
                          <th className="text-left px-5 py-3 font-semibold">Student</th>
                          <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">ID</th>
                          <th className="text-center px-5 py-3 font-semibold">Marks Obtained</th>
                          <th className="text-center px-5 py-3 font-semibold">Attendance</th>
                          <th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Remarks</th>
                          <th className="text-center px-5 py-3 font-semibold hidden lg:table-cell">Feedback</th>
                        </tr>
                      </thead>
                      <tbody>
                        {examStudents.map((s, i) => (
                          <tr key={s._id} className="border-b border-[var(--color-border-subtle)]">
                            <td className="px-5 py-3 text-center text-xs text-[var(--color-text-tertiary)] w-10">{i + 1}</td>
                            <td className="px-5 py-3"><p className="font-medium">{s.profile?.firstName} {s.profile?.lastName}</p></td>
                            <td className="px-5 py-3 text-center hidden sm:table-cell"><code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{s.studentId}</code></td>
                            <td className="px-5 py-3 text-center">
                              <input
                                type="number"
                                min={0}
                                max={selectedExamObj?.totalMarks || 100}
                                value={marks[s._id]?.obtained || ''}
                                onChange={e => handleMarkChange(s._id, 'obtained', e.target.value)}
                                disabled={marks[s._id]?.status === 'absent'}
                                className="w-20 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-xs text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-30"
                                placeholder={`/ ${selectedExamObj?.totalMarks || 100}`}
                              />
                            </td>
                            <td className="px-5 py-3 text-center">
                              <select value={marks[s._id]?.status || 'present'} onChange={e => handleMarkChange(s._id, 'status', e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer">
                                <option value="present">Present</option>
                                <option value="absent">Absent</option>
                                <option value="late">Late</option>
                                <option value="excused">Excused</option>
                              </select>
                            </td>
                            <td className="px-5 py-3 text-center hidden md:table-cell">
                              <input type="text" value={marks[s._id]?.remarks || ''} onChange={e => handleMarkChange(s._id, 'remarks', e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs w-36" placeholder="Internal only" />
                            </td>
                            <td className="px-5 py-3 text-center hidden lg:table-cell">
                              <input type="text" value={marks[s._id]?.feedback || ''} onChange={e => handleMarkChange(s._id, 'feedback', e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs w-36" placeholder="Shown to student" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] flex items-center justify-between">
                    <p className="text-xs text-[var(--color-text-tertiary)]">{examStudents.length} students</p>
                    <button onClick={handleBulkSubmit} disabled={loading} className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm">
                      {loading ? 'Saving...' : '💾 Save All Results'}
                    </button>
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