import { useState, type ReactNode } from 'react';
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { AnswerKey, ChapterContent, ChapterRow, LessonRow, QuestionRow } from './types';

export const inputClass = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-black text-[var(--color-text-secondary)]">
      <span className="mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] font-medium text-[var(--color-text-tertiary)]">{hint}</span>}
    </label>
  );
}

/** Delete needs a second tap on the same button, so no browser dialog is involved. */
export function DeleteButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className="inline-flex items-center gap-1">
      <button type="button" disabled={disabled} onClick={onConfirm} className="inline-flex items-center gap-1 rounded-xl bg-red-500 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><Trash2 size={14} /> Hubi, tirtir</button>
      <button type="button" onClick={() => setArmed(false)} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-bold">Maya</button>
    </span>
  ) : (
    <button type="button" disabled={disabled} onClick={() => setArmed(true)} className="inline-flex items-center gap-1 rounded-xl border border-red-500/40 px-3 py-2 text-xs font-black text-red-500 disabled:opacity-50"><Trash2 size={14} /> Tirtir</button>
  );
}

function EditorShell({ title, error, saving, onSave, onCancel, onDelete, children }: {
  title: string;
  error: string;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border-2 border-emerald-500/70 bg-[var(--color-surface-primary)] p-4 shadow-[0_0_0_4px_rgba(16,185,129,.12)]">
      <p className="text-[11px] font-black uppercase tracking-[.14em] text-emerald-500">{title}</p>
      {children}
      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {onDelete && <DeleteButton onConfirm={onDelete} disabled={saving} />}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-bold"><X size={14} /> Jooji</button>
        <button type="button" disabled={saving} onClick={onSave} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Kaydi
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chapter
// ---------------------------------------------------------------------------

export function ChapterEditor({ chapter, imported, saving, error, onSave, onCancel }: {
  chapter: ChapterRow;
  imported: boolean;
  saving: boolean;
  error: string;
  onSave: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [titleEn, setTitleEn] = useState(chapter.titleEn);
  const [titleSo, setTitleSo] = useState(chapter.titleSo);
  const [titleAr, setTitleAr] = useState(chapter.titleAr);
  const [weight, setWeight] = useState(String(chapter.examWeight));
  const [status, setStatus] = useState(chapter.status);

  return (
    <EditorShell
      title={`Wax ka beddel cutubka ${chapter.order}`}
      error={error}
      saving={saving}
      onCancel={onCancel}
      onSave={() => onSave(imported ? { titleEn, titleSo, titleAr, examWeight: weight, status } : { examWeight: weight })}
    >
      {imported ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Magaca (English)"><input className={inputClass} value={titleEn} onChange={e => setTitleEn(e.target.value)} dir="auto" /></Field>
          <Field label="Magaca (Soomaali)"><input className={inputClass} value={titleSo} onChange={e => setTitleSo(e.target.value)} dir="auto" /></Field>
          <Field label="Magaca (العربية)"><input className={inputClass} value={titleAr} onChange={e => setTitleAr(e.target.value)} dir="rtl" /></Field>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-tertiary)]">Magaca iyo casharrada cutubkan waxaa laga beddelaa <strong>Chapters & Lessons</strong> (menu-ga ⋮). Halkan waxaad ka beddeli kartaa miisaanka keliya.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Miisaanka imtixaanka (%)" hint="Wuxuu saameeyaa Pass Meter-ka ardayda.">
          <input className={inputClass} type="number" min={0} max={100} step={0.1} value={weight} onChange={e => setWeight(e.target.value)} />
        </Field>
        {imported && (
          <Field label="Xaaladda" hint="Cutub draft ah ardayga looma muujiyo.">
            <select className={inputClass} value={status} onChange={e => setStatus(e.target.value as 'draft' | 'published')}>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </Field>
        )}
      </div>
    </EditorShell>
  );
}

// ---------------------------------------------------------------------------
// Lesson
// ---------------------------------------------------------------------------

export function LessonEditor({ lesson, saving, error, onSave, onCancel, onDelete }: {
  lesson: LessonRow | null;
  saving: boolean;
  error: string;
  onSave: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(lesson?.title || '');
  const [contentText, setContentText] = useState(lesson?.contentText || '');
  const [url, setUrl] = useState(lesson?.url || '');
  const [pageFrom, setPageFrom] = useState(lesson?.pageFrom ? String(lesson.pageFrom) : '');
  const [pageTo, setPageTo] = useState(lesson?.pageTo ? String(lesson.pageTo) : '');
  const [clientError, setClientError] = useState('');
  const showUrl = !lesson || lesson.type !== 'note';

  const submit = () => {
    if (!title.trim()) return setClientError('Cinwaanka casharka waa loo baahan yahay.');
    setClientError('');
    onSave({ title, contentText, url, pageFrom: pageFrom || null, pageTo: pageTo || null });
  };

  return (
    <EditorShell title={lesson ? 'Wax ka beddel casharka' : 'Cashar cusub'} error={clientError || error} saving={saving} onSave={submit} onCancel={onCancel} onDelete={onDelete}>
      <Field label="Cinwaanka casharka"><input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} dir="auto" /></Field>
      <Field label="Qoraalka casharka" hint="Formula waxaa lagu qoraa $V = IR$; erayo muhiim ah **mugdi** ku qor.">
        <textarea className={`${inputClass} min-h-[160px] leading-6`} value={contentText} onChange={e => setContentText(e.target.value)} dir="auto" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Bogga ka bilaabma"><input className={inputClass} type="number" min={1} value={pageFrom} onChange={e => setPageFrom(e.target.value)} /></Field>
        <Field label="Bogga ku dhammaada"><input className={inputClass} type="number" min={1} value={pageTo} onChange={e => setPageTo(e.target.value)} /></Field>
        {showUrl && <Field label="Link (ikhtiyaari)"><input className={inputClass} value={url} onChange={e => setUrl(e.target.value)} dir="ltr" /></Field>}
      </div>
    </EditorShell>
  );
}

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

type AnswerMode = 'manual' | 'text' | 'numeric';

function initialMode(question: QuestionRow | null, type: string): AnswerMode {
  const answer = question?.answer;
  if (answer && typeof answer === 'object' && !Array.isArray(answer)) return answer.kind === 'numeric' ? 'numeric' : 'text';
  return type === 'fill' ? 'text' : 'manual';
}

export function QuestionEditor({ question, newType, chapters, exams, defaultExamId, defaultChapterId, saving, error, onSave, onCancel, onDelete }: {
  question: QuestionRow | null;
  newType?: 'mcq' | 'fill' | 'structured';
  chapters: ChapterRow[];
  exams: ChapterContent['exams'];
  defaultExamId: string;
  defaultChapterId: string;
  saving: boolean;
  error: string;
  onSave: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [type, setType] = useState<QuestionRow['type']>(question?.type || newType || 'mcq');
  const [textSo, setTextSo] = useState(question?.textSo || '');
  const [textEn, setTextEn] = useState(question?.textEn || '');
  const [marks, setMarks] = useState(String(question?.marks ?? 1));
  const [chapterId, setChapterId] = useState(question?.chapterId || defaultChapterId);
  const [examId, setExamId] = useState(question?.examId || defaultExamId);
  const [status, setStatus] = useState<'verified' | 'pending'>(question?.answerStatus || 'pending');
  const [tags, setTags] = useState((question?.topicTags || []).join(', '));
  const [explainer, setExplainer] = useState(question?.explainerText || '');
  const [options, setOptions] = useState<string[]>(question?.options?.length ? question.options : type === 'mcq' ? ['', '', '', ''] : []);
  const [correct, setCorrect] = useState<number>(typeof question?.answer === 'number' ? question.answer : 0);
  const [mode, setMode] = useState<AnswerMode>(initialMode(question, type));
  const answer: AnswerKey | undefined = question?.answer;
  const [manualText, setManualText] = useState(typeof answer === 'string' ? answer : '');
  const [accepted, setAccepted] = useState(
    answer && typeof answer === 'object' && !Array.isArray(answer) && answer.kind === 'text' ? answer.accepted.join('\n') : typeof answer === 'string' && type === 'fill' ? answer : '',
  );
  const numeric = answer && typeof answer === 'object' && !Array.isArray(answer) && answer.kind === 'numeric' ? answer : null;
  const [numValue, setNumValue] = useState(numeric ? String(numeric.value) : '');
  const [numTolerance, setNumTolerance] = useState(numeric?.tolerancePct !== undefined ? String(numeric.tolerancePct) : '');
  const [numUnit, setNumUnit] = useState(numeric?.unit || '');
  const [clientError, setClientError] = useState('');

  const submit = () => {
    if (!textSo.trim()) return setClientError('Qoraalka su’aasha waa loo baahan yahay.');
    const payload: Record<string, unknown> = {
      textSo,
      textEn,
      marks,
      chapterId,
      examId,
      answerStatus: status,
      explainerText: explainer,
      topicTags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
    };
    if (!question) payload.type = type;
    if (type === 'mcq') {
      const cleaned = options.map(option => option.trim());
      if (cleaned.length < 2 || cleaned.some(option => !option)) return setClientError('Dhammaan doorashooyinka waa in la buuxiyaa (ugu yaraan 2).');
      payload.options = cleaned;
      payload.answer = correct;
    } else if (type !== 'match') {
      if (mode === 'text') {
        const list = accepted.split('\n').map(item => item.trim()).filter(Boolean);
        if (!list.length) return setClientError('Geli ugu yaraan hal jawaab oo la aqbalo.');
        payload.answer = { kind: 'text', accepted: list };
      } else if (mode === 'numeric') {
        if (numValue.trim() === '' || !Number.isFinite(Number(numValue))) return setClientError('Qiimaha tirada waa inuu noqdaa lambar.');
        payload.answer = { kind: 'numeric', value: Number(numValue), ...(numTolerance !== '' ? { tolerancePct: Number(numTolerance) } : {}), ...(numUnit.trim() ? { unit: numUnit.trim() } : {}) };
      } else {
        payload.answer = manualText;
      }
    }
    setClientError('');
    onSave(payload);
  };

  const typeLabel = { mcq: 'Doorasho (MCQ)', fill: 'Jawaab gaaban', structured: 'Qoraal dheer', match: 'Isku-xidh' }[type];

  return (
    <EditorShell title={question ? `Wax ka beddel su’aasha ${question.number}` : 'Su’aal cusub'} error={clientError || error} saving={saving} onSave={submit} onCancel={onCancel} onDelete={onDelete}>
      {!question && (
        <Field label="Nooca su’aasha">
          <select className={inputClass} value={type} onChange={e => {
            const next = e.target.value as QuestionRow['type'];
            setType(next);
            setMode(next === 'fill' ? 'text' : 'manual');
            if (next === 'mcq' && options.length < 2) setOptions(['', '', '', '']);
          }}>
            <option value="mcq">Doorasho (MCQ)</option>
            <option value="fill">Jawaab gaaban</option>
            <option value="structured">Qoraal dheer</option>
          </select>
        </Field>
      )}
      {question && <p className="text-xs text-[var(--color-text-tertiary)]">Nooca: <strong>{typeLabel}</strong></p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cutubka">
          <select className={inputClass} value={chapterId} onChange={e => setChapterId(e.target.value)}>
            {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.order}. {chapter.title}</option>)}
          </select>
        </Field>
        <Field label="Imtixaanka" hint="Beddel si su’aasha loogu wareejiyo sanad kale ama tababar.">
          <select className={inputClass} value={examId} onChange={e => setExamId(e.target.value)}>
            {exams.filter(exam => exam.kind !== 'practice').map(exam => <option key={exam.id} value={exam.id}>Sanadka {exam.year}{exam.published ? '' : ' (draft)'}</option>)}
            {exams.filter(exam => exam.kind === 'practice').map(exam => <option key={exam.id} value={exam.id}>Tababar{exams.filter(item => item.kind === 'practice').length > 1 ? ' · ' + exam.year : ''}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Su’aasha"><textarea className={`${inputClass} min-h-[96px] leading-6`} value={textSo} onChange={e => setTextSo(e.target.value)} dir="auto" /></Field>
      <Field label="Su’aasha (English, ikhtiyaari)"><textarea className={`${inputClass} min-h-[64px]`} value={textEn} onChange={e => setTextEn(e.target.value)} dir="auto" /></Field>

      {type === 'mcq' && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-black text-[var(--color-text-secondary)]">Doorashooyinka · dooro kan sax ah</legend>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input type="radio" name="correct-option" checked={correct === index} onChange={() => setCorrect(index)} className="h-5 w-5 shrink-0 accent-emerald-500" aria-label={`Doorashada ${String.fromCharCode(65 + index)} waa jawaabta saxda ah`} />
              <span className="w-5 shrink-0 text-xs font-black text-[var(--color-text-tertiary)]">{String.fromCharCode(65 + index)}</span>
              <input className={inputClass} value={option} onChange={e => setOptions(current => current.map((item, i) => i === index ? e.target.value : item))} dir="auto" aria-label={`Doorashada ${String.fromCharCode(65 + index)}`} />
              {options.length > 2 && (
                <button type="button" aria-label="Ka saar doorashadan" onClick={() => {
                  setOptions(current => current.filter((_, i) => i !== index));
                  setCorrect(current => current === index ? 0 : current > index ? current - 1 : current);
                }} className="shrink-0 rounded-lg border border-[var(--color-border-default)] p-2 text-[var(--color-text-tertiary)]"><X size={14} /></button>
              )}
            </div>
          ))}
          {options.length < 6 && <button type="button" onClick={() => setOptions(current => [...current, ''])} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[var(--color-border-default)] px-3 py-1.5 text-xs font-bold"><Plus size={14} /> Ku dar doorasho</button>}
        </fieldset>
      )}

      {type === 'match' && (
        <div className="rounded-xl bg-[var(--color-surface-tertiary)] p-3 text-xs">
          <p className="font-black">Isku-xidhka jawaabaha</p>
          <p className="mt-1 whitespace-pre-line text-[var(--color-text-secondary)]">{question?.answerDisplay || '—'}</p>
          <p className="mt-2 text-[var(--color-text-tertiary)]">Lammaanaha isku-xidhka waxaa laga beddelaa Excel-ka (Questions sheet). Halkan waxaad ka saxi kartaa qoraalka iyo cutubka.</p>
        </div>
      )}

      {(type === 'fill' || type === 'structured') && (
        <div className="space-y-3 rounded-xl bg-[var(--color-surface-tertiary)]/60 p-3">
          <Field label="Sida jawaabta loo hubiyo">
            <select className={inputClass} value={mode} onChange={e => setMode(e.target.value as AnswerMode)}>
              <option value="text">Qoraal (liis jawaabo la aqbalo)</option>
              <option value="numeric">Lambar (qiime + xad-dhaaf)</option>
              <option value="manual">Macallinku gacanta ayuu hubiyaa (jawaab tusaale ah)</option>
            </select>
          </Field>
          {mode === 'text' && (
            <Field label="Jawaabaha la aqbalo" hint="Hal sadar = hal jawaab. Higgaadda yar iyo xarakaadka waa la dhaafaa.">
              <textarea className={`${inputClass} min-h-[80px]`} value={accepted} onChange={e => setAccepted(e.target.value)} dir="auto" />
            </Field>
          )}
          {mode === 'numeric' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Qiimaha saxda ah"><input className={inputClass} inputMode="decimal" value={numValue} onChange={e => setNumValue(e.target.value)} /></Field>
              <Field label="Xad-dhaaf (%)"><input className={inputClass} inputMode="decimal" value={numTolerance} onChange={e => setNumTolerance(e.target.value)} placeholder="1" /></Field>
              <Field label="Cutubka (unit)"><input className={inputClass} value={numUnit} onChange={e => setNumUnit(e.target.value)} placeholder="m/s" /></Field>
            </div>
          )}
          {mode === 'manual' && (
            <Field label="Jawaabta tusaalaha ah"><textarea className={`${inputClass} min-h-[80px]`} value={manualText} onChange={e => setManualText(e.target.value)} dir="auto" /></Field>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Dhibcaha"><input className={inputClass} type="number" min={0} max={100} step={0.5} value={marks} onChange={e => setMarks(e.target.value)} /></Field>
        <Field label="Xaaladda jawaabta">
          <select className={inputClass} value={status} onChange={e => setStatus(e.target.value as 'verified' | 'pending')}>
            <option value="verified">Verified · waa la hubiyay</option>
            <option value="pending">Pending · weli lama hubin</option>
          </select>
        </Field>
        <Field label="Tags" hint="Kala sooc comma (,)"><input className={inputClass} value={tags} onChange={e => setTags(e.target.value)} dir="auto" /></Field>
      </div>
      <Field label="Sharaxaadda jawaabta (ikhtiyaari)"><textarea className={`${inputClass} min-h-[64px]`} value={explainer} onChange={e => setExplainer(e.target.value)} dir="auto" /></Field>
    </EditorShell>
  );
}
