/**
 * Student Bookmarks — Saved courses & resources with i18n
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface Course {
  _id: string; title: { en: string; so: string; ar: string }; slug: string; category: string; level: string;
  duration: number; fee: number; enrolledStudents: number; maxStudents: number;
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

export function StudentBookmarks() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    if (lang === 'so') return (catLabels as any)[cat]?.so || cat;
    if (lang === 'ar') return (catLabels as any)[cat]?.ar || cat;
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  const getLevel = (lv: string) => {
    if (lang === 'so') return (levelLabels as any)[lv]?.so || lv;
    if (lang === 'ar') return (levelLabels as any)[lv]?.ar || lv;
    return lv.charAt(0).toUpperCase() + lv.slice(1);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🔖 {t('bookmarks')}</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{courses.length} {lang==='so'?'la keydiyey':lang==='ar'?'محفوظة':'saved items'}</p>
        </div>
        {courses.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]">
            <p className="text-5xl mb-4">🔖</p>
            <p className="text-lg">{lang==='so'?'Ma jiraan wax calaamadeysan':lang==='ar'?'لا توجد مفضلات':'No bookmarks yet'}</p>
            <p className="text-sm">
              <Link to="/student/available" className="text-primary-600 hover:underline font-medium">{t('browse_to_enroll')}</Link>
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map(c => (
              <Link key={c._id} to="/student/courses" className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card hover:shadow-card-hover transition-all">
                <div className="flex items-start justify-between mb-2">
                  <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300 capitalize">{getCat(c.category)}</span>
                  <span className="text-lg">🔖</span>
                </div>
                <h3 className="font-bold mb-1">{getTitle(c)}</h3>
                <div className="flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
                  <span className="capitalize">{getLevel(c.level)}</span>
                  <span>{c.duration} {lang==='so'?'usbuuc':lang==='ar'?'أسبوع':'weeks'}</span>
                  <span>{c.fee > 0 ? `$${c.fee}` : (lang==='so'?'Bilaash':lang==='ar'?'مجاني':'Free')}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentBookmarks;