import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, FileText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';
import { getCachedTeacherExamPeriods, getCachedTeacherExamWorkspace } from '../../../lib/teacher-offline-exams';
import { ExamPaperEditor } from '../../admin/components/exam-paper-editor';
import { TeacherExamWorkflowNav } from '../components/teacher-exam-workflow-nav';

interface Exam { _id: string; title: string; examDate?: string; startTime?: string; endTime?: string; totalMarks?: number; course?: { title?: { en?: string }; class?: { title?: string; section?: string } } }

export function TeacherExamPaper() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const requestRef = useRef<Promise<void> | null>(null);

  const load = async () => {
    if (!examId || requestRef.current) return requestRef.current || undefined;
    const task = (async () => {
      setError('');
      let hasCachedExam = false;
      try {
        const [snapshot, workspace] = await Promise.all([
          getCachedTeacherExamPeriods<{ exams?: Exam[] }>().catch(() => undefined),
          getCachedTeacherExamWorkspace<{ exams?: Exam[] }>(new URLSearchParams(window.location.search).get('period') || '').catch(() => undefined),
        ]);
        const cachedExam = [...(snapshot?.exams || []), ...(workspace?.exams || [])].find((item) => item._id === examId);
        if (cachedExam) {
          hasCachedExam = true;
          setExam(cachedExam);
          setLoading(false);
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          if (!hasCachedExam) setError('This exam has not been downloaded to this device. Connect once and open its exam period to prepare offline access.');
          return;
        }
        const { data } = await api.get(`/exams/${examId}`);
        setExam(data.data);
      } catch (err: any) {
        if (!hasCachedExam) setError(err?.response?.data?.message || 'This exam is not saved on this device. Connect to download it for offline access.');
      } finally {
        setLoading(false);
      }
    })();
    requestRef.current = task;
    try { await task; } finally { requestRef.current = null; }
  };

  useEffect(() => {
    void load();
    const onOnline = () => { void load(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [examId]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-emerald-600" /></div>;
  if (error || !exam) return <div className="flex min-h-screen items-center justify-center p-6"><div className="text-center"><p className="text-red-600">{error || 'Exam not found'}</p><button onClick={() => navigate('/teacher/exam-papers')} className="mt-4 rounded-xl border px-4 py-2 text-sm font-semibold">Back to Exam Papers</button></div></div>;

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] p-3 pt-16 sm:p-6 sm:pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-4">
        <TeacherExamWorkflowNav />
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
          <button onClick={() => navigate('/teacher/exam-papers')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-tertiary)] hover:text-emerald-600"><ArrowLeft className="h-4 w-4" /> My Exam Papers</button>
          <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40"><FileText className="h-6 w-6" /></div><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Exam Paper</p><h1 className="mt-1 text-2xl font-bold">{exam.title}</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{exam.course?.title?.en || 'Course'} · {exam.course?.class?.title}{exam.course?.class?.section ? ` (${exam.course.class.section})` : ''}</p><p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]"><CalendarDays className="h-3.5 w-3.5" />{exam.examDate ? new Date(exam.examDate).toLocaleDateString() : 'No date'} · {exam.startTime || ''}{exam.endTime ? `–${exam.endTime}` : ''}</p></div></div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-sm sm:p-6"><ExamPaperEditor examId={examId!} /></div>
      </div>
    </div>
  );
}

export default TeacherExamPaper;
