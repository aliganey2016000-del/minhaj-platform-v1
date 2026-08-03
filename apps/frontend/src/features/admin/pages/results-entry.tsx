/**
 * Enter Results — Admin
 *
 * Course-centric bulk score entry: pick a course, then key in every
 * enrolled student's Mid Exam / Mid Activity / Final / Final Activity score
 * in one sheet. Every course is selectable — if a course has no Grading
 * Rules category matching one of the 4 columns yet, the backend
 * auto-provisions it the moment this page loads that course (see
 * ensureManualEntryCategories in gradebook.controller.ts), so all 4 columns
 * are always fillable. A column an admin marked hidden from teachers
 * (teacherVisible: false on that category) shows as "not set up" for a
 * teacher, same as a genuinely missing category. Multi-tenant: every
 * endpoint here is scoped server-side to the caller's organization and, for
 * teachers, to only the courses they teach.
 *
 * Rebuilt from scratch as its own page (previously a tab inside a combined
 * "Manage Results" page), so entering scores never shares loading/error
 * state with the org-wide View Results table.
 */
import { useEffect, useState } from 'react';
import { ClipboardEdit, Save, Loader2, AlertTriangle } from 'lucide-react';
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

interface CourseBrief {
  _id: string;
  title: { en: string };
  class?: { title: string; section: string } | null;
}

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
  slots: Record<ManualEntrySlot, { key: string; label: string; weight: number } | null>;
  organization: string;
  courseClass: string;
  passingScore: number;
  students: ManualEntryRosterStudent[];
}

interface ResultsEntryProps {
  /** BackButton's fallback route — defaults to the admin exams hub; the teacher portal passes '/teacher'. */
  backFallback?: string;
}

export function ResultsEntry({ backFallback = '/admin/exams' }: ResultsEntryProps) {
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [roster, setRoster] = useState<ManualEntryRoster | null>(null);
  const [entryValues, setEntryValues] = useState<Record<string, Record<ManualEntrySlot, string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/gradebook-courses');
        setCourses(data.data || []);
      } catch { /* course list stays empty; the empty-state below handles it */ }
    })();
  }, []);

  const loadCourse = async (courseId: string) => {
    setSelectedCourseId(courseId);
    setMessage('');
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
    } finally {
      setLoading(false);
    }
  };

  const handleEntryChange = (studentId: string, slot: ManualEntrySlot, value: string) => {
    setEntryValues((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [slot]: value } }));
  };

  const handleSubmit = async () => {
    if (!selectedCourseId || !roster || roster.students.length === 0) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const entries: { studentId: string; slot: ManualEntrySlot; score: number }[] = [];
      roster.students.forEach((s) => {
        MANUAL_ENTRY_SLOTS.forEach(({ slot }) => {
          if (!roster.slots[slot]) return;
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
      const saved = data.data?.saved ?? entries.length;
      setMessage(`Saved ${saved} score${saved === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save results');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-none space-y-6">
        <div>
          <BackButton fallback={backFallback} />
          <div className="mt-1 flex items-center gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <ClipboardEdit className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Enter Results</h1>
              <p className="text-sm text-[var(--color-text-tertiary)]">Record Mid Exam, Mid Activity, Final, and Final Activity scores for a course</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5 block">Select Course</label>
          <select
            value={selectedCourseId}
            onChange={(e) => loadCourse(e.target.value)}
            className="w-full max-w-xl rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          >
            <option value="">Choose a course...</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>{c.title?.en}{c.class ? ` · ${c.class.title} (${c.class.section})` : ''}</option>
            ))}
          </select>
          {roster && (
            <p className="mt-2.5 text-xs text-[var(--color-text-tertiary)]">
              {roster.organization}{roster.organization && roster.courseClass ? ' · ' : ''}{roster.courseClass}
              <span className="mx-1.5">|</span>
              Passing score: <strong className="text-[var(--color-text-secondary)]">{roster.passingScore}%</strong>
            </p>
          )}
          {courses.length === 0 && (
            <p className="mt-2.5 text-xs text-[var(--color-text-tertiary)]">No courses found.</p>
          )}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}
        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700 dark:text-green-400">{message}</div>}

        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          </div>
        )}

        {!loading && selectedCourseId && roster && roster.students.length > 0 && (
          <>
            {(() => {
              const zeroWeightLabels = MANUAL_ENTRY_SLOTS.filter(({ slot }) => roster.slots[slot] && roster.slots[slot]!.weight === 0).map(({ label }) => label);
              if (zeroWeightLabels.length === 0) return null;
              return (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3.5 flex items-start gap-2.5 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <p>
                    <strong>{zeroWeightLabels.join(', ')}</strong> {zeroWeightLabels.length === 1 ? 'is' : 'are'} set to 0% weight for this course —
                    scores entered here are saved but won't affect the student's Final Grade until you assign a weight to{' '}
                    {zeroWeightLabels.length === 1 ? 'it' : 'them'} in Grading Rules.
                  </p>
                </div>
              );
            })()}
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
                    <th className="text-left px-4 py-2 font-semibold">Student Name / ID</th>
                    <th className="text-left px-4 py-2 font-semibold hidden sm:table-cell">Organization / Department</th>
                    {MANUAL_ENTRY_SLOTS.map(({ slot, label }) => {
                      const zeroWeight = roster.slots[slot] && roster.slots[slot]!.weight === 0;
                      return (
                        <th key={slot} className="text-left px-4 py-2 font-semibold">
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {zeroWeight && (
                              <span title="0% weight — scores here won't count toward the Final Grade until you set a weight in Grading Rules">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" strokeWidth={2} />
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {roster.students.map((s, i) => (
                    <tr key={s.studentId} className={`border-b border-[var(--color-border-subtle)] ${i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/40' : ''}`}>
                      <td className="px-4 py-1.5">
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
                      <td className="px-4 py-1.5 hidden sm:table-cell text-xs text-[var(--color-text-secondary)] truncate">
                        {roster.organization}{roster.organization && s.department ? ' · ' : ''}{s.department}
                      </td>
                      {MANUAL_ENTRY_SLOTS.map(({ slot }) => {
                        const active = !!roster.slots[slot];
                        return (
                          <td className="px-4 py-1.5" key={slot}>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={entryValues[s.studentId]?.[slot] || ''}
                              onChange={(e) => handleEntryChange(s.studentId, slot, e.target.value)}
                              disabled={!active}
                              className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-30 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                              placeholder={active ? '/ 100' : 'not set up'}
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
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors shadow-md"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save All Results'}
              </button>
            </div>
          </div>
          </>
        )}

        {!loading && selectedCourseId && roster && roster.students.length === 0 && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">No students enrolled in this course.</p></div>
        )}

        {!selectedCourseId && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">👆 Select a course above to enter results</p></div>
        )}
      </div>
    </div>
  );
}

export default ResultsEntry;
