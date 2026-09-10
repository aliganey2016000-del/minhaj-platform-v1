import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Download, MoreVertical, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import api from '../../../lib/axios';
import BulkEntityImportModal from './components/bulk-entity-import-modal';
import { useAuth } from '../../../store/auth-context';
import { type InstitutionType, resolveInstitutionType, institutionTypeLabel } from '../../../lib/institution-type';

type Status = 'draft' | 'published' | 'archived';
type Ref = { _id: string; name?: string; title?: string; code?: string; slug?: string; section?: string; facultyId?: string; departmentId?: string };
type Org = { _id: string; name: string; institutionType?: InstitutionType; organizationType?: InstitutionType };
type Teacher = { _id: string; profile?: { firstName?: string; lastName?: string }; teacherId?: string };
type Course = { _id: string; title: { en: string; so?: string; ar?: string }; category: string; level: string; duration: number; fee: number; status: Status; maxStudents: number; enrolledStudents: number; teacher?: Teacher | null; school?: { _id: string; name: string } | null; class?: Ref | null; description?: { en?: string; so?: string; ar?: string }; thumbnail?: string; accessMode?: 'open' | 'restricted' };

const labelFor = institutionTypeLabel;
const teacherName = (t?: Teacher | null) => t ? `${t.profile?.firstName || ''} ${t.profile?.lastName || ''}`.trim() || t.teacherId || 'Teacher' : 'Unassigned';

