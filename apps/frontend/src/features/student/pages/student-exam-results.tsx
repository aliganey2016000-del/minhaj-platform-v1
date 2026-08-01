/**
 * Exam Results & Grades — Student self-service view.
 * Mirrors the Course Attendance page's layout: one card per course
 * (all courses for the student's Class if the org is class-based,
 * or every individually-enrolled course otherwise), each showing a
 * quick metric row and — once expanded — the full points breakdown
 * for that course: quizzes, assignments, exams (mid/final/etc, only
 * published ones), attendance, and any other graded activity.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import api from '../../../lib/axios';

interface ExamResultItem {
  resultId: string;
  title: string;
  examDate: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  status: 'passed' | 'failed' | 'absent';
  feedback?: string;
}

interface AssignmentItem {
  title: string;
  score: number;
  totalMarks: number;
  percentage: number;
  isLate: boolean;
}

interface OtherItem {
  label: string;
  score: number;
}

interface CourseResults {
  courseId: string;
  code: string;
  title: string;
  section: string;
  attendance: { days: number; present: number; absent: number; late: number; excused: number; presentPercentage: number } | null;
  quizzes: { count: number; averagePercent: number } | null;
  assignments: { count: number; averagePercent: number; items: AssignmentItem[] } | null;
  exams: ExamResultItem[];
  other: OtherItem[];
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
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${c[grade] || c['N/A']}`}>{grade}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    passed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    absent: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${c[status] || c.absent}`}>{status}</span>;
}

function MetricBox({ label, value, valueClass }: { label: string; value: number | string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-center min-w-[4.5rem]">
      <p className={`text-sm font-bold tracking-tight ${valueClass || 'text-[var(--color-text-primary)]'}`}>{value}</p>
      <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">{label}</p>
    </div>
  );
}

function downloadResultSlip(courseTitle: string, r: ExamResultItem) {
  const lines = [
    'EXAM RESULT SLIP',
    '='.repeat(40),
    `Exam: ${r.title || ''}`,
    `Course: ${courseTitle}`,
    `Date: ${r.examDate ? new Date(r.examDate).toLocaleDateString() : ''}`,
    '-'.repeat(40),
    `Marks Obtained: ${r.marksObtained} / ${r.totalMarks}`,
    `Percentage: ${r.percentage}%`,
    `Grade: ${r.grade}`,
    `Status: ${r.status}`,
    r.feedback ? `Feedback: ${r.feedback}` : '',
    '='.repeat(40),
  ].filter(Boolean);

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `result-slip-${(r.title || 'exam').replace(/\s+/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function StudentExamResults() {
  const { t } = useTranslation('common');
  const [courses, setCourses] = useState<CourseResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/results/my/courses');
        setCourses(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || t('error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  const allExams = courses.flatMap((c) => c.exams);
  const passed = allExams.filter((r) => r.status === 'passed').length;
  const failed = allExams.filter((r) => r.status === 'failed').length;
  const avgPercent = allExams.length > 0 ? Math.round(allExams.reduce((sum, r) => sum + r.percentage, 0) / allExams.length) : 0;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📊 Exam Results & Grades</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{allExams.length} published exam result{allExams.length === 1 ? '' : 's'}</p>
        </div>

        {allExams.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{passed}</p>
              <p className="text-xs text-green-600 dark:text-green-400">Passed</p>
            </div>
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{failed}</p>
              <p className="text-xs text-red-600 dark:text-red-400">Failed</p>
            </div>
            <div className="rounded-xl border border-primary-200 dark:border-primary-900/50 bg-primary-50 dark:bg-primary-950/30 p-4 text-center">
              <p className="text-2xl font-bold text-primary-700 dark:text-primary-300">{avgPercent}%</p>
              <p className="text-xs text-primary-600 dark:text-primary-400">Average</p>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">📚 Results by Course</h2>
            <span className="rounded-full bg-[var(--color-surface-tertiary)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
              {courses.length} course{courses.length === 1 ? '' : 's'}
            </span>
          </div>

          {courses.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--color-border-default)] p-12 text-center text-[var(--color-text-tertiary)]">
              <p className="text-5xl mb-4">📊</p>
              <p className="text-lg">No courses to show yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {courses.map((c) => {
                const isExpanded = expandedId === c.courseId;
                const hasAnyData = !!c.attendance || !!c.quizzes || !!c.assignments || c.exams.length > 0 || c.other.length > 0;
                return (
                  <div
                    key={c.courseId}
                    className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId((prev) => (prev === c.courseId ? null : c.courseId))}
                      className="w-full flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          {c.code && (
                            <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">{c.code}</span>
                          )}
                          {!hasAnyData && (
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-tight bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              No Records
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-[var(--color-text-primary)] truncate">{c.title}</p>
                        {c.section && <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 truncate">{c.section}</p>}
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <MetricBox label="Quizzes" value={c.quizzes ? `${c.quizzes.averagePercent}%` : '—'} />
                          <MetricBox label="Assignments" value={c.assignments ? `${c.assignments.averagePercent}%` : '—'} />
                          <MetricBox label="Exams" value={c.exams.length} />
                          <MetricBox label="Attendance" value={c.attendance ? `${c.attendance.presentPercentage}%` : '—'} />
                        </div>
                        <ChevronDown
                          className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          strokeWidth={2}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
                        <div className="border-t border-[var(--color-border-default)] pt-4 space-y-5">
                          {/* Exams — mid exam, final exam, etc. (published only) */}
                          <div>
                            <p className="text-xs font-semibold tracking-wide text-[var(--color-text-tertiary)] uppercase mb-2">Exams</p>
                            {c.exams.length === 0 ? (
                              <p className="text-sm text-[var(--color-text-tertiary)]">No published exam results yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {c.exams.map((r) => (
                                  <div
                                    key={r.resultId}
                                    className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3 flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <div>
                                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{r.title}</p>
                                      <p className="text-xs text-[var(--color-text-tertiary)]">
                                        {r.examDate ? new Date(r.examDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                                        {' · '}{r.marksObtained}/{r.totalMarks} ({r.percentage}%)
                                      </p>
                                      {r.feedback && <p className="text-xs italic text-[var(--color-text-tertiary)] mt-1">"{r.feedback}"</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <GradeBadge grade={r.grade} />
                                      <StatusBadge status={r.status} />
                                      <button
                                        onClick={() => downloadResultSlip(c.title, r)}
                                        className="rounded-lg border border-[var(--color-border-default)] px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--color-surface-tertiary)] transition-colors"
                                      >
                                        ⬇️ Slip
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Quizzes + Assignments — quick metric row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-md">
                            <MetricBox label="Quizzes Taken" value={c.quizzes?.count ?? 0} />
                            <MetricBox label="Quiz Avg" value={c.quizzes ? `${c.quizzes.averagePercent}%` : '—'} />
                            <MetricBox label="Assignments Graded" value={c.assignments?.count ?? 0} />
                            <MetricBox label="Assignment Avg" value={c.assignments ? `${c.assignments.averagePercent}%` : '—'} />
                          </div>
                          {c.assignments && c.assignments.items.length > 0 && (
                            <div className="space-y-1.5">
                              {c.assignments.items.map((a, i) => (
                                <div key={i} className="flex items-center justify-between text-sm rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2">
                                  <span className="text-[var(--color-text-primary)]">{a.title} {a.isLate && <span className="text-amber-600 text-xs">(late)</span>}</span>
                                  <span className="font-mono text-xs text-[var(--color-text-tertiary)]">{a.score}/{a.totalMarks} ({a.percentage}%)</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Attendance summary for this course */}
                          <div>
                            <p className="text-xs font-semibold tracking-wide text-[var(--color-text-tertiary)] uppercase mb-2">Attendance</p>
                            {c.attendance ? (
                              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-w-lg">
                                <MetricBox label="Days" value={c.attendance.days} />
                                <MetricBox label="Present" value={c.attendance.present} valueClass="text-green-600 dark:text-green-400" />
                                <MetricBox label="Absent" value={c.attendance.absent} valueClass="text-red-600 dark:text-red-400" />
                                <MetricBox label="Late" value={c.attendance.late} valueClass="text-amber-600 dark:text-amber-400" />
                                <MetricBox label="Rate" value={`${c.attendance.presentPercentage}%`} />
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--color-text-tertiary)]">No attendance recorded yet.</p>
                            )}
                          </div>

                          {/* Other graded activities — anything a teacher entered manually */}
                          {c.other.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold tracking-wide text-[var(--color-text-tertiary)] uppercase mb-2">Other Activities</p>
                              <div className="space-y-1.5">
                                {c.other.map((o, i) => (
                                  <div key={i} className="flex items-center justify-between text-sm rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2">
                                    <span className="text-[var(--color-text-primary)]">{o.label}</span>
                                    <span className="font-mono text-xs text-[var(--color-text-tertiary)]">{o.score}%</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentExamResults;
