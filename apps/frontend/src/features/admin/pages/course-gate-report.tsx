/**
 * Interactive Gate Report — per-course Stop & Check accuracy, shared between
 * Admin and Teacher portals (teacher is restricted server-side to their own
 * courses; see gate-report.controller.ts).
 *
 * "Accuracy" is always FIRST-ATTEMPT accuracy: a gate block only unlocks
 * once answered correctly, so a student can always retry until they get it
 * right — counting every attempt would trend every student toward 100% and
 * say nothing about how well they understood the material unaided. Retry
 * count is shown alongside as a separate "how much they worked at it" signal.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';

interface StudentRow {
  studentId: string;
  name: string;
  firstAttemptAccuracy: number;
  questionsCorrect: number;
  questionsAttempted: number;
  totalAttempts: number;
  lessonsStarted: number;
  lessonsCompleted: number;
  lastActivityAt: string;
}

interface LessonRow {
  lessonId: string;
  lessonTitle: string;
  firstAttemptAccuracy: number;
  studentsAttempted: number;
  questionsCorrect: number;
  questionsAttempted: number;
  totalAttempts: number;
}

interface GateReport {
  course: { _id: string; title: { en: string; so?: string; ar?: string } };
  studentsCount: number;
  overallFirstAttemptAccuracy: number;
  totalQuestionsCorrect: number;
  totalQuestionsAttempted: number;
  totalAttempts: number;
  perStudent: StudentRow[];
  perLesson: LessonRow[];
}

function accuracyColor(pct: number): string {
  if (pct >= 80) return 'text-green-600 dark:text-green-400';
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function accuracyBg(pct: number): string {
  if (pct >= 80) return 'bg-green-100 dark:bg-green-900/30';
  if (pct >= 50) return 'bg-amber-100 dark:bg-amber-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

interface CourseGateReportProps {
  basePath?: string;
}

export function CourseGateReport({ basePath = '/admin' }: CourseGateReportProps) {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<GateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/courses/${courseId}/gate-report`);
      setReport(data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <button onClick={() => navigate(`${basePath}/courses`)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mb-1">← Back to Courses</button>
        <h1 className="text-xl lg:text-2xl font-bold text-[var(--color-text-primary)]">📊 Interactive Gate Report</h1>
        {report && <p className="text-sm text-[var(--color-text-secondary)] mt-1">{report.course.title.en}</p>}
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading...</p>
      ) : !report ? null : report.totalQuestionsAttempted === 0 ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)]">
          <p className="text-4xl mb-2">📭</p>
          <p className="text-sm">No Stop & Check questions have been answered in this course yet.</p>
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
              <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Overall Accuracy</p>
              <p className={`text-2xl font-bold ${accuracyColor(report.overallFirstAttemptAccuracy)}`}>{report.overallFirstAttemptAccuracy}%</p>
              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">{report.totalQuestionsCorrect}/{report.totalQuestionsAttempted} correct, first attempt only</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
              <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Students</p>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{report.studentsCount}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
              <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Questions Answered</p>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{report.totalQuestionsAttempted}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
              <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Total Attempts</p>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{report.totalAttempts}</p>
              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">incl. retries</p>
            </div>
          </div>

          {/* Per-lesson breakdown */}
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)] px-4 pt-4 pb-2">By Lesson</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)]">
                    <th className="px-4 py-2 font-medium">Lesson</th>
                    <th className="px-4 py-2 font-medium">Students</th>
                    <th className="px-4 py-2 font-medium">Questions</th>
                    <th className="px-4 py-2 font-medium">Total Attempts</th>
                    <th className="px-4 py-2 font-medium">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {report.perLesson.map((l) => (
                    <tr key={l.lessonId} className="border-b border-[var(--color-border-subtle)] last:border-0">
                      <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{l.lessonTitle}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{l.studentsAttempted}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{l.questionsAttempted}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{l.totalAttempts}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${accuracyBg(l.firstAttemptAccuracy)} ${accuracyColor(l.firstAttemptAccuracy)}`}>
                          {l.questionsCorrect}/{l.questionsAttempted} ({l.firstAttemptAccuracy}%)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-student breakdown */}
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)] px-4 pt-4 pb-2">By Student</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)]">
                    <th className="px-4 py-2 font-medium">Student</th>
                    <th className="px-4 py-2 font-medium">Lessons Completed</th>
                    <th className="px-4 py-2 font-medium">Questions</th>
                    <th className="px-4 py-2 font-medium">Total Attempts</th>
                    <th className="px-4 py-2 font-medium">Accuracy</th>
                    <th className="px-4 py-2 font-medium">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {report.perStudent.map((s) => (
                    <tr key={s.studentId} className="border-b border-[var(--color-border-subtle)] last:border-0">
                      <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{s.name}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{s.lessonsCompleted}/{s.lessonsStarted}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{s.questionsAttempted}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{s.totalAttempts}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${accuracyBg(s.firstAttemptAccuracy)} ${accuracyColor(s.firstAttemptAccuracy)}`}>
                          {s.questionsCorrect}/{s.questionsAttempted} ({s.firstAttemptAccuracy}%)
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-tertiary)]">{new Date(s.lastActivityAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CourseGateReport;
