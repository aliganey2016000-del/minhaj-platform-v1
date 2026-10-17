import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Shuffle, X } from 'lucide-react';
import api from '../../../lib/axios';

type Item = { id: string; number: number; type: string; marks: number; year: number | null; text: string };

/**
 * Sheet to pick some of the questions of one chapter source or one exam
 * (bottom sheet on a phone, centred card on a larger screen).
 */
export function GuuldoonQuestionPicker({ courseId, chapterId, examId, source, onSourceChange, title, rtl, selected, onChange, onClose }: {
  onSourceChange?: (source: 'understand' | 'past') => void;
  courseId: string; chapterId?: string; examId?: string; source?: 'understand' | 'past'; title: string; rtl: 'ltr' | 'rtl';
  selected: string[]; onChange: (ids: string[]) => void; onClose: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.get('/guuldoon-challenges/questions', { params: { courseId, chapterId, examId, source } })
      .then(({ data }) => { if (live) setItems(data.data as Item[]); })
      .catch((err) => { if (live) setError(err.response?.data?.message || 'Su’aalaha lama soo rari karin.'); });
    return () => { live = false; };
  }, [courseId, chapterId, examId, source]);

  const chosen = useMemo(() => new Set(selected), [selected]);
  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  const all = items?.map((item) => item.id) || [];
  const random = (n: number) => onChange([...all].sort(() => Math.random() - 0.5).slice(0, n));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--color-surface-primary)] shadow-2xl sm:max-w-2xl sm:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-3.5 text-white sm:px-5">
          <div className="min-w-0"><p className="text-xs font-bold text-white/80">Dooro su’aalaha</p><h3 className="break-words text-lg font-black" dir={rtl}>{title}</h3></div>
          <button type="button" onClick={onClose} aria-label="Xidh" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20"><X size={18} /></button>
        </header>

        {chapterId && onSourceChange && (
          <div className="flex gap-1 px-4 pt-3 sm:px-5" role="group" aria-label="Nooca su’aalaha">
            {([['understand', 'Fahamka cutubka'], ['past', 'Imtixaanadii hore']] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={source === key} onClick={() => onSourceChange(key)}
                className={'min-h-[40px] flex-1 rounded-xl px-3 text-xs font-extrabold ' + (source === key ? 'bg-sky-600 text-white' : 'bg-[var(--color-surface-tertiary)]')}>{label}</button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border-subtle)] px-4 py-3 sm:px-5">
          <button type="button" onClick={() => onChange(all)} className="min-h-[40px] rounded-full bg-sky-600 px-4 text-xs font-extrabold text-white">Dhammaan ({all.length})</button>
          <button type="button" onClick={() => onChange([])} className="min-h-[40px] rounded-full border px-4 text-xs font-extrabold">Ka saar</button>
          {[5, 10, 20].filter((n) => n < all.length).map((n) => (
            <button key={n} type="button" onClick={() => random(n)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 px-3.5 text-xs font-extrabold text-amber-600"><Shuffle size={13} />{n} random</button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {!items && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-sky-500" /></div>}
          {error && <p role="alert" className="p-3 text-sm font-bold text-rose-500">{error}</p>}
          {items && items.length === 0 && <p className="p-4 text-center text-sm text-[var(--color-text-tertiary)]">Su’aal ma jirto halkan.</p>}
          <ul className="space-y-2">
            {items?.map((item) => {
              const on = chosen.has(item.id);
              return (
                <li key={item.id}>
                  <button type="button" aria-pressed={on} onClick={() => toggle(item.id)}
                    className={'flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left transition ' + (on ? 'border-sky-500 bg-sky-500/10' : 'border-[var(--color-border-subtle)] hover:border-sky-500/40')}>
                    <span className={'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 ' + (on ? 'border-sky-600 bg-sky-600 text-white' : 'border-[var(--color-border-default)]')}>{on && <Check size={14} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold">
                        <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-indigo-600">Q{item.number}</span>
                        {item.year && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-amber-600">{item.year}</span>}
                        <span className="rounded-md bg-slate-500/15 px-1.5 py-0.5 uppercase text-slate-500">{item.type}</span>
                        <span className="text-[var(--color-text-tertiary)]">{item.marks} dhibcood</span>
                      </span>
                      <span className="mt-1 line-clamp-3 block break-words text-sm font-semibold leading-5" dir="auto">{item.text}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          <b className="text-sm text-sky-600">{selected.length} la doortay</b>
          <button type="button" onClick={onClose} className="min-h-[46px] rounded-2xl bg-gradient-to-r from-emerald-600 to-sky-600 px-6 text-sm font-black text-white">Waa kaas</button>
        </footer>
      </div>
    </div>
  );
}
