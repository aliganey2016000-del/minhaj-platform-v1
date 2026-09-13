import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock3, Redo2, RotateCcw, Save, Settings2, ShieldAlert, Sparkles, Undo2, X } from 'lucide-react';
import api from '../../../../lib/axios';

type ClassRef = { _id: string; title?: string; name?: string; section?: string; room?: string };
type Teacher = { _id: string; teacherId?: string; profile?: { firstName?: string; lastName?: string }; user?: { email?: string } };
type Course = { _id: string; courseCode?: string; title: { en: string }; teacher?: Teacher | string | null; class?: ClassRef | string | null };
type Period = { key: string; label: string; startTime: string; endTime: string; isBreak: boolean };
type Config = { school?: string; workingDays: number[]; periods: Period[]; strictPeriods: boolean; timezone: string };
type DraftEntry = { _id?: string; sourceSchedule?: string | null; class: string; course: string; teacher?: string | null; dayOfWeek: number; startTime: string; endTime: string; room?: string; isActive: boolean };
type Draft = { _id: string; name: string; entries: DraftEntry[]; status: string };
type Conflict = { id: string; type: string; severity: 'error' | 'warning'; message: string; entryIds: string[]; suggestions: string[] };
type Availability = { _id?: string; teacher: Teacher | string; dayOffs: number[]; unavailableWindows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>; maxLessonsPerDay: number; maxConsecutiveLessons: number };
type Version = { version: number; label: string; publishedAt: string };
type Constraint = { _id: string; type: string; priority: 'required' | 'preferred'; description?: string; teacher?: string; class?: string; course?: string; dayOfWeek?: number; payload?: Record<string, unknown> };
type ProposedRule = { type: string; priority: 'required' | 'preferred'; dayOfWeek?: number; teacherId?: string; classId?: string; courseId?: string; count?: number; description: string };
type View = 'grid' | 'conflicts' | 'settings' | 'ai';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const classLabel = (cls?: ClassRef | null) => cls ? `${cls.title || cls.name || 'Class'}${cls.section ? ` — ${cls.section}` : ''}` : 'Class';
const teacherName = (teacher?: Teacher | null) => {
  if (!teacher) return 'Unassigned';
  const name = `${teacher.profile?.firstName || ''} ${teacher.profile?.lastName || ''}`.trim();
  return name || teacher.teacherId || teacher.user?.email || 'Teacher';
};
const idOf = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' && '_id' in (value as Record<string, unknown>) ? String((value as { _id: unknown })._id) : '';
const entryKey = (entry: DraftEntry, index: number) => entry._id || entry.sourceSchedule || `entry-${index}`;
const prettyRule = (value: string) => value.replace(/_/g, ' ');
const cloneEntries = (entries: DraftEntry[]) => entries.map(entry => ({ ...entry }));

