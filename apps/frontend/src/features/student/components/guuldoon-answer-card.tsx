import { CheckCircle2, XCircle } from 'lucide-react';

export type AnswerItem = {
  _id: string; number: number; type: string; textSo?: string; textEn?: string; examYear: number | null;
  mine: string; correct: boolean | null; right: string; attempts: number; firstTry: boolean | null; marks?: number;
};

/** One answered question: the student's answer, whether it was right, and the right answer for mistakes. */
export function AnswerCard({ item, onRetry, mineLabel = 'Jawaabtaada' }: { item: AnswerItem; onRetry?: () => void; mineLabel?: string }) {
  return (
    <article className={'space-y-2 rounded-2xl border p-3.5 ' + (item.correct === false ? 'border-rose-500/30 bg-rose-500/5' : item.correct ? 'border-emerald-500/30 bg-emerald-500/5' : '')}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-[var(--color-text-tertiary)]">
        <span>{item.examYear ? `${item.examYear} · ` : ''}Q{item.number} · {item.type}{item.marks ? ` · ${item.marks} dhibcood` : ''}</span>
        {item.correct === true && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-600"><CheckCircle2 size={13} />Waa saxday</span>}
        {item.correct === false && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-500"><XCircle size={13} />Waa qaladay</span>}
        {item.correct === null && <span className="rounded-full bg-slate-500/15 px-2.5 py-1">Sugaya hubin</span>}
      </div>
      <p className="whitespace-pre-line text-sm font-bold" dir="auto">{item.textSo || item.textEn}</p>
      <div>
        <span className="block text-[11px] text-[var(--color-text-tertiary)]">{mineLabel}</span>
        <b className={'whitespace-pre-line break-words text-sm ' + (item.correct === false ? 'text-rose-500' : item.correct ? 'text-emerald-600' : '')} dir="auto">{item.mine || '—'}</b>
      </div>
      {item.correct === false && item.right && (
        <div>
          <span className="block text-[11px] text-[var(--color-text-tertiary)]">Jawaabta saxda ah</span>
          <b className="whitespace-pre-line break-words text-sm text-emerald-600" dir="auto">{item.right}</b>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)]">{item.attempts > 1 ? `${item.attempts} isku-day${item.firstTry === false && item.correct ? ' · markii hore waa qaladay' : ''}` : ''}</span>
        {onRetry && <button type="button" onClick={onRetry} className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white">Isku day hadda</button>}
      </div>
    </article>
  );
}
