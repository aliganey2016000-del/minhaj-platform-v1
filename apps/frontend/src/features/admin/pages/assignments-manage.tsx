/**
 * Assignment Management — Admin / Org Admin / Teacher CRUD
 *
 * Tabbed list view + full-screen Create / Edit forms (inline, not modal).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { RichTextEditor } from './components/rich-text-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseBrief {
  _id: string;
  title: { en: string; so?: string; ar?: string };
  slug: string;
  category?: string;
  level?: string;
  thumbnail?: string;
  school?: { _id: string; name: string } | null;
  teacher?: { _id: string; teacherId: string; profile?: { firstName: string; lastName: string } } | null;
}

interface ClassBrief { _id: string; title: string; section: string; }
interface SchoolBrief { _id: string; name: string; status: string; }

interface AttachmentItem { url: string; name: string; allowDownload: boolean; }

interface AssignmentRecord {
  _id: string; title: string; description: string; course: CourseBrief;
  class?: ClassBrief | null; startDate: string | null; dueDate: string;
  totalMarks: number; allowLateSubmission: boolean; attachments: AttachmentItem[] | string[];
  status: 'active' | 'inactive'; createdBy: { _id: string; email: string };
  tab?: 'active' | 'upcoming' | 'past'; createdAt: string;
  submissionCount?: number; totalStudents?: number;
}

interface FormData {
  organizationId: string; title: string; description: string; course: string;
  classId: string; startDate: string; dueDate: string;
  totalMarks: string; allowLateSubmission: boolean; attachments: AttachmentItem[];
}

// ---------------------------------------------------------------------------
// L10n
// ---------------------------------------------------------------------------

const catLabels: Record<string, string> = { quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah', arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq' };
const levelLabels: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLocalDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Full-page Create / Edit Form
// ---------------------------------------------------------------------------

function AssignmentFormPage({
  assignment,
  onClose,
  onSaved,
}: {
  assignment?: AssignmentRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!assignment;
  const isSuperAdmin = user?.role === 'admin';
  const isOrgAdmin = user?.role === 'org_admin';
  const isTeacher = user?.role === 'teacher';

  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [classesLoading, setClassesLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);

  const [form, setForm] = useState<FormData>({
    organizationId: isSuperAdmin ? '' : (user?.organizationId || ''),
    title: assignment?.title || '',
    description: assignment?.description || '',
    course: assignment?.course?._id || '',
    classId: assignment?.class?._id || '',
    startDate: assignment?.startDate ? toLocalDatetime(new Date(assignment.startDate)) : toLocalDatetime(new Date()),
    dueDate: assignment?.dueDate ? toLocalDatetime(new Date(assignment.dueDate)) : toLocalDatetime(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    totalMarks: String(assignment?.totalMarks || 100),
    allowLateSubmission: assignment?.allowLateSubmission || false,
    attachments: (assignment?.attachments || []).map((a: any) =>
      typeof a === 'string' ? { url: a, name: a.split('/').pop() || 'file', allowDownload: false }
        : { url: a.url, name: a.name || a.url.split('/').pop() || 'file', allowDownload: a.allowDownload || false }
    ),
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load orgs
  useEffect(() => {
    if (isSuperAdmin) {
      (async () => {
        try { const { data } = await api.get('/schools', { params: { limit: '200' } }); setSchools((data.data || []).filter((s: SchoolBrief) => s.status === 'active')); }
        catch { /* non-fatal */ }
      })();
    }
  }, [isSuperAdmin]);

  // Chained: org → classes
  useEffect(() => {
    if (!form.organizationId) { setClasses([]); setDataLoading(false); return; }
    setClassesLoading(true); setDataLoading(true);
    if (!isEdit) setForm((prev) => ({ ...prev, classId: '', course: '' }));
    (async () => {
      try { const { data } = await api.get('/classes', { params: { schoolId: form.organizationId, limit: '200' } }); setClasses(data.data || []); }
      catch { setClasses([]); } finally { setClassesLoading(false); setDataLoading(false); }
    })();
  }, [form.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chained: class → courses
  useEffect(() => {
    if (!form.organizationId) { setCourses([]); return; }
    if (!form.classId) {
      setCoursesLoading(true);
      const params: any = { limit: '200' }; if (isTeacher) params.my = 'true';
      (async () => {
        try {
          const { data } = await api.get('/courses', { params });
          setCourses((data.data || []).filter((c: any) => !isSuperAdmin || (c.school && (typeof c.school === 'string' ? c.school === form.organizationId : c.school._id === form.organizationId))));
        } catch { setCourses([]); } finally { setCoursesLoading(false); }
      })();
      return;
    }
    setCoursesLoading(true);
    if (!isEdit) setForm((prev) => ({ ...prev, course: '' }));
    const params: any = { classId: form.classId, limit: '200' }; if (isTeacher) params.my = 'true';
    (async () => {
      try { const { data } = await api.get('/courses', { params }); setCourses(data.data || []); }
      catch { setCourses([]); } finally { setCoursesLoading(false); }
    })();
  }, [form.classId, form.organizationId, isTeacher, isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (k: keyof FormData, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files || files.length === 0) return;
    setUploading(true); setError('');
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData(); fd.append('file', file);
        const { data } = await api.post('/assignments/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (data.success && data.data?.url) {
          setForm((prev) => ({ ...prev, attachments: [...prev.attachments, { url: data.data.url, name: data.data.name || data.data.url.split('/').pop() || 'file', allowDownload: data.data.allowDownload || false }] }));
        }
      }
    } catch (err: any) { setError(err.response?.data?.message || 'File upload failed'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const removeAttachment = (i: number) => setForm((p) => ({ ...p, attachments: p.attachments.filter((_, idx) => idx !== i) }));
  const toggleAllowDownload = (i: number) => setForm((p) => ({ ...p, attachments: p.attachments.map((a, idx) => idx === i ? { ...a, allowDownload: !a.allowDownload } : a) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload: any = { title: form.title, description: form.description, course: form.course, classId: form.classId || undefined, startDate: form.startDate || undefined, dueDate: new Date(form.dueDate).toISOString(), totalMarks: Number(form.totalMarks), allowLateSubmission: form.allowLateSubmission, attachments: form.attachments };
      if (isEdit) await api.patch(`/assignments/${assignment!._id}`, payload);
      else await api.post('/assignments', payload);
      onSaved();
      onClose();
    } catch (err: any) { setError(err.response?.data?.message || err.message || 'Failed to save assignment'); }
    finally { setSaving(false); }
  };

  if (dataLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      {/* ── Header Bar ── */}
      <div className="sticky top-0 z-30 bg-[var(--color-surface-primary)] border-b border-[var(--color-border-subtle)] shadow-sm">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Back to Assignments
            </button>
            <div>
              <h1 className="text-lg font-bold text-[var(--color-text-primary)]">{isEdit ? '✏️ Edit Assignment' : '➕ New Assignment'}</h1>
              <p className="text-xs text-[var(--color-text-tertiary)]">{isEdit ? assignment?.title : 'Create a new task for your students'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Form Body ── */}
      <div className="mx-auto max-w-5xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ── Metadata Row (Org / Class / Course) ── */}
          <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">📋 Assignment Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Organization */}
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Organization {isSuperAdmin ? '*' : ''}</label>
                {isSuperAdmin ? (
                  <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" value={form.organizationId} onChange={(e) => update('organizationId', e.target.value)} required>
                    <option value="">-- Select --</option>
                    {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                ) : (
                  <div className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">{schools.find((s) => s._id === form.organizationId)?.name || 'Your Organization'}</div>
                )}
              </div>

              {/* Class */}
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Class / Grade</label>
                <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" value={form.classId} onChange={(e) => update('classId', e.target.value)} disabled={!form.organizationId || classesLoading}>
                  <option value="">{!form.organizationId ? '-- Select org first --' : classesLoading ? 'Loading...' : '-- All Classes --'}</option>
                  {classes.map((c) => <option key={c._id} value={c._id}>{c.title} ({c.section})</option>)}
                </select>
              </div>

              {/* Course */}
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Course *</label>
                <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" value={form.course} onChange={(e) => update('course', e.target.value)} required disabled={!form.organizationId || coursesLoading}>
                  <option value="">{!form.organizationId ? '-- Select org first --' : coursesLoading ? 'Loading...' : '-- Select Course --'}</option>
                  {courses.map((c) => <option key={c._id} value={c._id}>{c.title.en}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Title & Description ── */}
          <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">📝 Content</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Assignment Title *</label>
                <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" value={form.title} onChange={(e) => update('title', e.target.value)} required maxLength={200} placeholder="e.g., Tafsiirka Surah Al-Fatiha Quiz" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Description / Instructions</label>
                <RichTextEditor
                  value={form.description}
                  onChange={(html: string) => update('description', html)}
                  placeholder="Enter assignment instructions or content here..."
                />
              </div>
            </div>
          </div>

          {/* ── Dates & Marks ── */}
          <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">⏱️ Schedule & Scoring</h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Start Date</label>
                <input type="datetime-local" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Due Date *</label>
                <input type="datetime-local" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" value={form.dueDate} onChange={(e) => update('dueDate', e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Total Marks / Points</label>
                <input type="number" min={1} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm" value={form.totalMarks} onChange={(e) => update('totalMarks', e.target.value)} placeholder="100" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                  <input type="checkbox" checked={form.allowLateSubmission} onChange={(e) => update('allowLateSubmission', e.target.checked)} className="rounded border-[var(--color-border-default)] h-4 w-4" />
                  Allow late submission
                </label>
              </div>
            </div>
          </div>

          {/* ── Attachments ── */}
          <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">📎 Attachment Files</h2>

            <label className={`flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed transition-colors cursor-pointer p-8 ${uploading ? 'border-primary-400 bg-primary-50 dark:bg-primary-950/20 opacity-60 pointer-events-none' : 'border-[var(--color-border-default)] hover:border-primary-400 hover:bg-[var(--color-surface-tertiary)]'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const dt = e.dataTransfer; if (dt?.files && fileInputRef.current) { fileInputRef.current.files = dt.files; handleFileUpload({ target: { files: dt.files } } as any); } }}>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt,.zip" className="hidden" onChange={handleFileUpload} />
              <p className="text-3xl mb-2">📤</p>
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">{uploading ? 'Uploading...' : 'Click to browse or drag & drop files'}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">PDF, Images, Docs (max 15 MB each)</p>
            </label>

            {form.attachments.length > 0 && (
              <ul className="mt-4 space-y-2">
                {form.attachments.map((att, i) => {
                  const fileName = att.name || att.url.split('/').pop() || `File ${i + 1}`;
                  return (
                    <li key={i} className="flex flex-col gap-1.5 text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)] rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-2"><span className="truncate flex-1">📎 {fileName}</span><button type="button" onClick={() => removeAttachment(i)} className="text-red-500 hover:text-red-700 font-medium flex-shrink-0">✕</button></div>
                      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={att.allowDownload} onChange={() => toggleAllowDownload(i)} className="rounded border-[var(--color-border-default)] h-3.5 w-3.5" /><span className="text-[10px] text-[var(--color-text-tertiary)]">Allow students to download</span></label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Spacer for sticky footer */}
          <div className="h-24" />
        </form>
      </div>

      {/* ── Sticky Footer Actions ── */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 z-30 bg-[var(--color-surface-primary)] border-t border-[var(--color-border-subtle)] shadow-lg">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || uploading}
              className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50"
            >
              💾 Save as Draft
            </button>
          </div>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving || uploading}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 transition-all shadow-md shadow-emerald-600/20"
          >
            {saving ? 'Saving...' : uploading ? 'Uploading files...' : isEdit ? '✅ Update Assignment' : '✅ Create Assignment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main List Component
// ---------------------------------------------------------------------------

export function AssignmentsManage() {
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<'active' | 'upcoming' | 'past'>(
    () => (localStorage.getItem('assignmentsTab') as any) || 'active'
  );

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AssignmentRecord | undefined>(undefined);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('assignmentsTab', activeTab); }, [activeTab]);

  const fetchAssignments = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/assignments', { params: { tab: activeTab, limit: '100' } }); setAssignments(data.data || []); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to load assignments'); }
    finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this assignment?')) return;
    try { await api.delete(`/assignments/${id}`); setAssignments((prev) => prev.filter((a) => a._id !== id)); }
    catch (err: any) { alert(err.response?.data?.message || 'Failed to delete'); }
  };

  const tabs: { key: 'active' | 'upcoming' | 'past'; label: string; icon: string }[] = [
    { key: 'active', label: 'Active', icon: '🟢' },
    { key: 'upcoming', label: 'Upcoming', icon: '🔵' },
    { key: 'past', label: 'Past / Expired', icon: '⏪' },
  ];

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isOverdue = (dueDate: string) => new Date(dueDate) < new Date();
  const getAttachCount = (attachments: AttachmentItem[] | string[]) => attachments?.length || 0;

  const getStatusPill = (a: AssignmentRecord) => {
    if (a.tab === 'past' || isOverdue(a.dueDate)) return { label: 'Expired', classes: 'bg-red-500 text-white' };
    if (a.tab === 'upcoming') return { label: 'Upcoming', classes: 'bg-blue-500 text-white' };
    return { label: 'Active', classes: 'bg-emerald-500 text-white' };
  };

  // ── Full-page create/edit mode ──
  if (showCreate) {
    return <AssignmentFormPage onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchAssignments(); }} />;
  }
  if (editing) {
    return <AssignmentFormPage assignment={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); fetchAssignments(); }} />;
  }

  // ── List view ──
  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📝 Assignments</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">+ New Assignment</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl bg-[var(--color-surface-tertiary)] p-1 w-fit">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200 ${activeTab === tab.key ? 'bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}`}>
              <span>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>

        {/* Loading / Error / Empty */}
        {loading && <div className="flex min-h-[300px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
        {!loading && error && (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
            <div className="text-center py-12 text-[var(--color-text-tertiary)]"><p className="text-3xl mb-3">⚠️</p><p className="text-sm">{error}</p><button onClick={fetchAssignments} className="mt-4 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700">Retry</button></div>
          </div>
        )}
        {!loading && !error && assignments.length === 0 && (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
            <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-4xl mb-3">📝</p><p className="text-lg font-medium mb-1">No {activeTab} assignments</p><p className="text-sm">Click "+ New Assignment" to create one.</p></div>
          </div>
        )}

        {/* ── Assignment Cards ── */}
        {!loading && !error && assignments.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {assignments.map((a) => {
              const pill = getStatusPill(a);
              const subPct = a.totalStudents && a.totalStudents > 0 ? Math.round(((a.submissionCount || 0) / a.totalStudents) * 100) : 0;
              const subLabel = `${a.submissionCount || 0}/${a.totalStudents || 0}`;
              return (
                <div key={a._id} className="group relative flex flex-col rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">

                  {/* Thumbnail Header */}
                  <div className="relative w-full aspect-video overflow-hidden bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/40 dark:to-primary-800/30">
                    {a.course?.thumbnail ? (
                      <img src={a.course.thumbnail} alt={a.course.title?.en || ''} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><span className="text-5xl opacity-30 select-none">📝</span></div>
                    )}
                    <div className="absolute top-2.5 left-2.5">
                      <span className="rounded-full bg-black/60 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold text-white tracking-wide">{a.course?.title?.en || 'Course'}</span>
                    </div>
                    <div className="absolute top-2.5 right-2.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-sm ${pill.classes}`}>{pill.label}</span>
                    </div>
                    <div className="absolute bottom-2.5 left-2.5 flex gap-1.5">
                      {a.course?.category && <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">{catLabels[a.course.category] || a.course.category}</span>}
                      {a.course?.level && <span className="rounded-full bg-green-100 dark:bg-green-900/40 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:text-green-300">{levelLabels[a.course.level] || a.course.level}</span>}
                    </div>
                    <div className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-0.5 text-xs font-bold text-white">{subPct}%</div>
                  </div>

                  {/* Card Body */}
                  <div className="flex flex-col flex-1 p-4 gap-2.5">
                    {/* Title with menu */}
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-[var(--color-text-primary)] group-hover:text-primary-600 transition-colors flex-1 min-w-0">{a.title}</h3>
                      <div className="relative flex-shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === a._id ? null : a._id); }} className="p-1 rounded-lg hover:bg-[var(--color-surface-tertiary)] transition-colors text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        </button>
                        {openMenuId === a._id && (
                          <div className="absolute right-0 mt-1 w-36 bg-[var(--color-surface-primary)] rounded-xl shadow-lg border border-[var(--color-border-default)] z-20 py-1 overflow-hidden">
                            <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setEditing(a); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> Edit
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleDelete(a._id); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-1 text-[11px] text-[var(--color-text-tertiary)]">
                      {a.course?.school?.name && (<div className="flex items-center gap-2"><svg className="w-3.5 h-3.5 opacity-50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg><span className="truncate">Organization: {a.course.school.name}</span></div>)}
                      {a.class && (<div className="flex items-center gap-2"><svg className="w-3.5 h-3.5 opacity-50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/></svg><span className="truncate">Class: {a.class.title} ({a.class.section})</span></div>)}
                      {a.course?.teacher?.profile && (<div className="flex items-center gap-2"><svg className="w-3.5 h-3.5 opacity-50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg><span className="truncate">Teacher: {a.course.teacher.profile.firstName} {a.course.teacher.profile.lastName}</span></div>)}
                      <div className="flex items-center gap-2"><svg className="w-3.5 h-3.5 opacity-50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span className="truncate">Due: {formatDate(a.dueDate)}{isOverdue(a.dueDate) ? <span className="ml-1 text-red-500 font-semibold">Overdue</span> : ''}</span></div>
                      <div className="flex items-center gap-2"><svg className="w-3.5 h-3.5 opacity-50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>Marks: {a.totalMarks} pts</span></div>
                      {getAttachCount(a.attachments) > 0 && (<div className="flex items-center gap-2"><svg className="w-3.5 h-3.5 opacity-50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg><span>{getAttachCount(a.attachments)} file{getAttachCount(a.attachments) !== 1 ? 's' : ''}</span></div>)}
                    </div>

                    {/* Submissions Progress */}
                    <div className="space-y-1">
                      <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${subPct >= 100 ? 'bg-green-500' : 'bg-primary-500'}`} style={{ width: `${Math.min(subPct, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)]"><span>Submissions: {subLabel}</span></div>
                    </div>
                    <div className="flex-1" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default AssignmentsManage;