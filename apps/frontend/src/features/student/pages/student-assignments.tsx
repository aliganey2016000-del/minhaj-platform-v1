/**
 * Student Assignments — Redesigned Course-Style Cards + Submission Modal
 *
 * Tabs: All | Active | Upcoming | Overdue
 */

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseBrief {
  _id: string;
  title: { en: string; so: string; ar: string };
  slug: string;
  category: string;
  thumbnail?: string;
}

interface Assignment {
  _id: string;
  title: string;
  description: string;
  course?: CourseBrief;
  startDate?: string | null;
  dueDate: string;
  totalMarks: number;
  allowLateSubmission: boolean;
  attachments: { url: string; name: string; allowDownload: boolean }[];
  isActive: boolean;
  isUpcoming: boolean;
  isOverdue: boolean;
}

// ---------------------------------------------------------------------------
// L10n helpers
// ---------------------------------------------------------------------------

const catLabels: Record<string, { en: string; so: string; ar: string }> = {
  quran: { en: 'Quran', so: "Qur'aanka", ar: 'القرآن' },
  fiqh: { en: 'Fiqh', so: 'Fiqhiga', ar: 'الفقه' },
  aqeedah: { en: 'Aqeedah', so: 'Cajiidada', ar: 'العقيدة' },
  seerah: { en: 'Seerah', so: 'Siirada', ar: 'السيرة' },
  arabic: { en: 'Arabic', so: 'Carabiga', ar: 'العربية' },
  tajweed: { en: 'Tajweed', so: 'Tajwiidka', ar: 'التجويد' },
  hadith: { en: 'Hadith', so: 'Xadiithka', ar: 'الحديث' },
  akhlaq: { en: 'Akhlaq', so: 'Akhlaaqda', ar: 'الأخلاق' },
};

// ---------------------------------------------------------------------------
// Detail Modal
// ---------------------------------------------------------------------------

