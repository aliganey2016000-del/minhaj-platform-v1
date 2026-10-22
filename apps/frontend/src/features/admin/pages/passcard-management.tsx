import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarDays, CreditCard, IdCard, Plus, Printer, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import api from '../../../lib/axios';

type Period = { _id: string; name: string; academicYear: string; term?: string; startDate?: string; endDate?: string; status: string };
type Student = { _id: string; studentId: string; profile?: { firstName?: string; lastName?: string } | null; class?: { title?: string; section?: string } | null };
type PassCard = { _id: string; cardNumber: string; createdAt: string; student?: Student; examPeriod?: Period; status: string };
const fullName = (s?: Student) => [s?.profile?.firstName, s?.profile?.lastName].filter(Boolean).join(' ') || s?.studentId || 'Student';
const className = (s?: Student) => [s?.class?.title, s?.class?.section].filter(Boolean).join(' · ') || '—';
const panel = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';

export function PassCardManagement() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [cards, setCards] = useState<PassCard[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [printing, setPrinting] = useState<PassCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [contextRes, cardsRes] = await Promise.all([
        api.get('/passcards/context'),
        api.get('/passcards', { params: periodId ? { periodId } : {} }),
      ]);
      const context = contextRes.data?.data || {};
      setPeriods(context.periods || []);
      setStudents(context.students || []);
      setCards(cardsRes.data?.data || []);
      if (!periodId && context.periods?.length) setPeriodId(context.periods[0]._id);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Could not load PassCard information.');
    } finally { setLoading(false); }
  }, [periodId]);

  useEffect(() => { void load(); }, [load]);

  const visibleCards = useMemo(() => cards.filter(c => {
    const q = search.toLowerCase().trim();
    return !q || fullName(c.student).toLowerCase().includes(q) || c.student?.studentId?.toLowerCase().includes(q) || c.cardNumber.toLowerCase().includes(q);
  }), [cards, search]);
  const existingStudentIds = useMemo(() => new Set(cards.filter(c => c.status === 'issued').map(c => c.student?._id)), [cards]);
  const availableStudents = students.filter(s => !existingStudentIds.has(s._id));

  const create = async () => {
    if (!periodId || !studentId) { setError('Choose an exam period and a student first.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const r = await api.post('/passcards', { periodId, studentId });
      setMessage(r.data?.message || 'PassCard created successfully.');
      setStudentId('');
      await load();
    } catch (e: any) { setError(e.response?.data?.message || 'Could not create PassCard.'); }
    finally { setSaving(false); }
  };

  const revoke = async (card: PassCard) => {
    if (!window.confirm('Revoke PassCard ' + card.cardNumber + '?')) return;
    setError(''); setMessage('');
    try { await api.delete('/passcards/' + card._id); setMessage('PassCard revoked.'); await load(); }
    catch (e: any) { setError(e.response?.data?.message || 'Could not revoke PassCard.'); }
  };

  const printCard = (card: PassCard) => { setPrinting(card); window.setTimeout(() => window.print(), 100); };

  return <div className="p-4 pt-5 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-primary-600">Finance Management</p><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">PassCard Management</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Issue and print examination entry cards for students.</p></div>
        <button onClick={() => document.getElementById('passcard-create-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-700"><Plus size={17}/> Create PassCard</button>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={panel+' p-5'}><div className="flex items-center justify-between"><span className="text-sm text-[var(--color-text-tertiary)]">Issued PassCards</span><IdCard className="text-primary-600"/></div><p className="mt-3 text-3xl font-bold">{cards.filter(c=>c.status==='issued').length}</p></div>
        <div className={panel+' p-5'}><div className="flex items-center justify-between"><span className="text-sm text-[var(--color-text-tertiary)]">Students</span><Users className="text-primary-600"/></div><p className="mt-3 text-3xl font-bold">{students.length}</p></div>
        <div className={panel+' p-5'}><div className="flex items-center justify-between"><span className="text-sm text-[var(--color-text-tertiary)]">Exam Periods</span><CalendarDays className="text-primary-600"/></div><p className="mt-3 text-3xl font-bold">{periods.length}</p></div>
      </div>
      <section id="passcard-create-form" className={panel+' p-5 sm:p-6'}>
        <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-700"><CreditCard size={21}/></div><div><h2 className="text-lg font-bold">Create PassCard</h2><p className="text-sm text-[var(--color-text-tertiary)]">Each student can have one active card per exam period.</p></div></div>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block text-sm font-semibold">Exam period<select value={periodId} onChange={e=>setPeriodId(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 font-normal"><option value="">Select exam period</option>{periods.map(p=><option key={p._id} value={p._id}>{p.name} · {p.academicYear}{p.term?' · '+p.term:''}</option>)}</select></label>
          <label className="block text-sm font-semibold">Student<select value={studentId} onChange={e=>setStudentId(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 font-normal"><option value="">Select student</option>{availableStudents.map(s=><option key={s._id} value={s._id}>{fullName(s)} · {s.studentId} · {className(s)}</option>)}</select></label>
          <button disabled={saving||!periodId||!studentId} onClick={()=>void create()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Plus size={17}/>{saving?'Creating…':'Create PassCard'}</button>
        </div>
      </section>
      <section className={panel+' overflow-hidden'}>
        <div className="flex flex-col gap-3 border-b border-[var(--color-border-default)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">Issued PassCards</h2><p className="text-sm text-[var(--color-text-tertiary)]">Cards created for the selected exam period.</p></div><div className="relative w-full sm:max-w-xs"><Search size={16} className="absolute left-3 top-3 text-[var(--color-text-tertiary)]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, student ID, card…" className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent py-2.5 pl-9 pr-3 text-sm"/></div></div>
        <div className="flex flex-wrap items-center gap-3 border-b p-4"><label className="text-sm font-semibold">Exam period</label><select value={periodId} onChange={e=>setPeriodId(e.target.value)} className="min-w-56 rounded-xl border bg-transparent px-3 py-2 text-sm">{periods.map(p=><option key={p._id} value={p._id}>{p.name} · {p.academicYear}</option>)}</select><button onClick={()=>void load()} className="rounded-xl border px-4 py-2 text-sm font-semibold">Refresh</button></div>
        {loading?<div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">Loading PassCards…</div>:visibleCards.length===0?<div className="p-12 text-center"><BadgeCheck className="mx-auto mb-3 text-[var(--color-text-tertiary)]" size={34}/><p className="font-semibold">No PassCards found</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose an exam period and create a card for a student.</p></div>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-xs uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Student ID</th><th className="px-5 py-3">Class</th><th className="px-5 py-3">Card Number</th><th className="px-5 py-3">Issued Date</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{visibleCards.map(c=><tr key={c._id} className="hover:bg-[var(--color-surface-secondary)]"><td className="px-5 py-4 font-semibold">{fullName(c.student)}</td><td className="px-5 py-4">{c.student?.studentId}</td><td className="px-5 py-4">{className(c.student)}</td><td className="px-5 py-4 font-mono text-xs">{c.cardNumber}</td><td className="px-5 py-4">{new Date(c.createdAt).toLocaleDateString()}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={()=>printCard(c)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Printer size={14}/> Print</button><button onClick={()=>void revoke(c)} className="rounded-lg border border-red-200 p-2 text-red-600" title="Revoke PassCard"><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
      </section>
      {printing&&<div className="print-passcard fixed inset-0 z-[100] flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-xl rounded-2xl border-2 border-slate-800 p-8 text-slate-900">
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4"><div><p className="text-xs font-bold uppercase tracking-[.2em]">Examination Admission</p><h2 className="text-2xl font-black">STUDENT PASSCARD</h2></div><ShieldCheck size={42}/></div>
          <div className="grid grid-cols-[1fr_auto] gap-5 py-6"><div className="space-y-3"><p><span className="block text-xs uppercase text-slate-500">Student name</span><b className="text-xl">{fullName(printing.student)}</b></p><p><span className="block text-xs uppercase text-slate-500">Student ID</span><b>{printing.student?.studentId}</b></p><p><span className="block text-xs uppercase text-slate-500">Class</span><b>{className(printing.student)}</b></p><p><span className="block text-xs uppercase text-slate-500">Exam</span><b>{printing.examPeriod?.name || periods.find(p=>p._id===periodId)?.name}</b></p><p><span className="block text-xs uppercase text-slate-500">Academic year</span><b>{printing.examPeriod?.academicYear || periods.find(p=>p._id===periodId)?.academicYear}</b></p></div><div className="flex h-28 w-28 items-center justify-center border-2 border-dashed border-slate-500 p-2 text-center text-xs font-bold">OFFICIAL<br/>PASSCARD</div></div>
          <div className="flex items-end justify-between border-t-2 border-slate-800 pt-4"><div><span className="block text-xs uppercase text-slate-500">Card number</span><b className="font-mono">{printing.cardNumber}</b></div><span className="text-xs font-bold uppercase">Authorized Entry</span></div>
          <button onClick={()=>setPrinting(null)} className="mt-6 rounded-lg border px-4 py-2 text-sm print:hidden">Close Preview</button>
        </div>
      </div>}
      <style>{'@media print { body * { visibility: hidden !important; } .print-passcard, .print-passcard * { visibility: visible !important; } .print-passcard { position: fixed !important; inset: 0 !important; display: flex !important; background: white !important; padding: 20mm !important; } .print\\:hidden { display: none !important; } }'}</style>
    </div>
  </div>;
}
export default PassCardManagement;
