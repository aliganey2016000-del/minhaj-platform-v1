/**
 * View Results — Admin
 *
 * Org-wide, read-only gradebook overview: one row per (student, course),
 * each grading category's earned % as its own column, computed from the
 * course's own Grading Rules (weighted scheme). Multi-tenant — every query
 * behind /gradebook-courses/overview is scoped to the caller's organization
 * server-side (org_admin sees only their own org; admin sees every org).
 *
 * Rebuilt from scratch as its own page (previously a tab inside a combined
 * "Manage Results" page) so it never shares state/loading with the entry
 * sheet, and to fix a slow-load complaint traced to computeCourseGrade
 * firing one query per (student, category) — the overview endpoint now
 * batches each category type across every student in a course in a fixed
 * handful of queries (see bulk-grade-calculator.ts), regardless of roster
 * size.
 */
import { useEffect, useState, useCallback } from 'react';
import { Search, CheckCircle2, XCircle, LayoutGrid, BarChart3 } from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';

function initials(first?: string, last?: string): string {
  return `${(first || '?').charAt(0)}${(last || '').charAt(0)}`.toUpperCase();
}

const AVATAR_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500'];
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

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

function PctPill({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="inline-flex min-w-[3rem] items-center justify-center rounded-lg bg-[var(--color-surface-tertiary)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-tertiary)]">—</span>;
  }
  const good = value >= 50;
  return (
    <span
      className={`inline-flex min-w-[3rem] items-center justify-center rounded-lg px-2.5 py-1 text-xs font-bold ${
        good ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      }`}
    >
      {value}%
    </span>
  );
}

function PassFailBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700 dark:bg-green-900/30 dark:text-green-300">Pass</span>
  ) : (
    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-300">Fail</span>
  );
}

const COLUMNS: { label: string; hideBelow?: 'sm' | 'md' | 'lg'; pick: (cats: GradebookCategory[]) => number | null }[] = [
  { label: 'Mid Exam', pick: (c) => pickCategoryPercent(c, { sourceType: 'exam', keywords: ['mid'] }) },
  { label: 'Mid Activity', hideBelow: 'lg', pick: (c) => pickCategoryPercent(c, { excludeSourceType: 'exam', keywords: ['mid'] }) },
  { label: 'Final', pick: (c) => pickCategoryPercent(c, { sourceType: 'exam', keywords: ['final'] }) },
  { label: 'Final Activity', hideBelow: 'lg', pick: (c) => pickCategoryPercent(c, { excludeSourceType: 'exam', keywords: ['final'] }) },
  { label: 'Quizzes', hideBelow: 'md', pick: (c) => pickCategoryPercent(c, { sourceType: 'quizzes' }) },
  { label: 'Assignment', hideBelow: 'md', pick: (c) => pickCategoryPercent(c, { sourceType: 'assignments' }) },
  { label: 'Attendance', hideBelow: 'sm', pick: (c) => pickCategoryPercent(c, { sourceType: 'attendance' }) },
];

const HIDE_CLASS: Record<string, string> = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

export function ResultsView() {
  const [rows, setRows] = useState<GradebookOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'passed' | 'failed'>('');

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (search) params.search = search;
      const { data } = await api.get('/gradebook-courses/overview', { params });
      setRows(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchOverview, 300);
    return () => clearTimeout(t);
  }, [fetchOverview]);

  const passed = rows.filter((r) => r.passed).length;
  const failed = rows.length - passed;
  const visibleRows = statusFilter ? rows.filter((r) => (statusFilter === 'passed' ? r.passed : !r.passed)) : rows;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <BackButton fallback="/admin/exams" />
          <div className="mt-1 flex items-center gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
              <BarChart3 className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">View Results</h1>
              <p className="text-sm text-[var(--color-text-tertiary)]">{rows.length} student record{rows.length === 1 ? '' : 's'} — {passed} passed, {failed} failed</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">
            <p>{error}</p>
            <button onClick={fetchOverview} className="text-primary-600 font-medium text-xs mt-1 hover:underline">Retry</button>
          </div>
        )}

        {/* Stats — gradient tiles doubling as status filter tabs */}
        <div className="grid grid-cols-3 gap-4">
          {([
            { key: '', label: 'All', count: rows.length, icon: LayoutGrid, gradient: 'from-slate-500 to-slate-600' },
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

        {/* Search & Filter */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={2} />
            <input
              type="text"
              placeholder="Search by course title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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

        {loading && rows.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate" style={{ borderSpacing: '0 0.5rem' }}>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  <th className="text-left px-4 py-2 font-semibold">Student Name / ID</th>
                  <th className="text-left px-4 py-2 font-semibold hidden sm:table-cell">Organization / Department</th>
                  <th className="text-left px-4 py-2 font-semibold hidden md:table-cell">Course / Class</th>
                  {COLUMNS.map((col) => (
                    <th key={col.label} className={`text-center px-3 py-2 font-semibold ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ''}`}>{col.label}</th>
                  ))}
                  <th className="text-center px-4 py-2 font-semibold">Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={4 + COLUMNS.length} className="text-center py-16 text-[var(--color-text-tertiary)]">
                      <p className="text-lg mb-1">📊 No results found</p>
                      <p className="text-sm">Set up Grading Rules for a course to see student breakdowns here.</p>
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((r, i) => (
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
                      {COLUMNS.map((col) => (
                        <td key={col.label} className={`px-3 py-3 text-center border-y border-[var(--color-border-default)] ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ''}`}>
                          <PctPill value={col.pick(r.categories)} />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center rounded-r-2xl border-y border-r border-[var(--color-border-default)]">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-bold text-[var(--color-text-primary)]">{r.grandTotal}%</span>
                          <PassFailBadge passed={r.passed} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResultsView;
