import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Loader2, Plus, Save, X } from 'lucide-react';
import api from '../../../../lib/axios';
import { Field, inputClass } from './editors';
import { errorMessage, type ChapterRow, type ExamRow, type Overview } from './types';

type Notify = (message: string, tone?: 'ok' | 'error') => void;

export function Drawer({ title, subtitle, icon, onClose, children }: { title: string; subtitle: string; icon: ReactNode; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label={title} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col bg-[var(--color-surface-secondary,var(--color-surface-primary))] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">{icon}</span>
          <div className="min-w-0 flex-1"><h2 className="font-black">{title}</h2><p className="text-xs text-[var(--color-text-tertiary)]">{subtitle}</p></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Xir" className="rounded-xl border border-[var(--color-border-default)] p-2"><X size={16} /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      </aside>
    </>
  );
}

function SaveButton({ saving, onClick, label = 'Kaydi' }: { saving: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" disabled={saving} onClick={onClick} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
      {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {label}
    </button>
  );
}

function ErrorLine({ message }: { message: string }) {
  return message ? <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500">{message}</div> : null;
}

export function SettingsPanel({ courseId, overview, onSaved, notify }: { courseId: string; overview: Overview; onSaved: () => void; notify: Notify }) {
  const [passTarget, setPassTarget] = useState(String(overview.config.passTarget));
  const [date, setDate] = useState(overview.config.targetExamDate ? String(overview.config.targetExamDate).slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/guuldoon/admin/builder/courses/${courseId}/settings`, { passTarget: Number(passTarget), targetExamDate: date || null });
      notify('Dejinta waa la kaydiyay');
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Lama kaydin karin.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Field label="Pass Meter Target (%)" hint="Heerka ardaygu u baahan yahay si loogu sheego “diyaar ayaad tahay”.">
        <input className={inputClass} type="number" min={0} max={100} value={passTarget} onChange={e => setPassTarget(e.target.value)} />
      </Field>
      <Field label="Taariikhda imtixaanka" hint="Ardayga waxaa loo tusaa inta maalmood ee ka harsan.">
        <input className={inputClass} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Field>
      <div className="rounded-xl bg-[var(--color-surface-tertiary)] p-3 text-xs"><strong>Sida loo xisaabiyo:</strong> Pass Meter = heerka ardayga ee cutub kasta × miisaanka cutubkaas. Miisaanka waxaad ka beddeli kartaa kaarka cutubka (✏️).</div>
      <ErrorLine message={error} />
      <SaveButton saving={saving} onClick={() => void save()} />
    </>
  );
}

export function ExamsPanel({ courseId, exams, onChanged, notify }: { courseId: string; exams: ExamRow[]; onChanged: () => void; notify: Notify }) {
  const [form, setForm] = useState({ year: new Date().getFullYear() - 1, durationMin: 120, totalMarks: 100, source: '', answerKeyStatus: 'pending' as 'pending' | 'verified' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const patch = async (exam: ExamRow, body: Record<string, unknown>, message: string) => {
    setError('');
    try {
      await api.patch(`/guuldoon/admin/exams/${exam.id}`, body);
      notify(message);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Imtixaanka lama cusboonaysiin karin.'));
    }
  };

  const create = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post(`/guuldoon/admin/courses/${courseId}/exams`, { ...form, published: false });
      notify(`Imtixaanka ${form.year} waa la abuuray (draft)`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Imtixaanka lama abuuri karin.'));
    } finally {
      setSaving(false);
    }
  };

  const number = (key: 'year' | 'durationMin' | 'totalMarks') => (e: ChangeEvent<HTMLInputElement>) => setForm(current => ({ ...current, [key]: Number(e.target.value) }));

  return (
    <>
      <div className="space-y-2">
        {exams.map(exam => (
          <div key={exam.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3">
            <strong className="text-xl tabular-nums">{exam.kind === 'practice' ? 'Tababar' : exam.year}</strong>
            <div className="min-w-0 flex-1 text-xs text-[var(--color-text-tertiary)]">{exam.durationMin} daqiiqo · {exam.totalMarks} dhibcood · {exam.questionCount} su’aalood</div>
            <button type="button" onClick={() => void patch(exam, { published: !exam.published }, exam.published ? 'Waa la qariyay' : 'Waa la daabacay')} className={'rounded-xl border px-3 py-1.5 text-xs font-black ' + (exam.published ? 'border-emerald-500/40 text-emerald-500' : 'border-slate-500/40')}>{exam.published ? 'Published' : 'Draft'}</button>
            <button type="button" onClick={() => void patch(exam, { answerKeyStatus: exam.answerKeyStatus === 'verified' ? 'pending' : 'verified' }, 'Answer key waa la beddelay')} className={'rounded-xl border px-3 py-1.5 text-xs font-black ' + (exam.answerKeyStatus === 'verified' ? 'border-emerald-500/40 text-emerald-500' : 'border-amber-500/40 text-amber-500')}>{exam.answerKeyStatus}</button>
          </div>
        ))}
        {!exams.length && <p className="text-sm text-[var(--color-text-tertiary)]">Imtixaan wali ma jiro.</p>}
      </div>
      <div className="space-y-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
        <p className="text-sm font-black">Ku dar sanad cusub</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sanadka"><input className={inputClass} type="number" value={form.year} onChange={number('year')} /></Field>
          <Field label="Daqiiqo"><input className={inputClass} type="number" value={form.durationMin} onChange={number('durationMin')} /></Field>
          <Field label="Dhibco"><input className={inputClass} type="number" value={form.totalMarks} onChange={number('totalMarks')} /></Field>
        </div>
        <Field label="Source"><input className={inputClass} value={form.source} onChange={e => setForm(current => ({ ...current, source: e.target.value }))} /></Field>
        <ErrorLine message={error} />
        <button type="button" disabled={saving} onClick={() => void create()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"><Plus size={16} /> Ku dar</button>
      </div>
    </>
  );
}

export function GlossaryPanel({ courseId, overview, onSaved, notify }: { courseId: string; overview: Overview; onSaved: () => void; notify: Notify }) {
  const [text, setText] = useState(JSON.stringify(overview.glossary.terms, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (overview.glossary.source === 'import') {
    return (
      <>
        <p className="text-xs text-[var(--color-text-secondary)]">{overview.glossary.terms.length} eray ayaa ka yimid Excel-ka (Glossary sheet). Si aad u beddesho, Excel-ka ku saxo kadibna dib u import-garee.</p>
        <div className="space-y-1.5">
          <div className="grid grid-cols-3 gap-2 text-[11px] font-black text-[var(--color-text-tertiary)]"><span>Soomaali</span><span>English</span><span className="text-right">العربية</span></div>
          {overview.glossary.terms.map((term, index) => (
            <div key={index} className="grid grid-cols-3 gap-2 text-sm font-bold">
              <span className="min-w-0 break-words rounded-lg bg-[var(--color-surface-tertiary)] p-2">{term.termSo}</span>
              <span className="min-w-0 break-words rounded-lg bg-[var(--color-surface-tertiary)] p-2" dir="ltr">{term.termEn}</span>
              <span className="min-w-0 break-words rounded-lg bg-[var(--color-surface-tertiary)] p-2" dir="rtl">{term.termAr}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      let glossary: unknown;
      try { glossary = JSON.parse(text || '[]'); } catch { throw new Error('Glossary JSON ma saxna.'); }
      if (!Array.isArray(glossary)) throw new Error('Glossary waa inuu noqdaa array.');
      await api.put(`/guuldoon/admin/builder/courses/${courseId}/settings`, { glossary });
      notify('Glossary waa la kaydiyay');
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Lama kaydin karin.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="text-xs text-[var(--color-text-secondary)]">JSON array ahaan geli erayada farsamo: <code>{'[{"termSo":"","termEn":"","termAr":""}]'}</code>. Ardaygu wuxuu taaban karaa erayga si uu saddexda luqadood u arko.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={14} spellCheck={false} className="w-full rounded-xl border border-[var(--color-border-default)] bg-slate-950 p-4 font-mono text-xs text-slate-100 outline-none" />
      <ErrorLine message={error} />
      <SaveButton saving={saving} onClick={() => void save()} />
    </>
  );
}

/** Bulk JSON question import; it only understands the classic Course Builder chapter IDs. */
export function JsonImportPanel({ exams, chapters, notify, onImported }: { exams: ExamRow[]; chapters: ChapterRow[]; notify: Notify; onImported: () => void }) {
  const past = exams.filter(exam => exam.kind !== 'practice');
  const [examId, setExamId] = useState(past[0]?.id || '');
  const [json, setJson] = useState('[]');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const example = [{ number: 1, type: 'mcq', textSo: 'Su’aasha...', options: ['A', 'B', 'C', 'D'], marks: 2, chapterId: chapters[0]?.id || 'CHAPTER_ID', topicTags: ['topic'], answer: 0, answerStatus: 'verified', explainerText: 'Sharaxaad kooban' }];

  const submit = async () => {
    if (!examId) return setError('Marka hore dooro sanad imtixaan.');
    setSaving(true);
    setError('');
    try {
      const questions = JSON.parse(json);
      if (!Array.isArray(questions)) throw new Error('JSON-ku waa inuu noqdaa array su’aalo ah.');
      const { data } = await api.post(`/guuldoon/admin/exams/${examId}/questions/bulk`, { questions });
      notify(`${data.data.imported} su’aalood ayaa la import-gareeyey`);
      onImported();
    } catch (err) {
      setError(errorMessage(err, 'Import-ku wuu fashilmay.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="text-xs text-[var(--color-text-secondary)]">Su’aal kasta waa inuu leeyahay <code>chapterId</code> iyo <code>topicTags</code>. Import-ku wuxuu update-gareeyaa question number hore u jiray.</p>
      <Field label="Sanadka imtixaanka">
        <select className={inputClass} value={examId} onChange={e => setExamId(e.target.value)}>
          <option value="">Dooro sanad</option>
          {past.map(exam => <option key={exam.id} value={exam.id}>{exam.year}</option>)}
        </select>
      </Field>
      <textarea value={json} onChange={e => setJson(e.target.value)} rows={14} spellCheck={false} className="w-full rounded-xl border border-[var(--color-border-default)] bg-slate-950 p-4 font-mono text-xs text-slate-100 outline-none" aria-label="Su’aalaha JSON" />
      <ErrorLine message={error} />
      <div className="flex flex-wrap gap-2">
        <SaveButton saving={saving} onClick={() => void submit()} label="Import / Update" />
        <button type="button" onClick={() => setJson(JSON.stringify(example, null, 2))} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-bold">Load Example</button>
      </div>
    </>
  );
}
