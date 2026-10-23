import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CreditCard, Plus, Printer, Search, ShieldCheck, Trash2, Users, MoreVertical } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

type Period = { _id: string; name: string; academicYear: string; term?: string; startDate?: string; endDate?: string; status: string };
type Student = { _id: string; studentId: string; department?: string | null; profile?: { firstName?: string; lastName?: string } | null; class?: { _id?: string; title?: string; section?: string } | null };
type PassCard = { _id: string; cardNumber: string; createdAt: string; student?: Student; examPeriod?: Period; status: string };
const fullName = (s?: Student) => [s?.profile?.firstName, s?.profile?.lastName].filter(Boolean).join(' ') || s?.studentId || 'Student';
const className = (s?: Student) => [s?.class?.title, s?.class?.section].filter(Boolean).join(' · ') || '—';
const panel = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';

export function PassCardManagement() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [cards, setCards] = useState<PassCard[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [printing, setPrinting] = useState<PassCard | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'issued' | 'pending'>('issued');
  const [pageView, setPageView] = useState<'exams' | 'detail'>('exams');
  const [scope, setScope] = useState<'all' | 'department' | 'class'>('all');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [issuingId, setIssuingId] = useState('');
  const { user } = useAuth();
  const [schoolName, setSchoolName] = useState((user as any)?.organizationName || 'School');
  const [schoolLogo, setSchoolLogo] = useState('');

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

  useEffect(() => {
    const schoolId = String((user as any)?.organizationId || '');
    if (!schoolId) return;
    let active = true;
    api.get(`/schools/${schoolId}/branding`).then(({ data }) => {
      if (!active) return;
      const school = data?.data?.school || {};
      if (school.name) setSchoolName(school.name);
      if (school.branding?.logo) setSchoolLogo(school.branding.logo);
    }).catch(() => {
      // Branding is optional; the passcard remains printable without a logo.
    });
    return () => { active = false; };
  }, [user]);

  const visibleCards = useMemo(() => cards.filter(c => c.status === activeTab).filter(c => {
    const q = search.toLowerCase().trim();
    return !q || fullName(c.student).toLowerCase().includes(q) || c.student?.studentId?.toLowerCase().includes(q) || c.cardNumber.toLowerCase().includes(q);
  }), [cards, search, activeTab]);
  const existingStudentIds = useMemo(() => new Set(cards.filter(c => c.status === 'issued' || c.status === 'pending').map(c => c.student?._id)), [cards]);
  const sortedPeriods = useMemo(() => [...periods].sort((a,b) => new Date(b.startDate || b.endDate || '1970-01-01').getTime() - new Date(a.startDate || a.endDate || '1970-01-01').getTime()), [periods]);
  const selectedPeriod = periods.find(p => p._id === periodId);
  const departments = useMemo(() => Array.from(new Set(students.map(s => s.department?.trim()).filter((v): v is string => Boolean(v)))).sort((a,b)=>a.localeCompare(b)), [students]);
  const classOptions = useMemo(() => Array.from(new Map(students.filter(s=>s.class?._id && (!departmentFilter || s.department === departmentFilter)).map(s=>[s.class!._id!, {id:s.class!._id!, label:className(s)}])).values()).sort((a,b)=>a.label.localeCompare(b.label)), [students, departmentFilter]);
  const filteredStudents = students.filter(s => {
    if (scope === 'department' && (!departmentFilter || s.department !== departmentFilter || (classFilter && s.class?._id !== classFilter))) return false;
    if (scope === 'class' && (!classFilter || s.class?._id !== classFilter || (departmentFilter && s.department !== departmentFilter))) return false;
    const q = studentSearch.trim().toLowerCase();
    return !q || fullName(s).toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q);
  });
  const availableStudents = filteredStudents.filter(s => !existingStudentIds.has(s._id));
  const toggleStudent = (id: string) => setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const createBulk = async () => {
    if (!periodId || selectedStudentIds.length === 0) { setError('Choose an exam period and at least one student.'); return; }
    setBulkSaving(true); setError(''); setMessage('');
    let created = 0; let skipped = 0; let failed = 0;
    try {
      for (const id of selectedStudentIds) {
        try {
          const response = await api.post('/passcards', { periodId, studentId: id });
          if (response.data?.alreadyExists) skipped++; else created++;
        } catch { failed++; }
      }
      setSelectedStudentIds([]);
      setMessage('Generation complete: ' + created + ' added to Not Issued, ' + skipped + ' already existed, ' + failed + ' failed.');
      await load();
      setPageView('detail');
      setCreateModalOpen(false);
    } finally { setBulkSaving(false); }
  };

  const issueCard = async (card: PassCard) => {
    setIssuingId(card._id); setError(''); setMessage('');
    try {
      const response = await api.post('/passcards/' + card._id + '/issue');
      setMessage(response.data?.message || 'PassCard issued successfully.');
      await load();
      setActiveTab('issued');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Could not issue this PassCard.');
    } finally {
      setIssuingId('');
    }
  };

  const revoke = async (card: PassCard) => {
    if (!window.confirm('Revoke PassCard ' + card.cardNumber + '?')) return;
    setError(''); setMessage('');
    try { await api.delete('/passcards/' + card._id); setMessage('PassCard revoked.'); await load(); }
    catch (e: any) { setError(e.response?.data?.message || 'Could not revoke PassCard.'); }
  };

  const printCard = (card: PassCard) => { setPrinting(card); window.setTimeout(() => window.print(), 100); };

  if (pageView === 'exams') {
    return <div className="p-4 pt-5 sm:p-6 lg:p-8"><div className="mx-auto max-w-screen-2xl space-y-6">
      <header><p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-primary-600">Finance Management</p><h1 className="whitespace-nowrap text-[clamp(1.1rem,5vw,1.875rem)] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">PassCard Management</h1><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Select an exam to manage its PassCards.</p></header>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? <div className={panel+" p-12 text-center"}>Loading exam periods…</div> : sortedPeriods.length === 0 ? <div className={panel+" p-10 text-center"}><h2 className="font-bold">No exam periods found</h2><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Create an exam period first.</p></div> : <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{sortedPeriods.map((period,index) => <button key={period._id} type="button" onClick={() => { setPeriodId(period._id); setPageView('detail'); setSearch(''); }} className={panel+" group flex min-h-[136px] min-w-0 flex-col justify-between p-4 text-left transition duration-150 hover:-translate-y-0.5 hover:border-primary-500 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"}><div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600"><CreditCard size={21}/></span><div className="min-w-0 flex-1"><div className="flex min-w-0 items-start justify-between gap-2"><h2 className="min-w-0 truncate text-base font-bold sm:text-lg" title={period.name}>{period.name}</h2>{index===0&&<span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600">Newest</span>}</div><p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">{period.academicYear}{period.term?' · '+period.term:''}</p></div></div><div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-t border-[var(--color-border-default)] pt-3"><span className="truncate text-xs text-[var(--color-text-tertiary)]">{period.startDate ? new Date(period.startDate).toLocaleDateString() : period.endDate ? new Date(period.endDate).toLocaleDateString() : 'Date not set'}</span><span className="shrink-0 text-sm font-bold text-primary-600 group-hover:translate-x-0.5">Open exam →</span></div></button>)}</section>}
    </div></div>;
  }

  const returnToExamList = () => { setPageView('exams'); setActionsMenuOpen(false); setCreateModalOpen(false); };

  return <div className="p-4 pt-5 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><button type="button" onClick={returnToExamList} className="mb-3 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-semibold">← All exams</button><p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-primary-600">Finance Management</p><h1 className="whitespace-nowrap text-[clamp(1.1rem,5vw,1.875rem)] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">PassCard Management</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{selectedPeriod?.name || "Selected exam"} · {selectedPeriod?.academicYear || ""} — issue and print student entry cards.</p></div>
        <div className="relative shrink-0">
          <button type="button" onClick={() => setActionsMenuOpen(open => !open)} aria-label="PassCard actions" aria-expanded={actionsMenuOpen} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] shadow-sm hover:bg-[var(--color-surface-secondary)]"><MoreVertical size={22}/></button>
          {actionsMenuOpen && <><button type="button" aria-label="Close actions menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setActionsMenuOpen(false)}></button><div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-xl">
            <button type="button" onClick={() => { setActionsMenuOpen(false); setCreateModalOpen(true); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold hover:bg-[var(--color-surface-secondary)]"><Users size={17}/> Generate PassCards</button>
          </div></>}
        </div>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      {createModalOpen && <div className="fixed inset-0 z-[90] overflow-y-auto bg-[var(--color-surface-primary)] p-4 pt-5 sm:p-6 lg:p-8" role="dialog" aria-modal="true" aria-labelledby="passcard-create-modal-title" onClick={e=>{if(e.target===e.currentTarget)setCreateModalOpen(false);}}>
      <section id="passcard-create-form" className={panel+' mx-auto min-h-[calc(100vh-2rem)] w-full max-w-screen-xl p-5 sm:p-6'}><div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="passcard-create-modal-title" className="text-xl font-bold">Generate PassCards</h2><p className="text-sm text-[var(--color-text-tertiary)]">{selectedPeriod?.name || "Selected exam"} · {selectedPeriod?.academicYear || ""}</p></div><button type="button" onClick={()=>setCreateModalOpen(false)} aria-label="Close PassCard actions" className="rounded-xl border px-3 py-2 text-sm font-semibold">Close ✕</button></div>
        <div id="passcard-bulk-issue" className="mt-5 rounded-xl border border-[var(--color-border-default)] p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-700"><Users size={21}/></div><div><h3 className="font-bold">Generate PassCards</h3><p className="text-sm text-[var(--color-text-tertiary)]">Generated cards go to Not Issued. Issue each card when it is ready.</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Generate for<select value={scope} onChange={e=>{setScope(e.target.value as 'all'|'department'|'class');setSelectedStudentIds([]);}} className="mt-2 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 font-normal"><option value="all">All eligible students</option><option value="department">Specific department</option><option value="class">Specific class</option></select></label>
            {(scope==='department'||scope==='class')&&<label className="block text-sm font-semibold">Department{scope==='class'?' *':''}<select value={departmentFilter} onChange={e=>{setDepartmentFilter(e.target.value);setClassFilter('');setSelectedStudentIds([]);}} className="mt-2 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 font-normal"><option value="">Select department</option>{departments.map(d=><option key={d} value={d}>{d}</option>)}</select></label>}
            {scope==='department'&&departmentFilter&&<label className="block text-sm font-semibold">Class (optional)<select value={classFilter} onChange={e=>{setClassFilter(e.target.value);setSelectedStudentIds([]);}} className="mt-2 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 font-normal"><option value="">All classes in department</option>{classOptions.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
            {scope==='class'&&<label className="block text-sm font-semibold">Class *<select value={classFilter} onChange={e=>{setClassFilter(e.target.value);setSelectedStudentIds([]);}} className="mt-2 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 font-normal"><option value="">Select class</option>{classOptions.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-3 text-[var(--color-text-tertiary)]"/><input value={studentSearch} onChange={e=>setStudentSearch(e.target.value)} placeholder="Find student by name or ID…" className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent py-2.5 pl-9 pr-3 text-sm"/></div><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setSelectedStudentIds(availableStudents.map(x=>x._id))} className="rounded-lg border px-3 py-2 text-sm font-semibold">Select eligible ({availableStudents.length})</button><button type="button" onClick={()=>setSelectedStudentIds([])} className="rounded-lg border px-3 py-2 text-sm font-semibold">Clear</button></div></div>
          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {filteredStudents.map(student=>{const already=existingStudentIds.has(student._id);return <label key={student._id} className={'flex min-w-0 items-start gap-3 rounded-lg border p-3 '+(already?'cursor-not-allowed opacity-50':'cursor-pointer hover:bg-[var(--color-surface-secondary)]')}><input type="checkbox" disabled={already} checked={selectedStudentIds.includes(student._id)} onChange={()=>toggleStudent(student._id)} className="mt-1 h-4 w-4 shrink-0 accent-current"/><span className="min-w-0"><span className="block break-words text-sm font-semibold">{fullName(student)}</span><span className="block text-xs text-[var(--color-text-tertiary)]">{student.studentId} · {className(student)}</span><span className="block text-xs text-[var(--color-text-tertiary)]">{student.department||'No department'}{already?' · Already generated':''}</span></span></label>})}
            {filteredStudents.length===0&&<p className="text-sm text-[var(--color-text-tertiary)]">No students match these filters.</p>}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-default)] pt-4"><p className="text-sm text-[var(--color-text-tertiary)]">{selectedStudentIds.length} selected · existing pending or issued cards are excluded</p><button type="button" disabled={bulkSaving||!periodId||selectedStudentIds.length===0||((scope==='department'||scope==='class')&&!departmentFilter)||(scope==='class'&&!classFilter)} onClick={()=>void createBulk()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Plus size={17}/>{bulkSaving?'Generating…':'Generate '+selectedStudentIds.length+' PassCard(s)'}</button></div>
        </div>
      </section>
      </div>}
      <section className={panel+' overflow-hidden'}>
        <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border-default)] p-4 sm:p-5">
          <button type="button" onClick={()=>setActiveTab('issued')} className={'flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold '+(activeTab==='issued'?'border-emerald-500 bg-emerald-500/10 text-emerald-600':'border-[var(--color-border-default)] text-[var(--color-text-tertiary)]')}>Issued <span className="rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-xs">{cards.filter(c=>c.status==='issued').length}</span></button>
          <button type="button" onClick={()=>setActiveTab('pending')} className={'flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold '+(activeTab==='pending'?'border-amber-500 bg-amber-500/10 text-amber-600':'border-[var(--color-border-default)] text-[var(--color-text-tertiary)]')}>Not Issued <span className="rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-xs">{cards.filter(c=>c.status==='pending').length}</span></button>
        </div>
        <div className="flex flex-col gap-3 border-b border-[var(--color-border-default)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">{activeTab==='issued'?'Issued PassCards':'Not Issued PassCards'}</h2><p className="text-sm text-[var(--color-text-tertiary)]">{activeTab==='issued'?'Cards officially issued for the selected exam period.':'Generated cards waiting to be issued.'}</p></div><div className="relative w-full sm:max-w-xs"><Search size={16} className="absolute left-3 top-3 text-[var(--color-text-tertiary)]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, student ID, card…" className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent py-2.5 pl-9 pr-3 text-sm"/></div></div>
        <div className="flex flex-wrap items-center gap-3 border-b p-4"><span className="text-sm font-semibold">Exam period: {selectedPeriod?.name} · {selectedPeriod?.academicYear}</span><button onClick={()=>void load()} className="rounded-xl border px-4 py-2 text-sm font-semibold">Refresh</button></div>
        {loading?<div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">Loading PassCards…</div>:visibleCards.length===0?<div className="p-12 text-center"><BadgeCheck className="mx-auto mb-3 text-[var(--color-text-tertiary)]" size={34}/><p className="font-semibold">{activeTab==='issued'?'No issued PassCards':'No PassCards waiting to be issued'}</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{activeTab==='issued'?'Generate cards, then issue them to move them here.':'Generate PassCards above to populate this list.'}</p></div>:<div>
          <div className="grid gap-3 p-3 sm:hidden">{visibleCards.map(c=><article key={c._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-bold">{fullName(c.student)}</h3><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Student ID: {c.student?.studentId || '—'}</p></div><span className={'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold '+(c.status==='issued'?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800')}>{c.status==='issued'?'Issued':'Not Issued'}</span></div>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm"><div className="min-w-0"><dt className="text-xs text-[var(--color-text-tertiary)]">Class</dt><dd className="break-words font-medium">{className(c.student)}</dd></div><div className="min-w-0"><dt className="text-xs text-[var(--color-text-tertiary)]">Issued date</dt><dd>{new Date(c.createdAt).toLocaleDateString()}</dd></div><div className="col-span-2 min-w-0"><dt className="text-xs text-[var(--color-text-tertiary)]">Card number</dt><dd className="break-all font-mono text-xs">{c.cardNumber}</dd></div></dl>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">{c.status==='pending'?<button disabled={issuingId===c._id} onClick={()=>void issueCard(c)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{issuingId===c._id?'Issuing…':'Issue PassCard'}</button>:<button onClick={()=>printCard(c)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-3 py-2 text-sm font-bold text-white"><Printer size={16}/> Print</button>}{c.status==='issued'&&<button onClick={()=>void revoke(c)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-3 text-red-600" title="Revoke PassCard" aria-label={`Revoke PassCard ${c.cardNumber}`}><Trash2 size={17}/></button>}</div>
          </article>)}</div>
          <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-xs uppercase text-[var(--color-text-tertiary)]"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Card Number</th><th className="px-4 py-3">Issued Date</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{visibleCards.map(c=><tr key={c._id} className="hover:bg-[var(--color-surface-secondary)]"><td className="max-w-48 break-words px-4 py-4 font-semibold">{fullName(c.student)}</td><td className="px-4 py-4">{c.student?.studentId || '—'}</td><td className="px-4 py-4">{className(c.student)}</td><td className="max-w-48 break-all px-4 py-4 font-mono text-xs">{c.cardNumber}</td><td className="whitespace-nowrap px-4 py-4">{new Date(c.createdAt).toLocaleDateString()}</td><td className="px-4 py-4"><div className="flex justify-end gap-2">{c.status==='pending'?<button disabled={issuingId===c._id} onClick={()=>void issueCard(c)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{issuingId===c._id?'Issuing…':'Issue'}</button>:<><button onClick={()=>printCard(c)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Printer size={14}/> Print</button><button onClick={()=>void revoke(c)} className="rounded-lg border border-red-200 p-2 text-red-600" title="Revoke PassCard" aria-label={`Revoke PassCard ${c.cardNumber}`}><Trash2 size={15}/></button></>}</div></td></tr>)}</tbody></table></div>
        </div>}
      </section>
      {printing&&<div className="print-passcard fixed inset-0 z-[100] flex items-center justify-center bg-slate-100 p-3 sm:p-6">
        <div className="passcard-sheet relative flex w-full max-w-[210mm] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
          <div className="passcard-top relative overflow-hidden bg-gradient-to-r from-blue-950 via-blue-800 to-teal-700 px-6 py-5 text-white sm:px-9 sm:py-7">
            <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full border-[18px] border-white/10"></div>
            <div className="relative flex items-center gap-4">
              {schoolLogo ? <img src={schoolLogo} alt="School logo" className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain p-1.5"/> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/15 text-xl font-black ring-1 ring-white/30">{schoolName.slice(0,2).toUpperCase()}</div>}
              <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-200">Official Examination Document</p><h2 className="mt-1 break-words text-xl font-black uppercase leading-tight sm:text-2xl">{schoolName}</h2><p className="mt-1 text-sm font-semibold text-blue-100">STUDENT EXAMINATION PASSCARD</p></div>
              <ShieldCheck className="hidden shrink-0 text-teal-200 sm:block" size={42}/>
            </div>
          </div>
          <div className="passcard-body flex flex-1 flex-col px-6 py-5 sm:px-9 sm:py-7">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-4"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Examination Admission</p><h3 className="mt-1 text-xl font-black text-slate-900">EXAM PASSCARD</h3></div><div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-center"><p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">Academic Year</p><p className="mt-1 text-sm font-extrabold text-slate-900">{printing.examPeriod?.academicYear || periods.find(p=>p._id===periodId)?.academicYear || '—'}</p></div></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Student name</p><p className="mt-1 break-words text-lg font-extrabold text-slate-900">{fullName(printing.student)}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Student ID</p><p className="mt-1 text-lg font-extrabold text-slate-900">{printing.student?.studentId || '—'}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Class / Section</p><p className="mt-1 text-base font-bold text-slate-900">{className(printing.student)}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Examination</p><p className="mt-1 break-words text-base font-bold text-slate-900">{printing.examPeriod?.name || periods.find(p=>p._id===periodId)?.name || '—'}</p><p className="mt-1 text-xs text-slate-500">{printing.examPeriod?.term || periods.find(p=>p._id===periodId)?.term || ''}</p></div>
            </div>
            <div className="mt-4 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/60 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-blue-800">PassCard Number</p><p className="mt-1 break-all font-mono text-sm font-black tracking-wide text-slate-900">{printing.cardNumber}</p></div>
            <div className="mt-auto grid grid-cols-2 gap-6 pt-7">
              <div className="border-t border-slate-300 pt-2 text-center"><p className="text-xs font-semibold text-slate-600">Finance Signature</p></div>
              <div className="flex min-h-[90px] flex-col items-center justify-end rounded-xl border border-dashed border-slate-300 px-3 pb-2 pt-3 text-center"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Official Stamp</p><p className="mt-1 text-[10px] text-slate-400">School seal / stamp area</p></div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>Valid for selected examination period</span><span>Issued {new Date(printing.createdAt).toLocaleDateString()}</span></div>
          </div>
          <div className="passcard-footer h-2 bg-gradient-to-r from-blue-950 via-teal-500 to-blue-800"></div>
          <div className="flex gap-2 p-4 print:hidden"><button onClick={()=>window.print()} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white">Print</button><button onClick={()=>setPrinting(null)} className="rounded-xl border px-4 py-2 text-sm font-semibold">Close Preview</button></div>
        </div>
      </div>}
      <style>{`@media print {
        @page { size: A5 portrait; margin: 0; }
        html, body { box-sizing: border-box !important; width: 148mm !important; min-width: 148mm !important; max-width: 148mm !important; height: 210mm !important; min-height: 210mm !important; max-height: 210mm !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #fff !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
        body * { visibility: hidden !important; }
        .print-passcard, .print-passcard * { visibility: visible !important; }
        .print-passcard { position: fixed !important; top: 0 !important; left: 0 !important; right: auto !important; bottom: auto !important; display: block !important; box-sizing: border-box !important; width: 148mm !important; min-width: 148mm !important; max-width: 148mm !important; height: 210mm !important; min-height: 210mm !important; max-height: 210mm !important; overflow: hidden !important; padding: 0 !important; margin: 0 !important; background: #fff !important; break-inside: avoid-page !important; page-break-inside: avoid !important; break-after: avoid-page !important; page-break-after: avoid !important; }
        .passcard-sheet { display: flex !important; box-sizing: border-box !important; flex: none !important; width: 148mm !important; min-width: 148mm !important; max-width: 148mm !important; height: 210mm !important; min-height: 210mm !important; max-height: 210mm !important; overflow: hidden !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; break-inside: avoid-page !important; page-break-inside: avoid !important; break-after: avoid-page !important; page-break-after: avoid !important; }
        .passcard-top { padding: 8mm 9mm !important; }
        .passcard-body { padding: 7mm 9mm !important; }
        .passcard-footer { flex: 0 0 2mm !important; }
        .print\\:hidden { display: none !important; }
        .print-passcard button { display: none !important; }
        * { animation: none !important; transition: none !important; }
      }`}</style>
    </div>
  </div>;
}
export default PassCardManagement;
