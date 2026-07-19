/**
 * Student Assignment Detail — Full-page dedicated view
 *
 * Route: /student/assignments/:assignmentId
 *
 * Default view: Full-width assignment instructions with teacher materials.
 * Submission view: Toggled via "Submit Your Work" button — full-page form with
 *   rich-text answer field, drag-and-drop file upload, and final submit action.
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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

interface Attachment {
  url: string;
  name: string;
  allowDownload: boolean;
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
  attachments: Attachment[] | string[];
  isActive: boolean;
  isUpcoming: boolean;
  isOverdue: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StudentAssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // View toggle: false = instructions, true = full-page submission
  const [showSubmission, setShowSubmission] = useState(false);

  // Submission state
  const [answer, setAnswer] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch assignment ──
  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/assignments/${assignmentId}`);
        setAssignment(data.data || data);
      } catch (err: any) {
        setError(err.response?.data?.message || t('error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [assignmentId, t]);

  // ── View file via authenticated blob ──
  const viewFileWithAuth = async (attachmentIndex: number) => {
    setLoadingFile(true);
    try {
      const url = `/assignments/materials/${attachmentIndex}/view?assignmentId=${assignment!._id}`;
      const res = await api.get(url, { responseType: 'blob' });
      const contentType = String(res.headers['content-type'] || 'application/octet-stream');
      const blob = new Blob([res.data], { type: contentType });
      const objectUrl = URL.createObjectURL(blob);
      setViewingFile(objectUrl);
    } catch {
      setSubmitError('Failed to load file preview');
    } finally {
      setLoadingFile(false);
    }
  };

  // ── File handling ──
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setUploadedUrl(null);
    setSubmitError('');
  };

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
      setSubmitError(
        lang === 'so'
          ? 'Fadlan qor jawaab ama soo geli fayl.'
          : lang === 'ar'
            ? 'يرجى كتابة إجابة أو رفع ملف.'
            : 'Please write an answer or upload a file.'
      );
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      let fileUrl = uploadedUrl;
      if (file && !fileUrl) {
        setUploading(true);
        fileUrl = await uploadFile(file);
        setUploadedUrl(fileUrl);
        setUploading(false);
      }

      await api.post(`/assignments/${assignment!._id}/submit`, {
        answer: answer.trim() || undefined,
        fileUrl: fileUrl || undefined,
      });

      setSuccess(true);
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
      </div>
    );
  }

  // ── Error ──
  if (error || !assignment) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || 'Assignment not found'}</p>
          <Link to="/student/assignments" className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white hover:bg-primary-700 transition-colors">
            {lang === 'so' ? 'Ku noqo Shaqooyinka' : lang === 'ar' ? 'العودة للواجبات' : 'Back to Assignments'}
          </Link>
        </div>
      </div>
    );
  }

  const courseName = assignment.course?.title?.[lang] || assignment.course?.title?.en || '—';
  const isDownloadable = (att: any) =>
    typeof att === 'object' && (att as Attachment).allowDownload;

  // ── Shared file upload UI (used in both instructions + submission views) ──
  const renderFileUploadZone = (large = false) => (
    <div>
      <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5 block">
        📂 {lang === 'so' ? 'Soo geli faylka shaqada' : lang === 'ar' ? 'رفع ملف العمل' : 'Upload your work file'}
      </label>

      {uploadedUrl ? (
        <div className={`flex items-center gap-3 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 ${large ? 'px-5 py-4' : 'px-4 py-3'}`}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white text-sm">✓</span>
          <span className="flex-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate">{uploadedUrl.split('/').pop() || 'Uploaded file'}</span>
          <button type="button" onClick={() => { setFile(null); setUploadedUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-xs text-red-500 hover:text-red-700">✕</button>
        </div>
      ) : file ? (
        <div className={`flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 ${large ? 'px-5 py-4' : 'px-4 py-3'}`}>
          <span className="flex-1 text-xs font-medium text-amber-700 dark:text-amber-300 truncate">📄 {file.name}</span>
          <span className="text-[10px] text-amber-600">{lang === 'so' ? 'Waxaa la soo gelin doonaa marka la gudbiyo' : lang === 'ar' ? 'سيتم الرفع عند التسليم' : 'Will upload on submit'}</span>
          <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-xs text-red-500 hover:text-red-700">✕</button>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed transition-colors cursor-pointer ${uploading ? 'border-primary-400 bg-primary-50 dark:bg-primary-950/20 pointer-events-none opacity-60' : 'border-[var(--color-border-default)] hover:border-emerald-400 hover:bg-[var(--color-surface-tertiary)]'} ${large ? 'p-8' : 'p-4'}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const dt = e.dataTransfer; if (dt?.files?.[0]) { setFile(dt.files[0]); setSubmitError(''); } }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt,.zip" className="hidden" onChange={handleFilePick} />
          <p className={`${large ? 'text-3xl' : 'text-xl'} mb-1`}>📤</p>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">{uploading ? 'Uploading...' : lang === 'so' ? 'Guji ama jiid faylka halkan' : lang === 'ar' ? 'انقر أو اسحب الملف هنا' : 'Click or drag file here'}</p>
          <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">PDF, Images, Docs (max 15 MB)</p>
        </label>
      )}
    </div>
  );

  // ── Shared submit button ──
  const renderSubmitButton = (fullWidth = true) => (
    <button
      type="button"
      onClick={handleSubmit}
      disabled={submitting || uploading}
      className={`rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 transition-all shadow-md shadow-emerald-600/20 ${fullWidth ? 'w-full' : ''}`}
    >
      {submitting
        ? lang === 'so' ? 'Gudbinta...' : lang === 'ar' ? 'جار التسليم...' : 'Submitting...'
        : uploading
          ? lang === 'so' ? 'Soo gelinta Faylka...' : lang === 'ar' ? 'جار رفع الملف...' : 'Uploading file...'
          : lang === 'so' ? 'Gudbi Shaqada' : lang === 'ar' ? 'تسليم الواجب' : 'Submit Assignment'}
    </button>
  );

  // ================================================================
  // FULL-PAGE SUBMISSION VIEW
  // ================================================================
  if (showSubmission) {
    return (
      <div className="py-6 lg:py-10 relative">
        {/* ── Back to Instructions ── */}
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => { setShowSubmission(false); setSuccess(false); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            {lang === 'so' ? 'Ku noqo Tilmaamaha' : lang === 'ar' ? 'العودة للتعليمات' : 'Back to Instructions'}
          </button>
        </div>

        {/* Success state */}
        {success ? (
          <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-10 shadow-card text-center">
            <p className="text-6xl mb-4">✅</p>
            <p className="text-xl font-bold text-emerald-600 mb-6">
              {lang === 'so' ? 'Si guul leh ayaa loo gudbiyey!' : lang === 'ar' ? 'تم التسليم بنجاح!' : 'Submitted successfully!'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => { setShowSubmission(false); setSuccess(false); }}
                className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
              >
                {lang === 'so' ? 'Ku noqo Tilmaamaha' : lang === 'ar' ? 'العودة للتعليمات' : 'Back to Instructions'}
              </button>
              <Link
                to="/student/assignments"
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                {lang === 'so' ? 'Ku noqo Shaqooyinka' : lang === 'ar' ? 'العودة للواجبات' : 'Back to Assignments'}
              </Link>
            </div>
          </div>
        ) : (
          /* ── Full-Width Submission Form ── */
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Assignment context header */}
            <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">{courseName}</p>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{assignment.title}</h1>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                {lang === 'so' ? 'Gudbinta Shaqada' : lang === 'ar' ? 'تسليم الواجب' : 'Submit Your Work'}
              </p>
            </div>

            {/* Write your answer — full-width rich text area */}
            <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
              <label className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4 block">
                ✍️ {lang === 'so' ? 'Qor jawaabtaada' : lang === 'ar' ? 'اكتب إجابتك' : 'Write your answer'}
              </label>
              <textarea
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm min-h-[280px] resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-shadow"
                placeholder={lang === 'so' ? 'Halkan ku qor jawaabtaada...' : lang === 'ar' ? 'اكتب إجابتك هنا...' : 'Type your answer here...'}
                value={answer}
                onChange={(e) => { setAnswer(e.target.value); setSubmitError(''); }}
              />
            </div>

            {/* Upload your work file — large drag-and-drop zone */}
            <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
              <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4">
                📂 {lang === 'so' ? 'Soo geli faylka shaqada' : lang === 'ar' ? 'رفع ملف العمل' : 'Upload your work file'}
              </h2>
              {renderFileUploadZone(true)}
            </div>

            {/* Error */}
            {submitError && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-xl px-4 py-3">{submitError}</p>
            )}

            {/* Submit Assignment button */}
            <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
              {renderSubmitButton(true)}
            </div>
          </div>
        )}

        {/* ── File Viewer Overlay ── */}
        {viewingFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { URL.revokeObjectURL(viewingFile); setViewingFile(null); }}>
            <div className="bg-[var(--color-surface-primary)] rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]">
                <span className="text-xs font-semibold text-[var(--color-text-primary)]">📄 {lang === 'so' ? 'Daawashada Faylka' : lang === 'ar' ? 'عرض الملف' : 'File Viewer'}</span>
                <button type="button" onClick={() => { URL.revokeObjectURL(viewingFile); setViewingFile(null); }} className="rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1 text-[10px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">
                  {lang === 'so' ? 'Xir' : lang === 'ar' ? 'إغلاق' : 'Close Viewer'}
                </button>
              </div>
              <iframe src={viewingFile} className="flex-1 w-full border-0" title="File Viewer" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================================================================
  // DEFAULT: FULL-WIDTH INSTRUCTIONS VIEW (NO RIGHT SIDEBAR)
  // ================================================================
  return (
    <div className="py-6 lg:py-10 relative">
      {/* ── Top Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <Link
          to="/student/assignments"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          {lang === 'so' ? 'Ku noqo Shaqooyinka' : lang === 'ar' ? 'العودة للواجبات' : 'Back to Assignments'}
        </Link>
      </div>

      {/* ── Full-Width Single Column ── */}
      <div className="space-y-6">
        {/* Assignment Meta Header — with Submit button in top-right */}
        <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">{courseName}</p>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{assignment.title}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-[var(--color-text-tertiary)]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  🏆 {assignment.totalMarks} {lang === 'so' ? 'Dhibcood' : lang === 'ar' ? 'درجة' : 'points'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/30 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                  📅 {lang === 'so' ? 'Kama Dambays:' : lang === 'ar' ? 'الموعد:' : 'Due:'}{' '}
                  {new Date(assignment.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {assignment.isOverdue && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-3 py-1 text-xs font-bold text-red-700 dark:text-red-300">⚠️ {lang === 'so' ? 'Dhaafay' : lang === 'ar' ? 'متأخر' : 'Overdue'}</span>
                )}
                {assignment.isActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-300">🟢 {lang === 'so' ? 'Firfircoon' : lang === 'ar' ? 'نشط' : 'Active'}</span>
                )}
              </div>
            </div>

            {/* ── "Submit Your Work" Header Action Button ── */}
            <div className="flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowSubmission(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-md shadow-emerald-600/20"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {lang === 'so' ? 'Gudbi Shaqada' : lang === 'ar' ? 'تسليم الواجب' : 'Submit Your Work'}
              </button>
            </div>
          </div>
        </div>

        {/* Rich Description — full width */}
        {assignment.description && (
          <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4">
              📝 {lang === 'so' ? 'Faahfaahinta Shaqada' : lang === 'ar' ? 'تفاصيل الواجب' : 'Assignment Instructions'}
            </h2>
            <div
              className="prose prose-slate prose-sm dark:prose-invert max-w-none
                [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-semibold [&_p]:mb-2
                [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                [&_img]:rounded-lg [&_img]:max-w-full
                [&_blockquote]:border-l-4 [&_blockquote]:border-primary-400 [&_blockquote]:pl-3 [&_blockquote]:italic
                [&_pre]:bg-slate-100 [&_pre]:dark:bg-slate-800/50 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto
                [&_code]:bg-slate-100 [&_code]:dark:bg-slate-800/50 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono
                [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--color-border-default)] [&_td]:p-2
                [&_th]:border [&_th]:border-[var(--color-border-default)] [&_th]:p-2 [&_th]:bg-[var(--color-surface-tertiary)] [&_th]:text-left"
              dangerouslySetInnerHTML={{ __html: assignment.description }}
            />
          </div>
        )}

        {/* Teacher Materials — full width */}
        {assignment.attachments.length > 0 && (
          <div className="bg-[var(--color-surface-primary)] rounded-2xl border border-[var(--color-border-default)] p-6 shadow-card">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4">
              📎 {lang === 'so' ? 'Qalabka Macallinka' : lang === 'ar' ? 'مواد المعلم' : 'Teacher Materials'}
            </h2>
            <ul className="space-y-2">
              {(assignment.attachments as any[]).map((att: any, i: number) => {
                const normalized = typeof att === 'string' ? { url: att, name: att.split('/').pop() || `File ${i + 1}`, allowDownload: false } : att;
                const fileName = normalized.name || normalized.url?.split('/').pop() || `File ${i + 1}`;
                return (
                  <li key={i} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-tertiary)] px-4 py-3">
                    <span className="flex-1 truncate text-xs text-[var(--color-text-secondary)]">📄 {fileName}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => viewFileWithAuth(i)}
                        disabled={loadingFile}
                        className="rounded-lg bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                      >
                        {loadingFile ? '...' : lang === 'so' ? 'Eeg' : lang === 'ar' ? 'عرض' : 'View'}
                      </button>
                      {isDownloadable(att) && (
                        <a
                          href={`/api/v1/assignments/materials/${i}/view?assignmentId=${assignment._id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                        >
                          {lang === 'so' ? 'Soo deji' : lang === 'ar' ? 'تحميل' : 'Download'}
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* ── File Viewer Overlay ── */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { URL.revokeObjectURL(viewingFile); setViewingFile(null); }}>
          <div className="bg-[var(--color-surface-primary)] rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]">
              <span className="text-xs font-semibold text-[var(--color-text-primary)]">📄 {lang === 'so' ? 'Daawashada Faylka' : lang === 'ar' ? 'عرض الملف' : 'File Viewer'}</span>
              <button type="button" onClick={() => { URL.revokeObjectURL(viewingFile); setViewingFile(null); }} className="rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1 text-[10px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">
                {lang === 'so' ? 'Xir' : lang === 'ar' ? 'إغلاق' : 'Close Viewer'}
              </button>
            </div>
            <iframe src={viewingFile} className="flex-1 w-full border-0" title="File Viewer" />
          </div>
        </div>
      )}
    </div>
  );
}

export default StudentAssignmentDetail;