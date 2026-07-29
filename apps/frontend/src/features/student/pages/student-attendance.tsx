import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Clock, User } from 'lucide-react';
import api from '../../../lib/axios';

interface CourseAttendance {
  courseId: string;
  code: string;
  title: string;
  section: string;
  days: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  presentPercentage: number;
  absentPercentage: number;
}

interface HistoryEntry {
  _id: string;
  date: string;
  status: string;
  notes?: string;
  schedule?: { startTime: string; endTime: string } | null;
  markedBy?: string | null;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  present: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300',
  absent: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
  late: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  excused: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
};

function absentBadgeClasses(pct: number): string {
  if (pct === 0) return 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300';
  if (pct <= 25) return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
  return 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300';
}

export function StudentAttendance() {
  const { t } = useTranslation('common');
  const [courses, setCourses] = useState<CourseAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyByCourse, setHistoryByCourse] = useState<Record<string, HistoryEntry[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/attendance/my/courses');
        setCourses(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || t('error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const toggleExpand = async (courseId: string) => {
    if (expandedId === courseId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(courseId);
    if (historyByCourse[courseId]) return; // already fetched
    setHistoryLoading(courseId);
    try {
      const { data } = await api.get('/attendance/my/course-history', { params: { courseId } });
      setHistoryByCourse((prev) => ({ ...prev, [courseId]: data.data || [] }));
    } catch {
      setHistoryByCourse((prev) => ({ ...prev, [courseId]: [] }));
    } finally {
      setHistoryLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">
          {t('retry')}
        </button>
      </div>
    );
  }

  // Compact overall summary — kept secondary to the course cards below.
  const totalDays = courses.reduce((sum, c) => sum + c.days, 0);
  const totalPresent = courses.reduce((sum, c) => sum + c.present, 0);
  const totalAbsent = courses.reduce((sum, c) => sum + c.absent, 0);
  const overallRate = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Compact overall summary — small and out of the way, per request */}
        {totalDays > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-6 flex-1">
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Total Days</p>
                <p className="text-lg font-bold text-[var(--color-text-primary)]">{totalDays}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Present</p>
                <p className="text-lg font-bold text-green-600">{totalPresent}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Absent</p>
                <p className="text-lg font-bold text-red-600">{totalAbsent}</p>
              </div>
            </div>
            <div className="flex-1 sm:max-w-xs">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[var(--color-text-tertiary)]">Overall present rate</span>
                <span className="font-semibold text-[var(--color-text-primary)]">{overallRate}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${overallRate >= 75 ? 'bg-green-500' : overallRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${overallRate}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Primary view — Course Attendance cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">📅 Course Attendance</h1>
            <span className="rounded-full bg-[var(--color-surface-tertiary)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
              {courses.length} course{courses.length === 1 ? '' : 's'}
            </span>
          </div>

          {courses.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--color-border-default)] p-12 text-center text-[var(--color-text-tertiary)]">
              No attendance records yet.
            </div>
          ) : (
            <div className="space-y-3">
              {courses.map((c) => {
                const isExpanded = expandedId === c.courseId;
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
                      {/* Left: code + absence badge + title + section */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          {c.code && (
                            <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">{c.code}</span>
                          )}
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${absentBadgeClasses(c.absentPercentage)}`}>
                            Absent {c.absentPercentage}%
                          </span>
                        </div>
                        <p className="font-bold text-[var(--color-text-primary)] truncate">{c.title}</p>
                        {c.section && <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 truncate">{c.section}</p>}
                      </div>

                      {/* Right: metric grid + expand arrow */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="grid grid-cols-4 gap-2">
                          <MetricBox label="Days" value={c.days} />
                          <MetricBox label="Present" value={c.present} valueClass="text-green-600 dark:text-green-400" />
                          <MetricBox label="Absent" value={c.absent} valueClass="text-red-600 dark:text-red-400" />
                          <MetricBox label="Present %" value={`${c.presentPercentage}%`} />
                        </div>
                        <ChevronDown
                          className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          strokeWidth={2}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
                        <div className="border-t border-[var(--color-border-default)] pt-4 space-y-4">
                          {/* Attendance rate bar */}
                          <div>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-[var(--color-text-tertiary)]">Attendance rate</span>
                              <span className="font-semibold text-[var(--color-text-primary)]">{c.presentPercentage}% present</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${c.presentPercentage >= 75 ? 'bg-green-500' : c.presentPercentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${c.presentPercentage}%` }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <MetricBox label="Late" value={c.late} valueClass="text-amber-600 dark:text-amber-400" />
                            <MetricBox label="Excused" value={c.excused} valueClass="text-blue-600 dark:text-blue-400" />
                            <MetricBox label="Present %" value={`${c.presentPercentage}%`} valueClass="text-green-600 dark:text-green-400" />
                            <MetricBox label="Absent %" value={`${c.absentPercentage}%`} valueClass="text-red-600 dark:text-red-400" />
                          </div>

                          {/* Absence records */}
                          <div>
                            <p className="text-xs font-semibold tracking-wide text-[var(--color-text-tertiary)] uppercase mb-2">Absence Records</p>
                            {historyLoading === c.courseId ? (
                              <div className="flex justify-center py-6">
                                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
                              </div>
                            ) : (
                              (() => {
                                const absences = (historyByCourse[c.courseId] || []).filter((h) => h.status === 'absent');
                                if (absences.length === 0) {
                                  return <p className="text-sm text-[var(--color-text-tertiary)] py-3">No absences recorded — great job!</p>;
                                }
                                return (
                                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-[var(--color-border-default)] rounded-xl overflow-hidden">
                                    {absences.map((h) => {
                                      const d = new Date(h.date);
                                      return (
                                        <div key={h._id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[var(--color-surface-primary)]">
                                          <div>
                                            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                                              {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </p>
                                            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                                              {d.toLocaleDateString(undefined, { weekday: 'long' })}
                                            </p>
                                          </div>
                                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold flex-shrink-0 ${STATUS_BADGE_CLASSES.absent}`}>
                                            Absent
                                          </span>
                                          {h.schedule && (
                                            <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] flex-shrink-0">
                                              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                                              {h.schedule.startTime} – {h.schedule.endTime}
                                            </span>
                                          )}
                                          {h.markedBy && (
                                            <span className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                                              <User className="h-3.5 w-3.5" strokeWidth={1.75} />
                                              {h.markedBy}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()
                            )}
                          </div>
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

function MetricBox({ label, value, valueClass }: { label: string; value: number | string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-center min-w-[4.5rem]">
      <p className={`text-sm font-bold ${valueClass || 'text-[var(--color-text-primary)]'}`}>{value}</p>
      <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">{label}</p>
    </div>
  );
}

export default StudentAttendance;
