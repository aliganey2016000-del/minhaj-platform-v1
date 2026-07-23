/**
 * Course Gradebook — weighted grading scheme configuration + the computed
 * class gradebook. Shared between Admin and Teacher portals (teacher is
 * restricted server-side to their own courses).
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';

type SourceType = 'attendance' | 'assignments' | 'quizzes' | 'exam' | 'manual';

interface Category {
  key: string;
  label: string;
  weight: number;
  sourceType: SourceType;
  examId?: string;
}

interface Scheme {
  categories: Category[];
  passingScore: number;
  latePenaltyPercent: number;
  bonusCapPercent: number;
  dropLowestQuiz: boolean;
}

interface CategoryResult {
  key: string;
  label: string;
  weight: number;
  sourceType: string;
  earnedPercent: number;
  contribution: number;
  detail?: string;
}

interface StudentGrade {
  studentId: string;
  studentCode: string;
  name: string;
  categories: CategoryResult[];
  weightedTotal: number;
  bonusApplied: number;
  finalGrade: number;
  passingScore: number;
  passed: boolean;
}

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: 'attendance', label: 'Attendance (auto)' },
  { value: 'assignments', label: 'Assignments (auto)' },
  { value: 'quizzes', label: 'Quizzes (auto)' },
  { value: 'exam', label: 'Specific Exam (auto)' },
  { value: 'manual', label: 'Manual Entry (e.g. Participation)' },
];

function emptyCategory(): Category {
  return { key: `cat_${Math.random().toString(36).slice(2, 8)}`, label: '', weight: 0, sourceType: 'manual' };
}

interface CourseGradebookProps {
  basePath?: string;
}

export function CourseGradebook({ basePath = '/admin' }: CourseGradebookProps) {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'rules' | 'grades'>('rules');

  const [scheme, setScheme] = useState<Scheme>({ categories: [], passingScore: 60, latePenaltyPercent: 0, bonusCapPercent: 0, dropLowestQuiz: false });
  const [exams, setExams] = useState<{ _id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [gradesConfigured, setGradesConfigured] = useState(true);
  const [gradesLoading, setGradesLoading] = useState(false);

  const fetchScheme = useCallback(async () => {
    setLoading(true);
    try {
      const [schemeRes, examsRes] = await Promise.all([
        api.get(`/gradebook/${courseId}/scheme`),
        api.get('/exams', { params: { courseId, limit: 100 } }),
      ]);
      setScheme(schemeRes.data.data);
      setExams((examsRes.data.data || []).map((e: any) => ({ _id: e._id, title: e.title })));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load grading scheme');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const fetchGrades = useCallback(async () => {
    setGradesLoading(true);
    try {
      const { data } = await api.get(`/gradebook/${courseId}/grades`);
      setGrades(data.data.students || []);
      setGradesConfigured(data.data.configured);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load grades');
    } finally {
      setGradesLoading(false);
    }
  }, [courseId]);

  useEffect(() => { fetchScheme(); }, [fetchScheme]);
  useEffect(() => { if (tab === 'grades') fetchGrades(); }, [tab, fetchGrades]);

  const totalWeight = scheme.categories.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

  const updateCategory = (idx: number, patch: Partial<Category>) => {
    setScheme((prev) => ({ ...prev, categories: prev.categories.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  };
  const addCategory = () => setScheme((prev) => ({ ...prev, categories: [...prev.categories, emptyCategory()] }));
  const removeCategory = (idx: number) => setScheme((prev) => ({ ...prev, categories: prev.categories.filter((_, i) => i !== idx) }));

  const handleSaveScheme = async () => {
    setError(''); setMessage('');
    if (Math.abs(totalWeight - 100) > 0.01) {
      setError(`Category weights must add up to 100% — currently ${totalWeight}%.`);
      return;
    }
    setSaving(true);
    try {
      await api.put(`/gradebook/${courseId}/scheme`, scheme);
      setMessage('Grading scheme saved.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save grading scheme');
    } finally {
      setSaving(false);
    }
  };

  const handleManualEdit = async (studentId: string, categoryKey: string, score: number) => {
    try {
      await api.put(`/gradebook/${courseId}/manual/${studentId}`, { categoryKey, score });
      fetchGrades();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save grade entry');
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/gradebook/${courseId}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gradebook.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed');
    }
  };

  const ic = 'w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2.5 py-1.5 text-xs';

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <button onClick={() => navigate(`${basePath}/courses`)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mb-1">← Back to Courses</button>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">📐 Gradebook</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Weighted grading rules and computed student grades.</p>
        </div>

        <div className="inline-flex rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-1">
          <button onClick={() => setTab('rules')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === 'rules' ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)]'}`}>Grading Rules</button>
          <button onClick={() => setTab('grades')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === 'grades' ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)]'}`}>Gradebook</button>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}
        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}

        {tab === 'rules' && (
          loading ? (
            <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>
          ) : (
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Grading Categories</h3>
                  <span className={`text-xs font-semibold ${Math.abs(totalWeight - 100) < 0.01 ? 'text-green-600' : 'text-red-500'}`}>Total: {totalWeight}% {Math.abs(totalWeight - 100) < 0.01 ? '✓' : '(must equal 100%)'}</span>
                </div>
                <div className="space-y-2">
                  {scheme.categories.map((cat, idx) => (
                    <div key={cat.key} className="grid grid-cols-12 gap-2 items-center rounded-xl border border-[var(--color-border-default)] p-2.5">
                      <input className={`${ic} col-span-3`} placeholder="Category name" value={cat.label} onChange={(e) => updateCategory(idx, { label: e.target.value })} />
                      <input type="number" className={`${ic} col-span-2`} placeholder="Weight %" value={cat.weight} onChange={(e) => updateCategory(idx, { weight: Number(e.target.value) })} />
                      <select className={`${ic} col-span-4`} value={cat.sourceType} onChange={(e) => updateCategory(idx, { sourceType: e.target.value as SourceType, examId: undefined })}>
                        {SOURCE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      {cat.sourceType === 'exam' ? (
                        <select className={`${ic} col-span-2`} value={cat.examId || ''} onChange={(e) => updateCategory(idx, { examId: e.target.value })}>
                          <option value="">Select exam...</option>
                          {exams.map((ex) => <option key={ex._id} value={ex._id}>{ex.title}</option>)}
                        </select>
                      ) : <div className="col-span-2" />}
                      <button onClick={() => removeCategory(idx)} className="col-span-1 text-red-500 hover:text-red-700 text-xs font-semibold">✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={addCategory} className="mt-2 text-xs font-semibold text-primary-600 hover:underline">+ Add Category</button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-[var(--color-border-subtle)] pt-4">
                <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Passing Score (%)</label><input type="number" className={ic} value={scheme.passingScore} onChange={(e) => setScheme((p) => ({ ...p, passingScore: Number(e.target.value) }))} /></div>
                <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Late Penalty (%)</label><input type="number" className={ic} value={scheme.latePenaltyPercent} onChange={(e) => setScheme((p) => ({ ...p, latePenaltyPercent: Number(e.target.value) }))} /></div>
                <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Bonus Cap (%)</label><input type="number" className={ic} value={scheme.bonusCapPercent} onChange={(e) => setScheme((p) => ({ ...p, bonusCapPercent: Number(e.target.value) }))} /></div>
                <label className="flex items-center gap-2 mt-5 text-xs font-semibold text-[var(--color-text-secondary)]">
                  <input type="checkbox" checked={scheme.dropLowestQuiz} onChange={(e) => setScheme((p) => ({ ...p, dropLowestQuiz: e.target.checked }))} /> Drop Lowest Quiz
                </label>
              </div>

              <button onClick={handleSaveScheme} disabled={saving} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : '💾 Save Grading Rules'}
              </button>
            </div>
          )
        )}

        {tab === 'grades' && (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <button onClick={() => handleExport('csv')} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)] transition-colors">⬇ CSV</button>
              <button onClick={() => handleExport('xlsx')} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)] transition-colors">⬇ Excel</button>
            </div>
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card overflow-hidden">
              {gradesLoading ? (
                <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>
              ) : !gradesConfigured ? (
                <p className="text-center text-sm text-[var(--color-text-tertiary)] py-10">Set up grading rules first (see the "Grading Rules" tab).</p>
              ) : grades.length === 0 ? (
                <p className="text-center text-sm text-[var(--color-text-tertiary)] py-10">No students enrolled in this course yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold">Student</th>
                        {grades[0].categories.map((c) => <th key={c.key} className="text-center px-3 py-2.5 font-semibold">{c.label}<br /><span className="font-normal text-[var(--color-text-tertiary)]">{c.weight}%</span></th>)}
                        <th className="text-center px-3 py-2.5 font-semibold">Bonus</th>
                        <th className="text-center px-3 py-2.5 font-semibold">Final</th>
                        <th className="text-center px-3 py-2.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-subtle)]">
                      {grades.map((g) => (
                        <tr key={g.studentId} className="hover:bg-[var(--color-surface-secondary)] transition-colors">
                          <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)] whitespace-nowrap">{g.name || g.studentCode}</td>
                          {g.categories.map((c) => (
                            <td key={c.key} className="px-3 py-2.5 text-center" title={c.detail}>
                              {c.sourceType === 'manual' ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  defaultValue={c.earnedPercent}
                                  onBlur={(e) => { const v = Number(e.target.value); if (v !== c.earnedPercent) handleManualEdit(g.studentId, c.key, v); }}
                                  className="w-14 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-1.5 py-1 text-center text-xs"
                                />
                              ) : (
                                <span>{c.earnedPercent}%</span>
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={g.bonusApplied}
                              onBlur={(e) => { const v = Number(e.target.value); if (v !== g.bonusApplied) handleManualEdit(g.studentId, '__bonus', v); }}
                              className="w-14 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-1.5 py-1 text-center text-xs"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-[var(--color-text-primary)]">{g.finalGrade}%</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.passed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                              {g.passed ? 'Pass' : 'Fail'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CourseGradebook;