function CourseModal({ course, org, onClose, onSaved }: { course?: Course; org: Org; onClose: () => void; onSaved: () => void }) {
  const type = resolveInstitutionType(org);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Ref[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: course?.title?.en || '', category: course?.category || '', level: course?.level || 'beginner', duration: course?.duration || 8, fee: course?.fee || 0, maxStudents: course?.maxStudents || 50, teacher: course?.teacher?._id || '', classId: course?.class?._id || '', status: course?.status || 'draft' as Status, description: course?.description?.en || '' });

  useEffect(() => { (async () => { try { const [t, c, cat] = await Promise.all([api.get('/teachers', { params: { school: org._id, status: 'active', limit: 200 } }), api.get('/classes', { params: { schoolId: org._id, status: 'active', limit: 300 } }), api.get('/course-categories', { params: { school: org._id } })]); setTeachers(t.data.data || []); setClasses(c.data.data || []); setCategories(cat.data.data || []); } catch { setTeachers([]); setClasses([]); setCategories([]); } })(); }, [org._id]);

  const submit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); setError(''); try { const payload = { title: { en: form.title, so: course?.title?.so || '', ar: course?.title?.ar || '' }, description: { en: form.description, so: course?.description?.so || '', ar: course?.description?.ar || '' }, category: form.category, level: form.level, duration: Number(form.duration), fee: Number(form.fee), maxStudents: Number(form.maxStudents), teacher: form.teacher || undefined, school: org._id, class: form.classId || undefined, status: form.status }; if (course) await api.patch(`/courses/${course._id}`, payload); else await api.post('/courses', payload); onSaved(); onClose(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to save course'); } finally { setSaving(false); } };

  const placement = type === 'school' ? 'Class / Section' : type === 'training_center' ? 'Batch / Cohort' : 'Class / Cohort';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}><div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
    <div className="mb-4 flex items-start justify-between"><div><h2 className="text-lg font-bold">{course ? 'Edit Course' : 'Add Course'}</h2><p className="text-xs text-[var(--color-text-tertiary)]">{labelFor(type)} curriculum</p></div><button onClick={onClose}><X className="h-5 w-5" /></button></div>
    {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs font-semibold">Course / Subject Name *<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm" /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Category *<select required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm"><option value="">Select category</option>{categories.map(c => <option key={c._id} value={c.slug || c.name}>{c.name}</option>)}</select></label><label className="text-xs font-semibold">Level<select value={form.level} onChange={e => setForm({ ...form, level: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label></div>
      <label className="block text-xs font-semibold">{placement}<select value={form.classId} onChange={e => setForm({ ...form, classId: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm"><option value="">No class/cohort</option>{classes.map(c => <option key={c._id} value={c._id}>{c.title || c.name}{c.section ? ` — ${c.section}` : ''}</option>)}</select></label>
      <label className="block text-xs font-semibold">Teacher / Instructor<select value={form.teacher} onChange={e => setForm({ ...form, teacher: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm"><option value="">Unassigned</option>{teachers.map(t => <option key={t._id} value={t._id}>{teacherName(t)}</option>)}</select></label>
      <label className="block text-xs font-semibold">Description<textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm" /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="text-xs font-semibold">Duration<input type="number" min="1" value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">Fee<input type="number" min="0" value={form.fee} onChange={e => setForm({ ...form, fee: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">Capacity<input type="number" min="1" value={form.maxStudents} onChange={e => setForm({ ...form, maxStudents: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm" /></label></div>
      {course && <label className="block text-xs font-semibold">Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>}
      <div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border px-4 py-2.5 text-sm">Cancel</button><button disabled={saving} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : course ? 'Update Course' : 'Create Course'}</button></div>
    </form>
  </div></div>;
}

// ---------------------------------------------------------------------------
// Course Progression Settings Modal
// ---------------------------------------------------------------------------

function AccessModeModal({ course, onClose, onSave }: { course: Course; onClose: () => void; onSave: (id: string, accessMode: 'open' | 'restricted') => Promise<void> }) {
  const [selected, setSelected] = useState<'open' | 'restricted'>(course.accessMode || 'open');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => { setSaving(true); setError(''); try { await onSave(course._id, selected); onClose(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to save progression settings'); } finally { setSaving(false); } };

  const options: { value: 'open' | 'restricted'; icon: string; title: string; description: string }[] = [
    { value: 'open', icon: '🔓', title: 'No Restriction', description: 'All lessons are unlocked from the start — students can watch them in any order.' },
    { value: 'restricted', icon: '🔒', title: 'Restricted Progression', description: 'Only the first lesson is unlocked. Each next lesson or quiz unlocks once the previous one is completed (e.g. 95% watched) or the quiz is passed.' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">🎯 Course Progression Settings</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">{course.title.en}</p>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-2.5">
          {options.map((opt) => (
            <label key={opt.value} className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${selected === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-tertiary)]'}`}>
              <input type="radio" name="accessMode" value={opt.value} checked={selected === opt.value} onChange={() => setSelected(opt.value)} className="mt-1" />
              <div><p className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5"><span>{opt.icon}</span> {opt.title}</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{opt.description}</p></div>
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">{saving ? 'Saving...' : 'Save Settings'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teacher Content Permission Modal
// ---------------------------------------------------------------------------

function TeacherPermissionModal({ teacherId, teacherName: tName, courseTitle, onClose, onSaved }: { teacherId: string; teacherName: string; courseTitle: string; onClose: () => void; onSaved: () => void }) {
  const [currentPerm, setCurrentPerm] = useState<string>('COURSE_BUILDER');
  const [selected, setSelected] = useState<string>('COURSE_BUILDER');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { (async () => { try { const { data } = await api.get(`/teachers/${teacherId}`); const perm = data.data?.coursePermission || 'COURSE_BUILDER'; setCurrentPerm(perm); setSelected(perm); } catch { setError('Failed to load current permission'); } finally { setFetching(false); } })(); }, [teacherId]);

  const handleSave = async () => { setLoading(true); setError(''); try { await api.patch(`/teachers/${teacherId}/course-permission`, { coursePermission: selected }); onSaved(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to update permission'); } finally { setLoading(false); } };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">🔐 Teacher Content Permission</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-1"><span className="font-semibold text-[var(--color-text-primary)]">{tName}</span> — {courseTitle}</p>
        {currentPerm && !fetching && <p className="text-[10px] text-[var(--color-text-tertiary)] mb-4">Current: <span className={`font-bold ${currentPerm === 'COURSE_BUILDER' ? 'text-emerald-600' : 'text-amber-600'}`}>{currentPerm === 'COURSE_BUILDER' ? 'Course Builder' : 'Student View'}</span></p>}
        {fetching && <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-emerald-600" /></div>}
        {error && <p className="text-red-500 text-xs mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        {!fetching && (
          <>
            <div className="space-y-2">
              <button onClick={() => setSelected('COURSE_BUILDER')} disabled={loading} className={`w-full flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all text-left ${selected === 'COURSE_BUILDER' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-[var(--color-border-default)] hover:border-emerald-300'}`}>
                <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 ${selected === 'COURSE_BUILDER' ? 'border-emerald-600 bg-emerald-600' : 'border-[var(--color-border-default)]'}`}>{selected === 'COURSE_BUILDER' && <div className="w-1.5 h-1.5 bg-white rounded-full m-auto mt-0.5" />}</div>
                <div><span className={`text-sm font-semibold ${selected === 'COURSE_BUILDER' ? 'text-emerald-700 dark:text-emerald-300' : 'text-[var(--color-text-primary)]'}`}>Course Builder</span><p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">Full write/edit access to course structure, chapters, and content blocks.</p></div>
              </button>
              <button onClick={() => setSelected('STUDENT_VIEW')} disabled={loading} className={`w-full flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all text-left ${selected === 'STUDENT_VIEW' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-[var(--color-border-default)] hover:border-amber-300'}`}>
                <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 ${selected === 'STUDENT_VIEW' ? 'border-amber-600 bg-amber-600' : 'border-[var(--color-border-default)]'}`}>{selected === 'STUDENT_VIEW' && <div className="w-1.5 h-1.5 bg-white rounded-full m-auto mt-0.5" />}</div>
                <div><span className={`text-sm font-semibold ${selected === 'STUDENT_VIEW' ? 'text-amber-700 dark:text-amber-300' : 'text-[var(--color-text-primary)]'}`}>Student View</span><p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">Read-only access. Same view as a student — no editing or saving allowed.</p></div>
              </button>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={onClose} disabled={loading} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={loading || selected === currentPerm} className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors ${selected === currentPerm ? 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)] cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>{loading ? <span className="inline-flex items-center gap-1"><div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving...</span> : selected === currentPerm ? 'Already Set' : 'Save'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Course Card — thumbnail, meta, and the full per-course actions menu
// ---------------------------------------------------------------------------

interface CourseCardProps {
  course: Course;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (course: Course) => void;
  onDelete: (id: string) => void;
  onDuplicate: (course: Course) => void;
  onToggleStatus: (id: string, currentStatus: Status) => void;
  onArchiveRestore: (id: string, currentStatus: Status) => void;
  onBuildContent: (course: Course) => void;
  onViewStudents: (course: Course) => void;
  onPreview: (course: Course) => void;
  onSetAccessMode: (course: Course) => void;
  onTeacherPermission: (course: Course) => void;
  onGateReport: (course: Course) => void;
  type: InstitutionType;
}

function CourseCard({ course: c, selected, onToggleSelect, onEdit, onDelete, onDuplicate, onToggleStatus, onArchiveRestore, onBuildContent, onViewStudents, onPreview, onSetAccessMode, onTeacherPermission, onGateReport, type }: CourseCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [thumbnailBroken, setThumbnailBroken] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); }
    if (menuOpen) { document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }
  }, [menuOpen]);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen && buttonRef.current) { const rect = buttonRef.current.getBoundingClientRect(); setMenuCoords({ top: rect.bottom + 4, left: rect.right - 240 }); }
    setMenuOpen(!menuOpen);
  };

  const isPublished = c.status === 'published';
  const isArchived = c.status === 'archived';
  const handleAction = (action: () => void) => { setMenuOpen(false); action(); };
  const className = c.class ? `${c.class.title || c.class.name}${c.class.section ? ` (${c.class.section})` : ''}` : '—';

  return (
    <article className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden flex flex-col">
      <div className="relative h-40 bg-gradient-to-br from-primary-100 via-primary-50 to-sky-100 dark:from-primary-900/40 dark:via-sky-900/30 dark:to-primary-950/50 flex items-center justify-center">
        {c.thumbnail && !thumbnailBroken ? (
          <img src={c.thumbnail} alt={c.title.en} className="w-full h-full object-cover" onError={() => setThumbnailBroken(true)} />
        ) : (
          <BookOpen className="h-10 w-10 text-primary-400" strokeWidth={1.5} />
        )}
        <span className={`absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${isPublished ? 'bg-green-100 text-green-700' : isArchived ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(c._id)} onClick={(e) => e.stopPropagation()} className="absolute top-3 left-3 h-4 w-4" />
      </div>

      <div className="p-5 flex flex-col flex-1 gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-[var(--color-text-primary)] leading-snug line-clamp-2 text-base flex-1">{c.title.en || 'Untitled course'}</h3>
          <div className="relative flex-shrink-0">
            <button ref={buttonRef} onClick={toggleMenu} className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors" aria-label="Course actions">
              <MoreVertical className="h-5 w-5" strokeWidth={1.75} />
            </button>
            {menuOpen && createPortal(
              <div ref={menuRef} style={{ position: 'fixed', top: menuCoords.top, left: menuCoords.left }} className="w-60 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-xl py-1.5 origin-top-right" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => handleAction(() => onEdit(c))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"><span className="w-4 text-center flex-shrink-0">✏️</span><span>Edit Course</span></button>
                <button onClick={() => handleAction(() => onBuildContent(c))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"><span className="w-4 text-center flex-shrink-0">🏗️</span><span>Build Course Content</span></button>
                <button onClick={() => handleAction(() => onSetAccessMode(c))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"><span className="w-4 text-center flex-shrink-0">{c.accessMode === 'restricted' ? '🔒' : '🔓'}</span><span>Course Progression Settings</span></button>
                <button onClick={() => handleAction(() => onTeacherPermission(c))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"><span className="w-4 text-center flex-shrink-0">🔐</span><span>Teacher Content Permission</span></button>
                <button onClick={() => handleAction(() => onViewStudents(c))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"><span className="w-4 text-center flex-shrink-0">👥</span><span>View Enrolled Students</span></button>
                <button onClick={() => handleAction(() => onGateReport(c))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"><span className="w-4 text-center flex-shrink-0">🎯</span><span>Interactive Gate Report</span></button>
                <button onClick={() => handleAction(() => onDuplicate(c))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"><span className="w-4 text-center flex-shrink-0">📋</span><span>Duplicate Course</span></button>
                <div className="my-1 border-t border-[var(--color-border-subtle)]" />
                <button onClick={() => handleAction(() => onToggleStatus(c._id, c.status))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"><span className="w-4 text-center flex-shrink-0">{isPublished ? '📥' : '📤'}</span><span className={isPublished ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>{isPublished ? 'Unpublish' : 'Publish'}</span></button>
                {!isArchived ? (
                  <button onClick={() => handleAction(() => { if (window.confirm('Archive this course? It will be hidden from students.')) onArchiveRestore(c._id, c.status); })} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left"><span className="w-4 text-center flex-shrink-0">📦</span><span>Archive</span></button>
                ) : (
                  <button onClick={() => handleAction(() => onArchiveRestore(c._id, c.status))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/20 transition-colors text-left"><span className="w-4 text-center flex-shrink-0">🔄</span><span>Restore</span></button>
                )}
                <div className="my-1 border-t border-[var(--color-border-subtle)]" />
                <button onClick={() => handleAction(() => onPreview(c))} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"><span className="w-4 text-center flex-shrink-0">👁️</span><span>Preview as Student</span></button>
                <div className="my-1 border-t border-[var(--color-border-subtle)]" />
                <button onClick={() => handleAction(() => { if (window.confirm('Delete this course permanently? This action cannot be undone.')) onDelete(c._id); })} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left"><span className="w-4 text-center flex-shrink-0">🗑️</span><span>Delete Course</span></button>
              </div>,
              document.body,
            )}
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-tertiary)]">{c.category || 'Uncategorized'} · {c.level || '—'}</p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-[var(--color-surface-tertiary)] p-2"><span className="text-[var(--color-text-tertiary)]">Teacher</span><p className="mt-0.5 truncate font-medium">{teacherName(c.teacher)}</p></div>
          <div className="rounded-lg bg-[var(--color-surface-tertiary)] p-2"><span className="text-[var(--color-text-tertiary)]">Students</span><p className="mt-0.5 font-medium">{c.enrolledStudents || 0} / {c.maxStudents || '∞'}</p></div>
        </div>

        <div className="rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs">
          <span className="text-[var(--color-text-tertiary)]">{type === 'school' ? 'Class / Section' : type === 'training_center' ? 'Batch / Cohort' : 'Class / Cohort'}</span>
          <p className="mt-0.5 truncate font-medium">{className}</p>
        </div>

        <div className="mt-1">
          <div className="flex justify-between text-xs text-[var(--color-text-tertiary)] mb-1"><span>Enrollment</span><span>{c.enrolledStudents}/{c.maxStudents}</span></div>
          <div className="w-full h-1.5 bg-[var(--color-surface-tertiary)] rounded-full overflow-hidden"><div className="h-full bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, ((c.enrolledStudents || 0) / (c.maxStudents || 1)) * 100)}%` }} /></div>
        </div>
      </div>
    </article>
  );
}

export default function CoursesManage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const organizationId = user?.organizationId || (user as any)?.schoolId || '';
  const [org, setOrg] = useState<Org | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<Course | 'new' | null>(null);
  const [accessModeCourse, setAccessModeCourse] = useState<Course | undefined>(undefined);
  const [permCourse, setPermCourse] = useState<Course | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const type = resolveInstitutionType(org);

  const load = useCallback(async () => { if (!organizationId) return; setLoading(true); try { const [o, c] = await Promise.all([api.get(`/schools/${organizationId}`), api.get('/courses/admin', { params: { school: organizationId, limit: 300 } })]); const raw = o.data.data || o.data; setOrg(raw); setCourses(c.data.data || []); } catch (err: any) { setError(err.response?.data?.message || 'Unable to load courses'); setCourses([]); } finally { setLoading(false); } }, [organizationId]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => courses.filter(c => { const q = search.toLowerCase().trim(); return (!q || c.title?.en?.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q) || teacherName(c.teacher).toLowerCase().includes(q)) && (status === 'all' || c.status === status); }), [courses, search, status]);
  const allSelected = filtered.length > 0 && filtered.every(c => selected.includes(c._id));

  const remove = async (id: string) => { try { await api.delete(`/courses/${id}`); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete course'); } };
  const bulkDelete = async () => { if (!selected.length || !window.confirm(`Delete ${selected.length} selected course(s)?`)) return; try { await Promise.all(selected.map(id => api.delete(`/courses/${id}`))); setSelected([]); await load(); } catch (err: any) { setError(err.response?.data?.message || 'Bulk delete failed'); } };
  const exportCourses = async () => { try { const res = await api.get('/courses/export', { params: { school: organizationId }, responseType: 'blob' }); const url = URL.createObjectURL(res.data); const a = document.createElement('a'); a.href = url; a.download = 'courses.xlsx'; a.click(); URL.revokeObjectURL(url); } catch (err: any) { setError(err.response?.data?.message || 'Export failed'); } };

  // ── Per-card actions restored from the original Course Content Builder
  // era menu (before the institution-aware rewrite dropped it down to just
  // Edit/Delete) — Duplicate, Publish/Unpublish, Archive/Restore, Build
  // Content, Progression Settings, Teacher Permission, Gate Report, Preview.
  const handleDuplicate = async (course: Course) => {
    if (!window.confirm('Duplicate this course?')) return;
    try {
      const payload: any = { title: { en: `${course.title.en} (Copy)`, so: course.title.so || '', ar: course.title.ar || '' }, description: course.description || { en: '', so: '', ar: '' }, category: course.category, level: course.level, duration: course.duration, fee: course.fee, teacher: course.teacher?._id || undefined, school: organizationId, class: course.class?._id || undefined, maxStudents: course.maxStudents };
      await api.post('/courses', payload);
      await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to duplicate course'); }
  };
  const handleToggleStatus = async (id: string, currentStatus: Status) => {
    const newStatus: Status = currentStatus === 'published' ? 'draft' : 'published';
    try { await api.patch(`/courses/${id}`, { status: newStatus }); setCourses(prev => prev.map(c => c._id === id ? { ...c, status: newStatus } : c)); } catch (err: any) { setError(err.response?.data?.message || 'Failed to update course'); }
  };
  const handleArchiveRestore = async (id: string, currentStatus: Status) => {
    const newStatus: Status = currentStatus === 'archived' ? 'draft' : 'archived';
    try { await api.patch(`/courses/${id}`, { status: newStatus }); setCourses(prev => prev.map(c => c._id === id ? { ...c, status: newStatus } : c)); } catch (err: any) { setError(err.response?.data?.message || 'Failed to update course'); }
  };
  const handleBuildContent = (course: Course) => navigate(`/admin/courses/${course._id}/builder`);
  const handleGateReport = (course: Course) => navigate(`/admin/courses/${course._id}/gate-report`);
  const handlePreview = (course: Course) => navigate(`/admin/courses/${course._id}/preview`);
  const handleViewStudents = (course: Course) => { window.alert(`View Enrolled Students for: ${course.title.en}\nEnrolled: ${course.enrolledStudents}/${course.maxStudents}`); };
  const handleSaveAccessMode = async (id: string, accessMode: 'open' | 'restricted') => { await api.patch(`/courses/${id}`, { accessMode }); setCourses(prev => prev.map(c => c._id === id ? { ...c, accessMode } : c)); };
  const handleTeacherPermission = (course: Course) => { if (!course.teacher?._id) { window.alert('This course has no teacher assigned. Please assign a teacher first.'); return; } setPermCourse(course); };

  return <div className="space-y-4 p-4 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h1 className="truncate text-xl font-bold">Manage Courses</h1><p className="text-sm text-[var(--color-text-secondary)]">{courses.length} courses · {labelFor(type)} curriculum</p></div><div className="relative shrink-0"><button aria-label="Course actions" onClick={() => setMenuOpen(v => !v)} className="rounded-xl border border-[var(--color-border-default)] p-2.5 hover:bg-[var(--color-surface-tertiary)]"><MoreVertical className="h-5 w-5" /></button>{menuOpen && <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-xl"><button onClick={() => { setModal('new'); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-tertiary)]"><Plus className="h-4 w-4" /> Add Course</button><button onClick={() => { exportCourses(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-tertiary)]"><Download className="h-4 w-4" /> Export Courses</button><button onClick={() => { setShowImportModal(true); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-tertiary)]"><Upload className="h-4 w-4" /> Import Courses</button>{selected.length > 0 && <button onClick={() => { bulkDelete(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete Selected ({selected.length})</button>}</div>}</div></div>
    <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search courses, categories, teachers..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-9 pr-3 text-sm" /></div><select value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></div>
    {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
    <label className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : filtered.map(c => c._id))} /> Select all visible</label>
    {loading ? <div className="rounded-2xl border p-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading courses...</div> : filtered.length === 0 ? <div className="rounded-2xl border p-10 text-center"><BookOpen className="mx-auto mb-2 h-8 w-8 text-[var(--color-text-tertiary)]" /><p className="font-medium">No courses found</p><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Add a course from the three-dot menu.</p></div> : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">{filtered.map(c => (
      <CourseCard
        key={c._id}
        course={c}
        selected={selected.includes(c._id)}
        onToggleSelect={(id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])}
        onEdit={setModal}
        onDelete={(id) => { if (window.confirm('Delete this course permanently? This action cannot be undone.')) remove(id); }}
        onDuplicate={handleDuplicate}
        onToggleStatus={handleToggleStatus}
        onArchiveRestore={handleArchiveRestore}
        onBuildContent={handleBuildContent}
        onViewStudents={handleViewStudents}
        onPreview={handlePreview}
        onSetAccessMode={setAccessModeCourse}
        onTeacherPermission={handleTeacherPermission}
        onGateReport={handleGateReport}
        type={type}
      />
    ))}</div>}

    {showImportModal && <BulkEntityImportModal
      title="Import Courses"
      description="Download the official course template, upload a completed spreadsheet, or paste rows directly from Excel/Google Sheets."
      templateUrl="/courses/template"
      importUrl="/courses/import"
      templateName="courses-template.xlsx"
      headers=["Course Title (English)", "Category", "Level", "Organization Name", "Class Title", "Teacher Email", "Duration (weeks)", "Price ($)", "Capacity", "Thumbnail URL"]
      onClose={() => setShowImportModal(false)}
      onImported={load}
    />}
    {modal && org && <CourseModal course={modal === 'new' ? undefined : modal} org={org} onClose={() => setModal(null)} onSaved={load} />}
    {accessModeCourse && <AccessModeModal course={accessModeCourse} onClose={() => setAccessModeCourse(undefined)} onSave={handleSaveAccessMode} />}
    {permCourse?.teacher && <TeacherPermissionModal teacherId={permCourse.teacher._id} teacherName={teacherName(permCourse.teacher)} courseTitle={permCourse.title.en} onClose={() => setPermCourse(undefined)} onSaved={() => setPermCourse(undefined)} />}
  </div>;
}

export { CoursesManage };
