/**
 * Grading Rules Management — a single organization-wide screen listing
 * every course with its grading-scheme status (configured or not), so an
 * org_admin can jump straight into any course's weighted Grading Rules
 * editor without hunting through Course Builder one course at a time.
 *
 * Also supports building ONE grading-rules template and applying it to many
 * courses at once (Select Courses -> Apply Template), instead of repeating
 * the same category setup course by course. Exam-specific categories aren't
 * available in a bulk template — each course has its own distinct exams, so
 * those still need to be added per course from the individual editor.
 *
 * Clicking a single course still navigates to the existing, already-proven
 * per-course editor at /admin/courses/:courseId/gradebook (the same page
 * Course Builder's "Gradebook" button already links to) — a teacher's
 * ability to edit their own course's rules from within Course Builder is
 * completely unaffected by any of this.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Percent, CheckCircle2, XCircle, LayoutGrid, ArrowRight, CheckSquare, Square, X, Plus, Trash2, Layers } from 'lucide-react';
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

type BulkSourceType = 'attendance' | 'assignments' | 'quizzes' | 'manual';

interface BulkCategory {
  key: string;
  label: string;
  weight: number;
  sourceType: BulkSourceType;
}

const BULK_SOURCE_TYPES: { value: BulkSourceType; label: string }[] = [
  { value: 'attendance', label: 'Attendance (auto)' },
  { value: 'assignments', label: 'Assignments (auto)' },
  { value: 'quizzes', label: 'Quizzes (auto)' },
  { value: 'manual', label: 'Manual Entry (e.g. Participation)' },
];

function emptyBulkCategory(): BulkCategory {
  return { key: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label: '', weight: 0, sourceType: 'manual' };
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
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'' | 'configured' | 'unconfigured'>('');

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateCategories, setTemplateCategories] = useState<BulkCategory[]>([emptyBulkCategory()]);
  const [passingScore, setPassingScore] = useState(60);
  const [latePenaltyPercent, setLatePenaltyPercent] = useState(0);
  const [bonusCapPercent, setBonusCapPercent] = useState(0);
  const [dropLowestQuiz, setDropLowestQuiz] = useState(false);
  const [applying, setApplying] = useState(false);

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

  const totalWeight = templateCategories.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const weightValid = Math.abs(totalWeight - 100) < 0.01;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const openTemplateModal = () => {
    setTemplateCategories([emptyBulkCategory()]);
    setPassingScore(60);
    setLatePenaltyPercent(0);
    setBonusCapPercent(0);
    setDropLowestQuiz(false);
    setShowTemplateModal(true);
  };

  const updateCategory = (key: string, patch: Partial<BulkCategory>) => {
    setTemplateCategories((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const handleApplyTemplate = async () => {
    setApplying(true);
    setError('');
    try {
      const payload = {
        courseIds: [...selectedIds],
        categories: templateCategories.map((c) => ({ ...c, label: c.label.trim() })),
        passingScore,
        latePenaltyPercent,
        bonusCapPercent,
        dropLowestQuiz,
      };
      const { data } = await api.post('/gradebook-courses/bulk-apply', payload);
      setMessage(data.message || 'Grading rules applied.');
      setShowTemplateModal(false);
      exitSelectMode();
      fetchCourses();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to apply grading rules');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <BackButton fallback="/admin/exams" />
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mt-1">📐 Grading Rules</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Manage weighted grading rules for every course in your organization from one place.
            </p>
          </div>
          {!selectMode ? (
            <button
              onClick={() => setSelectMode(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              <Layers className="h-4 w-4" strokeWidth={2} />
              Apply One Template to Many Courses
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={exitSelectMode}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2} />
                Cancel
              </button>
              <button
                onClick={openTemplateModal}
                disabled={selectedIds.size === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                <Layers className="h-4 w-4" strokeWidth={2} />
                Apply Template to {selectedIds.size} Course{selectedIds.size === 1 ? '' : 's'}
              </button>
            </div>
          )}
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

        {message && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
            {message}
            <button onClick={() => setMessage('')} className="ml-3 underline">Dismiss</button>
          </div>
        )}
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
            {visibleCourses.map((c) => {
              const isSelected = selectedIds.has(c._id);
              return (
                <div
                  key={c._id}
                  onClick={() => (selectMode ? toggleSelect(c._id) : navigate(`/admin/courses/${c._id}/gradebook`))}
                  className={`flex cursor-pointer items-center gap-4 rounded-2xl border bg-[var(--color-surface-primary)] px-5 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    isSelected ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-[var(--color-border-default)]'
                  }`}
                >
                  {selectMode && (
                    <span className="flex-shrink-0 text-primary-600">
                      {isSelected ? <CheckSquare className="h-5 w-5" strokeWidth={2} /> : <Square className="h-5 w-5 text-[var(--color-text-tertiary)]" strokeWidth={2} />}
                    </span>
                  )}
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
                  {!selectMode && (
                    <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary-50 dark:bg-primary-950/30 px-3.5 py-2 text-sm font-semibold text-primary-700 dark:text-primary-300">
                      {c.configured ? 'Manage Rules' : 'Set Up Rules'}
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowTemplateModal(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Build Grading Template</h2>
              <button onClick={() => setShowTemplateModal(false)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
              Applying to <strong>{selectedIds.size}</strong> course{selectedIds.size === 1 ? '' : 's'}. Exam-specific categories aren't
              available here since each course has its own exams — add those individually from a course's own editor.
            </p>

            <div className="space-y-2.5">
              {templateCategories.map((cat) => (
                <div key={cat.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border-subtle)] p-3">
                  <input
                    type="text"
                    value={cat.label}
                    onChange={(e) => updateCategory(cat.key, { label: e.target.value })}
                    placeholder="Category label (e.g. Quizzes)"
                    className="flex-1 min-w-[10rem] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={cat.weight}
                    onChange={(e) => updateCategory(cat.key, { weight: Number(e.target.value) })}
                    className="w-20 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />
                  <span className="text-xs text-[var(--color-text-tertiary)]">%</span>
                  <select
                    value={cat.sourceType}
                    onChange={(e) => updateCategory(cat.key, { sourceType: e.target.value as BulkSourceType })}
                    className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  >
                    {BULK_SOURCE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <button
                    onClick={() => setTemplateCategories((prev) => prev.filter((c) => c.key !== cat.key))}
                    disabled={templateCategories.length === 1}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setTemplateCategories((prev) => [...prev, emptyBulkCategory()])}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} />
                Add Category
              </button>
            </div>

            <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${weightValid ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>
              Total: {totalWeight}% {weightValid ? '✓' : '(must equal 100%)'}
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Passing Score (%)</label>
                <input type="number" min={0} max={100} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Late Penalty (%)</label>
                <input type="number" min={0} max={100} value={latePenaltyPercent} onChange={(e) => setLatePenaltyPercent(Number(e.target.value))} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Bonus Cap (%)</label>
                <input type="number" min={0} max={100} value={bonusCapPercent} onChange={(e) => setBonusCapPercent(Number(e.target.value))} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              </div>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={dropLowestQuiz} onChange={(e) => setDropLowestQuiz(e.target.checked)} className="h-4 w-4 rounded border-[var(--color-border-default)]" />
              Drop lowest quiz
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowTemplateModal(false)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
                Cancel
              </button>
              <button
                onClick={handleApplyTemplate}
                disabled={applying || !weightValid || templateCategories.some((c) => !c.label.trim())}
                className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {applying ? 'Applying...' : `Apply to ${selectedIds.size} Course${selectedIds.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GradingRulesManage;
