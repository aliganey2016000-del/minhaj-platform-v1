/**
 * Exam Results & Grades — Student self-service view
 * Shows only results for exams the admin/teacher has published.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface ResultRow {
  _id: string;
  exam: {
    _id: string;
    title: string;
    examDate: string;
    totalMarks: number;
    passingMarks: number;
    course?: { title: { en: string }; category: string };
  };
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  remarks: string;
  feedback: string;
  status: 'passed' | 'failed' | 'absent';
  createdAt: string;
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
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${c[grade] || c['N/A']}`}>{grade}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    passed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    absent: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c[status] || c.absent}`}>{status}</span>;
}

function downloadResultSlip(r: ResultRow) {
  const lines = [
    'EXAM RESULT SLIP',
    '='.repeat(40),
    `Exam: ${r.exam?.title || ''}`,
    `Course: ${r.exam?.course?.title?.en || ''}`,
    `Date: ${r.exam?.examDate ? new Date(r.exam.examDate).toLocaleDateString() : ''}`,
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
  a.download = `result-slip-${(r.exam?.title || 'exam').replace(/\s+/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function StudentExamResults() {
  const { t } = useTranslation('common');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/results/my');
        setResults(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || t('error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const avgPercent = results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / results.length) : 0;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📊 Exam Results & Grades</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{results.length} published result{results.length === 1 ? '' : 's'}</p>
        </div>

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

        {results.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">📊</p>
            <p className="text-lg">No published results yet</p>
            <p className="text-sm mt-1">Your teacher will publish results once grading is complete.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((r) => (
              <div key={r._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {r.exam?.course && (
                      <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300">
                        {r.exam.course.title?.en}
                      </span>
                    )}
                    <h3 className="font-bold mt-2">{r.exam?.title}</h3>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {r.exam?.examDate ? new Date(r.exam.examDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <GradeBadge grade={r.grade} />
                    <StatusBadge status={r.status} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-center">
                    <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Marks</p>
                    <p className="font-bold font-mono">{r.marksObtained}<span className="text-[var(--color-text-tertiary)] font-normal">/{r.totalMarks}</span></p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-center">
                    <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Percentage</p>
                    <p className={`font-bold ${r.percentage >= 50 ? 'text-green-600' : 'text-red-600'}`}>{r.percentage}%</p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-center">
                    <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Passing</p>
                    <p className="font-bold">{r.exam?.passingMarks ?? '—'}</p>
                  </div>
                </div>

                {r.feedback && (
                  <div className="mt-3 rounded-xl border border-gold-200 dark:border-gold-800 bg-gold-50 dark:bg-gold-950/30 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-300 mb-1">Teacher Feedback</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">{r.feedback}</p>
                  </div>
                )}

                <button
                  onClick={() => downloadResultSlip(r)}
                  className="mt-4 rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-xs font-semibold hover:bg-[var(--color-surface-tertiary)] transition-colors"
                >
                  ⬇️ Download Result Slip
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentExamResults;
