import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  MessageSquare,
  Save,
  Search,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface Submission {
  _id: string;
  studentId: string;
  studentName: string;
  studentAvatar?: string;
  assignmentTitle: string;
  assignmentId: string;
  maxScore: number;
  rubric?: { criteria: string; maxPoints: number }[];
  submittedAt: string;
  status: 'submitted' | 'graded' | 'returned';
  score?: number;
  feedback?: string;
  content?: string;
  files?: { name: string; url: string; type: string }[];
}

interface CourseOption {
  _id: string;
  title: { en: string } | string;
}

type Filter = 'submitted' | 'graded' | 'all';

const labels = {
  en: {
    title: 'Gradebook',
    subtitle: 'Review submissions and record grades',
    course: 'Course',
    selectCourse: 'Select a course',
    new: 'New',
    graded: 'Graded',
    all: 'All',
    search: 'Search student or assignment...',
    student: 'Student',
    assignment: 'Assignment',
    submitted: 'Submitted',
    score: 'Score',
    action: 'Action',
    grade: 'Grade',
    view: 'View',
    noCourse: 'Select a course to begin',
    noSubmissions: 'No submissions found',
    noSubmissionsHint: 'Try another status filter or check another course.',
    details: 'Submission details',
    feedback: 'Feedback',
    feedbackPlaceholder: 'Write feedback for the student...',
    save: 'Save grade',
    saving: 'Saving...',
    close: 'Close',
    page: 'Page',
    saved: 'Grade saved successfully',
    invalidScore: 'Score must be between 0 and the maximum score.',
  },
  so: {
    title: 'Buugga Qiimeynta',
    subtitle: 'Dib u eeg gudbinta ardayda oo geli dhibcaha',
    course: 'Koorso',
    selectCourse: 'Dooro koorso',
    new: 'Cusub',
    graded: 'Qiimeeyay',
    all: 'Dhammaan',
    search: 'Raadi arday ama shaqo...',
    student: 'Arday',
    assignment: 'Shaqo',
    submitted: 'La gudbiyay',
    score: 'Dhibco',
    action: 'Fal',
    grade: 'Qiimee',
    view: 'Eeg',
    noCourse: 'Dooro koorso si aad u bilowdo',
    noSubmissions: 'Wax gudbin ah lama helin',
    noSubmissionsHint: 'Isku day filter kale ama koorso kale.',
    details: 'Faahfaahinta gudbinta',
    feedback: 'Faallo',
    feedbackPlaceholder: 'U qor faallo ardayga...',
    save: 'Keydi qiimeynta',
    saving: 'Waa la keydinayaa...',
    close: 'Xir',
    page: 'Bogga',
    saved: 'Qiimeynta waa la keydiyay',
    invalidScore: 'Dhibcuhu waa inay u dhexeeyaan 0 iyo dhibcaha ugu badan.',
  },
  ar: {
    title: 'سجل الدرجات',
    subtitle: 'راجع التسليمات وسجل الدرجات',
    course: 'المقرر',
    selectCourse: 'اختر مقرراً',
    new: 'جديد',
    graded: 'تم التقييم',
    all: 'الكل',
    search: 'ابحث عن طالب أو مهمة...',
    student: 'الطالب',
    assignment: 'المهمة',
    submitted: 'التسليم',
    score: 'الدرجة',
    action: 'إجراء',
    grade: 'قيّم',
    view: 'عرض',
    noCourse: 'اختر مقرراً للبدء',
    noSubmissions: 'لا توجد تسليمات',
    noSubmissionsHint: 'جرّب فلتر حالة آخر أو مقرراً آخر.',
    details: 'تفاصيل التسليم',
    feedback: 'ملاحظات',
    feedbackPlaceholder: 'اكتب ملاحظات للطالب...',
    save: 'حفظ الدرجة',
    saving: 'جارٍ الحفظ...',
    close: 'إغلاق',
    page: 'صفحة',
    saved: 'تم حفظ الدرجة بنجاح',
    invalidScore: 'يجب أن تكون الدرجة بين 0 والحد الأقصى.',
  },
};

