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
import { Search, CheckCircle2, XCircle, LayoutGrid } from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';

interface CourseBrief {
  _id: string;
  title: { en: string };
  class?: { title: string; section: string } | null;
  configured: boolean;
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

// ---------------------------------------------------------------------------
// Manual Entry Roster — the "Enter Results" bulk sheet. Fixed 4 UI columns
// (Mid Exam, Mid Activity, Final, Final Activity) matched onto whichever
// categories the selected course's own GradingScheme defines with those
// labels — a slot with no matching category is disabled for that course,
// since there's nothing configured to save it against.
// ---------------------------------------------------------------------------
type ManualEntrySlot = 'midExam' | 'midActivity' | 'final' | 'finalActivity';
const MANUAL_ENTRY_SLOTS: { slot: ManualEntrySlot; label: string }[] = [
  { slot: 'midExam', label: 'Mid Exam' },
  { slot: 'midActivity', label: 'Mid Activity' },
  { slot: 'final', label: 'Final' },
  { slot: 'finalActivity', label: 'Final Activity' },
];

interface ManualEntryRosterStudent {
  studentId: string;
  studentCode: string;
  studentName: string;
  department: string;
  scores: Record<ManualEntrySlot, number | null>;
}

interface ManualEntryRoster {
  slots: Record<ManualEntrySlot, { key: string; label: string } | null>;
  organization: string;
  courseClass: string;
  passingScore: number;
  students: ManualEntryRosterStudent[];
}

function PassFailBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700 dark:bg-green-900/30 dark:text-green-300">Pass</span>
  ) : (
    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-300">Fail</span>
  );
}

// ---------------------------------------------------------------------------
// Org-wide Gradebook Overview — one row per (student, course), each grading
// category's earned % as its own column. Feeds the View Results table.
// ---------------------------------------------------------------------------

interface GradebookCategory {
  key: string;
  label: string;
  sourceType: string;
  earnedPercent: number;
}

interface GradebookOverviewRow {
  studentId: string;
  studentCode: string;
  studentName: string;
  organization: string;
  department: string;
  courseClass: string;
  categories: GradebookCategory[];
  grandTotal: number;
  passed: boolean;
  passingScore: number;
}

/** Finds the first category matching a sourceType and/or label keywords, for mapping flexible-labeled scheme categories onto fixed table columns. */
function pickCategoryPercent(
  categories: GradebookCategory[],
  opts: { sourceType?: string; excludeSourceType?: string; keywords?: string[] }
): number | null {
  const found = categories.find((c) => {
    if (opts.sourceType && c.sourceType !== opts.sourceType) return false;
    if (opts.excludeSourceType && c.sourceType === opts.excludeSourceType) return false;
    if (opts.keywords && !opts.keywords.some((k) => c.label.toLowerCase().includes(k))) return false;
    return true;
  });
  return found ? found.earnedPercent : null;
}

function PctCell({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-[var(--color-text-tertiary)]">—</span>
  ) : (
    <span className={`font-semibold ${value >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{value}%</span>
  );
}

export function ResultsManage() {
  const [tab, setTab] = useState<'view' | 'enter'>('view');
  const [overviewRows, setOverviewRows] = useState<GradebookOverviewRow[]>([]);
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'passed' | 'failed'>('');

  // Bulk entry state
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [roster, setRoster] = useState<ManualEntryRoster | null>(null);
  const [entryValues, setEntryValues] = useState<Record<string, Record<ManualEntrySlot, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCourses(); }, []);

  const fetchCourses = async () => {
    try {
      const { data } = await api.get('/gradebook-courses');
      setCourses((data.data || []).filter((c: CourseBrief) => c.configured));
    } catch {}
  };

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (search) params.search = search;
      const { data } = await api.get('/gradebook-courses/overview', { params });
      setOverviewRows(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load results');
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchOverview, 300);
    return () => clearTimeout(t);
  }, [fetchOverview]);

  const loadCourseForEntry = async (courseId: string) => {
    setSelectedCourseId(courseId);
    if (!courseId) { setRoster(null); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/gradebook/${courseId}/manual-entry-roster`);
      const r: ManualEntryRoster = data.data;
      setRoster(r);
      const values: Record<string, Record<ManualEntrySlot, string>> = {};
      r.students.forEach((s) => {
        values[s.studentId] = {
          midExam: s.scores.midExam === null ? '' : String(s.scores.midExam),
          midActivity: s.scores.midActivity === null ? '' : String(s.scores.midActivity),
          final: s.scores.final === null ? '' : String(s.scores.final),
          finalActivity: s.scores.finalActivity === null ? '' : String(s.scores.finalActivity),
        };
      });
      setEntryValues(values);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load students');
    } finally { setLoading(false); }
  };

  const handleEntryChange = (studentId: string, slot: ManualEntrySlot, value: string) => {
    setEntryValues((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [slot]: value },
    }));
  };

  const handleBulkSubmit = async () => {
    if (!selectedCourseId || !roster || roster.students.length === 0) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const entries: { studentId: string; slot: ManualEntrySlot; score: number }[] = [];
      roster.students.forEach((s) => {
        MANUAL_ENTRY_SLOTS.forEach(({ slot }) => {
          if (!roster.slots[slot]) return; // course has no category for this slot
          const raw = entryValues[s.studentId]?.[slot];
          if (raw === undefined || raw === '') return;
          const score = Number(raw);
          if (!Number.isNaN(score)) entries.push({ studentId: s.studentId, slot, score });
        });
      });

      if (entries.length === 0) {
        setError('Enter at least one score before saving.');
        return;
      }

      const { data } = await api.post(`/gradebook/${selectedCourseId}/manual-entry-roster/bulk`, { entries });
      setMessage(`✅ Saved ${data.data?.saved ?? entries.length} score${(data.data?.saved ?? entries.length) === 1 ? '' : 's'}!`);
      fetchOverview();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save results');
    } finally { setSaving(false); }
  };

  // ── Dynamic stats from the current gradebook overview ──
  const passed = overviewRows.filter(r => r.passed).length;
  const failed = overviewRows.length - passed;
  const visibleRows = statusFilter ? overviewRows.filter(r => (statusFilter === 'passed' ? r.passed : !r.passed)) : overviewRows;

  if (loading && overviewRows.length === 0 && tab === 'view') {
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className={`mx-auto space-y-6 ${tab === 'enter' ? 'max-w-none' : 'max-w-7xl'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <BackButton fallback="/admin/exams" />
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mt-1">📊 Manage Results</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{overviewRows.length} student record{overviewRows.length === 1 ? '' : 's'} — {passed} passed, {failed} failed</p>
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
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600"><p>{error}</p><button onClick={fetchOverview} className="text-primary-600 font-medium text-xs mt-1 hover:underline">Retry</button></div>}

        {/* ── View Results Tab — org-wide gradebook overview ── */}
        {tab === 'view' && (
          <>
            {/* Stats — gradient tiles doubling as status filter tabs */}
            <div className="grid grid-cols-3 gap-4">
              {([
                { key: '', label: 'All', count: overviewRows.length, icon: LayoutGrid, gradient: 'from-slate-500 to-slate-600' },
                { key: 'passed', label: 'Passed', count: passed, icon: CheckCircle2, gradient: 'from-green-500 to-emerald-600' },
                { key: 'failed', label: 'Failed', count: failed, icon: XCircle, gradient: 'from-red-500 to-rose-600' },
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
                  placeholder="Search by course title..."
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
                    <th className="text-left px-4 py-2 font-semibold">Student Name / ID</th>
                    <th className="text-left px-4 py-2 font-semibold hidden sm:table-cell">Organization / Department</th>
                    <th className="text-left px-4 py-2 font-semibold hidden md:table-cell">Course / Class</th>
                    <th className="text-center px-3 py-2 font-semibold">Mid Exam</th>
                    <th className="text-center px-3 py-2 font-semibold hidden lg:table-cell">Mid Activity</th>
                    <th className="text-center px-3 py-2 font-semibold">Final</th>
                    <th className="text-center px-3 py-2 font-semibold hidden lg:table-cell">Final Activity</th>
                    <th className="text-center px-3 py-2 font-semibold hidden md:table-cell">Quizzes</th>
                    <th className="text-center px-3 py-2 font-semibold hidden md:table-cell">Assignment</th>
                    <th className="text-center px-3 py-2 font-semibold hidden sm:table-cell">Attendance</th>
                    <th className="text-center px-4 py-2 font-semibold">Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr><td colSpan={11} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">📊 No results found</p><p className="text-sm">Set up Grading Rules for a course to see student breakdowns here.</p></td></tr>
                  ) : visibleRows.map((r, i) => (
                    <tr key={`${r.studentId}_${i}`} className="shadow-sm hover:shadow-md transition-shadow bg-[var(--color-surface-primary)]">
                      <td className="px-4 py-3 rounded-l-2xl border-y border-l border-[var(--color-border-default)]">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(r.studentId || r.studentName)}`}>
                            {initials(r.studentName.split(' ')[0], r.studentName.split(' ').slice(1).join(' '))}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{r.studentName || 'Unknown Student'}</p>
                            <p className="text-xs text-[var(--color-text-tertiary)]">{r.studentCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-[var(--color-text-secondary)] border-y border-[var(--color-border-default)]">
                        {r.organization}{r.organization && r.department ? ' · ' : ''}{r.department}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-[var(--color-text-secondary)] border-y border-[var(--color-border-default)]">
                        {r.courseClass}
                      </td>
                      <td className="px-3 py-3 text-center border-y border-[var(--color-border-default)]">
                        <PctCell value={pickCategoryPercent(r.categories, { sourceType: 'exam', keywords: ['mid'] })} />
                      </td>
                      <td className="px-3 py-3 text-center hidden lg:table-cell border-y border-[var(--color-border-default)]">
                        <PctCell value={pickCategoryPercent(r.categories, { excludeSourceType: 'exam', keywords: ['mid'] })} />
                      </td>
                      <td className="px-3 py-3 text-center border-y border-[var(--color-border-default)]">
                        <PctCell value={pickCategoryPercent(r.categories, { sourceType: 'exam', keywords: ['final'] })} />
                      </td>
                      <td className="px-3 py-3 text-center hidden lg:table-cell border-y border-[var(--color-border-default)]">
                        <PctCell value={pickCategoryPercent(r.categories, { excludeSourceType: 'exam', keywords: ['final'] })} />
                      </td>
                      <td className="px-3 py-3 text-center hidden md:table-cell border-y border-[var(--color-border-default)]">
                        <PctCell value={pickCategoryPercent(r.categories, { sourceType: 'quizzes' })} />
                      </td>
                      <td className="px-3 py-3 text-center hidden md:table-cell border-y border-[var(--color-border-default)]">
                        <PctCell value={pickCategoryPercent(r.categories, { sourceType: 'assignments' })} />
                      </td>
                      <td className="px-3 py-3 text-center hidden sm:table-cell border-y border-[var(--color-border-default)]">
                        <PctCell value={pickCategoryPercent(r.categories, { sourceType: 'attendance' })} />
                      </td>
                      <td className="px-4 py-3 text-center rounded-r-2xl border-y border-r border-[var(--color-border-default)]">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-bold text-[var(--color-text-primary)]">{r.grandTotal}%</span>
                          <PassFailBadge passed={r.passed} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Enter Results Tab — course-centric manual entry sheet ── */}
        {tab === 'enter' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Select Course</label>
              <select value={selectedCourseId} onChange={e => loadCourseForEntry(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
                <option value="">Choose a course...</option>
                {courses.map(c => (
                  <option key={c._id} value={c._id}>{c.title?.en}{c.class ? ` · ${c.class.title} (${c.class.section})` : ''}</option>
                ))}
              </select>
              {roster && (
                <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                  {roster.organization}{roster.organization && roster.courseClass ? ' · ' : ''}{roster.courseClass} | Passing: <strong>{roster.passingScore}%</strong>
                </p>
              )}
              {courses.length === 0 && (
                <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">No courses have Grading Rules configured yet — set one up first.</p>
              )}
            </div>

            {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

            {selectedCourseId && roster && roster.students.length > 0 && !loading && (
              <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col style={{ width: '26%' }} />
                      <col className="hidden sm:table-column" style={{ width: '18%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                    <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                      <tr>
                        <th className="text-left px-4 py-1.5 font-semibold">Student Name / ID</th>
                        <th className="text-left px-4 py-1.5 font-semibold hidden sm:table-cell">Organization / Department</th>
                        {MANUAL_ENTRY_SLOTS.map(({ slot, label }) => (
                          <th key={slot} className="text-left px-4 py-1.5 font-semibold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {roster.students.map((s, i) => (
                        <tr key={s.studentId} className={`border-b border-[var(--color-border-subtle)] ${i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/40' : ''}`}>
                          <td className="px-4 py-1">
                            <div className="flex items-center gap-2">
                              <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor(s.studentId)}`}>
                                {initials(s.studentName.split(' ')[0], s.studentName.split(' ').slice(1).join(' '))}
                              </span>
                              <div className="min-w-0">
                                <p className="font-medium truncate leading-tight">{s.studentName || 'Unknown Student'}</p>
                                <code className="text-[10px] text-[var(--color-text-tertiary)]">{s.studentCode}</code>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-1 hidden sm:table-cell text-xs text-[var(--color-text-secondary)] truncate">
                            {roster.organization}{roster.organization && s.department ? ' · ' : ''}{s.department}
                          </td>
                          {MANUAL_ENTRY_SLOTS.map(({ slot }) => {
                            const active = !!roster.slots[slot];
                            return (
                              <td className="px-4 py-1" key={slot}>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={entryValues[s.studentId]?.[slot] || ''}
                                  onChange={e => handleEntryChange(s.studentId, slot, e.target.value)}
                                  disabled={!active}
                                  style={{ textAlign: 'left' }}
                                  className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-30 placeholder:text-slate-500 dark:placeholder:text-slate-400"
                                  placeholder={active ? '/ 100' : '— not set up'}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] flex items-center justify-between">
                  <p className="text-xs text-[var(--color-text-tertiary)]">{roster.students.length} students</p>
                  <button onClick={handleBulkSubmit} disabled={saving} className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors shadow-md">
                    {saving ? 'Saving...' : '💾 Save All Results'}
                  </button>
                </div>
              </div>
            )}

            {selectedCourseId && roster && roster.students.length === 0 && !loading && (
              <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">No students enrolled in this course.</p></div>
            )}

            {!selectedCourseId && (
              <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">👆 Select a course above to enter results</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ResultsManage;