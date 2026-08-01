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
import { ChevronDown, Download, FileText, HelpCircle, ClipboardList, CalendarCheck, Star, Award } from 'lucide-react';
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

interface GradeCategory {
  key: string;
  label: string;
  weight: number;
  sourceType: string;
  earnedPercent: number;
  contribution: number;
  detail?: string;
}

interface CourseGrade {
  configured: boolean;
  categories?: GradeCategory[];
  weightedTotal?: number;
  bonusApplied?: number;
  finalGrade?: number;
  passingScore?: number;
  passed?: boolean;
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

const CATEGORY_ICON: Record<string, typeof HelpCircle> = {
  quizzes: HelpCircle,
  assignments: ClipboardList,
  exam: FileText,
  attendance: CalendarCheck,
  manual: Star,
};

function FinalGradeCard({ grade }: { grade: CourseGrade }) {
  const categories = grade.categories || [];
  const finalGrade = grade.finalGrade ?? 0;
  const passed = !!grade.passed;

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
        <p className="text-xs font-semibold tracking-wide text-[var(--color-text-tertiary)] uppercase flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5" strokeWidth={2} /> Final Grade
        </p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${passed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          {passed ? 'Pass' : 'Fail'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] border-b border-[var(--color-border-default)]">
              <th className="text-left px-4 py-2 font-semibold">Category</th>
              <th className="text-center px-4 py-2 font-semibold">Weight</th>
              <th className="text-center px-4 py-2 font-semibold">Score</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, i) => {
              const Icon = CATEGORY_ICON[cat.sourceType] || Star;
              return (
                <tr key={cat.key} className={i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/40' : ''}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2 text-[var(--color-text-primary)]">
                      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)]" strokeWidth={2} />
                      {cat.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center text-xs text-[var(--color-text-tertiary)]">{cat.weight}%</td>
                  <td className="px-4 py-2 text-center font-semibold text-[var(--color-text-primary)]">{cat.earnedPercent}%</td>
                </tr>
              );
            })}
            {!!grade.bonusApplied && (
              <tr>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Star className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} /> Bonus
                  </span>
                </td>
                <td className="px-4 py-2 text-center text-xs text-[var(--color-text-tertiary)]">—</td>
                <td className="px-4 py-2 text-center font-semibold text-amber-600 dark:text-amber-400">+{grade.bonusApplied}%</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
              <td className="px-4 py-2.5 font-bold text-[var(--color-text-primary)]">Final Grade</td>
              <td className="px-4 py-2.5 text-center text-xs text-[var(--color-text-tertiary)]">100%</td>
              <td className={`px-4 py-2.5 text-center font-bold ${passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{finalGrade}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-4 py-2 border-t border-[var(--color-border-default)] text-[10px] text-[var(--color-text-tertiary)]">Passing score: {grade.passingScore}%</p>
    </div>
  );
}

function ExamResultCard({ courseTitle, r }: { courseTitle: string; r: ExamResultItem }) {
  const accent = r.status === 'passed' ? 'border-l-green-500' : r.status === 'failed' ? 'border-l-red-500' : 'border-l-slate-400';
  const barColor = r.status === 'absent' ? 'bg-slate-400' : r.percentage >= 50 ? 'bg-green-500' : 'bg-red-500';
  const pctColor = r.status === 'absent' ? 'text-[var(--color-text-tertiary)]' : r.percentage >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className={`rounded-xl border border-[var(--color-border-default)] border-l-4 ${accent} bg-[var(--color-surface-secondary)] p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]">
            <FileText className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[var(--color-text-primary)] truncate">{r.title}</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              {r.examDate ? new Date(r.examDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <GradeBadge grade={r.grade} />
          <StatusBadge status={r.status} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.max(r.percentage, 2)}%` }} />
        </div>
        <span className="font-mono text-xs font-semibold text-[var(--color-text-secondary)] flex-shrink-0">{r.marksObtained}/{r.totalMarks}</span>
        <span className={`text-sm font-bold flex-shrink-0 ${pctColor}`}>{r.percentage}%</span>
      </div>

      {r.feedback && (
        <p className="mt-2.5 rounded-lg bg-[var(--color-surface-tertiary)] px-3 py-2 text-xs italic text-[var(--color-text-secondary)]">"{r.feedback}"</p>
      )}

      <button
        onClick={() => downloadResultSlip(courseTitle, r)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
      >
        <Download className="h-3.5 w-3.5" strokeWidth={2} /> Download Result Slip
      </button>
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
  const [gradeByCourse, setGradeByCourse] = useState<Record<string, CourseGrade>>({});
  const [gradeLoading, setGradeLoading] = useState<string | null>(null);

  const toggleExpand = async (courseId: string) => {
    setExpandedId((prev) => (prev === courseId ? null : courseId));
    if (gradeByCourse[courseId]) return; // already fetched
    setGradeLoading(courseId);
    try {
      const { data } = await api.get(`/gradebook/${courseId}/my`);
      setGradeByCourse((prev) => ({ ...prev, [courseId]: data.data || { configured: false } }));
    } catch {
      setGradeByCourse((prev) => ({ ...prev, [courseId]: { configured: false } }));
    } finally {
      setGradeLoading(null);
    }
  };

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
                      onClick={() => toggleExpand(c.courseId)}
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
                          {/* Final Grade — the weighted breakdown a teacher configured for
                              this course (Final Exam 40%, Quizzes 20%, ... -> Final Grade),
                              the same computation shown on the admin/teacher Gradebook page. */}
                          {gradeLoading === c.courseId ? (
                            <div className="flex justify-center py-4">
                              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
                            </div>
                          ) : (
                            gradeByCourse[c.courseId]?.configured && (
                              <FinalGradeCard grade={gradeByCourse[c.courseId]} />
                            )
                          )}

                          {/* Exams — only shown as a fallback when this course has no
                              weighted grading scheme configured; otherwise the Final Grade
                              table above already covers each exam's score. */}
                          {!gradeByCourse[c.courseId]?.configured && (
                            <div>
                              <p className="text-xs font-semibold tracking-wide text-[var(--color-text-tertiary)] uppercase mb-2">Exams</p>
                              {c.exams.length === 0 ? (
                                <p className="text-sm text-[var(--color-text-tertiary)]">No published exam results yet.</p>
                              ) : (
                                <div className="space-y-2.5">
                                  {c.exams.map((r) => (
                                    <ExamResultCard key={r.resultId} courseTitle={c.title} r={r} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Fallback for courses with no weighted grading scheme configured —
                              the Final Grade table above only renders when one exists, so this
                              keeps quiz/assignment/attendance data visible either way. */}
                          {!gradeByCourse[c.courseId]?.configured && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg">
                              <MetricBox label="Quiz Avg" value={c.quizzes ? `${c.quizzes.averagePercent}%` : '—'} />
                              <MetricBox label="Assignment Avg" value={c.assignments ? `${c.assignments.averagePercent}%` : '—'} />
                              <MetricBox label="Attendance Rate" value={c.attendance ? `${c.attendance.presentPercentage}%` : '—'} />
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
