import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Pencil } from 'lucide-react';
import api from '../../../lib/axios';
import { LessonBody, SummaryHero, isSummarySection } from '../../shared/components/guuldoon-lesson-body';
import { LessonEditor } from '../components/guuldoon-builder/editors';
import { errorMessage, type ChapterContent } from '../components/guuldoon-builder/types';

const builderBase = '/guuldoon/admin/builder';

/** One lesson on its own page, rendered the way students read it, with the editor one tap away. */
export function GuuldoonBuilderLesson() {
  const { courseId, chapterId, lessonId } = useParams<{ courseId: string; chapterId: string; lessonId: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!courseId || !chapterId) return;
    try {
      const { data } = await api.get(`${builderBase}/courses/${courseId}/chapters/${encodeURIComponent(chapterId)}`);
      setContent(data.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Casharka lama soo rari karin.'));
    } finally {
      setLoading(false);
    }
  }, [courseId, chapterId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setEditing(false); setEditError(''); setNotice(''); window.scrollTo({ top: 0 }); }, [lessonId]);

  const lessons = content?.lessons || [];
  const index = useMemo(() => lessons.findIndex(lesson => lesson.id === lessonId), [lessons, lessonId]);
  const lesson = index >= 0 ? lessons[index] : null;
  const previous = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;

  const backToChapter = () => navigate(`/admin/global-courses/${courseId}/guuldoon-builder?chapter=${encodeURIComponent(chapterId || '')}&section=lessons`);
  const openLesson = (id: string) => navigate(`/admin/global-courses/${courseId}/guuldoon-builder/chapters/${encodeURIComponent(chapterId || '')}/lessons/${id}`);

  const save = async (payload: Record<string, unknown>) => {
    if (!lesson) return;
    setSaving(true);
    setEditError('');
    try {
      await api.patch(`${builderBase}/lessons/${lesson.id}`, payload);
      await load();
      setEditing(false);
      setNotice('Casharka waa la kaydiyay');
    } catch (err) {
      setEditError(errorMessage(err, 'Lama kaydin karin.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!lesson) return;
    setSaving(true);
    setEditError('');
    try {
      await api.delete(`${builderBase}/lessons/${lesson.id}`);
      backToChapter();
    } catch (err) {
      setEditError(errorMessage(err, 'Lama tirtiri karin.'));
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  if (!content || !lesson) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <button onClick={backToChapter} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Cutubyada</button>
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error || 'Casharkan lama helin. Waxaa laga yaabaa in la tirtiray.'}</div>
      </div>
    );
  }

  const summary = isSummarySection(lesson);
  const pages = lesson.pageFrom ? `Bogga ${lesson.pageFrom}${lesson.pageTo && lesson.pageTo !== lesson.pageFrom ? '–' + lesson.pageTo : ''}` : '';
  const rtl = lesson.direction === 'rtl' || lesson.language === 'ar';

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <button onClick={backToChapter} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Cutubyada · {content.chapter.title}</button>

      <header className="student-glass-card rounded-[24px] p-4 sm:p-5">
        <p className="text-[11px] font-black uppercase tracking-[.16em] text-emerald-500">Cashar {index + 1} / {lessons.length}</p>
        <div className="mt-1 flex items-start gap-3">
          <h1 className="min-w-0 flex-1 break-words text-xl font-black sm:text-2xl" dir="auto">{lesson.title}</h1>
          {!editing && <button type="button" onClick={() => { setEditError(''); setNotice(''); setEditing(true); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500/40 px-3 py-2 text-xs font-black text-emerald-500"><Pencil size={14} /> Wax ka beddel</button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black">
          {pages && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-500">{pages}</span>}
          {lesson.type !== 'note' && <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-sky-500">{lesson.type}</span>}
          {lesson.manuallyEdited && <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-500">La beddelay</span>}
        </div>
        {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-500">{notice}</p>}
      </header>

      {editing ? (
        <LessonEditor lesson={lesson} saving={saving} error={editError} onCancel={() => { setEditing(false); setEditError(''); }} onSave={payload => void save(payload)} onDelete={() => void remove()} />
      ) : (
        <article className="student-glass-card rounded-[24px] p-4 sm:p-6" dir={rtl ? 'rtl' : 'auto'}>
          {summary && <div className="mb-5"><SummaryHero /></div>}
          <LessonBody content={lesson.contentText || 'Qoraalka casharka wali lama gelin.'} highlights={[]} visible={false} onOpen={() => undefined} />
        </article>
      )}

      {!editing && (previous || next) && (
        <nav className="flex items-stretch gap-3" aria-label="Casharrada">
          {previous ? (
            <button type="button" onClick={() => openLesson(previous.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 text-left">
              <ChevronLeft size={18} className="shrink-0 text-emerald-500" aria-hidden="true" />
              <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">Hore</span><span className="block truncate text-sm font-black" dir="auto">{previous.title}</span></span>
            </button>
          ) : <span className="flex-1" />}
          {next ? (
            <button type="button" onClick={() => openLesson(next.id)} className="flex min-w-0 flex-1 items-center justify-end gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 text-right">
              <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-wide text-[var(--color-text-tertiary)]">Xiga</span><span className="block truncate text-sm font-black" dir="auto">{next.title}</span></span>
              <ChevronRight size={18} className="shrink-0 text-emerald-500" aria-hidden="true" />
            </button>
          ) : <span className="flex-1" />}
        </nav>
      )}
    </div>
  );
}
