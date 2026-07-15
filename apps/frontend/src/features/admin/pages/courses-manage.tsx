/**
 * Course Management — Admin CRUD
 * Modern card-based layout with full course information display
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';
import { VideoGatedSettingsModal, type VideoGatingSettings } from '../components/video-gated-settings-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeacherBrief {
  _id: string;
  teacherId: string;
  profile?: { firstName: string; lastName: string };
  school?: { _id: string; name: string };
}

interface ClassInfo {
  _id: string;
  title: string;
  section: string;
  school?: { _id: string; name: string };
}

interface SchoolInfo {
  _id: string;
  name: string;
}

interface Course {
  _id: string;
  title: { en: string; so: string; ar: string };
  slug: string;
  description?: { en: string; so: string; ar: string };
  category: string;
  level: string;
  duration: number;
  fee: number;
  status: string;
  enrolledStudents: number;
  maxStudents: number;
  thumbnail?: string;
  teacher?: TeacherBrief | null;
  school?: SchoolInfo | null;
  class?: ClassInfo | null;
  startDate?: string;
  createdAt: string;
  accessMode?: 'open' | 'restricted';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const categoryLabels: Record<string, string> = {
  quran: 'Quran',
  fiqh: 'Fiqh',
  aqeedah: 'Aqeedah',
  seerah: 'Seerah',
  arabic: 'Arabic',
  tajweed: 'Tajweed',
  hadith: 'Hadith',
  akhlaq: 'Akhlaq',
};

const levelColors: Record<string, string> = {
  beginner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const statusColors: Record<string, string> = {
  published: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  draft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const categoryColors: Record<string, string> = {
  quran: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  fiqh: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  aqeedah: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  seerah: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  arabic: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  tajweed: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  hadith: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  akhlaq: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
};

const thumbnailFallbacks: Record<string, string> = {
  quran: '📖',
  fiqh: '⚖️',
  aqeedah: '🕌',
  seerah: '📜',
  arabic: '🔤',
  tajweed: '🎙️',
  hadith: '📚',
  akhlaq: '💎',
};

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function CourseModal({
  course,
  onClose,
  onSaved,
}: {
  course?: Course;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!course;
  const [form, setForm] = useState({
    titleEn: course?.title?.en || '',
    category: course?.category || 'quran',
    level: course?.level || 'beginner',
    duration: course?.duration || 8,
    fee: course?.fee || 0,
    maxStudents: course?.maxStudents || 50,
    status: course?.status || 'draft',
    teacher: course?.teacher?._id || '',
    school: course?.school?._id || '',
    classId: course?.class?._id || '',
    thumbnail: course?.thumbnail || '',
    descriptionEn: (course as any)?.description?.en || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Data for dropdowns
  const [teachers, setTeachers] = useState<{ _id: string; profile?: { firstName: string; lastName: string } }[]>([]);
  const [schools, setSchools] = useState<{ _id: string; name: string; status: string }[]>([]);
  const [classes, setClasses] = useState<{ _id: string; title: string; section: string }[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(false);

  // Load schools on mount
  useEffect(() => {
    const load = async () => {
      try {
        const sRes = await api.get('/schools', { params: { limit: '100' } });
        setSchools((sRes.data.data || []).filter((s: any) => s.status === 'active'));
      } catch {
        // Silently fail
      } finally {
        setDataLoading(false);
      }
    };
    load();
  }, []);

  // Load teachers when school changes
  useEffect(() => {
    const loadTeachers = async () => {
      setTeachersLoading(true);
      try {
        const params: any = { limit: '100', status: 'active' };
        if (form.school) {
          params.school = form.school;
        }
        const { data } = await api.get('/teachers', { params });
        setTeachers(data.data || []);
      } catch {
        setTeachers([]);
      } finally {
        setTeachersLoading(false);
      }
    };
    loadTeachers();
  }, [form.school]);

  // Load classes when school changes
  useEffect(() => {
    const loadClasses = async () => {
      if (!form.school) {
        setClasses([]);
        return;
      }
      setClassesLoading(true);
      try {
        const { data } = await api.get('/classes', { params: { schoolId: form.school, limit: '200' } });
        setClasses(data.data || []);
      } catch {
        setClasses([]);
      } finally {
        setClassesLoading(false);
      }
    };
    loadClasses();
  }, [form.school]);

  const update = (field: string, value: string | number) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Reset teacher and class when school changes
      if (field === 'school') {
        next.teacher = '';
        next.classId = '';
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        title: { en: form.titleEn, so: course?.title?.so || '', ar: course?.title?.ar || '' },
        description: {
          en: form.descriptionEn,
          so: (course as any)?.description?.so || '',
          ar: (course as any)?.description?.ar || '',
        },
        category: form.category,
        level: form.level,
        duration: Number(form.duration),
        fee: Number(form.fee),
        teacher: form.teacher || null,
        school: form.school || null,
        class: form.classId || null,
        maxStudents: Number(form.maxStudents),
        status: form.status,
        ...(form.thumbnail ? { thumbnail: form.thumbnail } : {}),
      };

      if (isEdit) {
        await api.patch(`/courses/${course._id}`, payload);
      } else {
        await api.post('/courses', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save course');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Course' : '➕ Create Course'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Thumbnail URL */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Thumbnail URL</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="https://example.com/image.jpg" value={form.thumbnail} onChange={(e) => update('thumbnail', e.target.value)} />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Course Title (English) *</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.titleEn} onChange={(e) => update('titleEn', e.target.value)} required />
          </div>

          {/* Row: Category + Level */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Category</label>
              <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.category} onChange={(e) => update('category', e.target.value)}>
                {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Level</label>
              <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.level} onChange={(e) => update('level', e.target.value)}>
                {['beginner', 'intermediate', 'advanced'].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* School */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Organization *</label>
            <select
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
              value={form.school}
              onChange={(e) => update('school', e.target.value)}
              disabled={dataLoading}
              required={!isEdit}
            >
              <option value="">{dataLoading ? 'Loading...' : '-- Select Organization --'}</option>
              {schools.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Class (cascading) */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Class</label>
            <select
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
              value={form.classId}
              onChange={(e) => update('classId', e.target.value)}
              disabled={!form.school || classesLoading}
            >
              <option value="">
                {!form.school ? '-- Select an organization first --' : classesLoading ? 'Loading classes...' : '-- None --'}
              </option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>{c.title} ({c.section})</option>
              ))}
            </select>
          </div>

          {/* Teacher (cascading) */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Teacher</label>
            <select
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm"
              value={form.teacher}
              onChange={(e) => update('teacher', e.target.value)}
              disabled={!form.school || teachersLoading}
            >
              <option value="">
                {!form.school ? '-- Select an organization first --' : teachersLoading ? 'Loading teachers...' : '-- None --'}
              </option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.profile ? `${t.profile.firstName} ${t.profile.lastName}` : t._id}
                </option>
              ))}
            </select>
          </div>

          {/* Row: Duration + Fee + Capacity */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Duration (weeks)</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={1} value={form.duration} onChange={(e) => update('duration', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Price ($)</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={0} value={form.fee} onChange={(e) => update('fee', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Capacity</label>
              <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={1} value={form.maxStudents} onChange={(e) => update('maxStudents', Number(e.target.value))} />
            </div>
          </div>

          {/* Status (edit mode) */}
          {isEdit && (
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Status</label>
              <select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Component
// ---------------------------------------------------------------------------

interface CourseCardProps {
  course: Course;
  onEdit: (course: Course) => void;
  onDelete: (id: string) => void;
  onDuplicate: (course: Course) => void;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onArchiveRestore: (id: string, currentStatus: string) => void;
  onBuildContent: (course: Course) => void;
  onViewStudents: (course: Course) => void;
  onPreview: (course: Course) => void;
  onSetAccessMode: (course: Course) => void;
  onSetVideoGating: (course: Course) => void;
}

function CourseCard({
  course,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleStatus,
  onArchiveRestore,
  onBuildContent,
  onViewStudents,
  onPreview,
  onSetAccessMode,
  onSetVideoGating,
}: CourseCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  // Calculate dropdown position on open
  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 4,
        left: rect.right - 240,
      });
    }
    setMenuOpen(!menuOpen);
  };

  const teacherName = course.teacher?.profile
    ? `${course.teacher.profile.firstName} ${course.teacher.profile.lastName}`
    : 'Unassigned';

  const schoolName = course.school?.name || '—';
  const className = course.class ? `${course.class.title} (${course.class.section})` : '—';

  const isPublished = course.status === 'published';
  const isArchived = course.status === 'archived';

  const handleAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden flex flex-col">
      {/* Thumbnail */}
      <div className="relative h-40 bg-gradient-to-br from-primary-100 via-primary-50 to-sky-100 dark:from-primary-900/40 dark:via-sky-900/30 dark:to-primary-950/50 flex items-center justify-center">
        {course.thumbnail ? (
          <img src={course.thumbnail} alt={course.title.en} className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl opacity-40 select-none">{thumbnailFallbacks[course.category] || '📚'}</span>
        )}
        {/* Status badge overlay */}
        <span className={`absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${statusColors[course.status] || 'bg-gray-100 text-gray-600'}`}>
          {course.status}
        </span>
      </div>

      {/* Card Body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        {/* Title + Menu */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-[var(--color-text-primary)] leading-snug line-clamp-2 text-base flex-1">
            {course.title.en}
          </h3>
          {/* 3-dot menu */}
          <div className="relative flex-shrink-0">
            <button
              ref={buttonRef}
              onClick={toggleMenu}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
              aria-label="Course actions"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {/* Dropdown Menu — rendered via Portal to avoid overflow clipping */}
            {menuOpen &&
              createPortal(
                <div
                  ref={menuRef}
                  style={{ position: 'fixed', top: menuCoords.top, left: menuCoords.left }}
                  className="w-60 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-xl py-1.5 animate-fade-in origin-top-right"
                  onClick={(e) => e.stopPropagation()}
                >
                {/* Edit */}
                <button
                  onClick={() => handleAction(() => onEdit(course))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"
                >
                  <span className="w-4 text-center flex-shrink-0">✏️</span>
                  <span>Edit Course</span>
                </button>

                {/* Build Content */}
                <button
                  onClick={() => handleAction(() => onBuildContent(course))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"
                >
                  <span className="w-4 text-center flex-shrink-0">🏗️</span>
                  <span>Build Course Content</span>
                </button>

                {/* Course Progression Settings */}
                <button
                  onClick={() => handleAction(() => onSetAccessMode(course))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"
                >
                  <span className="w-4 text-center flex-shrink-0">{course.accessMode === 'restricted' ? '🔒' : '🔓'}</span>
                  <span>Course Progression Settings</span>
                </button>

                {/* Video-Gated Lesson Settings */}
                <button
                  onClick={() => handleAction(() => onSetVideoGating(course))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"
                >
                  <span className="w-4 text-center flex-shrink-0">🎬</span>
                  <span>Video-Gated Lesson Settings</span>
                </button>

                {/* View Enrolled Students */}
                <button
                  onClick={() => handleAction(() => onViewStudents(course))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"
                >
                  <span className="w-4 text-center flex-shrink-0">👥</span>
                  <span>View Enrolled Students</span>
                </button>

                {/* Duplicate */}
                <button
                  onClick={() => handleAction(() => onDuplicate(course))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"
                >
                  <span className="w-4 text-center flex-shrink-0">📋</span>
                  <span>Duplicate Course</span>
                </button>

                <div className="my-1 border-t border-[var(--color-border-subtle)]" />

                {/* Publish / Unpublish */}
                <button
                  onClick={() => handleAction(() => onToggleStatus(course._id, course.status))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"
                >
                  <span className="w-4 text-center flex-shrink-0">{isPublished ? '📥' : '📤'}</span>
                  <span className={isPublished ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {isPublished ? 'Unpublish' : 'Publish'}
                  </span>
                </button>

                {/* Archive / Restore */}
                {!isArchived ? (
                  <button
                    onClick={() => handleAction(() => {
                      if (window.confirm('Archive this course? It will be hidden from students.')) {
                        onArchiveRestore(course._id, course.status);
                      }
                    })}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left"
                  >
                    <span className="w-4 text-center flex-shrink-0">📦</span>
                    <span>Archive</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction(() => onArchiveRestore(course._id, course.status))}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/20 transition-colors text-left"
                  >
                    <span className="w-4 text-center flex-shrink-0">🔄</span>
                    <span>Restore</span>
                  </button>
                )}

                <div className="my-1 border-t border-[var(--color-border-subtle)]" />

                {/* Preview as Student */}
                <button
                  onClick={() => handleAction(() => onPreview(course))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors text-left"
                >
                  <span className="w-4 text-center flex-shrink-0">👁️</span>
                  <span>Preview as Student</span>
                </button>

                {/* Delete */}
                <div className="my-1 border-t border-[var(--color-border-subtle)]" />
                <button
                  onClick={() => handleAction(() => {
                    if (window.confirm('Delete this course permanently? This action cannot be undone.')) {
                      onDelete(course._id);
                    }
                  })}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left"
                >
                  <span className="w-4 text-center flex-shrink-0">🗑️</span>
                  <span>Delete Course</span>
                </button>
              </div>,
                document.body
              )}
          </div>
        </div>

        {/* Meta Pills */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryColors[course.category] || 'bg-gray-100 text-gray-600'}`}>
            {categoryLabels[course.category] || course.category}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${levelColors[course.level] || 'bg-gray-100 text-gray-600'}`}>
            {course.level}
          </span>
        </div>

        {/* Info rows */}
        <div className="space-y-1.5 text-sm flex-1">
          <InfoRow icon="🏛️" label="Organization" value={schoolName} />
          <InfoRow icon="🏛️" label="Class" value={className} />
          <InfoRow icon="👨‍🏫" label="Teacher" value={teacherName} />
          <InfoRow icon="⏱️" label="Duration" value={`${course.duration} weeks`} />
          <InfoRow icon="💰" label="Price" value={course.fee > 0 ? `$${course.fee}` : 'Free'} highlight={course.fee === 0} />
        </div>

        {/* Students progress */}
        <div className="mt-1">
          <div className="flex justify-between text-xs text-[var(--color-text-tertiary)] mb-1">
            <span>Enrollment</span>
            <span>{course.enrolledStudents}/{course.maxStudents}</span>
          </div>
          <div className="w-full h-1.5 bg-[var(--color-surface-tertiary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (course.enrolledStudents / course.maxStudents) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-4 text-center flex-shrink-0">{icon}</span>
      <span className="text-xs text-[var(--color-text-tertiary)] w-16 flex-shrink-0">{label}</span>
      <span className={`text-xs font-medium truncate ${highlight ? 'text-green-600 dark:text-green-400' : 'text-[var(--color-text-primary)]'}`}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Course Progression Settings Modal
// ---------------------------------------------------------------------------

function AccessModeModal({
  course,
  onClose,
  onSave,
}: {
  course: Course;
  onClose: () => void;
  onSave: (id: string, accessMode: 'open' | 'restricted') => Promise<void>;
}) {
  const [selected, setSelected] = useState<'open' | 'restricted'>(course.accessMode || 'open');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(course._id, selected);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save progression settings');
    } finally {
      setSaving(false);
    }
  };

  const options: { value: 'open' | 'restricted'; icon: string; title: string; description: string }[] = [
    {
      value: 'open',
      icon: '🔓',
      title: 'No Restriction',
      description: 'All lessons are unlocked from the start — students can watch them in any order.',
    },
    {
      value: 'restricted',
      icon: '🔒',
      title: 'Restricted Progression',
      description: 'Only the first lesson is unlocked. Each next lesson or quiz unlocks once the previous one is completed (e.g. 95% watched) or the quiz is passed.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">🎯 Course Progression Settings</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">{course.title.en}</p>

        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}

        <div className="space-y-2.5">
          {options.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${
                selected === opt.value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                  : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-tertiary)]'
              }`}
            >
              <input
                type="radio"
                name="accessMode"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <span>{opt.icon}</span> {opt.title}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex gap-2 pt-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CoursesManage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | undefined>(undefined);
  const [accessModeCourse, setAccessModeCourse] = useState<Course | undefined>(undefined);
  const [videoGatedCourse, setVideoGatedCourse] = useState<Course | undefined>(undefined);
  const [videoGatingSettings, setVideoGatingSettings] = useState<VideoGatingSettings | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const fetchCourses = useCallback(async () => {
    try {
      const params: any = { limit: '100' };
      if (statusFilter) params.status = statusFilter;
      if (categoryFilter) params.category = categoryFilter;
      const { data } = await api.get('/courses/admin', { params });
      let results = data.data || [];
      if (search) {
        const s = search.toLowerCase();
        results = results.filter((c: Course) =>
          c.title.en.toLowerCase().includes(s) ||
          (c.teacher?.profile?.firstName || '').toLowerCase().includes(s) ||
          (c.teacher?.profile?.lastName || '').toLowerCase().includes(s) ||
          c.category.toLowerCase().includes(s)
        );
      }
      setCourses(results);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, categoryFilter]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/courses/${id}`);
      setCourses(prev => prev.filter(c => c._id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    try {
      await api.patch(`/courses/${id}`, { status: newStatus });
      setCourses(prev => prev.map(c => c._id === id ? { ...c, status: newStatus } : c));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update course status');
    }
  };

  const handleArchiveRestore = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'archived' ? 'draft' : 'archived';
    try {
      await api.patch(`/courses/${id}`, { status: newStatus });
      setCourses(prev => prev.map(c => c._id === id ? { ...c, status: newStatus } : c));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update course');
    }
  };

  const handleDuplicate = async (course: Course) => {
    if (!window.confirm('Duplicate this course?')) return;
    try {
      const payload: any = {
        title: { en: `${course.title.en} (Copy)`, so: course.title.so || '', ar: course.title.ar || '' },
        description: course.description || { en: '', so: '', ar: '' },
        category: course.category,
        level: course.level,
        duration: course.duration,
        fee: course.fee,
        teacher: course.teacher?._id || null,
        school: course.school?._id || null,
        class: course.class?._id || null,
        maxStudents: course.maxStudents,
      };
      await api.post('/courses', payload);
      await fetchCourses();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to duplicate course');
    }
  };

  const handleBuildContent = (course: Course) => {
    navigate(`/admin/courses/${course._id}/builder`);
  };

  const handleViewStudents = (course: Course) => {
    alert(`View Enrolled Students for: ${course.title.en}\nEnrolled: ${course.enrolledStudents}/${course.maxStudents}`);
  };

  const handlePreview = (course: Course) => {
    navigate(`/admin/courses/${course._id}/preview`);
  };

  const handleSaveAccessMode = async (id: string, accessMode: 'open' | 'restricted') => {
    await api.patch(`/courses/${id}`, { accessMode });
    setCourses((prev) => prev.map((c) => (c._id === id ? { ...c, accessMode } : c)));
  };

  const handleOpenVideoGating = async (course: Course) => {
    setVideoGatedCourse(course);
    setVideoGatingSettings(undefined);
    try {
      const { data } = await api.get(`/courses/${course._id}/video-gating`);
      if (data.data) setVideoGatingSettings(data.data);
    } catch (err: any) {
      // Non-fatal — the modal just opens with default settings instead.
      console.error('Failed to load existing video gating settings:', err);
    }
  };

  const handleSaveVideoGatingSettings = async (settings: VideoGatingSettings) => {
    try {
      if (videoGatedCourse) {
        await api.post(`/courses/${videoGatedCourse._id}/video-gating`, settings);
        setVideoGatedCourse(undefined);
        setVideoGatingSettings(undefined);
        alert('Video-gating settings saved successfully!');
      }
    } catch (err: any) {
      console.error('Failed to save video gating settings:', err);
      throw err;
    }
  };

  if (loading) return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
    </div>
  );

  if (error) return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={fetchCourses} className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700">Retry</button>
      </div>
    </div>
  );

  const publishedCount = courses.filter(c => c.status === 'published').length;
  const draftCount = courses.filter(c => c.status === 'draft').length;
  const archivedCount = courses.filter(c => c.status === 'archived').length;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📚 Manage Courses</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              {courses.length} total — {publishedCount} published, {draftCount} draft, {archivedCount} archived
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
          >
            + Add Course
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{publishedCount}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Published</p>
          </div>
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{draftCount}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">Draft</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 text-center">
            <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{archivedCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Archived</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            placeholder="Search by title, teacher, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <select
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Course Cards Grid */}
        {courses.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
            <div className="text-center py-16 text-[var(--color-text-tertiary)]">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-lg font-medium mb-1">No courses found</p>
              <p className="text-sm">Click "+ Add Course" to create one.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {courses.map(course => (
              <CourseCard
                key={course._id}
                course={course}
                onEdit={setEditingCourse}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onToggleStatus={handleToggleStatus}
                onArchiveRestore={handleArchiveRestore}
                onBuildContent={handleBuildContent}
                onViewStudents={handleViewStudents}
                onPreview={handlePreview}
                onSetAccessMode={setAccessModeCourse}
                onSetVideoGating={handleOpenVideoGating}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CourseModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            fetchCourses();
          }}
        />
      )}

      {editingCourse && (
        <CourseModal
          course={editingCourse}
          onClose={() => setEditingCourse(undefined)}
          onSaved={() => {
            setEditingCourse(undefined);
            fetchCourses();
          }}
        />
      )}

      {accessModeCourse && (
        <AccessModeModal
          course={accessModeCourse}
          onClose={() => setAccessModeCourse(undefined)}
          onSave={handleSaveAccessMode}
        />
      )}

      {videoGatedCourse && (
        <VideoGatedSettingsModal
          courseId={videoGatedCourse._id}
          initialSettings={videoGatingSettings}
          onClose={() => {
            setVideoGatedCourse(undefined);
            setVideoGatingSettings(undefined);
          }}
          onSave={handleSaveVideoGatingSettings}
        />
      )}
    </div>
  );
}

export default CoursesManage;