/**
 * Exam Attendance — Invigilator Portal (Admin/Teacher)
 * Mark exam-day attendance for the roster of an exam's course.
 */

import { useEffect, useState, useCallback } from 'react';
import { Search, Clock, ArrowRight, CalendarX } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface SchoolBrief { _id: string; name: string; }
interface DepartmentBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; }

interface ExamBrief {
  _id: string;
  title: string;
  examDate: string;
  startTime?: string;
  endTime?: string;
  status: string;
  course?: {
    _id: string;
    title: { en: string };
    class?: { _id: string; title: string; section: string; department?: { _id: string; name: string } } | null;
    school?: { _id: string; name: string } | null;
  };
}
interface StudentBrief { _id: string; studentId: string; profile?: { firstName: string; lastName: string }; }
interface RosterEntry {
  student: StudentBrief;
  seat: { room?: { name: string }; deskNumber: string } | null;
  attendance: { status: string; notes?: string } | null;
}

const STATUS_OPTIONS: { value: string; letter: string; label: string; active: string; idle: string }[] = [
  { value: 'present', letter: 'P', label: 'Present', active: 'bg-green-600 text-white border-green-600', idle: 'bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900/50 hover:bg-green-50 dark:hover:bg-green-950/30' },
  { value: 'absent', letter: 'A', label: 'Absent', active: 'bg-red-600 text-white border-red-600', idle: 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30' },
  { value: 'late', letter: 'L', label: 'Late', active: 'bg-amber-500 text-white border-amber-500', idle: 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50 hover:bg-amber-50 dark:hover:bg-amber-950/30' },
  { value: 'excused', letter: 'E', label: 'Excused', active: 'bg-blue-600 text-white border-blue-600', idle: 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-950/30' },
];

function StatusButtons({ value, onChange }: { value: string; onChange: (status: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1" role="group">
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`h-7 w-7 rounded-lg border text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
            value === opt.value ? opt.active : opt.idle
          }`}
        >
          {opt.letter}
        </button>
      ))}
    </div>
  );
}

