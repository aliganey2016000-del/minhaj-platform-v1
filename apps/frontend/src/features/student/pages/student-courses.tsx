import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface Course {
  _id: string; title: { en: string; so: string; ar: string }; slug: string; category: string; level: string; status: string;
  duration: number; fee: number; teacher?: { profile?: { firstName: string; lastName: string } };
}

const catLabels: Record<string, { so: string; ar: string }> = {
  quran: { so: "Qur'aanka", ar: 'القرآن' },
  fiqh: { so: 'Fiqhiga', ar: 'الفقه' },
  aqeedah: { so: 'Cajiidada', ar: 'العقيدة' },
  seerah: { so: 'Siirada', ar: 'السيرة' },
  arabic: { so: 'Carabiga', ar: 'العربية' },
  tajweed: { so: 'Tajwiidka', ar: 'التجويد' },
  hadith: { so: 'Xadiithka', ar: 'الحديث' },
  akhlaq: { so: 'Akhlaaqda', ar: 'الأخلاق' },
};

const levelLabels: Record<string, { so: string; ar: string }> = {
  beginner: { so: 'Bilowga', ar: 'مبتدئ' },
  intermediate: { so: 'Dhexdhexaad', ar: 'متوسط' },
  advanced: { so: 'Heer Sare', ar: 'متقدم' },
};

const statusLabels: Record<string, { so: string; ar: string }> = {
  published: { so: 'La daabacay', ar: 'منشور' },
  draft: { so: 'Qabyo', ar: 'مسودة' },
  archived: { so: 'La kaydiyey', ar: 'مؤرشف' },
};

export function StudentCourses() {
  const { t, i18n } = useTranslation('common');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const lang = i18n.language as 'en' | 'so' | 'ar';

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/students/my/courses');
        setCourses(data.data || []);
      } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); }
      finally { setLoading(false); }
    })();
  }, [t]);

  const getTitle = (course: Course) => {
    if (lang === 'so' && course.title.so) return course.title.so;
    if (lang === 'ar' && course.title.ar) return course.title.ar;
    return course.title.en;
  };

  const getCat = (cat: string) => {
    if (lang === 'so') return catLabels[cat]?.so || cat;
    if (lang === 'ar') return catLabels[cat]?.ar || cat;
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  const getLevel = (lv: string) => {
    if (lang === 'so') return levelLabels[lv]?.so || lv;
    if (lang === 'ar') return levelLabels[lv]?.ar || lv;
    return lv.charAt(0).toUpperCase() + lv.slice(1);
  };

  const getStatus = (st: string) => {
    if (lang === 'so') return statusLabels[st]?.so || st;
    if (lang === 'ar') return statusLabels[st]?.ar || st;
    return st.charAt(0).toUpperCase() + st.slice(1);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📚 {t('my_courses')}</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{courses.length} {t('enrolled_courses')}</p>
        </div>
        {courses.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">{t('no_courses_enrolled')}</p></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map(c => (
              <div key={c._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card hover:shadow-card-hover transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300 capitalize">{getCat(c.category)}</span>
                  <span className="text-xs text-[var(--color-text-tertiary)]">{c.duration} weeks</span>
                </div>
                <h3 className="font-bold text-lg mb-1">{getTitle(c)}</h3>
                <p className="text-sm text-[var(--color-text-tertiary)] capitalize">{getLevel(c.level)}</p>
                {c.teacher?.profile && (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-2">👨‍🏫 {c.teacher.profile.firstName} {c.teacher.profile.lastName}</p>
                )}
                <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
                  <span className="text-sm font-medium">{c.fee > 0 ? `$${c.fee}` : (lang==='so'?'Bilaash':lang==='ar'?'مجاني':'Free')}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>{getStatus(c.status)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentCourses;