/**
 * Exam Picker Modal — used from the Course Content Builder's "+ Exam"
 * quick-add button. Either links an exam already scheduled for this course
 * (via Manage Exams) or schedules a brand new one on the spot, then hands
 * back a lightweight summary the builder uses to create the chapter item.
 *
 * The full exam lifecycle (room allocation, attendance, papers, results)
 * still lives entirely in Manage Exams — this modal only creates the link.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../../../lib/axios';

export interface ExamSummary {
  _id: string;
  title: string;
  examDate: string;
  totalMarks: number;
  duration: number;
}

interface ExamPickerModalProps {
  courseId: string;
  onClose: () => void;
  onLink: (exam: ExamSummary) => void;
}

const inputCls = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm';
const labelCls = 'text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block';

export function ExamPickerModal({ courseId, onClose, onLink }: ExamPickerModalProps) {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    examDate: '',
    startTime: '',
    endTime: '',
    duration: 60,
    totalMarks: 100,
    passingMarks: 50,
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/exams', { params: { courseId, limit: 100 } });
        setExams((data.data || []).map((e: any) => ({
          _id: e._id,
          title: e.title,
          examDate: e.examDate,
          totalMarks: e.totalMarks,
          duration: e.duration,
        })));
      } catch {
        setError('Failed to load exams for this course.');
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId]);

  const handleLinkExisting = () => {
    const exam = exams.find((e) => e._id === selectedId);
    if (exam) onLink(exam);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.examDate || !form.startTime || !form.endTime) {
      setError('Title, date, start time, and end time are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/exams', { ...form, course: courseId, status: 'scheduled' });
      const e = data.data;
      onLink({ _id: e._id, title: e.title, examDate: e.examDate, totalMarks: e.totalMarks, duration: e.duration });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create exam.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[var(--color-text-primary)]">🎓 Add Exam to Module</h3>
          <button onClick={onClose} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">✕</button>
        </div>

        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-600">{error}</div>}

        {!creating ? (
          <>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" />
              </div>
            ) : exams.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)] py-4 text-center border border-dashed border-[var(--color-border-default)] rounded-xl">
                No exams scheduled for this course yet.
              </p>
            ) : (
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {exams.map((exam) => (
                  <label
                    key={exam._id}
                    className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      selectedId === exam._id
                        ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-950/20'
                        : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-tertiary)]'
                    }`}
                  >
                    <input type="radio" name="exam" checked={selectedId === exam._id} onChange={() => setSelectedId(exam._id)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{exam.title}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        {new Date(exam.examDate).toLocaleDateString()} · {exam.totalMarks} marks · {exam.duration} min
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={handleLinkExisting}
                disabled={!selectedId}
                className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-primary-700 transition-colors"
              >
                Add Selected Exam
              </button>
              <button
                onClick={() => setCreating(true)}
                className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
              >
                + Create New Exam
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Exam Title *</label>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Midterm Exam" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Exam Date *</label>
                <input type="date" className={inputCls} value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Duration (min) *</label>
                <input type="number" min={1} className={inputCls} value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Start Time *</label>
                <input type="time" className={inputCls} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>End Time *</label>
                <input type="time" className={inputCls} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Total Marks *</label>
                <input type="number" min={1} className={inputCls} value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: Number(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Passing Marks *</label>
                <input type="number" min={1} className={inputCls} value={form.passingMarks} onChange={(e) => setForm({ ...form, passingMarks: Number(e.target.value) })} />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-primary-700 transition-colors"
              >
                {saving ? 'Creating…' : 'Create & Add to Module'}
              </button>
              <button
                onClick={() => setCreating(false)}
                className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default ExamPickerModal;
