import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, UserRound, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';

interface StudentAttendanceReport {
  student: {
    _id: string;
    studentId: string;
    name: string;
    className: string;
  };
  summary: {
    total: number;
    present: number;
    absent: number;
    percentage: number;
  };
  courses: Array<{
    _id: string;
    courseName: string;
    courseCode?: string;
    totalDays: number;
    present: number;
    absent: number;
    presentPercentage: number;
  }>;
  records: Array<{
    _id: string;
    date: string;
    status: 'present' | 'absent';
    excused: boolean;
    reasonCode?: string;
    notes?: string;
    courseName: string;
    period?: string;
  }>;
}

function SummaryCard({ icon, label, value, valueClass = 'text-[var(--color-text-primary)]' }: { icon: React.ReactNode; label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 text-center">
      <div className="mx-auto mb-2 flex w-fit items-center justify-center text-[var(--color-text-tertiary)]">{icon}</div>
      <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
      <p className={`mt-1 text-2xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

export function SchoolStudentAttendanceReport() {
  const { studentId = '' } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<StudentAttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    setLoading(true);
    setError('');
    api.get(`/attendance/school/report/student-overall/${studentId}`)
      .then(({ data }) => {
        if (active) setReport(data?.data || null);
      })
      .catch((e: any) => {
        if (active) setError(e?.response?.data?.message || 'Could not load the student attendance report.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [studentId]);

  if (loading) {
    return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading student attendance report...</div>;
  }

  if (error || !report) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/admin/attendance')} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600">
          <ArrowLeft className="h-4 w-4" /> Back to Attendance
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error || 'Student attendance report not found.'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-600">
            <UserRound className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Student Attendance Report</p>
            <h1 className="truncate text-2xl font-black text-[var(--color-text-primary)]">{report.student.name}</h1>
            <p className="text-sm text-[var(--color-text-tertiary)]">{report.student.studentId} · {report.student.className}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
        <div className="flex items-center gap-3 border-b border-[var(--color-border-default)] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-[var(--color-text-primary)]">Course Attendance Summary</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">Attendance by course: total days recorded, present, absent, and present percentage.</p>
          </div>
        </div>

        {!report.courses?.length ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">No enrolled courses found for this student.</div>
        ) : (
          <>
            <div className="space-y-3 p-3 sm:hidden">
              {report.courses.map((course) => (
                <div key={course._id} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[var(--color-text-primary)]">{course.courseName}</p>
                    {course.courseCode && <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{course.courseCode}</p>}
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                    <div className="rounded-lg bg-[var(--color-surface-primary)] px-1 py-2">
                      <p className="text-[9px] font-medium uppercase text-[var(--color-text-tertiary)]">Days</p>
                      <p className="mt-0.5 text-sm font-black text-[var(--color-text-primary)]">{course.totalDays}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-1 py-2 dark:bg-emerald-950/30">
                      <p className="text-[9px] font-medium uppercase text-emerald-700 dark:text-emerald-300">Present</p>
                      <p className="mt-0.5 text-sm font-black text-emerald-600">{course.present}</p>
                    </div>
                    <div className="rounded-lg bg-red-50 px-1 py-2 dark:bg-red-950/30">
                      <p className="text-[9px] font-medium uppercase text-red-700 dark:text-red-300">Absent</p>
                      <p className="mt-0.5 text-sm font-black text-red-600">{course.absent}</p>
                    </div>
                    <div className="rounded-lg bg-primary-500/10 px-1 py-2">
                      <p className="text-[9px] font-medium uppercase text-primary-700 dark:text-primary-300">Present %</p>
                      <p className="mt-0.5 text-sm font-black text-primary-600">{course.presentPercentage}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto [touch-action:pan-x_pan-y] sm:block">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--color-surface-secondary)] text-left text-xs text-[var(--color-text-secondary)]">
                    <th className="px-4 py-3 font-bold">Course</th>
                    <th className="px-3 py-3 text-center font-bold">Total Days</th>
                    <th className="px-3 py-3 text-center font-bold">Present</th>
                    <th className="px-3 py-3 text-center font-bold">Absent</th>
                    <th className="px-3 py-3 text-center font-bold">Present %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {report.courses.map((course) => (
                    <tr key={course._id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--color-text-primary)]">{course.courseName}</p>
                        {course.courseCode && <p className="text-[11px] text-[var(--color-text-tertiary)]">{course.courseCode}</p>}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-[var(--color-text-primary)]">{course.totalDays}</td>
                      <td className="px-3 py-3 text-center font-bold text-emerald-600">{course.present}</td>
                      <td className="px-3 py-3 text-center font-bold text-red-600">{course.absent}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex rounded-full bg-primary-500/10 px-2.5 py-1 font-bold text-primary-600">{course.presentPercentage}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard icon={<CalendarDays className="h-4 w-4" />} label="Total Attendance" value={report.summary.total} />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Present" value={report.summary.present} valueClass="text-emerald-600" />
        <SummaryCard icon={<XCircle className="h-4 w-4" />} label="Absent" value={report.summary.absent} valueClass="text-red-600" />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Present %" value={`${report.summary.percentage}%`} valueClass="text-primary-600" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
        <div className="border-b border-[var(--color-border-default)] p-4">
          <p className="font-bold text-[var(--color-text-primary)]">Attendance History</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">Overall attendance summary uses the student's full history. Up to the latest 200 records are shown below.</p>
        </div>

        {report.records.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No attendance records found for this student.</div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {report.records.map((record) => (
              <div key={record._id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--color-text-primary)]">{new Date(record.date).toLocaleDateString()}</p>
                    <p className="truncate text-xs text-[var(--color-text-tertiary)]">{record.courseName}{record.period ? ` · ${record.period}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${record.status === 'present' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {record.status === 'present' ? 'Present' : 'Absent'}
                    </span>
                    {record.excused && <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">Excused</span>}
                  </div>
                </div>
                {(record.reasonCode || record.notes) && (
                  <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                    {record.reasonCode ? `Reason: ${record.reasonCode.replace(/_/g, ' ')}` : ''}
                    {record.reasonCode && record.notes ? ' · ' : ''}
                    {record.notes || ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SchoolStudentAttendanceReport;
