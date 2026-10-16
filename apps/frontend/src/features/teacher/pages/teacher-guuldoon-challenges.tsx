import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Trophy } from 'lucide-react';
import api from '../../../lib/axios';

type Option = {
  courses: { id: string; title: string; grade: number; chapters: { id: string; title: string }[]; exams: { id: string; year: number }[] }[];
  classes: { id: string; title: string; grade: number }[];
};
type Row = { id: string; title: string; status: string; deadline: string | null; questions: number; students: number; done: number; started: number };

const input = 'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-sm';

/** Teacher: list of challenges and the form to open a new one. */
export function TeacherGuuldoonChallenges() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [options, setOptions] = useState<Option | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>(['understand']);
  const [examIds, setExamIds] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');

  const load = useCallback(() => {
    api.get('/guuldoon-challenges').then(({ data }) => setRows(data.data as Row[])).catch((err) => setError(err.response?.data?.message || 'Tartannada lama soo rari karin.'));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open || options) return;
    api.get('/guuldoon-challenges/options').then(({ data }) => setOptions(data.data as Option)).catch((err) => setError(err.response?.data?.message || 'Doorashooyinka lama helin.'));
  }, [open, options]);

  const course = useMemo(() => options?.courses.find((item) => item.id === courseId), [options, courseId]);
  const classes = useMemo(() => (options?.classes || []).filter((item) => !course || item.grade === course.grade), [options, course]);
  const toggle = (list: string[], set: (value: string[]) => void, id: string) => set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  const pickCourse = (id: string) => { setCourseId(id); setChapterIds([]); setExamIds([]); setClassIds([]); };
  const submit = async () => {
    setError(''); setSaving(true);
    try {
      const { data } = await api.post('/guuldoon-challenges', {
        title, courseId, chapterIds, sources: chapterIds.length ? sources : [], examIds, classIds,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
      });
      navigate(`/teacher/guuldoon/challenges/${data.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Tartanka lama abuuri karin.');
    } finally { setSaving(false); }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 pb-24 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-emerald-600">Guulgaar</p><h1 className="mt-1 text-2xl font-black">Tartanada</h1></div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white"><Plus size={16} />Tartan cusub</button>
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-500">{error}</p>}

      {open && (
        <section className="student-glass-card space-y-4 rounded-[24px] p-4">
          {!options && <Loader2 className="mx-auto animate-spin text-emerald-500" />}
          {options && (
            <>
              <label className="block text-xs font-bold">Magaca tartanka
                <input className={input + ' mt-1'} value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Tusaale: Cutubka 3 · Reaction Rates" />
              </label>
              <label className="block text-xs font-bold">Maaddada
                <select className={input + ' mt-1'} value={courseId} onChange={(event) => pickCourse(event.target.value)}>
                  <option value="">Dooro maaddada</option>
                  {options.courses.map((item) => <option key={item.id} value={item.id}>{item.title} · Grade {item.grade}</option>)}
                </select>
              </label>
              {course && (
                <>
                  <fieldset className="space-y-2"><legend className="text-xs font-bold">Cutubyada</legend>
                    <div className="flex flex-wrap gap-2">{course.chapters.map((chapter) => (
                      <button key={chapter.id} type="button" aria-pressed={chapterIds.includes(chapter.id)} onClick={() => toggle(chapterIds, setChapterIds, chapter.id)}
                        className={'rounded-full border px-3 py-1.5 text-xs font-bold ' + (chapterIds.includes(chapter.id) ? 'border-emerald-600 bg-emerald-600 text-white' : '')}>{chapter.title}</button>
                    ))}</div>
                    {chapterIds.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-xs font-bold">
                        {[['understand', 'Fahamka cutubka'], ['past', 'Imtixaanadii hore']].map(([key, label]) => (
                          <label key={key} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={sources.includes(key)} onChange={() => toggle(sources, setSources, key)} />{label}</label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                  {course.exams.length > 0 && (
                    <fieldset className="space-y-2"><legend className="text-xs font-bold">Ama imtixaan dhan</legend>
                      <div className="flex flex-wrap gap-2">{course.exams.map((exam) => (
                        <button key={exam.id} type="button" aria-pressed={examIds.includes(exam.id)} onClick={() => toggle(examIds, setExamIds, exam.id)}
                          className={'rounded-full border px-3 py-1.5 text-xs font-bold ' + (examIds.includes(exam.id) ? 'border-sky-600 bg-sky-600 text-white' : '')}>{exam.year}</button>
                      ))}</div>
                    </fieldset>
                  )}
                  <fieldset className="space-y-2"><legend className="text-xs font-bold">Fasallada</legend>
                    {classes.length === 0 && <p className="text-xs text-[var(--color-text-tertiary)]">Fasal Grade {course.grade} ah ma jiro.</p>}
                    <div className="flex flex-wrap gap-2">{classes.map((item) => (
                      <button key={item.id} type="button" aria-pressed={classIds.includes(item.id)} onClick={() => toggle(classIds, setClassIds, item.id)}
                        className={'rounded-full border px-3 py-1.5 text-xs font-bold ' + (classIds.includes(item.id) ? 'border-emerald-600 bg-emerald-600 text-white' : '')}>{item.title}</button>
                    ))}</div>
                  </fieldset>
                </>
              )}
              <label className="block text-xs font-bold">Dhammaadka (ikhtiyaari)
                <input type="datetime-local" className={input + ' mt-1'} value={deadline} onChange={(event) => setDeadline(event.target.value)} />
              </label>
              <button type="button" disabled={saving || !title.trim() || !courseId || !classIds.length || (!examIds.length && !chapterIds.length)} onClick={submit}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}Bilow tartanka</button>
            </>
          )}
        </section>
      )}

      {!rows && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-emerald-500" size={30} /></div>}
      {rows && rows.length === 0 && <section className="student-glass-card rounded-[24px] p-6 text-center text-sm text-[var(--color-text-tertiary)]"><Trophy className="mx-auto mb-2 text-emerald-500" />Weli tartan ma furin. Riix “Tartan cusub”.</section>}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => navigate(`/teacher/guuldoon/challenges/${row.id}`)} className="student-glass-card block w-full rounded-[22px] p-4 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-base" dir="auto">{row.title}</b>
                <span className={'rounded-full px-2.5 py-1 text-[11px] font-extrabold ' + (row.status === 'closed' ? 'bg-slate-500/15' : 'bg-emerald-500/15 text-emerald-600')}>{row.status === 'closed' ? 'La xiray' : 'Furan'}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{row.questions} suaal · {row.students} arday{row.deadline ? ` · Dhammaad ${new Date(row.deadline).toLocaleDateString()}` : ''}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-500/20"><div className="h-full bg-emerald-500" style={{ width: `${row.students ? Math.round((row.done / row.students) * 100) : 0}%` }} /></div>
              <p className="mt-1.5 text-xs font-bold">{row.done}/{row.students} dhammeeyay · {row.started} bilaabay</p>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
