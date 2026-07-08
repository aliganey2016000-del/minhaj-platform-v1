/**
 * Student Assignments — Modern LMS View with i18n
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface Assignment {
  _id: string; title: string; description: string;
  course?: { _id: string; title: { en: string; so: string; ar: string }; slug: string; category: string };
  dueDate: string; totalMarks: number;
  allowLateSubmission: boolean; attachments: string[];
  isDue: boolean; isOverdue: boolean;
}

export function StudentAssignments() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'due' | 'overdue'>('all');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/assignments/my');
        setAssignments(data.data || []);
      } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); }
      finally { setLoading(false); }
    })();
  }, [t]);

  const filtered = assignments.filter(a => {
    if (filter === 'due') return a.isDue;
    if (filter === 'overdue') return a.isOverdue;
    return true;
  });

  const due = assignments.filter(a => a.isDue).length;
  const overdue = assignments.filter(a => a.isOverdue).length;

  const getTitle = (course: any) => {
    if (lang === 'so' && course?.title?.so) return course.title.so;
    if (lang === 'ar' && course?.title?.ar) return course.title.ar;
    return course?.title?.en || '';
  };

  const submitted = assignments.length - due - overdue;

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📝 {t('assignments')}</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{assignments.length} {t('total')} — {due} {t('upcoming')}, {overdue} {t('overdue')}</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-4 text-center"><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{due}</p><p className="text-xs">{t('upcoming')}</p></div>
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-2xl font-bold text-red-700 dark:text-red-300">{overdue}</p><p className="text-xs">{t('overdue')}</p></div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 dark:bg-gray-800/30 p-4 text-center"><p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{submitted}</p><p className="text-xs">{lang==='so'?'La gudbiyey':lang==='ar'?'مُسلّم':'Submitted'}</p></div>
        </div>
        <div className="flex gap-2">
          {(['all', 'due', 'overdue'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${filter === f ? 'bg-primary-600 text-white shadow-sm' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>{f === 'all' ? 'All' : f === 'due' ? t('upcoming') : t('overdue')}</button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-5xl mb-4">📝</p><p className="text-lg">{t('no_data')}</p></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(a => (
              <div key={a._id} className={`rounded-2xl border bg-[var(--color-surface-primary)] p-5 shadow-card hover:shadow-card-hover transition-all ${a.isOverdue ? 'border-red-300 dark:border-red-800' : a.isDue ? 'border-blue-300 dark:border-blue-800' : 'border-[var(--color-border-default)]'}`}>
                {a.course && (
                  <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300">{getTitle(a.course)}</span>
                )}
                <h3 className="font-bold mt-2 mb-1">{a.title}</h3>
                {a.description && <p className="text-xs text-[var(--color-text-tertiary)] line-clamp-2 mb-3">{a.description}</p>}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Kama Dambays':lang==='ar'?'الموعد':'Due'}</span><span className={`font-semibold ${a.isOverdue ? 'text-red-600' : 'text-blue-600'}`}>{new Date(a.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Dhibcaha':lang==='ar'?'الدرجات':'Marks'}</span><span className="font-semibold">{a.totalMarks}</span></div>
                  {a.allowLateSubmission && <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Daahitaan la ogol yahay':lang==='ar'?'تسليم متأخر':'Late Allowed'}</span><span className="text-amber-600 font-medium">{lang==='so'?'Haa':lang==='ar'?'نعم':'Yes'}</span></div>}
                  {a.attachments.length > 0 && <div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{t('files')}</span><span>{a.attachments.length}</span></div>}
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
                  {a.isOverdue ? (
                    <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-3 py-1 text-[10px] font-bold text-red-700 dark:text-red-300">⚠️ {t('overdue')}</span>
                  ) : a.isDue ? (
                    <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-[10px] font-bold text-blue-700 dark:text-blue-300">⏳ {t('upcoming')}</span>
                  ) : (
                    <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-3 py-1 text-[10px] font-bold text-green-700 dark:text-green-300">✅ {lang==='so'?'La gudbiyey':lang==='ar'?'مُسلّم':'Submitted'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export default StudentAssignments;