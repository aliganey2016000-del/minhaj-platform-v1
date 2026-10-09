import { useCallback, useEffect, useState } from 'react';
import { Check, Inbox, RefreshCw, X } from 'lucide-react';
import api from '../../../lib/axios';

type UnmatchedRow = {
  id: string;
  answer: string;
  count: number;
  expected: string;
  question: { id: string; externalId: string; number: number; text: string } | null;
};

/**
 * Wrong text answers that several students gave. One tap adds the answer to the
 * accepted list (so it is marked correct from now on) or dismisses it.
 */
export function GuuldoonUnmatchedAnswers({ courseId }: { courseId: string }) {
  const [rows, setRows] = useState<UnmatchedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/guuldoon/admin/courses/${courseId}/unmatched-answers`, { params: { limit: 30 } });
      setRows(Array.isArray(data.data) ? data.data : []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Jawaabaha ardayda lama soo rari karin.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (row: UnmatchedRow, decision: 'accept' | 'reject') => {
    setBusyId(row.id);
    setError('');
    try {
      await api.post(`/guuldoon/admin/unmatched-answers/${row.id}/${decision}`);
      setRows(current => current.filter(item => item.id !== row.id));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Go’aanka lama kaydin karin.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5" aria-labelledby="unmatched-answers-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="text-emerald-600" size={20} />
          <h2 id="unmatched-answers-title" className="font-black">Jawaabaha ardayda ee la dhex-eego</h2>
          {rows.length > 0 && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-black text-amber-600">{rows.length}</span>}
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-bold disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Cusbooneysii
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
        Jawaabaha qoraalka ah ee khaldan ee ardayda badan qortay. <strong>Aqbal</strong> waxay ku darsataa liiska jawaabaha saxda ah (marka xigta waa sax); <strong>Diid</strong> waxay ka saartaa liiska.
      </p>

      {error && <div role="alert" className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

      {loading && rows.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">Waa la soo rarayaa…</p>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border-default)] p-6 text-center text-sm text-[var(--color-text-tertiary)]">Jawaab dib-u-eegis u baahan ma jirto.</div>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map(row => (
            <li key={row.id} className="grid gap-3 rounded-xl border border-[var(--color-border-subtle)] p-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-xs text-[var(--color-text-tertiary)]">{row.question ? `Q${row.question.number} · ${row.question.externalId}` : 'Su’aal la tirtiray'}</p>
                <p className="mt-0.5 line-clamp-2 text-sm font-bold">{row.question?.text || '—'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-lg bg-red-500/10 px-2.5 py-1 font-black text-red-500">Ardaygu: {row.answer}</span>
                  <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-600">Jawaabta: {row.expected || '—'}</span>
                  <span className="font-bold text-[var(--color-text-secondary)]">{row.count}× la qoray</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={busyId === row.id} onClick={() => void decide(row, 'accept')} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Check size={16} /> Aqbal</button>
                <button disabled={busyId === row.id} onClick={() => void decide(row, 'reject')} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-bold disabled:opacity-50"><X size={16} /> Diid</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
