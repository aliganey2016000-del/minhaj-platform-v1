import { useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, GripVertical, Loader2, Send, Sparkles, X } from 'lucide-react';
import api from '../../../../lib/axios';

type PlanItem = { class: string; course: string; teacher: string | null; dayOfWeek: number; startTime: string; endTime: string };
type NamedRef = { _id: string; label: string; code?: string; class?: string };
type Conflict = { type: string; message: string; suggestion: string; indexes?: number[] };
type Plan = {
  items: PlanItem[];
  conflicts: Conflict[];
  warnings: string[];
  constraints: Array<{ type: string; teacher?: string; course?: string; day?: string; value?: number; priority?: string }>;
  reply: string;
  aiUsed: boolean;
  days: number[];
  slots: Array<[string, string]>;
  references: { classes: NamedRef[]; courses: NamedRef[]; teachers: NamedRef[] };
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AiTimetableStudio({ school, onClose, onPublished, initialPrompt = '' }: { school: string; onClose: () => void; onPublished: () => void | Promise<void>; initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt || 'Create a balanced, conflict-free weekly timetable for all classes and courses.');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);

  const courses = useMemo(() => new Map((plan?.references.courses || []).map(item => [String(item._id), item])), [plan]);
  const teachers = useMemo(() => new Map((plan?.references.teachers || []).map(item => [String(item._id), item])), [plan]);
  const visibleItems = useMemo(() => plan?.items.map((item, index) => ({ item, index })).filter(row => !selectedClass || row.item.class === selectedClass) || [], [plan, selectedClass]);

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true); setError('');
    setMessages(current => [...current, { role: 'user', text: prompt.trim() }]);
    try {
      const response = await api.post('/class-schedules/school/ai-plan', { school, prompt: prompt.trim(), constraints: plan?.constraints || [] });
      const data: Plan = response.data.data;
      setPlan(data);
      setSelectedClass(current => current && data.references.classes.some(item => item._id === current) ? current : data.references.classes[0]?._id || '');
      setMessages(current => [...current, { role: 'assistant', text: data.reply }]);
    } catch (err: any) { setError(err.response?.data?.message || 'Could not generate the timetable.'); }
    finally { setLoading(false); }
  };

  const validate = async (items = plan?.items || []) => {
    if (!plan) return;
    setValidating(true); setError('');
    try {
      const response = await api.post('/class-schedules/school/ai-validate', { school, items, constraints: plan.constraints });
      setPlan(current => current ? { ...current, items, conflicts: response.data.data.conflicts || [] } : current);
    } catch (err: any) { setError(err.response?.data?.message || 'Conflict check failed.'); }
    finally { setValidating(false); }
  };

  const move = (sourceIndex: number, dayOfWeek: number, slotIndex: number) => {
    if (!plan) return;
    const [startTime, endTime] = plan.slots[slotIndex];
    const next = plan.items.map(item => ({ ...item }));
    const moving = next[sourceIndex];
    const targetIndex = next.findIndex((item, index) => index !== sourceIndex && item.class === moving.class && item.dayOfWeek === dayOfWeek && item.startTime === startTime);
    if (targetIndex >= 0) {
      const target = next[targetIndex];
      target.dayOfWeek = moving.dayOfWeek; target.startTime = moving.startTime; target.endTime = moving.endTime;
    }
    moving.dayOfWeek = dayOfWeek; moving.startTime = startTime; moving.endTime = endTime;
    setPlan({ ...plan, items: next });
    void validate(next);
  };

  const publish = async () => {
    if (!plan || plan.conflicts.length) return;
    const replaceExisting = window.confirm('Publish this draft? Existing active timetable lessons will be replaced.');
    if (!replaceExisting) return;
    setPublishing(true); setError('');
    try {
      await api.post('/class-schedules/school/ai-publish', { school, items: plan.items, constraints: plan.constraints, replaceExisting: true });
      await onPublished(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Could not publish the timetable.'); }
    finally { setPublishing(false); }
  };

  const cell = (day: number, start: string) => visibleItems.find(row => row.item.dayOfWeek === day && row.item.startTime === start);

  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4">
    <div className="flex h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
      <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3 sm:px-6">
        <div><h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-violet-600"/>AI Timetable Studio</h2><p className="text-xs text-[var(--color-text-tertiary)]">DeepSeek-assisted rules · deterministic conflict checking · draft before publish</p></div>
        <button onClick={onClose} disabled={publishing} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]"><X className="h-5 w-5"/></button>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-h-0 overflow-auto p-3 sm:p-5">
          {!plan ? <div className="flex h-full min-h-96 items-center justify-center rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/40 p-8 text-center dark:border-violet-900 dark:bg-violet-950/10"><div><Bot className="mx-auto h-12 w-12 text-violet-500"/><h3 className="mt-3 text-lg font-bold">Generate your first conflict-free draft</h3><p className="mx-auto mt-2 max-w-xl text-sm text-[var(--color-text-secondary)]">Classes and their courses are loaded automatically. Teachers may remain Unassigned and can be added later.</p><button onClick={generate} disabled={loading} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin"/>}Generate Timetable</button></div></div> : <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={selectedClass} onChange={event => setSelectedClass(event.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm font-semibold"><option value="">All classes (drag disabled by overlap)</option>{plan.references.classes.map(item => <option key={item._id} value={item._id}>{item.label}</option>)}</select>
              <button onClick={() => validate()} disabled={validating} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-sm font-semibold">{validating ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}Check Conflicts</button>
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${plan.conflicts.length ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{plan.conflicts.length ? `${plan.conflicts.length} conflict(s)` : 'No conflicts'}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{plan.items.length} lessons</span>
            </div>
            <div className="overflow-auto rounded-2xl border border-[var(--color-border-default)]">
              <table className="min-w-[900px] w-full table-fixed text-xs"><thead><tr className="bg-[var(--color-surface-secondary)]"><th className="w-24 border-b border-r p-2">Time</th>{plan.days.map(day => <th key={day} className="border-b border-r p-2 last:border-r-0">{DAYS[day]}</th>)}</tr></thead><tbody>{plan.slots.map(([start, end], slotIndex) => <tr key={start}><th className="border-b border-r p-2 align-top font-semibold">{start}<br/><span className="font-normal text-[var(--color-text-tertiary)]">{end}</span></th>{plan.days.map(day => { const row = cell(day, start); const course = row ? courses.get(row.item.course) : null; return <td key={day} onDragOver={event => event.preventDefault()} onDrop={event => { const index = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(index)) move(index, day, slotIndex); }} className="h-20 border-b border-r p-1.5 align-top last:border-r-0 hover:bg-violet-50 dark:hover:bg-violet-950/20">{row && <div draggable onDragStart={event => event.dataTransfer.setData('text/plain', String(row.index))} className="h-full cursor-grab rounded-lg border border-violet-200 bg-violet-50 p-2 shadow-sm active:cursor-grabbing dark:border-violet-900 dark:bg-violet-950/30"><div className="flex gap-1"><GripVertical className="h-3.5 w-3.5 shrink-0 text-violet-400"/><p className="font-bold text-violet-800 dark:text-violet-200">{course?.label || 'Course'}</p></div><p className="mt-1 truncate text-[10px] text-slate-500">{row.item.teacher ? teachers.get(row.item.teacher)?.label || 'Teacher' : 'Unassigned'}</p></div>}</td>; })}</tr>)}</tbody></table>
            </div>
          </>}
        </main>

        <aside className="flex min-h-0 flex-col border-t border-[var(--color-border-subtle)] lg:border-l lg:border-t-0">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <h3 className="flex items-center gap-2 font-bold"><Bot className="h-4 w-4 text-violet-600"/>AI Planner Chat</h3>
            {messages.length === 0 && <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3 text-xs text-[var(--color-text-secondary)]">Try: “Give teacher Ahmed Monday off”, “A teacher must not exceed 5 lessons per day”, or “Prefer morning lessons”.</div>}
            {messages.map((message, index) => <div key={index} className={`rounded-xl px-3 py-2 text-sm ${message.role === 'user' ? 'ml-5 bg-primary-600 text-white' : 'mr-5 bg-violet-50 text-violet-900 dark:bg-violet-950/30 dark:text-violet-200'}`}>{message.text}</div>)}
            {plan?.constraints?.length ? <div><p className="mb-2 text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Understood rules</p>{plan.constraints.map((rule, index) => <div key={index} className="mb-1 rounded-lg border border-[var(--color-border-subtle)] px-2 py-1.5 text-xs">{rule.type.replace(/_/g, ' ')} {rule.teacher || rule.course || ''} {rule.day || rule.value || ''}</div>)}</div> : null}
            {(plan?.conflicts?.length || 0) > 0 && <div><p className="mb-2 text-xs font-bold uppercase text-red-600">Conflicts & solutions</p>{plan!.conflicts.slice(0, 20).map((conflict, index) => <div key={index} className="mb-2 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700"><p className="flex gap-1 font-bold"><AlertTriangle className="h-3.5 w-3.5 shrink-0"/>{conflict.message}</p><p className="mt-1">Suggestion: {conflict.suggestion}</p></div>)}</div>}
            {(plan?.warnings?.length || 0) > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><p className="font-bold">Warnings</p>{plan!.warnings.slice(0, 12).map((warning, index) => <p key={index} className="mt-1">• {warning}</p>)}</div>}
          </div>
          <div className="border-t border-[var(--color-border-subtle)] p-3"><textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-[var(--color-border-default)] bg-transparent p-3 text-sm" placeholder="Tell AI how to arrange the timetable..."/><button onClick={generate} disabled={loading || !prompt.trim()} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}{plan ? 'Apply Prompt & Regenerate' : 'Generate with AI'}</button></div>
        </aside>
      </div>
      {error && <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">{error}</div>}
      <footer className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-4 py-3"><p className="text-xs text-[var(--color-text-tertiary)]">Drag lessons between cells, check conflicts, then publish.</p><div className="flex gap-2"><button onClick={onClose} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-semibold">Cancel</button><button onClick={publish} disabled={!plan || !!plan.conflicts.length || publishing} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{publishing && <Loader2 className="h-4 w-4 animate-spin"/>}Publish Timetable</button></div></footer>
    </div>
  </div>;
}