function AssignmentDetailModal({
  assignment,
  onClose,
  onSubmitted,
}: {
  assignment: Assignment;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';

  const courseName =
    assignment.course?.title?.[lang] ||
    assignment.course?.title?.en ||
    '—';

  const [answer, setAnswer] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch file via axios (authenticated) → create Blob URL for iframe ──
  const viewFileWithAuth = async (attachmentIndex: number) => {
    setLoadingFile(true);
    setError('');
    try {
      const url = `/assignments/materials/${attachmentIndex}/view?assignmentId=${assignment._id}`;
      const res = await api.get(url, { responseType: 'blob' });
      // Preserve the server's Content-Type so the browser knows how to render
      // (e.g. 'application/pdf' → native PDF viewer, 'image/png' → image)
      const contentType = String(res.headers['content-type'] || 'application/octet-stream');
      const blob = new Blob([res.data], { type: contentType });
      const objectUrl = URL.createObjectURL(blob);
      setViewingFile(objectUrl);
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Failed to load file preview'
      );
    } finally {
      setLoadingFile(false);
    }
  };

  // ── Handle file selection ──
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setUploadedUrl(null);
    setError('');
  };

  // ── Upload file to server ──
  const uploadFile = async (f: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', f);
    const { data } = await api.post('/assignments/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (!data.success || !data.data?.url) throw new Error('Upload failed');
    return data.data.url;
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (!answer.trim() && !file) {
      setError(
        lang === 'so'
          ? 'Fadlan qor jawaab ama soo geli fayl.'
          : lang === 'ar'
            ? 'يرجى كتابة إجابة أو رفع ملف.'
            : 'Please write an answer or upload a file.'
      );
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let fileUrl = uploadedUrl;
      if (file && !fileUrl) {
        setUploading(true);
        fileUrl = await uploadFile(file);
        setUploadedUrl(fileUrl);
        setUploading(false);
      }

      // Submit the assignment work
      await api.post(`/assignments/${assignment._id}/submit`, {
        answer: answer.trim() || undefined,
        fileUrl: fileUrl || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        onSubmitted();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Submission failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface-primary)] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="p-6 pb-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">
            {courseName}
          </p>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
            {assignment.title}
          </h2>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {assignment.totalMarks}{' '}
            {lang === 'so'
              ? 'Dhibcood'
              : lang === 'ar'
                ? 'درجة'
                : 'points'}
            {' · '}
            {lang === 'so'
              ? 'Kama Dambays:'
              : lang === 'ar'
                ? 'الموعد:'
                : 'Due:'}{' '}
            {new Date(assignment.dueDate).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          {assignment.isOverdue && (
            <span className="mt-2 inline-block rounded-full bg-red-100 dark:bg-red-900/30 px-3 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
              ⚠️{' '}
              {lang === 'so'
                ? 'Dhaafay'
                : lang === 'ar'
                  ? 'متأخر'
                  : 'Overdue'}
            </span>
          )}
        </div>

        {/* ── File Viewer Overlay ── */}
        {viewingFile && (
          <div className="absolute inset-0 z-10 flex flex-col bg-[var(--color-surface-primary)] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]">
              <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                📄 {lang === 'so' ? 'Daawashada Faylka' : lang === 'ar' ? 'عرض الملف' : 'File Viewer'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (viewingFile.startsWith('blob:')) URL.revokeObjectURL(viewingFile);
                  setViewingFile(null);
                }}
                className="rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1 text-[10px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              >
                {lang === 'so' ? 'Xir' : lang === 'ar' ? 'إغلاق' : 'Close Viewer'}
              </button>
            </div>
            <iframe
              src={viewingFile}
              className="flex-1 w-full border-0"
              title="File Viewer"
            />
          </div>
        )}

        {/* ── Success state ── */}
        {success ? (
          <div className="p-6 text-center">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-lg font-bold text-emerald-600">
              {lang === 'so'
                ? 'Si guul leh ayaa loo gudbiyey!'
                : lang === 'ar'
                  ? 'تم التسليم بنجاح!'
                  : 'Submitted successfully!'}
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* ── Teacher Materials ── */}
            {assignment.attachments.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                  📎{' '}
                  {lang === 'so'
                    ? 'Qalabka Macallinka'
                    : lang === 'ar'
                      ? 'مواد المعلم'
                      : 'Teacher Materials'}
                </h3>
                <ul className="space-y-1.5">
                  {(assignment.attachments as any[]).map((att: any, i: number) => {
                    // Normalize: legacy string attachments → object shape
                    const normalized =
                      typeof att === 'string'
                        ? { url: att, name: att.split('/').pop() || `File ${i + 1}`, allowDownload: false }
                        : att;
                    const fileName = normalized.name || normalized.url.split('/').pop() || `File ${i + 1}`;
                    const viewUrl = `/api/v1/assignments/materials/${i}/view?assignmentId=${assignment._id}`;
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-tertiary)] px-4 py-2.5"
                      >
                        <span className="flex-1 truncate text-xs text-[var(--color-text-secondary)]">
                          📄 {fileName}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => viewFileWithAuth(i)}
                            disabled={loadingFile}
                            className="rounded-lg bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                          >
                            {loadingFile
                              ? '...'
                              : lang === 'so'
                                ? 'Eeg'
                                : lang === 'ar'
                                  ? 'عرض'
                                  : 'View'}
                          </button>
                          {att.allowDownload && (
                            <a
                              href={viewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                            >
                              {lang === 'so'
                                ? 'Soo deji'
                                : lang === 'ar'
                                  ? 'تحميل'
                                  : 'Download'}
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* ── Answer Textarea ── */}
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">
                ✍️{' '}
                {lang === 'so'
                  ? 'Qor jawaabtaada'
                  : lang === 'ar'
                    ? 'اكتب إجابتك'
                    : 'Write your answer'}
              </label>
              <textarea
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm min-h-[120px] resize-y"
                placeholder={
                  lang === 'so'
                    ? 'Halkan ku qor jawaabtaada...'
                    : lang === 'ar'
                      ? 'اكتب إجابتك هنا...'
                      : 'Type your answer here...'
                }
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setError('');
                }}
              />
            </div>

            {/* ── File Upload ── */}
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">
                📂{' '}
                {lang === 'so'
                  ? 'Soo geli faylka shaqada'
                  : lang === 'ar'
                    ? 'رفع ملف العمل'
                    : 'Upload your work file'}
              </label>

              {/* If file already picked & uploaded, show success */}
              {uploadedUrl ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white text-sm">
                    ✓
                  </span>
                  <span className="flex-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate">
                    {uploadedUrl.split('/').pop() || 'Uploaded file'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setUploadedUrl(null);
                      if (fileInputRef.current)
                        fileInputRef.current.value = '';
                    }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              ) : file ? (
                /* File picked but not uploaded yet — show pending state */
                <div className="flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                  <span className="flex-1 text-xs font-medium text-amber-700 dark:text-amber-300 truncate">
                    📄 {file.name}
                  </span>
                  <span className="text-[10px] text-amber-600">
                    {lang === 'so'
                      ? 'Waxaa la soo gelin doonaa marka la gudbiyo'
                      : lang === 'ar'
                        ? 'سيتم الرفع عند التسليم'
                        : 'Will upload on submit'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current)
                        fileInputRef.current.value = '';
                    }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                /* Drag-and-drop zone */
                <label
                  className={`flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed transition-colors cursor-pointer p-5 ${
                    uploading
                      ? 'border-primary-400 bg-primary-50 dark:bg-primary-950/20 pointer-events-none opacity-60'
                      : 'border-[var(--color-border-default)] hover:border-emerald-400 hover:bg-[var(--color-surface-tertiary)]'
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dt = e.dataTransfer;
                    if (dt?.files?.[0]) {
                      setFile(dt.files[0]);
                      setError('');
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt,.zip"
                    className="hidden"
                    onChange={handleFilePick}
                  />
                  <p className="text-2xl mb-1">📤</p>
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {uploading
                      ? lang === 'so'
                        ? 'Soo gelinta...'
                        : lang === 'ar'
                          ? 'جار الرفع...'
                          : 'Uploading...'
                      : lang === 'so'
                        ? 'Guji ama jiid faylka halkan'
                        : lang === 'ar'
                          ? 'انقر أو اسحب الملف هنا'
                          : 'Click or drag file here'}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                    PDF, Images, Docs (max 15 MB)
                  </p>
                </label>
              )}
            </div>

            {/* ── Error ── */}
            {error && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* ── Actions ── */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors"
              >
                {lang === 'so'
                  ? 'Ka Noqo'
                  : lang === 'ar'
                    ? 'إلغاء'
                    : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || uploading}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 transition-all shadow-sm"
              >
                {submitting
                  ? lang === 'so'
                    ? 'Gudbinta...'
                    : lang === 'ar'
                      ? 'جار التسليم...'
                      : 'Submitting...'
                  : uploading
                    ? lang === 'so'
                      ? 'Soo gelinta Faylka...'
                      : lang === 'ar'
                        ? 'جار رفع الملف...'
                        : 'Uploading file...'
                    : lang === 'so'
                      ? 'Gudbi Shaqada'
                      : lang === 'ar'
                        ? 'تسليم الواجب'
                        : 'Submit Assignment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StudentAssignments() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'overdue'>('all');
  const [selected, setSelected] = useState<Assignment | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/assignments/my');
        setAssignments(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || t('error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  // ── Client-side filtering ──
  const filtered = assignments.filter((a) => {
    if (filter === 'active') return a.isActive;
    if (filter === 'upcoming') return a.isUpcoming;
    if (filter === 'overdue') return a.isOverdue;
    return true;
  });

  // ── Counts ──
  const activeCount = assignments.filter((a) => a.isActive).length;
  const upcomingCount = assignments.filter((a) => a.isUpcoming).length;
  const overdueCount = assignments.filter((a) => a.isOverdue).length;

  const getCourseTitle = (course: CourseBrief | undefined) => {
    if (!course) return '';
    return course.title?.[lang] || course.title?.en || '';
  };

  const getCategory = (cat: string) =>
    catLabels[cat]?.[lang] || catLabels[cat]?.en || cat;

  // ── Status badge for card overlay ──
  const getStatusBadge = (a: Assignment) => {
    if (a.isOverdue) {
      return {
        classes:
          'rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm',
        label:
          lang === 'so' ? '⚠️ Dhaafay' : lang === 'ar' ? '⚠️ متأخر' : '⚠️ Overdue',
      };
    }
    if (a.isActive) {
      return {
        classes:
          'rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm',
        label:
          lang === 'so' ? '🟢 Firfircoon' : lang === 'ar' ? '🟢 نشط' : '🟢 Active',
      };
    }
    if (a.isUpcoming) {
      return {
        classes:
          'rounded-full bg-blue-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm',
        label:
          lang === 'so' ? '⏳ Soo socda' : lang === 'ar' ? '⏳ قادم' : '⏳ Upcoming',
      };
    }
    return {
      classes:
        'rounded-full bg-gray-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm',
      label:
        lang === 'so'
          ? '✅ Dhammeystiran'
          : lang === 'ar'
            ? '✅ مكتمل'
            : '✅ Completed',
    };
  };

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" />
      </div>
    );
  if (error)
    return (
      <div className="text-center py-20">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white"
        >
          {t('retry')}
        </button>
      </div>
    );

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* ── Page Header ── */}
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
            📝 {t('assignments')}
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {assignments.length} {t('total')} — {activeCount}{' '}
            {lang === 'so' ? 'Firfircoon' : lang === 'ar' ? 'نشط' : 'Active'},{' '}
            {upcomingCount} {t('upcoming')}, {overdueCount} {t('overdue')}
          </p>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label={lang === 'so' ? 'Dhammaan' : lang === 'ar' ? 'الكل' : 'All'}
            value={assignments.length}
            color="from-gray-50 to-gray-100 dark:from-gray-800/20 dark:to-gray-800/30"
            textColor="text-gray-700 dark:text-gray-300"
            border="border-gray-200 dark:border-gray-700"
          />
          <StatCard
            label={lang === 'so' ? 'Firfircoon' : lang === 'ar' ? 'نشط' : 'Active'}
            value={activeCount}
            color="from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20"
            textColor="text-green-700 dark:text-green-300"
            border="border-green-200 dark:border-green-800"
          />
          <StatCard
            label={t('upcoming')}
            value={upcomingCount}
            color="from-blue-50 to-sky-50 dark:from-blue-950/20 dark:to-sky-950/20"
            textColor="text-blue-700 dark:text-blue-300"
            border="border-blue-200 dark:border-blue-800"
          />
          <StatCard
            label={t('overdue')}
            value={overdueCount}
            color="from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20"
            textColor="text-red-700 dark:text-red-300"
            border="border-red-200 dark:border-red-800"
          />
        </div>

        {/* ── Filter Tabs ── */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'upcoming', 'overdue'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                filter === f
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
              }`}
            >
              {f === 'all'
                ? lang === 'so'
                  ? 'Dhammaan'
                  : lang === 'ar'
                    ? 'الكل'
                    : 'All'
                : f === 'active'
                  ? lang === 'so'
                    ? 'Firfircoon'
                    : lang === 'ar'
                      ? 'نشط'
                      : 'Active'
                  : f === 'upcoming'
                    ? t('upcoming')
                    : t('overdue')}
            </button>
          ))}
        </div>

        {/* ── Empty State ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">📝</p>
            <p className="text-lg">
              {lang === 'so'
                ? 'Wax xog ah ma jiraan'
                : lang === 'ar'
                  ? 'لا توجد بيانات'
                  : 'No assignments'}
            </p>
          </div>
        ) : (
          /* ── Assignment Cards Grid (course-card style) ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((a) => {
              const badge = getStatusBadge(a);
              return (
                <div
                  key={a._id}
                  className="group relative flex flex-col rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                >
                  {/* ── Thumbnail Header ── */}
                  <div className="relative w-full aspect-video overflow-hidden bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/30">
                    {a.course?.thumbnail ? (
                      <img
                        src={a.course.thumbnail}
                        alt={getCourseTitle(a.course)}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl opacity-20 select-none">📝</span>
                      </div>
                    )}
                    {/* Course name badge — top left */}
                    <div className="absolute top-2.5 left-2.5">
                      <span className="rounded-full bg-black/60 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold text-white tracking-wide">
                        {getCourseTitle(a.course)}
                      </span>
                    </div>
                    {/* Status badge — top right */}
                    <div className="absolute top-2.5 right-2.5">
                      <span className={badge.classes}>{badge.label}</span>
                    </div>
                    {/* Category — bottom left */}
                    {a.course?.category && (
                      <div className="absolute bottom-2.5 left-2.5 rounded-full bg-white/90 dark:bg-black/40 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-primary)]">
                        {getCategory(a.course.category)}
                      </div>
                    )}
                  </div>

                  {/* ── Card Body ── */}
                  <div className="flex flex-col flex-1 p-4 gap-3">
                    {/* Title */}
                    <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-[var(--color-text-primary)]">
                      {a.title}
                    </h3>

                    {/* Description */}
                    {a.description && (
                      <p className="text-xs text-[var(--color-text-tertiary)] line-clamp-2 leading-relaxed">
                        {a.description}
                      </p>
                    )}

                    {/* Metrics grid */}
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                      <div className="flex flex-col items-center rounded-lg bg-[var(--color-surface-tertiary)] py-1.5">
                        <span className="text-xs font-bold text-[var(--color-text-primary)]">
                          📅
                        </span>
                        <span className="truncate max-w-[60px]">
                          {new Date(a.dueDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg bg-[var(--color-surface-tertiary)] py-1.5">
                        <span className="text-xs font-bold text-[var(--color-text-primary)]">
                          🏆
                        </span>
                        <span>
                          {a.totalMarks}{' '}
                          {lang === 'so'
                            ? 'Dhib'
                            : lang === 'ar'
                              ? 'درجة'
                              : 'pts'}
                        </span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg bg-[var(--color-surface-tertiary)] py-1.5">
                        <span className="text-xs font-bold text-[var(--color-text-primary)]">
                          📎
                        </span>
                        <span>
                          {a.attachments.length}{' '}
                          {lang === 'so'
                            ? 'Fayl'
                            : lang === 'ar'
                              ? 'ملف'
                              : 'files'}
                        </span>
                      </div>
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* ── Action Button ── */}
                    <button
                      onClick={() => setSelected(a)}
                      className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-sm hover:shadow-md"
                    >
                      {lang === 'so'
                        ? '🏗️ Eeg & Gudbi Shaqada'
                        : lang === 'ar'
                          ? '🏗️ عرض وتسليم العمل'
                          : '🏗️ View & Submit Work'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Detail Modal ── */}
        {selected && (
          <AssignmentDetailModal
            assignment={selected}
            onClose={() => setSelected(null)}
            onSubmitted={() => {
              // Refresh list after submission
              setAssignments((prev) =>
                prev.map((a) =>
                  a._id === selected._id
                    ? { ...a, isActive: false, isOverdue: false }
                    : a
                )
              );
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Reusable Stat Card ──
function StatCard({
  label,
  value,
  color,
  textColor,
  border,
}: {
  label: string;
  value: number;
  color: string;
  textColor: string;
  border: string;
}) {
  return (
    <div
      className={`rounded-xl border ${border} bg-gradient-to-br ${color} p-4 text-center`}
    >
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
    </div>
  );
}

export default StudentAssignments;