function ActionButton({ children, onClick, disabled, variant = 'default', title }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  title?: string;
}) {
  const style = variant === 'primary'
    ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
    : variant === 'danger'
      ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/20'
      : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-tertiary)]';
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${style}`}>{children}</button>;
}

export default function AITimetableStudio({ organizationId, classes, teachers, initialView = 'grid', onClose, onPublished }: {
  organizationId: string;
  classes: ClassRef[];
  teachers: Teacher[];
  initialView?: View;
  onClose: () => void;
  onPublished: () => Promise<void> | void;
}) {
  const [view, setView] = useState<View>(initialView);
  const [config, setConfig] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [publishedEntries, setPublishedEntries] = useState<DraftEntry[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?._id || '');
  const [selectedTeacherId, setSelectedTeacherId] = useState(teachers[0]?._id || '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undoStack, setUndoStack] = useState<DraftEntry[][]>([]);
  const [redoStack, setRedoStack] = useState<DraftEntry[][]>([]);
  const [ignoredWarnings, setIgnoredWarnings] = useState<Set<string>>(new Set());
  const [ruleForm, setRuleForm] = useState({ type: 'no_day', priority: 'required', dayOfWeek: 5, teacher: '', class: '', course: '', count: 5, description: '' });
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [aiBusyConflictId, setAiBusyConflictId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiRuleBusy, setAiRuleBusy] = useState(false);
  const [aiRuleError, setAiRuleError] = useState('');
  const [proposedRules, setProposedRules] = useState<ProposedRule[]>([]);
  const [addedRuleKeys, setAddedRuleKeys] = useState<Set<number>>(new Set());

  const loadCourses = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { data } = await api.get('/courses/admin', { params: { school: organizationId, limit: 500 } });
      setCourses(data.data || []);
    } catch {
      setCourses([]);
    }
  }, [organizationId]);

  const refreshBootstrap = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/class-schedules/school/studio/bootstrap', { params: { school: organizationId } });
      const payload = data.data || data;
      setConfig(payload.config);
      setAvailability(payload.availability || []);
      setConstraints(payload.constraints || []);
      setVersions(payload.versions || []);
      setPublishedEntries(payload.schedules || []);
      if (payload.draft) {
        setDraft(payload.draft);
        setEntries(cloneEntries(payload.draft.entries || []));
      } else {
        setDraft(null);
        setEntries(cloneEntries(payload.schedules || []));
      }
      setConflicts(payload.conflicts || []);
      setUndoStack([]);
      setRedoStack([]);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to open AI Timetable Studio');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void refreshBootstrap(); void loadCourses(); }, [refreshBootstrap, loadCourses]);
  useEffect(() => {
    if (!selectedClassId && classes[0]?._id) setSelectedClassId(classes[0]._id);
    if (!selectedTeacherId && teachers[0]?._id) setSelectedTeacherId(teachers[0]._id);
  }, [classes, teachers, selectedClassId, selectedTeacherId]);

  const teacherMap = useMemo(() => new Map(teachers.map(teacher => [teacher._id, teacher])), [teachers]);
  const classMap = useMemo(() => new Map(classes.map(cls => [cls._id, cls])), [classes]);
  const courseMap = useMemo(() => new Map(courses.map(course => [course._id, course])), [courses]);
  const workingPeriods = useMemo(() => (config?.periods || []).filter(period => !period.isBreak), [config]);
  const workingDays = config?.workingDays || [];
  const classEntries = useMemo(() => entries.filter(entry => entry.class === selectedClassId && entry.isActive), [entries, selectedClassId]);
  const visibleConflicts = useMemo(() => conflicts.filter(conflict => conflict.severity === 'error' || !ignoredWarnings.has(conflict.id)), [conflicts, ignoredWarnings]);
  const hardErrors = conflicts.filter(conflict => conflict.severity === 'error').length;
  const warningCount = conflicts.filter(conflict => conflict.severity === 'warning').length;

  const remember = (next: DraftEntry[]) => {
    setUndoStack(stack => [...stack.slice(-29), cloneEntries(entries)]);
    setRedoStack([]);
    setEntries(next);
  };
  const undo = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setRedoStack(stack => [...stack, cloneEntries(entries)]);
    setEntries(cloneEntries(previous));
    setUndoStack(stack => stack.slice(0, -1));
  };
  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setUndoStack(stack => [...stack, cloneEntries(entries)]);
    setEntries(cloneEntries(next));
    setRedoStack(stack => stack.slice(0, -1));
  };

  const checkCandidate = async (candidate: DraftEntry[]) => {
    const { data } = await api.post('/class-schedules/school/studio/conflicts', { school: organizationId, entries: candidate });
    const payload = data.data || data;
    setConflicts(payload.conflicts || []);
    return (payload.conflicts || []) as Conflict[];
  };

  const dropEntry = async (draggedKey: string, dayOfWeek: number, period: Period) => {
    const index = entries.findIndex((entry, idx) => entryKey(entry, idx) === draggedKey);
    if (index < 0) return;
    const next = cloneEntries(entries);
    next[index] = { ...next[index], dayOfWeek, startTime: period.startTime, endTime: period.endTime };
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await checkCandidate(next);
      const movedId = entryKey(next[index], index);
      const blocking = result.find(conflict => conflict.severity === 'error' && conflict.entryIds.includes(movedId));
      if (blocking) { setError(blocking.message); return; }
      remember(next);
      setNotice(`Lesson moved to ${DAYS[dayOfWeek]} ${period.label}.`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to validate this move');
    } finally { setBusy(false); }
  };

  const createDraft = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await api.post('/class-schedules/school/studio/drafts', { school: organizationId, name: 'Working Draft', entries });
      const created = data.data || data;
      setDraft(created); setEntries(cloneEntries(created.entries || []));
      setNotice('Draft created. Changes stay separate from the published timetable until Publish Timetable.');
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to create draft'); }
    finally { setBusy(false); }
  };

  const saveDraft = async () => {
    if (!draft) { await createDraft(); return; }
    setBusy(true); setError('');
    try {
      const { data } = await api.put(`/class-schedules/school/studio/drafts/${draft._id}`, { school: organizationId, name: draft.name || 'Working Draft', entries });
      const saved = data.data || data;
      setDraft(saved); setEntries(cloneEntries(saved.entries || [])); setNotice('Draft saved.');
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to save draft'); }
    finally { setBusy(false); }
  };

  const resetDraft = async () => {
    if (!window.confirm('Reset the working draft to the currently published timetable?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (draft) {
        const { data } = await api.post(`/class-schedules/school/studio/drafts/${draft._id}/reset`, { school: organizationId });
        const reset = data.data || data;
        setDraft(reset); setEntries(cloneEntries(reset.entries || []));
      } else {
        setEntries(cloneEntries(publishedEntries));
      }
      setUndoStack([]); setRedoStack([]); setNotice('Draft reset to the published timetable.');
      await checkCandidate(publishedEntries);
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to reset draft'); }
    finally { setBusy(false); }
  };

  const publishDraft = async () => {
    if (!draft) { setError('Create and save a draft before publishing.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api.put(`/class-schedules/school/studio/drafts/${draft._id}`, { school: organizationId, name: draft.name || 'Working Draft', entries });
      const latestConflicts = await checkCandidate(entries);
      const blocking = latestConflicts.filter(conflict => conflict.severity === 'error');
      if (blocking.length) { setError(`Publish blocked: resolve ${blocking.length} hard conflict(s) first.`); setView('conflicts'); return; }
      const { data } = await api.post(`/class-schedules/school/studio/drafts/${draft._id}/publish`, { school: organizationId });
      const payload = data.data || data;
      setNotice(`Published timetable version ${payload.version?.version || ''}.`);
      await onPublished();
      await refreshBootstrap();
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to publish timetable'); }
    finally { setBusy(false); }
  };

  const saveConfig = async () => {
    if (!config) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await api.patch('/class-schedules/school/studio/config', { school: organizationId, ...config });
      setConfig(data.data || data); setNotice('Timetable settings saved.'); await checkCandidate(entries);
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to save timetable settings'); }
    finally { setBusy(false); }
  };

  const selectedAvailability = useMemo(() => availability.find(item => idOf(item.teacher) === selectedTeacherId) || ({ teacher: selectedTeacherId, dayOffs: [], unavailableWindows: [], maxLessonsPerDay: 5, maxConsecutiveLessons: 3 } as Availability), [availability, selectedTeacherId]);
  const updateSelectedAvailability = (patch: Partial<Availability>) => {
    setAvailability(list => {
      const index = list.findIndex(item => idOf(item.teacher) === selectedTeacherId);
      const next = { ...selectedAvailability, ...patch, teacher: selectedTeacherId } as Availability;
      if (index < 0) return [...list, next];
      return list.map((item, i) => i === index ? next : item);
    });
  };
  const saveTeacherAvailability = async () => {
    if (!selectedTeacherId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await api.put(`/class-schedules/school/studio/teachers/${selectedTeacherId}/availability`, { school: organizationId, dayOffs: selectedAvailability.dayOffs, unavailableWindows: selectedAvailability.unavailableWindows, maxLessonsPerDay: selectedAvailability.maxLessonsPerDay, maxConsecutiveLessons: selectedAvailability.maxConsecutiveLessons });
      const saved = data.data || data;
      setAvailability(list => [...list.filter(item => idOf(item.teacher) !== selectedTeacherId), saved]);
      setNotice('Teacher availability saved.'); await checkCandidate(entries);
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to save teacher availability'); }
    finally { setBusy(false); }
  };

  const addConstraint = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const payload: Record<string, unknown> = { school: organizationId, type: ruleForm.type, priority: ruleForm.priority, description: ruleForm.description };
      if (ruleForm.type === 'no_day') payload.dayOfWeek = ruleForm.dayOfWeek;
      if (ruleForm.type === 'teacher_day_off') { payload.teacher = ruleForm.teacher; payload.dayOfWeek = ruleForm.dayOfWeek; }
      if (ruleForm.type === 'no_consecutive_lessons') { payload.class = ruleForm.class; payload.course = ruleForm.course; }
      if (ruleForm.type === 'lessons_per_week') { payload.class = ruleForm.class; payload.course = ruleForm.course; payload.payload = { count: Number(ruleForm.count) }; }
      const { data } = await api.post('/class-schedules/school/studio/constraints', payload);
      setConstraints(list => [data.data || data, ...list]); setNotice('Rule added.'); await checkCandidate(entries);
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to add timetable rule'); }
    finally { setBusy(false); }
  };
  const applySuggestedFix = async (conflict: Conflict) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await api.post('/class-schedules/school/studio/conflicts/auto-fix', { school: organizationId, entries, conflictId: conflict.id });
      const payload = data.data || data;
      setConflicts(payload.conflicts || []);
      if (payload.fixed) { remember(payload.entries); setNotice(data.message || 'Automatic fix applied.'); }
      else { setNotice(payload.message || 'No automatic fix was found for this conflict.'); }
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to apply an automatic fix'); }
    finally { setBusy(false); }
  };

  const askAiAboutConflict = async (conflict: Conflict) => {
    setAiBusyConflictId(conflict.id); setError('');
    try {
      const { data } = await api.post('/class-schedules/school/studio/ai/explain-conflict', { school: organizationId, type: conflict.type, severity: conflict.severity, message: conflict.message, suggestions: conflict.suggestions });
      const payload = data.data || data;
      setAiExplanations(current => ({ ...current, [conflict.id]: payload.explanation }));
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to reach the AI Assistant'); }
    finally { setAiBusyConflictId(null); }
  };

  const generateAiRules = async () => {
    if (!aiPrompt.trim()) return;
    setAiRuleBusy(true); setAiRuleError(''); setProposedRules([]); setAddedRuleKeys(new Set());
    try {
      const { data } = await api.post('/class-schedules/school/studio/ai/parse-rules', { school: organizationId, prompt: aiPrompt });
      const payload = data.data || data;
      setProposedRules(payload.rules || []);
      if (!payload.rules?.length) setAiRuleError('No supported rule could be understood from that request. Try describing one instruction at a time, e.g. "Ahmed should be off on Friday".');
    } catch (err: any) { setAiRuleError(err.response?.data?.message || 'Unable to reach the AI Assistant'); }
    finally { setAiRuleBusy(false); }
  };

  const addProposedRule = async (rule: ProposedRule, index: number) => {
    setAiRuleBusy(true); setAiRuleError('');
    try {
      const payload: Record<string, unknown> = { school: organizationId, type: rule.type, priority: rule.priority, description: rule.description, source: 'ai' };
      if (rule.type === 'no_day') payload.dayOfWeek = rule.dayOfWeek;
      if (rule.type === 'teacher_day_off') { payload.teacher = rule.teacherId; payload.dayOfWeek = rule.dayOfWeek; }
      if (rule.type === 'no_consecutive_lessons') { payload.class = rule.classId; payload.course = rule.courseId; }
      if (rule.type === 'lessons_per_week') { payload.class = rule.classId; payload.course = rule.courseId; payload.payload = { count: rule.count }; }
      const { data } = await api.post('/class-schedules/school/studio/constraints', payload);
      setConstraints(list => [data.data || data, ...list]);
      setAddedRuleKeys(current => new Set([...current, index]));
      await checkCandidate(entries);
    } catch (err: any) { setAiRuleError(err.response?.data?.message || 'Unable to add this rule'); }
    finally { setAiRuleBusy(false); }
  };

  const removeConstraint = async (id: string) => {
    setBusy(true); setError('');
    try {
      await api.delete(`/class-schedules/school/studio/constraints/${id}`, { params: { school: organizationId } });
      setConstraints(list => list.filter(item => item._id !== id)); await checkCandidate(entries);
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to remove rule'); }
    finally { setBusy(false); }
  };
  const rollbackVersion = async (version: number) => {
    if (!window.confirm(`Roll back the published timetable to version ${version}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.post(`/class-schedules/school/studio/versions/${version}/rollback`, { school: organizationId });
      setNotice(`Rolled back to timetable version ${version}.`); await onPublished(); await refreshBootstrap();
    } catch (err: any) { setError(err.response?.data?.message || 'Unable to roll back timetable version'); }
    finally { setBusy(false); }
  };

  const dayToggle = (day: number) => {
    if (!config) return;
    const next = config.workingDays.includes(day) ? config.workingDays.filter(value => value !== day) : [...config.workingDays, day].sort((a, b) => a - b);
    setConfig({ ...config, workingDays: next });
  };

  const tabs: Array<{ id: View; label: string; icon: ReactNode }> = [
    { id: 'grid', label: 'Timetable Grid', icon: <Clock3 className="h-4 w-4" /> },
    { id: 'conflicts', label: `Conflicts${hardErrors + warningCount ? ` (${hardErrors + warningCount})` : ''}`, icon: <ShieldAlert className="h-4 w-4" /> },
    { id: 'settings', label: 'Settings & Rules', icon: <Settings2 className="h-4 w-4" /> },
    { id: 'ai', label: 'AI Assistant', icon: <Bot className="h-4 w-4" /> },
  ];

  return <div className="fixed inset-0 z-[150] flex flex-col bg-[var(--color-surface-primary)] text-[var(--color-text-primary)]">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--color-border-default)] px-4 py-3 sm:px-6">
      <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-[var(--color-surface-tertiary)]" aria-label="Close AI Timetable Studio"><ArrowLeft className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-emerald-600" /><h1 className="truncate text-lg font-bold">AI Timetable Studio</h1></div><p className="text-xs text-[var(--color-text-tertiary)]">Draft first · validate hard constraints · review · publish</p></div>
      <div className="flex flex-wrap items-center gap-2"><ActionButton disabled={!undoStack.length || busy} onClick={undo}><Undo2 className="h-4 w-4" />Undo</ActionButton><ActionButton disabled={!redoStack.length || busy} onClick={redo}><Redo2 className="h-4 w-4" />Redo</ActionButton><ActionButton disabled={busy} onClick={() => void resetDraft()}><RotateCcw className="h-4 w-4" />Reset</ActionButton><ActionButton disabled={busy} onClick={() => void saveDraft()}><Save className="h-4 w-4" />{draft ? 'Save Draft' : 'Create Draft'}</ActionButton><ActionButton variant="primary" disabled={busy || !draft} onClick={() => void publishDraft()}><CheckCircle2 className="h-4 w-4" />Publish</ActionButton><button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-[var(--color-surface-tertiary)]"><X className="h-5 w-5" /></button></div>
    </header>

    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--color-border-default)] px-4 py-2 sm:px-6">{tabs.map(tab => <button type="button" key={tab.id} onClick={() => setView(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${view === tab.id ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}>{tab.icon}{tab.label}</button>)}</div>
    {(error || notice) && <div className="shrink-0 space-y-2 px-4 pt-3 sm:px-6">{error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div>}{notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">{notice}</div>}</div>}

    <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
      {loading ? <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">Loading Timetable Studio...</div> : null}

      {!loading && view === 'grid' && <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 sm:flex-row sm:items-center"><label className="flex-1 text-xs font-semibold">Class<select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">{classes.map(cls => <option key={cls._id} value={cls._id}>{classLabel(cls)}</option>)}</select></label><div className="grid grid-cols-3 gap-2 sm:w-[420px]"><Metric value={classEntries.length} label="Lessons" /><Metric value={hardErrors} label="Hard conflicts" tone="red" /><Metric value={warningCount} label="Warnings" tone="amber" /></div></div>
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border-default)]"><table className="w-full min-w-[900px] border-collapse text-sm"><thead><tr className="bg-[var(--color-surface-secondary)]"><th className="sticky left-0 z-10 w-36 border-b border-r border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-3 text-left text-xs">Period</th>{workingDays.map(day => <th key={day} className="min-w-40 border-b border-r border-[var(--color-border-default)] px-3 py-3 text-left text-xs">{DAYS[day]}</th>)}</tr></thead><tbody>{workingPeriods.map(period => <tr key={period.key}><td className="sticky left-0 z-10 border-b border-r border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-3 align-top"><div className="font-semibold">{period.label}</div><div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{period.startTime}–{period.endTime}</div></td>{workingDays.map(day => {
          const cellEntries = classEntries.filter(entry => entry.dayOfWeek === day && entry.startTime === period.startTime && entry.endTime === period.endTime);
          return <td key={`${period.key}-${day}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const key = event.dataTransfer.getData('text/timetable-entry'); if (key) void dropEntry(key, day, period); }} className="h-24 border-b border-r border-[var(--color-border-default)] p-2 align-top transition hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10">{cellEntries.map(entry => {
            const index = entries.indexOf(entry); const key = entryKey(entry, index); const course = courseMap.get(entry.course); const teacher = entry.teacher ? teacherMap.get(entry.teacher) : null;
            return <div key={key} draggable={!busy} onDragStart={event => event.dataTransfer.setData('text/timetable-entry', key)} className={`mb-1 cursor-grab rounded-xl border p-2 shadow-sm active:cursor-grabbing ${entry.teacher ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20'}`}><div className="font-semibold">{course?.title?.en || 'Course'}</div><div className="mt-1 text-[10px] text-[var(--color-text-secondary)]">{teacherName(teacher)} · {entry.room || classMap.get(entry.class)?.room || 'No room'}</div></div>;
          })}</td>;
        })}</tr>)}</tbody></table></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">Drag a lesson to another period. The backend checks class, teacher, room, working-day, break and availability constraints before accepting the move. Nothing is published until you choose Publish.</div>
      </div>}

      {!loading && view === 'conflicts' && <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Conflicts & Suggestions</h2><p className="text-xs text-[var(--color-text-tertiary)]">Hard constraints block publishing. Warnings may be reviewed or ignored.</p></div><ActionButton disabled={busy} onClick={() => void checkCandidate(entries)}><ShieldAlert className="h-4 w-4" />Check Again</ActionButton></div>
        {!visibleConflicts.length ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-950/20"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><div className="mt-2 font-bold text-emerald-800 dark:text-emerald-200">No timetable conflicts found</div></div> : visibleConflicts.map(conflict => <div key={conflict.id} className={`rounded-2xl border p-4 ${conflict.severity === 'error' ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'}`}>
          <div className="flex items-start gap-3">
            {conflict.severity === 'error' ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wide">{prettyRule(conflict.type)}</div>
              <p className="mt-1 text-sm">{conflict.message}</p>
              {conflict.suggestions.length > 0 && <div className="mt-3 space-y-1">{conflict.suggestions.map(suggestion => <div key={suggestion} className="text-xs">• {suggestion}</div>)}</div>}
              {aiExplanations[conflict.id] && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200"><div className="mb-1 flex items-center gap-1 font-bold"><Bot className="h-3.5 w-3.5" />AI Assistant</div>{aiExplanations[conflict.id]}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton disabled={busy || conflict.severity !== 'error'} title={conflict.severity !== 'error' ? 'Automatic fixes apply to hard conflicts only' : 'Move this lesson to the first free slot that resolves the conflict'} onClick={() => void applySuggestedFix(conflict)}>Apply Suggested Fix</ActionButton>
                <ActionButton onClick={() => setNotice(conflict.suggestions.join(' · ') || 'No alternatives available.')}>Show Alternatives</ActionButton>
                {conflict.severity === 'warning' && <ActionButton onClick={() => setIgnoredWarnings(current => new Set([...current, conflict.id]))}>Ignore Warning</ActionButton>}
                <ActionButton disabled={busy || aiBusyConflictId === conflict.id} onClick={() => void askAiAboutConflict(conflict)}><Bot className="h-4 w-4" />{aiBusyConflictId === conflict.id ? 'Asking AI…' : 'Ask AI'}</ActionButton>
              </div>
            </div>
          </div>
        </div>)}
      </div>}

      {!loading && view === 'settings' && config && <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-[var(--color-border-default)] p-4"><div><h2 className="font-bold">Timetable Settings</h2><p className="text-xs text-[var(--color-text-tertiary)]">Working days, periods, breaks and strict period enforcement.</p></div><div><div className="mb-2 text-xs font-semibold">Working days</div><div className="flex flex-wrap gap-2">{DAYS.map((day, index) => <label key={day} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${config.workingDays.includes(index) ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-[var(--color-border-default)]'}`}><input type="checkbox" checked={config.workingDays.includes(index)} onChange={() => dayToggle(index)} />{day}</label>)}</div></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.strictPeriods} onChange={event => setConfig({ ...config, strictPeriods: event.target.checked })} />Require each lesson to match a configured teaching period exactly</label><label className="block text-xs font-semibold">Timezone<input value={config.timezone} onChange={event => setConfig({ ...config, timezone: event.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" /></label><div className="space-y-2"><div className="text-xs font-semibold">Periods & breaks</div>{config.periods.map((period, index) => <div key={period.key} className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-border-default)] p-2 sm:grid-cols-[1fr_110px_110px_auto_auto]"><input value={period.label} onChange={event => setConfig({ ...config, periods: config.periods.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} className="rounded-lg border border-[var(--color-border-default)] bg-transparent px-2 py-2 text-xs" /><input type="time" value={period.startTime} onChange={event => setConfig({ ...config, periods: config.periods.map((item, i) => i === index ? { ...item, startTime: event.target.value } : item) })} className="rounded-lg border border-[var(--color-border-default)] bg-transparent px-2 py-2 text-xs" /><input type="time" value={period.endTime} onChange={event => setConfig({ ...config, periods: config.periods.map((item, i) => i === index ? { ...item, endTime: event.target.value } : item) })} className="rounded-lg border border-[var(--color-border-default)] bg-transparent px-2 py-2 text-xs" /><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={period.isBreak} onChange={event => setConfig({ ...config, periods: config.periods.map((item, i) => i === index ? { ...item, isBreak: event.target.checked } : item) })} />Break</label><button type="button" onClick={() => setConfig({ ...config, periods: config.periods.filter((_, i) => i !== index) })} className="rounded-lg px-2 text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button></div>)}<ActionButton onClick={() => setConfig({ ...config, periods: [...config.periods, { key: `period-${Date.now()}`, label: `Period ${config.periods.filter(item => !item.isBreak).length + 1}`, startTime: '13:00', endTime: '13:45', isBreak: false }] })}>+ Add Period</ActionButton></div><ActionButton variant="primary" disabled={busy} onClick={() => void saveConfig()}><Save className="h-4 w-4" />Save Settings</ActionButton></section>

        <section className="space-y-4 rounded-2xl border border-[var(--color-border-default)] p-4"><div><h2 className="font-bold">Teacher Availability</h2><p className="text-xs text-[var(--color-text-tertiary)]">Day-offs are hard constraints; lesson limits are warnings.</p></div><select value={selectedTeacherId} onChange={event => setSelectedTeacherId(event.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">Select teacher</option>{teachers.map(teacher => <option key={teacher._id} value={teacher._id}>{teacherName(teacher)}</option>)}</select>{selectedTeacherId && <><div><div className="mb-2 text-xs font-semibold">Day off</div><div className="flex flex-wrap gap-2">{DAYS.map((day, index) => <label key={day} className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs"><input type="checkbox" checked={selectedAvailability.dayOffs.includes(index)} onChange={() => updateSelectedAvailability({ dayOffs: selectedAvailability.dayOffs.includes(index) ? selectedAvailability.dayOffs.filter(value => value !== index) : [...selectedAvailability.dayOffs, index] })} />{day}</label>)}</div></div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Max lessons/day<input type="number" min="1" max="20" value={selectedAvailability.maxLessonsPerDay} onChange={event => updateSelectedAvailability({ maxLessonsPerDay: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold">Max consecutive<input type="number" min="1" max="12" value={selectedAvailability.maxConsecutiveLessons} onChange={event => updateSelectedAvailability({ maxConsecutiveLessons: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" /></label></div><ActionButton variant="primary" disabled={busy} onClick={() => void saveTeacherAvailability()}><Save className="h-4 w-4" />Save Availability</ActionButton></>}</section>

        <section className="space-y-4 rounded-2xl border border-[var(--color-border-default)] p-4 xl:col-span-2"><div><h2 className="font-bold">Timetable Rules</h2><p className="text-xs text-[var(--color-text-tertiary)]">These structured rules are the same format the AI prompt parser will create later.</p></div><div className="grid gap-2 md:grid-cols-4"><select value={ruleForm.type} onChange={event => setRuleForm({ ...ruleForm, type: event.target.value })} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="no_day">No lessons on day</option><option value="teacher_day_off">Teacher day off</option><option value="no_consecutive_lessons">No consecutive course lessons</option><option value="lessons_per_week">Lessons per week</option></select><select value={ruleForm.priority} onChange={event => setRuleForm({ ...ruleForm, priority: event.target.value })} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="required">Required</option><option value="preferred">Preferred</option></select>{(ruleForm.type === 'no_day' || ruleForm.type === 'teacher_day_off') && <select value={ruleForm.dayOfWeek} onChange={event => setRuleForm({ ...ruleForm, dayOfWeek: Number(event.target.value) })} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm">{DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>}{ruleForm.type === 'teacher_day_off' && <select value={ruleForm.teacher} onChange={event => setRuleForm({ ...ruleForm, teacher: event.target.value })} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">Select teacher</option>{teachers.map(teacher => <option key={teacher._id} value={teacher._id}>{teacherName(teacher)}</option>)}</select>}{(ruleForm.type === 'no_consecutive_lessons' || ruleForm.type === 'lessons_per_week') && <><select value={ruleForm.class} onChange={event => setRuleForm({ ...ruleForm, class: event.target.value, course: '' })} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">Select class</option>{classes.map(cls => <option key={cls._id} value={cls._id}>{classLabel(cls)}</option>)}</select><select value={ruleForm.course} onChange={event => setRuleForm({ ...ruleForm, course: event.target.value })} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm"><option value="">Select course</option>{courses.filter(course => !course.class || idOf(course.class) === ruleForm.class).map(course => <option key={course._id} value={course._id}>{course.title.en}</option>)}</select></>}{ruleForm.type === 'lessons_per_week' && <input type="number" min="1" max="20" value={ruleForm.count} onChange={event => setRuleForm({ ...ruleForm, count: Number(event.target.value) })} className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" />}</div><ActionButton variant="primary" disabled={busy} onClick={() => void addConstraint()}>+ Add Rule</ActionButton><div className="grid gap-2 md:grid-cols-2">{constraints.map(rule => <div key={rule._id} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border-default)] p-3"><div><div className="text-xs font-bold uppercase tracking-wide">{prettyRule(rule.type)} · {rule.priority}</div><div className="mt-1 text-xs text-[var(--color-text-tertiary)]">{rule.description || 'Structured timetable rule'}</div></div><button type="button" onClick={() => void removeConstraint(rule._id)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button></div>)}</div></section>

        {!!versions.length && <section className="space-y-3 rounded-2xl border border-[var(--color-border-default)] p-4 xl:col-span-2"><h2 className="font-bold">Published Versions & Rollback</h2><div className="flex flex-wrap gap-2">{versions.map(version => <button type="button" key={version.version} disabled={busy} onClick={() => void rollbackVersion(version.version)} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-left text-xs hover:bg-[var(--color-surface-tertiary)]"><div className="font-semibold">v{version.version} · {version.label}</div><div className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">{new Date(version.publishedAt).toLocaleString()}</div></button>)}</div></section>}
      </div>}

      {!loading && view === 'ai' && <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200"><Bot className="h-5 w-5" />Describe a scheduling rule in plain language</div>
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">The AI Assistant only ever proposes structured rules — it never edits the timetable directly. Review each proposal and add the ones you want; they are checked by the same conflict engine as manually-added rules.</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border-default)] p-5">
          <h3 className="font-bold">Ask the AI Assistant</h3>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Example: "Ahmed should be off on Friday" or "Grade 8 Mathematics must not run in consecutive periods".</p>
          <textarea value={aiPrompt} onChange={event => setAiPrompt(event.target.value)} rows={4} placeholder="Describe the rule you want..." className="mt-3 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3 text-sm" />
          {aiRuleError && <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{aiRuleError}</div>}
          <div className="mt-3"><ActionButton variant="primary" disabled={aiRuleBusy || !aiPrompt.trim()} onClick={() => void generateAiRules()}><Sparkles className="h-4 w-4" />{aiRuleBusy ? 'Thinking…' : 'Generate Rules'}</ActionButton></div>
        </div>
        {proposedRules.length > 0 && <div className="space-y-3">
          <h3 className="font-bold">Proposed rules</h3>
          {proposedRules.map((rule, index) => {
            const teacher = rule.teacherId ? teacherMap.get(rule.teacherId) : null;
            const cls = rule.classId ? classMap.get(rule.classId) : null;
            const course = rule.courseId ? courseMap.get(rule.courseId) : null;
            const added = addedRuleKeys.has(index);
            return <div key={`${rule.type}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border-default)] p-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide">{prettyRule(rule.type)} · {rule.priority}</div>
                <p className="mt-1 text-sm">{rule.description}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[var(--color-text-tertiary)]">
                  {typeof rule.dayOfWeek === 'number' && <span>{DAYS[rule.dayOfWeek]}</span>}
                  {teacher && <span>{teacherName(teacher)}</span>}
                  {cls && <span>{classLabel(cls)}</span>}
                  {course && <span>{course.title?.en}</span>}
                  {typeof rule.count === 'number' && <span>{rule.count}/week</span>}
                </div>
              </div>
              <ActionButton variant={added ? 'default' : 'primary'} disabled={aiRuleBusy || added} onClick={() => void addProposedRule(rule, index)}>{added ? <><CheckCircle2 className="h-4 w-4" />Added</> : '+ Add Rule'}</ActionButton>
            </div>;
          })}
        </div>}
      </div>}
    </main>
  </div>;
}

function Metric({ value, label, tone }: { value: number; label: string; tone?: 'red' | 'amber' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : '';
  return <div className="rounded-xl bg-[var(--color-surface-primary)] p-3 text-center"><div className={`text-lg font-bold ${color}`}>{value}</div><div className="text-[10px] text-[var(--color-text-tertiary)]">{label}</div></div>;
}
