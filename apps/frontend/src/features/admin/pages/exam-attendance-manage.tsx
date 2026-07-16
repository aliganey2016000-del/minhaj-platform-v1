/**
 * Exam Attendance — Invigilator Portal (Admin/Teacher)
 * Mark exam-day attendance for the roster of an exam's course.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface ExamBrief { _id: string; title: string; examDate: string; course?: { _id: string; title: { en: string } }; }
interface StudentBrief { _id: string; studentId: string; profile?: { firstName: string; lastName: string }; }
interface RosterEntry {
  student: StudentBrief;
  seat: { room?: { name: string }; deskNumber: string } | null;
  attendance: { status: string; notes?: string } | null;
}

const STATUS_OPTIONS = ['present', 'absent', 'late', 'excused'] as const;

export function ExamAttendanceManage() {
  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [marks, setMarks] = useState<Record<string, { status: string; notes: string }>>({});
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/exams');
      setExams(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const loadRoster = async (examId: string) => {
    setSelectedExam(examId);
    setRoster([]);
    setMessage('');
    if (!examId) return;
    setRosterLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/exams/${examId}/attendance`);
      const entries: RosterEntry[] = data.data || [];
      setRoster(entries);
      const m: Record<string, { status: string; notes: string }> = {};
      entries.forEach((e) => {
        m[e.student._id] = {
          status: e.attendance?.status || 'present',
          notes: e.attendance?.notes || '',
        };
      });
      setMarks(m);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load roster');
    } finally {
      setRosterLoading(false);
    }
  };

  const handleMarkChange = (studentId: string, field: 'status' | 'notes', value: string) => {
    setMarks((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
  };

  const markAll = (status: string) => {
    setMarks((prev) => {
      const next = { ...prev };
      roster.forEach((r) => { next[r.student._id] = { ...next[r.student._id], status }; });
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedExam || roster.length === 0) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const records = roster.map((r) => ({
        student: r.student._id,
        status: marks[r.student._id]?.status || 'present',
        notes: marks[r.student._id]?.notes || '',
      }));
      await api.post(`/exams/${selectedExam}/attendance`, { records });
      setMessage(`✅ Attendance saved for ${records.length} student(s)`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">✅ Exam Attendance</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Invigilator portal — mark exam-day attendance</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Select Exam</label>
          <select value={selectedExam} onChange={(e) => loadRoster(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">Choose an exam...</option>
            {exams.map((e) => (
              <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en} ({new Date(e.examDate).toLocaleDateString()})</option>
            ))}
          </select>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {rosterLoading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!rosterLoading && selectedExam && roster.length === 0 && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">No students enrolled in this exam's course.</p></div>
        )}

        {!rosterLoading && roster.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-[var(--color-text-tertiary)] self-center mr-1">Mark all as:</span>
              {STATUS_OPTIONS.map((s) => (
                <button key={s} onClick={() => markAll(s)} className="rounded-full px-3 py-1 text-xs font-semibold bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] transition-colors capitalize">
                  {s}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                    <tr>
                      <th className="text-left px-5 py-3 font-semibold">Student</th>
                      <th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Seat</th>
                      <th className="text-center px-5 py-3 font-semibold">Status</th>
                      <th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((r) => (
                      <tr key={r.student._id} className="border-b border-[var(--color-border-subtle)]">
                        <td className="px-5 py-3">
                          <p className="font-medium">{r.student.profile?.firstName} {r.student.profile?.lastName}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{r.student.studentId}</p>
                        </td>
                        <td className="px-5 py-3 text-center hidden sm:table-cell">
                          {r.seat ? <code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{r.seat.room?.name} · {r.seat.deskNumber}</code> : <span className="text-xs text-[var(--color-text-tertiary)]">Unassigned</span>}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <select
                            value={marks[r.student._id]?.status || 'present'}
                            onChange={(e) => handleMarkChange(r.student._id, 'status', e.target.value)}
                            className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer capitalize"
                          >
                            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-5 py-3 text-center hidden md:table-cell">
                          <input
                            type="text"
                            value={marks[r.student._id]?.notes || ''}
                            onChange={(e) => handleMarkChange(r.student._id, 'notes', e.target.value)}
                            className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs w-40"
                            placeholder="Optional"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] flex items-center justify-between">
                <p className="text-xs text-[var(--color-text-tertiary)]">{roster.length} students</p>
                <button onClick={handleSave} disabled={saving} className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm">
                  {saving ? 'Saving...' : '💾 Save Attendance'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!selectedExam && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">👆 Select an exam above to mark attendance</p></div>
        )}
      </div>
    </div>
  );
}

export default ExamAttendanceManage;