export function ExamAttendanceManage() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'org_admin';

  // Cascading Organization → Department → Class filters that narrow the
  // Exam dropdown, mirroring the pattern in Course Attendance Management.
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [filterSchool, setFilterSchool] = useState('');
  const [departments, setDepartments] = useState<DepartmentBrief[]>([]);
  const [filterDepartment, setFilterDepartment] = useState('');
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [filterClass, setFilterClass] = useState('');
  const [classesLoading, setClassesLoading] = useState(false);

  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [marks, setMarks] = useState<Record<string, { status: string; notes: string }>>({});
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/schools');
        const list: SchoolBrief[] = data.data || [];
        setSchools(list);
        // org_admin only ever has their own organization — /schools already
        // scopes the list to just it, so auto-select it instead of showing
        // a misleading "All Organizations" default they can't actually use.
        if (isOrgAdmin && list[0]) setFilterSchool(list[0]._id);
      } catch {}
    })();
  }, [isOrgAdmin]);

  // Organization → Departments
  useEffect(() => {
    if (!filterSchool) { setDepartments([]); setFilterDepartment(''); return; }
    setDepartmentsLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/departments?school=${filterSchool}`);
        setDepartments(data.data || []);
      } catch {
        setDepartments([]);
      } finally {
        setDepartmentsLoading(false);
      }
    })();
    setFilterDepartment('');
    setFilterClass('');
    setSelectedExam('');
  }, [filterSchool]);

  // Department → Classes
  useEffect(() => {
    if (!filterDepartment) { setClasses([]); setFilterClass(''); return; }
    setClassesLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/classes?department=${filterDepartment}`);
        setClasses(data.data || []);
      } catch {
        setClasses([]);
      } finally {
        setClassesLoading(false);
      }
    })();
    setFilterClass('');
    setSelectedExam('');
  }, [filterDepartment]);

  useEffect(() => { setSelectedExam(''); }, [filterClass]);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '200' };
      if (filterSchool) params.school = filterSchool;
      const { data } = await api.get('/exams', { params });
      setExams(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, [filterSchool]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  // Exams don't carry a department/class query param on the backend — the
  // Class narrows client-side against each exam's populated course.class.
  const examsToShow = exams.filter((e) => {
    if (filterClass) return e.course?.class?._id === filterClass;
    if (filterDepartment) return e.course?.class?.department?._id === filterDepartment;
    return true;
  });

  // Today's Exams — surfaces same-day exams up front so the invigilator
  // doesn't have to hunt through the cascade/dropdown to find what's due.
  const todayStr = new Date().toDateString();
  const examsToday = examsToShow.filter((e) => e.examDate && new Date(e.examDate).toDateString() === todayStr);

  const loadRoster = async (examId: string) => {
    setSelectedExam(examId);
    setRoster([]);
    setMessage('');
    setStudentSearch('');
    setStatusFilter('');
    if (!examId) return;
    setRosterLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/exams/${examId}/attendance`);
      const entries: RosterEntry[] = data.data || [];
      setRoster(entries);
      const m: Record<string, { status: string; notes: string }> = {};
      entries.forEach((e) => {
        m[e.student._id] = {
          status: e.attendance?.status || 'present',
          notes: e.attendance?.notes || '',
        };
      });
      setMarks(m);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load roster');
    } finally {
      setRosterLoading(false);
    }
  };

  const handleMarkChange = (studentId: string, field: 'status' | 'notes', value: string) => {
    setMarks((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
  };

  // Bulk-mark everyone Present in one click — the common case is nearly
  // everyone showing up for an exam.
  const markAllPresent = () => {
    setMarks((prev) => {
      const next = { ...prev };
      roster.forEach((r) => { next[r.student._id] = { status: 'present', notes: prev[r.student._id]?.notes || '' }; });
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedExam || roster.length === 0) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const records = roster.map((r) => ({
        student: r.student._id,
        status: marks[r.student._id]?.status || 'present',
        notes: marks[r.student._id]?.notes || '',
      }));
      await api.post(`/exams/${selectedExam}/attendance`, { records });
      setMessage(`✅ Attendance saved for ${records.length} student(s)`);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  const effectiveStatus = (studentId: string) => marks[studentId]?.status || 'present';
  const presentCount = roster.filter((r) => effectiveStatus(r.student._id) === 'present').length;
  const absentCount = roster.filter((r) => effectiveStatus(r.student._id) === 'absent').length;
  const lateCount = roster.filter((r) => effectiveStatus(r.student._id) === 'late').length;
  const excusedCount = roster.filter((r) => effectiveStatus(r.student._id) === 'excused').length;

  const rosterToShow = roster.filter((r) => {
    if (statusFilter && effectiveStatus(r.student._id) !== statusFilter) return false;
    if (studentSearch.trim()) {
      const q = studentSearch.trim().toLowerCase();
      const name = `${r.student.profile?.firstName || ''} ${r.student.profile?.lastName || ''}`.toLowerCase();
      if (!name.includes(q) && !r.student.studentId.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const showStickySaveBar = !!selectedExam && roster.length > 0 && !rosterLoading;

  return (
    <div className={`p-6 lg:p-10 pt-20 lg:pt-10 ${showStickySaveBar ? 'pb-28' : ''}`}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">✅ Exam Attendance</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Invigilator portal — mark exam-day attendance</p>
        </div>

        {/* Filters — Organization → Department → Class cascade + Exam */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100/80 dark:border-slate-800 shadow-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              🏢 Organization {isOrgAdmin && <span className="text-slate-400 font-normal">(your org)</span>}
            </label>
            {isOrgAdmin ? (
              <div className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 flex items-center text-sm font-medium text-slate-600 dark:text-slate-300">
                {schools.find((s) => s._id === filterSchool)?.name || 'Your Organization'}
              </div>
            ) : (
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full"
              >
                <option value="">All Organizations</option>
                {schools.map((s) => (<option key={s._id} value={s._id}>{s.name}</option>))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">🏫 Department</label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              disabled={!filterSchool || departmentsLoading}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{!filterSchool ? 'Select organization first' : 'All Departments'}</option>
              {departments.map((d) => (<option key={d._id} value={d._id}>{d.name}</option>))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">👥 Class</label>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              disabled={!filterDepartment || classesLoading}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{!filterDepartment ? 'Select department first' : 'All Classes'}</option>
              {classes.map((c) => (<option key={c._id} value={c._id}>{c.title} ({c.section})</option>))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">📝 Exam</label>
            <select
              value={selectedExam}
              onChange={(e) => loadRoster(e.target.value)}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full"
            >
              <option value="">Choose an exam...</option>
              {examsToShow.map((e) => (
                <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en} ({new Date(e.examDate).toLocaleDateString()})</option>
              ))}
            </select>
          </div>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {/* Clickable stat cards */}
        {selectedExam && roster.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              { key: 'present', count: presentCount, label: 'Present', border: 'border-green-200 dark:border-green-900/50', bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-300', sub: 'text-green-600 dark:text-green-400', ring: 'ring-green-500' },
              { key: 'absent', count: absentCount, label: 'Absent', border: 'border-red-200 dark:border-red-900/50', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', sub: 'text-red-600 dark:text-red-400', ring: 'ring-red-500' },
              { key: 'late', count: lateCount, label: 'Late', border: 'border-amber-200 dark:border-amber-900/50', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', sub: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500' },
              { key: 'excused', count: excusedCount, label: 'Excused', border: 'border-blue-200 dark:border-blue-900/50', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', sub: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500' },
            ] as const).map((stat) => (
              <button
                key={stat.key}
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === stat.key ? '' : stat.key))}
                className={`rounded-xl border ${stat.border} ${stat.bg} p-4 text-center transition-all hover:shadow-sm ${
                  statusFilter === stat.key ? `ring-2 ${stat.ring} ring-offset-1` : ''
                }`}
              >
                <p className={`text-2xl font-bold ${stat.text}`}>{stat.count}</p>
                <p className={`text-xs ${stat.sub}`}>{stat.label}</p>
              </button>
            ))}
          </div>
        )}

        {rosterLoading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!rosterLoading && selectedExam && roster.length === 0 && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">No students enrolled in this exam's course.</p></div>
        )}

        {!rosterLoading && roster.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="p-4 border-b border-[var(--color-border-default)] flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" strokeWidth={1.75} />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student name or ID..."
                  className="w-full h-10 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </div>
              <button
                type="button"
                onClick={markAllPresent}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs font-semibold text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors flex-shrink-0"
              >
                ✅ Mark All Present
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 dark:bg-slate-800/40">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Student</th>
                    <th className="text-center px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase hidden sm:table-cell">Seat</th>
                    <th className="text-center px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase">Status</th>
                    <th className="text-center px-5 py-3 font-semibold text-xs tracking-wider text-slate-500 uppercase hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterToShow.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">
                        No students match this filter.
                      </td>
                    </tr>
                  )}
                  {rosterToShow.map((r, i) => (
                    <tr
                      key={r.student._id}
                      className={`border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors ${
                        i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium">{r.student.profile?.firstName} {r.student.profile?.lastName}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{r.student.studentId}</p>
                      </td>
                      <td className="px-5 py-3 text-center hidden sm:table-cell">
                        {r.seat ? <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{r.seat.room?.name} · {r.seat.deskNumber}</code> : <span className="text-xs text-[var(--color-text-tertiary)]">Unassigned</span>}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <StatusButtons
                          value={marks[r.student._id]?.status || 'present'}
                          onChange={(status) => handleMarkChange(r.student._id, 'status', status)}
                        />
                      </td>
                      <td className="px-5 py-3 text-center hidden md:table-cell">
                        <input
                          type="text"
                          value={marks[r.student._id]?.notes || ''}
                          onChange={(e) => handleMarkChange(r.student._id, 'notes', e.target.value)}
                          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                          placeholder="Optional"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {rosterToShow.length === roster.length ? `${roster.length} students` : `${rosterToShow.length} of ${roster.length} students shown`}
              </p>
            </div>
          </div>
        )}

        {/* Sticky Save bar */}
        {showStickySaveBar && (
          <div className="fixed bottom-0 left-0 right-0 lg:left-72 z-30 border-t border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-3 flex items-center justify-between gap-4">
              <p className="text-xs text-[var(--color-text-tertiary)] hidden sm:block">
                {roster.length} students &middot; {presentCount} present / {absentCount} absent / {lateCount} late / {excusedCount} excused
              </p>
              <div className="flex items-center gap-3 ml-auto">
                {savedFlash && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">✓ Saved</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm"
                >
                  {saving ? 'Saving...' : '💾 Save Attendance'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!selectedExam && (
          <>
            {examsToday.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Today's Exams</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {examsToday.map((e) => (
                    <div
                      key={e._id}
                      onClick={() => loadRoster(e._id)}
                      className="group bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer overflow-hidden p-4 flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-sm text-[var(--color-text-primary)] truncate">{e.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 capitalize ${
                          e.status === 'ongoing' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {e.status}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-tertiary)] truncate">{e.course?.title?.en || 'Untitled Course'}</p>
                      {e.startTime && e.endTime && (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
                          <Clock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
                          {e.startTime} – {e.endTime}
                        </div>
                      )}
                      <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 group-hover:gap-1.5 transition-all">
                        Mark Attendance <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 rounded-2xl p-12 text-center">
                <CalendarX className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" strokeWidth={1.5} />
                <p className="text-lg text-[var(--color-text-secondary)]">No exams scheduled for today.</p>
                <p className="text-sm mt-1 text-[var(--color-text-tertiary)]">👆 Select an exam above to mark attendance.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ExamAttendanceManage;
