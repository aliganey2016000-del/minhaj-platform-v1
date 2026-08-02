/**
 * Grading Rules Management — a single organization-wide screen listing
 * every course with its grading-scheme status (configured or not), so an
 * org_admin can jump straight into any course's weighted Grading Rules
 * editor without hunting through Course Builder one course at a time.
 *
 * This intentionally does NOT reimplement the category/weight editor —
 * clicking "Manage Rules" navigates to the existing, already-proven
 * per-course editor at /admin/courses/:courseId/gradebook (the same page
 * Course Builder's "Gradebook" button already links to), so a teacher's
 * ability to edit their own course's rules from within Course Builder is
 * completely unaffected by this page.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Percent, CheckCircle2, XCircle, LayoutGrid, ArrowRight } from 'lucide-react';
import api from '../../../lib/axios';
import { BackButton } from '../../shared/components/back-button';

interface CourseGradingStatus {
  _id: string;
  title: { en: string };
  slug: string;
  category: string;
  status: 'draft' | 'published' | 'archived';
  teacher: { name: string } | null;
  class: { title: string; section: string } | null;
  configured: boolean;
  categoriesCount: number;
  passingScore: number | null;
}

function StatusPill({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
      <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
      Configured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
      <XCircle className="h-3 w-3" strokeWidth={2.5} />
      Not Set Up
    </span>
  );
}

export function GradingRulesManage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseGradingStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'' | 'configured' | 'unconfigured'>('');

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (search) params.search = search;
      const { data } = await api.get('/gradebook-courses', { params });
      setCourses(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchCourses, 300);
    return () => clearTimeout(t);
  }, [fetchCourses]);

  const configuredCount = courses.filter((c) => c.configured).length;
  const unconfiguredCount = courses.length - configuredCount;
  const visibleCourses = courses.filter((c) => {
    if (filter === 'configured') return c.configured;
    if (filter === 'unconfigured') return !c.configured;
    return true;
  });

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <BackButton fallback="/admin/exams" />
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mt-1">📐 Grading Rules</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Manage weighted grading rules for every course in your organization from one place.
          </p>
        </div>

        {/* Stats — gradient tiles doubling as status filter tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {([
            { key: '', label: 'All Courses', count: courses.length, icon: LayoutGrid, gradient: 'from-slate-500 to-slate-600' },
            { key: 'configured', label: 'Configured', count: configuredCount, icon: CheckCircle2, gradient: 'from-green-500 to-emerald-600' },
            { key: 'unconfigured', label: 'Not Set Up', count: unconfiguredCount, icon: XCircle, gradient: 'from-amber-500 to-orange-600' },
          ] as const).map((s) => (
            <button
              key={s.key || 'all'}
              type="button"
              onClick={() => setFilter(s.key)}
              className={`rounded-2xl bg-gradient-to-br ${s.gradient} p-4 text-white shadow-sm relative overflow-hidden text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${
                filter === s.key ? 'ring-2 ring-offset-2 ring-offset-[var(--color-surface-primary)] ring-slate-900 dark:ring-white' : ''
              }`}
            >
              <s.icon className="absolute -right-2 -bottom-2 h-16 w-16 opacity-20" strokeWidth={1.5} />
              <p className="text-2xl font-bold relative">{s.count}</p>
              <p className="text-xs text-white/85 relative">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>
        ) : visibleCourses.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--color-border-default)] p-12 text-center text-[var(--color-text-tertiary)]">
            <Percent className="mx-auto h-10 w-10 opacity-40" strokeWidth={1.5} />
            <p className="mt-4 text-lg font-medium text-[var(--color-text-primary)]">No courses found</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleCourses.map((c) => (
              <div
                key={c._id}
                onClick={() => navigate(`/admin/courses/${c._id}/gradebook`)}
                className="flex cursor-pointer items-center gap-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[var(--color-text-primary)] truncate" dir="auto">{c.title?.en}</h3>
                    <StatusPill configured={c.configured} />
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                    {c.teacher?.name || 'No teacher assigned'}
                    {c.class && <> · {c.class.title} ({c.class.section})</>}
                    {c.configured && <> · {c.categoriesCount} categories · Passing score {c.passingScore}%</>}
                  </p>
                </div>
                <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary-50 dark:bg-primary-950/30 px-3.5 py-2 text-sm font-semibold text-primary-700 dark:text-primary-300">
                  {c.configured ? 'Manage Rules' : 'Set Up Rules'}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GradingRulesManage;
