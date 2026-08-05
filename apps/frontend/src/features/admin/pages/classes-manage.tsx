/**
 * Class Management — Admin Full CRUD
 * Fields: School, Class Name, Section, Room, Shift / Learning Mode.
 */

import { useEffect, useState, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { School, Pencil, Trash2, MoreVertical, Search, ChevronDown, CheckCircle2, PauseCircle, Archive } from 'lucide-react';
import api from '../../../lib/axios';
import { ColumnFilterHeader, useColumnFilters } from '../components/column-filter-header';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolBrief { _id: string; name: string; orgId?: string; }

interface DepartmentItem {
  _id: string;
  name: string;
  code?: string;
}

interface ClassItem {
  _id: string;
  title: string;
  section: string;
  room: string;
  department?: string;
  departmentId?: string;
  shiftMode: 'Morning' | 'Afternoon' | 'Evening' | 'Virtual';
  school?: { _id: string; name: string };
  course?: { _id: string; title: { en: string }; slug: string; category: string };
  teacher?: { _id: string; teacherId: string };
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  meetingLink?: string;
  status: 'active' | 'inactive' | 'completed';
  batch?: string;
  gradeLevel?: number;
  academicYear?: string;
  isGraduatingGrade?: boolean;
  promotedAt?: string;
  createdAt: string;
}

interface ClassForm {
  school: string;
  department: string;
  title: string;
  section: string;
  room: string;
  shiftMode: string;
  batch: string;
  gradeLevel: string;
  academicYear: string;
  isGraduatingGrade: boolean;
}

// The academic year currently in progress — Aug (month index 7) onward
// counts as already inside the new one. Used only as an editable default.
function defaultAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const startY = now.getMonth() >= 7 ? y : y - 1;
  return `${startY}-${startY + 1}`;
}

const emptyForm: ClassForm = { school: '', department: '', title: '', section: '', room: '', shiftMode: 'Morning', batch: '', gradeLevel: '', academicYear: defaultAcademicYear(), isGraduatingGrade: false };

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function ShiftBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    Morning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Afternoon: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    Evening: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    Virtual: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[mode] || 'bg-gray-100 text-gray-600'}`}>{mode}</span>;
}

const STATUS_PILL_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400',
  completed: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300',
};

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${type === 'success' ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'}`}><span>{type === 'success' ? '✅' : '❌'}</span><span>{message}</span><button onClick={onClose} className="ml-2 text-lg leading-none opacity-60 hover:opacity-100">&times;</button></div>;
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function ClassModal({ cls, schools, departments, onClose, onSaved }: { cls?: ClassItem; schools: SchoolBrief[]; departments: DepartmentItem[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!cls;
  const [form, setForm] = useState<ClassForm>(cls ? {
    school: cls.school?._id || '', department: cls.departmentId || cls.department || '', title: cls.title || '',
    section: cls.section || '', room: cls.room || '', shiftMode: cls.shiftMode || 'Morning', batch: cls.batch || '',
    gradeLevel: cls.gradeLevel !== undefined && cls.gradeLevel !== null ? String(cls.gradeLevel) : '',
    academicYear: cls.academicYear || defaultAcademicYear(), isGraduatingGrade: !!cls.isGraduatingGrade,
  } : emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ClassForm, string>>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const validate = (): boolean => {
    const errs: Partial<Record<keyof ClassForm, string>> = {};
    if (!form.school) errs.school = 'Organization is required';
    if (!form.department) errs.department = 'Department is required';
    if (!form.title.trim()) errs.title = 'Class name is required';
    if (!form.section.trim()) errs.section = 'Section is required';
    if (!form.room.trim()) errs.room = 'Room is required';
    if (!form.batch.trim()) errs.batch = 'Batch number is required';
    if (!form.gradeLevel.trim()) errs.gradeLevel = 'Grade level is required';
    if (!form.academicYear.trim()) errs.academicYear = 'Academic year is required';
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name as keyof ClassForm]) setErrors(p => { const n = { ...p }; delete n[name as keyof ClassForm]; return n; });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); if (!validate()) return;
    setLoading(true); setApiError('');
    try {
      const payload: Record<string, unknown> = {
        school: form.school, department: form.department, title: form.title.trim(), section: form.section.trim(),
        room: form.room.trim(), shiftMode: form.shiftMode, batch: form.batch.trim(),
        gradeLevel: Number(form.gradeLevel), academicYear: form.academicYear.trim(), isGraduatingGrade: form.isGraduatingGrade,
      };
      if (isEdit) await api.patch(`/classes/${cls._id}`, payload); else await api.post('/classes', payload);
      onSaved(); onClose();
    } catch (err: any) { setApiError(err.response?.data?.message || err.message || 'Failed to save class'); } finally { setLoading(false); }
  };

  const ic = (f: keyof ClassForm) => `w-full rounded-xl border px-4 py-2.5 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${errors[f] ? 'border-red-400 focus:ring-red-400' : 'border-[var(--color-border-default)]'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h2 className="text-xl font-bold text-[var(--color-text-primary)]">{isEdit ? '✏️ Edit Class' : '➕ Add Class'}</h2><button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
        {apiError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{apiError}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label htmlFor="school" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Organization <span className="text-red-500">*</span></label><select id="school" name="school" value={form.school} onChange={handleChange} className={ic('school')}><option value="">Select an organization...</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>{errors.school && <p className="mt-1 text-xs text-red-500">{errors.school}</p>}</div>
          <div>
            <label htmlFor="batch" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Batch Number <span className="text-red-500">*</span></label>
            <input id="batch" name="batch" type="text" value={form.batch} onChange={handleChange} placeholder="e.g. 10026" className={ic('batch')} />
            {errors.batch && <p className="mt-1 text-xs text-red-500">{errors.batch}</p>}
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Suggested format: Organization ID + 2-digit graduation year (e.g. 10026).</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="gradeLevel" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Grade Level <span className="text-red-500">*</span></label>
              <input id="gradeLevel" name="gradeLevel" type="number" min={0} max={30} value={form.gradeLevel} onChange={handleChange} placeholder="e.g. 1" className={ic('gradeLevel')} />
              {errors.gradeLevel && <p className="mt-1 text-xs text-red-500">{errors.gradeLevel}</p>}
            </div>
            <div>
              <label htmlFor="academicYear" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Academic Year <span className="text-red-500">*</span></label>
              <input id="academicYear" name="academicYear" type="text" value={form.academicYear} onChange={handleChange} placeholder="e.g. 2026-2027" className={ic('academicYear')} />
              {errors.academicYear && <p className="mt-1 text-xs text-red-500">{errors.academicYear}</p>}
            </div>
          </div>
          <p className="-mt-2 text-xs text-[var(--color-text-tertiary)]">Grade Level (1, 2, 3...) and Academic Year let "Promote All Classes" automatically find or create next year's class.</p>
          <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 cursor-pointer">
            <input type="checkbox" name="isGraduatingGrade" checked={form.isGraduatingGrade} onChange={handleChange} className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30" />
            <span className="text-sm text-[var(--color-text-secondary)]">This is the final grade — promoting graduates students instead of moving them to a next class</span>
          </label>
          <div><label htmlFor="department" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Department <span className="text-red-500">*</span></label><select id="department" name="department" value={form.department} onChange={handleChange} className={ic('department')}><option value="">Select a department...</option>{departments.map((dept) => (<option key={dept._id} value={dept._id}>{dept.name}{dept.code ? ` (${dept.code})` : ''}</option>))}</select>{errors.department && <p className="mt-1 text-xs text-red-500">{errors.department}</p>}</div>
          <div><label htmlFor="title" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Class Name <span className="text-red-500">*</span></label><input id="title" name="title" type="text" value={form.title} onChange={handleChange} placeholder="e.g. Grade 3" className={ic('title')} />{errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}</div>
          <div><label htmlFor="section" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Section <span className="text-red-500">*</span></label><input id="section" name="section" type="text" value={form.section} onChange={handleChange} placeholder="e.g. A" className={ic('section')} />{errors.section && <p className="mt-1 text-xs text-red-500">{errors.section}</p>}</div>
          <div><label htmlFor="room" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Room <span className="text-red-500">*</span></label><input id="room" name="room" type="text" value={form.room} onChange={handleChange} placeholder="e.g. Room 5" className={ic('room')} />{errors.room && <p className="mt-1 text-xs text-red-500">{errors.room}</p>}</div>
          <div><label htmlFor="shiftMode" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Shift / Learning Mode <span className="text-red-500">*</span></label><select id="shiftMode" name="shiftMode" value={form.shiftMode} onChange={handleChange} className={ic('shiftMode')}><option value="Morning">Morning</option><option value="Afternoon">Afternoon</option><option value="Evening">Evening</option><option value="Virtual">Virtual</option></select></div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}{isEdit ? 'Update' : 'Create'}</button></div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promote All Classes — year-end wizard: preview which classes will move to
// the next grade (or graduate), confirm once, and the backend does the rest
// in a single request.
// ---------------------------------------------------------------------------

interface PromotionGroup {
  classId: string;
  title: string;
  section: string;
  batch?: string;
  gradeLevel?: number;
  studentCount?: number;
  action: 'promote-new' | 'promote-existing' | 'graduate' | 'already-promoted';
  targetTitle?: string;
}

interface PromotionResult {
  classId: string;
  title: string;
  action: 'promoted' | 'graduated' | 'skipped';
  targetTitle?: string;
  studentsMoved?: number;
  reason?: string;
}

function PromoteAllModal({ schools, onClose, onDone }: { schools: SchoolBrief[]; onClose: () => void; onDone: () => void }) {
  const [schoolId, setSchoolId] = useState(schools.length === 1 ? schools[0]._id : '');
  const [targetAcademicYear, setTargetAcademicYear] = useState('');
  const [groups, setGroups] = useState<PromotionGroup[]>([]);
  const [missingGradeLevel, setMissingGradeLevel] = useState<{ classId: string; title: string; section: string }[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [result, setResult] = useState<{ results: PromotionResult[]; promoted: number; graduated: number; skipped: number; studentsMoved: number } | null>(null);
  // Testing-only override — normally an already-promoted class is skipped so
  // a cohort never gets moved twice. Checking this lets QA re-run "Promote
  // All" repeatedly against the same test classes; leave it OFF in
  // production so the double-promotion guard stays enforced.
  const [allowRepromote, setAllowRepromote] = useState(false);

  useEffect(() => {
    if (!schoolId) { setGroups([]); setMissingGradeLevel([]); return; }
    let cancelled = false;
    setLoadingPreview(true); setPreviewError('');
    api.get('/classes/promotion-preview', { params: { schoolId, allowRepromote: allowRepromote ? 'true' : undefined } })
      .then(({ data }) => {
        if (cancelled) return;
        setGroups(data.data?.groups || []);
        setMissingGradeLevel(data.data?.missingGradeLevel || []);
        setTargetAcademicYear(prev => prev || data.data?.suggestedAcademicYear || '');
      })
      .catch((err: any) => { if (!cancelled) setPreviewError(err.response?.data?.message || 'Failed to load promotion preview'); })
      .finally(() => { if (!cancelled) setLoadingPreview(false); });
    return () => { cancelled = true; };
  }, [schoolId, allowRepromote]);

  const promotable = groups.filter(g => g.action === 'promote-new' || g.action === 'promote-existing' || g.action === 'graduate');
  const alreadyPromoted = groups.filter(g => g.action === 'already-promoted');
  const totalStudents = promotable.reduce((sum, g) => sum + (g.studentCount || 0), 0);

  const handleConfirm = async () => {
    if (!schoolId || !targetAcademicYear.trim()) return;
    setConfirming(true); setConfirmError('');
    try {
      const { data } = await api.post('/classes/promote-all', { schoolId, targetAcademicYear: targetAcademicYear.trim(), allowRepromote });
      setResult(data.data);
      onDone();
    } catch (err: any) { setConfirmError(err.response?.data?.message || err.message || 'Promotion failed'); } finally { setConfirming(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">🎓 Promote All Classes</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700 dark:text-green-300">
              ✅ Promoted {result.promoted} classes, graduated {result.graduated}, moved {result.studentsMoved} students{result.skipped > 0 ? `, skipped ${result.skipped}` : ''}.
            </div>
            <div className="rounded-xl border border-[var(--color-border-default)] divide-y divide-[var(--color-border-subtle)] max-h-64 overflow-y-auto">
              {result.results.map(r => (
                <div key={r.classId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-[var(--color-text-primary)] font-medium">{r.title}</span>
                  {r.action === 'promoted' && <span className="text-[var(--color-text-secondary)]">→ {r.targetTitle} ({r.studentsMoved} students)</span>}
                  {r.action === 'graduated' && <span className="text-blue-600 dark:text-blue-400">🎓 Graduated ({r.studentsMoved} students)</span>}
                  {r.action === 'skipped' && <span className="text-amber-600 dark:text-amber-400">Skipped — {r.reason}</span>}
                </div>
              ))}
            </div>
            <button onClick={onClose} className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">Done</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="promoteSchool" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Organization</label>
              <select id="promoteSchool" value={schoolId} onChange={e => { setSchoolId(e.target.value); setResult(null); }} className="w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Select an organization...</option>
                {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>

            {schoolId && (
              <div>
                <label htmlFor="targetAcademicYear" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">Target Academic Year</label>
                <input id="targetAcademicYear" type="text" value={targetAcademicYear} onChange={e => setTargetAcademicYear(e.target.value)} placeholder="e.g. 2026-2027" className="w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            )}

            {schoolId && (
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 cursor-pointer">
                <input type="checkbox" checked={allowRepromote} onChange={e => setAllowRepromote(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500/30" />
                <span className="text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Testing only:</span> allow re-promoting classes already promoted this cycle. Leave this unchecked in production — it disables the safeguard that stops a cohort from being moved twice.
                </span>
              </label>
            )}

            {loadingPreview && <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
            {previewError && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{previewError}</div>}

            {!loadingPreview && schoolId && groups.length === 0 && missingGradeLevel.length === 0 && (
              <p className="text-sm text-[var(--color-text-tertiary)] text-center py-6">No active classes found for this organization.</p>
            )}

            {promotable.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Will be promoted ({totalStudents} students total):</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mb-2">Sections (A, B, C...) aren't matched separately — every section of a grade merges into one shared next-grade class.</p>
                <div className="rounded-xl border border-[var(--color-border-default)] divide-y divide-[var(--color-border-subtle)] max-h-56 overflow-y-auto">
                  {promotable.map(g => (
                    <div key={g.classId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-[var(--color-text-primary)]">{g.title} <span className="text-[var(--color-text-tertiary)]">({g.section})</span></span>
                      <span className="text-[var(--color-text-secondary)]">
                        {g.action === 'graduate' ? '🎓 Graduate' : `→ ${g.targetTitle}`} <span className="text-xs text-[var(--color-text-tertiary)]">· {g.studentCount} students</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {alreadyPromoted.length > 0 && (
              <p className="text-xs text-[var(--color-text-tertiary)]">{alreadyPromoted.length} class(es) already promoted this cycle — skipped automatically.</p>
            )}

            {missingGradeLevel.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">⚠️ {missingGradeLevel.length} class(es) missing a Grade Level — edit them first, then re-open this dialog:</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">{missingGradeLevel.map(c => `${c.title} (${c.section})`).join(', ')}</p>
              </div>
            )}

            {confirmError && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{confirmError}</div>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
              <button
                type="button" onClick={handleConfirm}
                disabled={confirming || !schoolId || !targetAcademicYear.trim() || promotable.length === 0}
                className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
              >
                {confirming && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                Confirm & Promote All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Three-Dot Actions Dropdown
// ---------------------------------------------------------------------------

function DepartmentModal({ open, departments, onClose, onSaved }: { open: boolean; departments: DepartmentItem[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState<DepartmentItem | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setCode('');
      setEditing(null);
      setError('');
    }
  }, [open]);

  const close = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Department name is required'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.patch(`/departments/${editing._id}`, { name: name.trim(), code: code.trim() || undefined });
      } else {
        await api.post('/departments', { name: name.trim(), code: code.trim() || undefined });
      }
      onSaved();
      setName('');
      setCode('');
      setEditing(null);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (dept: DepartmentItem) => {
    setEditing(dept);
    setName(dept.name);
    setCode(dept.code || '');
    setError('');
  };

  const handleDelete = async (dept: DepartmentItem) => {
    if (!window.confirm(`Delete department "${dept.name}"? Classes linked to this department must be reassigned first.`)) return;
    setSaving(true);
    setError('');
    try {
      await api.delete(`/departments/${dept._id}`);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete department');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Manage Departments</h2>
            <p className="text-sm text-[var(--color-text-tertiary)]">Create, rename, or delete your tenant's departments.</p>
          </div>
          <button onClick={close} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-3">
              <label className="text-sm font-semibold text-[var(--color-text-primary)]">Department Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. Secondary" />
            </div>
            <div className="grid gap-3">
              <label className="text-sm font-semibold text-[var(--color-text-primary)]">Code (optional)</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. SEC" />
            </div>
          </div>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors disabled:opacity-60">{editing ? 'Update Department' : 'Add Department'}</button>
              {editing && <button type="button" onClick={() => { setEditing(null); setName(''); setCode(''); setError(''); }} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>}
            </div>
            <div className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Existing Departments</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{departments.length}</span>
              </div>
              <div className="space-y-3">
                {departments.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">No departments yet. Add one to begin.</p>}
                {departments.map((dept) => (
                  <div key={dept._id} className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-[var(--color-text-primary)]">{dept.name}</p>
                      {dept.code && <p className="text-xs text-[var(--color-text-tertiary)]">Code: {dept.code}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleEdit(dept)} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]">Edit</button>
                      <button type="button" onClick={() => handleDelete(dept)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionsDropdown({ onImport, onExport, exporting, label, onManageDepartments, onAddClass, onPromoteAll }: {
  onImport: () => void; onExport: () => void; exporting: boolean; label: string; onManageDepartments: () => void; onAddClass: () => void; onPromoteAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);

  const toggle = (e: React.MouseEvent) => { e.stopPropagation(); setOpen(!open); };

  return (<>
    <button ref={btnRef} onClick={toggle} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors" title="More Actions">
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 16 16">
        <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
      </svg>
    </button>
    {open && btnRef.current && createPortal(
      <div ref={menuRef} style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }} className="w-56 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated py-1">
        <button onClick={() => { setOpen(false); onAddClass(); }} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-primary-600 hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2 transition-colors">{'+ Add Class'}</button>
        <button onClick={() => { setOpen(false); onManageDepartments(); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2 transition-colors">Manage Departments</button>
        <div className="my-1 border-t border-[var(--color-border-subtle)]" />
        <button onClick={() => { setOpen(false); onImport(); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2 transition-colors">{'\u2191 Import ' + label + ' via Excel'}</button>
        <button onClick={() => { setOpen(false); onExport(); }} disabled={exporting} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50 flex items-center gap-2 transition-colors">{exporting ? <div className="h-3 w-3 animate-spin rounded-full border border-[var(--color-border-default)] border-t-primary-600" /> : '\u2193 Export ' + label + ' to Excel'}</button>
        <div className="my-1 border-t border-[var(--color-border-subtle)]" />
        <button onClick={() => { setOpen(false); onPromoteAll(); }} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2 transition-colors">🎓 Promote All Classes</button>
      </div>,
      document.body,
    )}
  </>);
}

// ---------------------------------------------------------------------------
// Row Actions — single "⋮" dropdown replacing individual Edit/Delete icons.
// ---------------------------------------------------------------------------

function RowActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (<>
    <button
      ref={btnRef}
      onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      className="rounded-lg border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] p-1.5 text-[var(--color-text-secondary)] shadow-sm hover:bg-[var(--color-surface-tertiary)] transition-colors"
      title="More Actions"
    >
      <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
    </button>
    {open && btnRef.current && createPortal(
      <div
        ref={menuRef}
        style={{ position: 'fixed', top: btnRef.current.getBoundingClientRect().bottom + 4, right: window.innerWidth - btnRef.current.getBoundingClientRect().right, zIndex: 100 }}
        className="w-40 rounded-xl border border-slate-100 dark:border-slate-800 bg-[var(--color-surface-primary)] shadow-md py-1"
      >
        <button onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-primary-600 hover:bg-[var(--color-surface-tertiary)] transition-colors">
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> Edit
        </button>
        <button onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-red-600 hover:bg-[var(--color-surface-tertiary)] transition-colors">
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Delete
        </button>
      </div>,
      document.body,
    )}
  </>);
}

// Main Component
// ---------------------------------------------------------------------------

export function ClassesManage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [showDepartments, setShowDepartments] = useState(false);
  const [showPromoteAll, setShowPromoteAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Excel-style column header filters/sort — applied client-side on top of
  // whatever the server already returned for the search/status filters above.
  const columnAccessors: Record<string, (row: ClassItem) => string> = {
    title: (r) => r.title,
    section: (r) => r.section,
    organization: (r) => r.school?.name || '—',
    department: (r) => r.department || 'Primary',
    room: (r) => r.room,
    shiftMode: (r) => r.shiftMode || 'Morning',
    gradeLevel: (r) => (r.gradeLevel !== undefined && r.gradeLevel !== null ? String(r.gradeLevel) : '—'),
    academicYear: (r) => r.academicYear || '—',
    batch: (r) => r.batch || '—',
    status: (r) => r.status,
  };
  const {
    columnFilters, sortCol, sortDir, applyColumnCommit, clearColumnFilter,
    clearAll: clearAllColumnFilters, displayedRows: displayedClasses, columnFiltersActive,
  } = useColumnFilters(classes, columnAccessors);

  const [showCreate, setShowCreate] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Import / Export state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteError, setPasteError] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ totalRows: number; created: number; failed: number; errors: { row: number; message: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Each of these three is independent — a hiccup fetching schools or
  // departments (reference data for the filter dropdowns) must never blank
  // out the class list itself. Promise.all fails fast on the first
  // rejection, so a single flaky secondary request could wipe out an
  // otherwise-successful class fetch (e.g. right after a bulk import,
  // showing "Imported 12 of 12" but then an empty list). Promise.allSettled
  // lets each piece of state update independently of the others.
  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;

    const [classesResult, schoolsResult, departmentsResult] = await Promise.allSettled([
      api.get('/classes', { params }),
      api.get('/schools', { params: { limit: '100' } }),
      api.get('/departments'),
    ]);

    if (classesResult.status === 'fulfilled') {
      setClasses(classesResult.value.data.data || []);
    } else {
      setError(classesResult.reason?.response?.data?.message || 'Failed to load classes');
    }
    if (schoolsResult.status === 'fulfilled') setSchools(schoolsResult.value.data.data || []);
    if (departmentsResult.status === 'fulfilled') setDepartments(departmentsResult.value.data.data || []);

    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try { await api.patch(`/classes/${id}/status`, { status: newStatus }); setClasses(p => p.map(c => c._id === id ? { ...c, status: newStatus as ClassItem['status'] } : c)); setToast({ message: `Status updated to ${newStatus}`, type: 'success' }); }
    catch (err: any) { setToast({ message: err.response?.data?.message || 'Failed to update status', type: 'error' }); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this class?')) return;
    try { await api.delete(`/classes/${id}`); setClasses(p => p.filter(c => c._id !== id)); setToast({ message: 'Class deleted', type: 'success' }); }
    catch (err: any) { setToast({ message: err.response?.data?.message || 'Failed to delete', type: 'error' }); }
  };

  // ───────────────────────────────────────────────────────────────────────
  // Import Modal Logic
  // ───────────────────────────────────────────────────────────────────────

  const openImportModal = () => { setShowImportModal(true); setImportMode('upload'); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };
  const closeImportModal = () => { setShowImportModal(false); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/classes/template`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'classes-template.xlsx';
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    } catch { setError('Failed to download template'); }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setSelectedFile(f); };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); };

  const submitFileImport = async () => {
    if (!selectedFile) return; setImporting(true); setError(''); setImportResult(null);
    try {
      const fd = new FormData(); fd.append('file', selectedFile);
      const { data } = await api.post('/classes/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(data.data);
      if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} classes`); await fetchData(); closeImportModal(); }
    } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); }
  };

  const parsePastedRows = (): string[][] => {
    if (!pasteText.trim()) return [];
    return pasteText.trim().split(/\r?\n/).map(l => l.split('\t').map(c => c.trim())).filter(r => r.length > 0 && r.some(c => c !== ''));
  };

  const submitPasteImport = async () => {
    const rows = parsePastedRows();
    if (rows.length === 0) { setPasteError('Please paste at least one row of data before submitting.'); return; }
    if (rows[0].length < 5) { setPasteError('Expected 5 columns (Class Name, Section, Room, Department, Shift / Learning Mode). Found ' + rows[0].length + '.'); return; }
    const csvContent = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], 'pasted-classes.csv', { type: 'text/csv' });
    setImporting(true); setError(''); setImportResult(null); setPasteError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/classes/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(data.data);
      if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} classes`); await fetchData(); closeImportModal(); }
    } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); }
  };

  const handleExport = async () => {
    setExporting(true); setError('');
    try {
      const token = localStorage.getItem('accessToken') || '';
      const response = await fetch(`${api.defaults.baseURL}/classes/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `classes-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      setMessage('Export downloaded successfully');
    } catch (err: any) { setError(err.message || 'Export failed'); } finally { setExporting(false); }
  };

  const activeCount = classes.filter(c => c.status === 'active').length;
  const inactiveCount = classes.filter(c => c.status === 'inactive').length;
  const completedCount = classes.filter(c => c.status === 'completed').length;
  const parsedRows = parsePastedRows();

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

        {/* Header + Buttons — stay top-right of the title on every screen size */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]"><School className="h-7 w-7 sm:h-8 sm:w-8 text-primary-600" strokeWidth={1.75} />Manage Classes</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{classes.length} total — {activeCount} active, {inactiveCount} inactive, {completedCount} completed</p></div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 flex-shrink-0">
            <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); submitFileImport(); } }} className="hidden" />
            <ActionsDropdown
              onImport={openImportModal}
              onExport={handleExport}
              exporting={exporting}
              label="Classes"
              onManageDepartments={() => setShowDepartments(true)}
              onAddClass={() => setShowCreate(true)}
              onPromoteAll={() => setShowPromoteAll(true)}
            />
          </div>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}

        {/* ═══════════════════════════════════════════════════════════════
            Import Modal
           ═══════════════════════════════════════════════════════════════ */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
              <div className="border-b border-[var(--color-border-subtle)] px-6 py-5">
                <div className="flex items-start justify-between">
                  <div><h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Classes</h2><p className="text-sm text-[var(--color-text-tertiary)] mt-1">Select your preferred method to import multiple classes into the system.</p></div>
                  <button onClick={closeImportModal} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors" disabled={importing}><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              </div>
              <div className="px-6 py-5 space-y-6">
                <button onClick={handleDownloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3"><span className="text-2xl">📥</span><div><p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">Download Excel Class Template</p><p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">Pre-formatted .xlsx file with the correct column structure</p></div></div>
                    <svg className="h-5 w-5 text-primary-500 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setImportMode('upload'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'upload' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}>
                    <span className="text-2xl block mb-1">📁</span><p className={`text-sm font-bold ${importMode === 'upload' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Upload Excel File</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Drag and drop your .xlsx file</p>
                  </button>
                  <button onClick={() => { setImportMode('paste'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'paste' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}>
                    <span className="text-2xl block mb-1">📋</span><p className={`text-sm font-bold ${importMode === 'paste' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Manual Copy & Paste</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Paste tabular data from your clipboard</p>
                  </button>
                </div>

                {importMode === 'upload' && (
                  <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>
                    {selectedFile ? (
                      <div className="space-y-3"><span className="text-3xl">✅</span><p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p><button onClick={() => setSelectedFile(null)} className="text-xs text-red-500 hover:underline">Remove file</button></div>
                    ) : (
                      <div className="space-y-3"><span className="text-3xl">📂</span><p className="text-sm font-medium text-[var(--color-text-secondary)]">Drag and drop your Excel file here, or</p><label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">Browse Files<input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInputChange} className="hidden" /></label><p className="text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p></div>
                    )}
                  </div>
                )}

                {importMode === 'paste' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                      <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Paste your spreadsheet data below (tab-separated columns, one row per line):</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">Class Name &nbsp; Section &nbsp; Room &nbsp; Shift / Learning Mode</p>
                      <textarea value={pasteText} onChange={e => { setPasteText(e.target.value); setPasteError(''); }} rows={8} placeholder={"Paste data from Excel here...\n\nExample:\nGrade 3\tA\tRoom 5\tPrimary\tMorning\nGrade 4\tB\tRoom 2\tSecondary\tAfternoon\nQuran Online\tA\tVirtual Room 1\tMiddle School\tVirtual"} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y" />
                    </div>
                    {pasteError && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{pasteError}</div>}
                    {parsedRows.length > 0 && (
                      <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
                        <div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed</div>
                        <div className="max-h-40 overflow-auto"><table className="w-full text-xs"><tbody className="divide-y divide-[var(--color-border-subtle)]">{parsedRows.slice(0, 20).map((row, ri) => (<tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>{row.map((cell, ci) => (<td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">{cell}</td>))}</tr>))}</tbody></table></div>
                      </div>
                    )}
                  </div>
                )}
                {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
              </div>

              <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between">
                <button onClick={closeImportModal} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button>
                <button onClick={importMode === 'upload' ? submitFileImport : submitPasteImport} disabled={importing || (importMode === 'upload' && !selectedFile) || (importMode === 'paste' && !pasteText.trim())} className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2">{importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Classes'}</button>
              </div>
              {importResult && (
                <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{importResult.created} of {importResult.totalRows} rows imported successfully{importResult.failed > 0 && ` — ${importResult.failed} failed`}</p>
                  {importResult.errors.length > 0 && (<div className="max-h-36 overflow-y-auto rounded-lg border border-red-200 dark:border-red-900/40"><table className="w-full text-xs"><thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300"><tr><th className="px-3 py-1.5">Row</th><th className="px-3 py-1.5">Error</th></tr></thead><tbody className="divide-y divide-red-100 dark:divide-red-900/30">{importResult.errors.map((e, idx) => (<tr key={idx}><td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{e.row}</td><td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td></tr>))}</tbody></table></div>)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40"><CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} /></div>
            <div><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{activeCount}</p><p className="text-xs text-emerald-600 dark:text-emerald-400">Active</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/30 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-200/70 dark:bg-slate-700/50"><PauseCircle className="h-5 w-5 text-slate-500 dark:text-slate-400" strokeWidth={1.75} /></div>
            <div><p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{inactiveCount}</p><p className="text-xs text-slate-500 dark:text-slate-400">Inactive</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-sky-100 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-950/30 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/40"><Archive className="h-5 w-5 text-sky-600 dark:text-sky-400" strokeWidth={1.75} /></div>
            <div><p className="text-2xl font-bold text-sky-700 dark:text-sky-300">{completedCount}</p><p className="text-xs text-sky-600 dark:text-sky-400">Completed</p></div>
          </div>
        </div>

        {error && !showImportModal && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={fetchData} className="text-primary-600 font-medium text-sm hover:underline">Retry</button></div>}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={2} />
            <input type="text" placeholder="Search by class name, section, room, or organization..." value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] pl-10 pr-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="completed">Completed</option></select>
        </div>

        {columnFiltersActive && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <span>Showing {displayedClasses.length} of {classes.length} classes (column filters active — click a column header's ✕ to clear it)</span>
            <button onClick={clearAllColumnFilters} className="font-medium text-primary-600 hover:underline">Clear all</button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[140px]">
                    <ColumnFilterHeader label="Class" colKey="title" allValues={classes.map(columnAccessors.title)} currentSelected={columnFilters.title ?? null} currentSort={sortCol === 'title' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[90px]">
                    <ColumnFilterHeader label="Section" colKey="section" allValues={classes.map(columnAccessors.section)} currentSelected={columnFilters.section ?? null} currentSort={sortCol === 'section' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--color-text-primary)] hidden md:table-cell whitespace-nowrap min-w-[140px]">
                    <ColumnFilterHeader label="Organization" colKey="organization" allValues={classes.map(columnAccessors.organization)} currentSelected={columnFilters.organization ?? null} currentSort={sortCol === 'organization' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[120px]">
                    <ColumnFilterHeader label="Department" colKey="department" allValues={classes.map(columnAccessors.department)} currentSelected={columnFilters.department ?? null} currentSort={sortCol === 'department' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} />
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[110px]">
                    <ColumnFilterHeader label="Grade Level" colKey="gradeLevel" allValues={classes.map(columnAccessors.gradeLevel)} currentSelected={columnFilters.gradeLevel ?? null} currentSort={sortCol === 'gradeLevel' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} align="center" />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[90px]">
                    <ColumnFilterHeader label="Room" colKey="room" allValues={classes.map(columnAccessors.room)} currentSelected={columnFilters.room ?? null} currentSort={sortCol === 'room' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} />
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[110px]">
                    <ColumnFilterHeader label="Shift / Mode" colKey="shiftMode" allValues={classes.map(columnAccessors.shiftMode)} currentSelected={columnFilters.shiftMode ?? null} currentSort={sortCol === 'shiftMode' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} align="center" />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[130px]">
                    <ColumnFilterHeader label="Academic Year" colKey="academicYear" allValues={classes.map(columnAccessors.academicYear)} currentSelected={columnFilters.academicYear ?? null} currentSort={sortCol === 'academicYear' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[110px]">
                    <ColumnFilterHeader label="Batch" colKey="batch" allValues={classes.map(columnAccessors.batch)} currentSelected={columnFilters.batch ?? null} currentSort={sortCol === 'batch' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} />
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[110px]">
                    <ColumnFilterHeader label="Status" colKey="status" allValues={classes.map(columnAccessors.status)} currentSelected={columnFilters.status ?? null} currentSort={sortCol === 'status' ? sortDir : null} onCommit={applyColumnCommit} onClear={clearColumnFilter} align="center" />
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-[var(--color-text-primary)] whitespace-nowrap min-w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedClasses.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-16 text-[var(--color-text-tertiary)]">{classes.length === 0 ? (<><p className="text-lg mb-1">🏫 No classes found</p><p className="text-sm">Click "+ Add Class" to create one.</p></>) : (<><p className="text-lg mb-1">🔍 No classes match these filters</p><button onClick={clearAllColumnFilters} className="text-sm text-primary-600 hover:underline">Clear column filters</button></>)}</td></tr>
                ) : (
                  displayedClasses.map(c => (
                    <tr key={c._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap"><p className="font-semibold text-[var(--color-text-primary)]">{c.title}</p></td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{c.section}</span></td>
                      <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap text-[var(--color-text-secondary)] text-sm">{c.school?.name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text-secondary)] text-sm">{c.department || 'Primary'}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap text-[var(--color-text-secondary)] text-sm">{c.gradeLevel !== undefined && c.gradeLevel !== null ? c.gradeLevel : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text-secondary)] text-sm">{c.room}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap"><ShiftBadge mode={c.shiftMode || 'Morning'} /></td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text-secondary)] text-sm">{c.academicYear || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text-secondary)] text-sm font-mono">{c.batch || '—'}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <span className="relative inline-flex items-center">
                          <select value={c.status} onChange={e => handleStatusChange(c._id, e.target.value)} className={`appearance-none rounded-full border-0 pl-3 pr-7 py-1 text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${STATUS_PILL_STYLES[c.status] || STATUS_PILL_STYLES.inactive}`}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="completed">Completed</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 opacity-60" strokeWidth={2.5} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}><div className="flex items-center justify-center gap-1"><RowActionsMenu onEdit={() => setEditingClass(c)} onDelete={() => handleDelete(c._id)} /></div></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreate && <ClassModal departments={departments} schools={schools} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchData(); }} />}
      {editingClass && <ClassModal cls={editingClass} departments={departments} schools={schools} onClose={() => setEditingClass(undefined)} onSaved={() => { setEditingClass(undefined); fetchData(); }} />}
      <DepartmentModal open={showDepartments} departments={departments} onClose={() => setShowDepartments(false)} onSaved={() => { setShowDepartments(false); fetchData(); }} />
      {showPromoteAll && <PromoteAllModal schools={schools} onClose={() => setShowPromoteAll(false)} onDone={fetchData} />}
    </div>
  );
}

export default ClassesManage;