export function TeacherGradebook() {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith('so') ? 'so' : i18n.language.startsWith('ar') ? 'ar' : 'en';
  const text = labels[lang];

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<Filter>('submitted');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [gradeScore, setGradeScore] = useState('0');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const limit = 20;

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const { data } = await api.get('/courses?limit=100');
        setCourses(data.data?.results || data.data?.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load courses');
      } finally {
        setCoursesLoading(false);
      }
    };
    void loadCourses();
  }, []);

  useEffect(() => {
    if (!selectedCourse) {
      setSubmissions([]);
      setTotal(0);
      return;
    }

    const loadSubmissions = async () => {
      setLoading(true);
      setError('');
      try {
        const statusParam = filter === 'all' ? '' : `&status=${filter}`;
        const { data } = await api.get(
          `/teacher-portal/courses/${selectedCourse}/submissions?page=${page}&limit=${limit}${statusParam}`,
        );
        setSubmissions(data.data?.results || data.data?.data || []);
        setTotal(data.data?.total || 0);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load submissions');
        setSubmissions([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };

    void loadSubmissions();
  }, [selectedCourse, filter, page]);

  const visibleSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return submissions;
    return submissions.filter(
      (submission) =>
        submission.studentName.toLowerCase().includes(query) ||
        submission.assignmentTitle.toLowerCase().includes(query),
    );
  }, [search, submissions]);

  const openGrading = (submission: Submission) => {
    setSelectedSubmission(submission);
    setGradeScore(String(submission.score ?? 0));
    setGradeFeedback(submission.feedback ?? '');
    setError('');
  };

  const submitGrade = async () => {
    if (!selectedSubmission) return;
    const maxScore = selectedSubmission.maxScore || 100;
    const score = Number(gradeScore);

    if (!Number.isFinite(score) || score < 0 || score > maxScore) {
      setError(text.invalidScore);
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.patch(`/teacher-portal/submissions/${selectedSubmission._id}/grade`, {
        score,
        status: 'graded',
      });

      if (gradeFeedback.trim()) {
        await api.post(`/teacher-portal/submissions/${selectedSubmission._id}/feedback`, {
          feedback: gradeFeedback.trim(),
        });
      }

      setSubmissions((current) =>
        current.map((submission) =>
          submission._id === selectedSubmission._id
            ? { ...submission, score, feedback: gradeFeedback.trim(), status: 'graded' }
            : submission,
        ),
      );
      setSelectedSubmission(null);
      setSuccess(text.saved);
      window.setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save grade');
    } finally {
      setSaving(false);
    }
  };

  const courseTitle = (course: CourseOption) =>
    typeof course.title === 'string' ? course.title : course.title?.en || 'Untitled course';

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-emerald-600">
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-wider">Teacher</span>
        </div>
        <h1 className="mt-1 text-2xl font-black text-[var(--color-text-primary)]">{text.title}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{text.subtitle}</p>
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label={text.close}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}

      <section className="mb-5 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">{text.course}</span>
            <select
              value={selectedCourse}
              disabled={coursesLoading}
              onChange={(event) => {
                setSelectedCourse(event.target.value);
                setPage(1);
                setSearch('');
              }}
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-emerald-500"
            >
              <option value="">{coursesLoading ? 'Loading...' : text.selectCourse}</option>
              {courses.map((course) => (
                <option key={course._id} value={course._id}>
                  {courseTitle(course)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1">
            {(['submitted', 'graded', 'all'] as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  filter === value
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-primary)]'
                }`}
              >
                {text[value === 'submitted' ? 'new' : value]}
              </button>
            ))}
          </div>
        </div>

        {selectedCourse && (
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={text.search}
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] py-2.5 pl-9 pr-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </section>

      {!selectedCourse ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-6 py-16 text-center">
          <FileText className="mx-auto mb-3 h-9 w-9 text-[var(--color-text-tertiary)]" />
          <p className="font-semibold text-[var(--color-text-primary)]">{text.noCourse}</p>
        </div>
      ) : loading ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
        </div>
      ) : visibleSubmissions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-6 py-16 text-center">
          <FileText className="mx-auto mb-3 h-9 w-9 text-[var(--color-text-tertiary)]" />
          <p className="font-semibold text-[var(--color-text-primary)]">{text.noSubmissions}</p>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{text.noSubmissionsHint}</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]">
                    {[text.student, text.assignment, text.submitted, text.score, text.action].map((heading, index) => (
                      <th
                        key={heading}
                        className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)] ${index > 2 ? 'text-center' : 'text-left'}`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {visibleSubmissions.map((submission) => {
                    const graded = submission.status === 'graded';
                    return (
                      <tr key={submission._id} className="transition hover:bg-[var(--color-surface-secondary)]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                              {submission.studentName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <span className="max-w-[180px] truncate text-sm font-semibold text-[var(--color-text-primary)]">
                              {submission.studentName}
                            </span>
                          </div>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                          {submission.assignmentTitle}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--color-text-tertiary)]">
                          {new Date(submission.submittedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                            graded
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          }`}>
                            {submission.score !== undefined ? `${submission.score}/${submission.maxScore}` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => openGrading(submission)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {graded ? text.view : text.grade}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {total > limit && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-[var(--color-border-default)] p-2 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{text.page} {page}</span>
              <button
                type="button"
                disabled={page * limit >= total}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-[var(--color-border-default)] p-2 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {selectedSubmission && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm md:items-center md:p-4"
          onMouseDown={() => setSelectedSubmission(null)}
        >
          <section
            className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-[var(--color-surface-primary)] shadow-2xl md:rounded-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[var(--color-border-subtle)] p-4 md:p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">{text.details}</p>
                <h2 className="mt-1 text-lg font-black text-[var(--color-text-primary)]">{selectedSubmission.assignmentTitle}</h2>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{selectedSubmission.studentName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)]"
                aria-label={text.close}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-5">
              {selectedSubmission.content && (
                <div className="mb-5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4">
                  <p className="mb-2 text-xs font-bold text-[var(--color-text-tertiary)]">Submission</p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-primary)]">{selectedSubmission.content}</p>
                </div>
              )}

              {selectedSubmission.files?.length ? (
                <div className="mb-5">
                  <p className="mb-2 text-xs font-bold text-[var(--color-text-secondary)]">Files</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedSubmission.files.map((file) => (
                      <a
                        key={`${file.name}-${file.url}`}
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-xl border border-[var(--color-border-subtle)] p-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]"
                      >
                        <FileText className="h-4 w-4 text-emerald-600" />
                        <span className="truncate">{file.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-secondary)]">
                    {text.score} / {selectedSubmission.maxScore || 100}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={selectedSubmission.maxScore || 100}
                    value={gradeScore}
                    onChange={(event) => setGradeScore(event.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-lg font-black text-[var(--color-text-primary)] outline-none focus:border-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-secondary)]">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {text.feedback}
                  </span>
                  <textarea
                    rows={5}
                    value={gradeFeedback}
                    onChange={(event) => setGradeFeedback(event.target.value)}
                    placeholder={text.feedbackPlaceholder}
                    className="w-full resize-none rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-emerald-500"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] p-4 md:p-5">
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
              >
                {text.close}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitGrade()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? text.saving : text.save}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
