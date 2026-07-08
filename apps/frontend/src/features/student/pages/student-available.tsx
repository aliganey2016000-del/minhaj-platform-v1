/**
 * Available Courses — Student Catalog with i18n
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface TeacherBrief { _id: string; teacherId: string; profile?: { firstName: string; lastName: string }; }
interface Course {
  _id: string; title: { en: string; so: string; ar: string }; slug: string; description: { en: string }; category: string; level: string; duration: number; fee: number;
  teacher?: TeacherBrief; maxStudents: number; enrolledStudents: number; thumbnail?: string; status: string; startDate?: string; isEnrolled: boolean;
}
interface Category { value: string; label: { en: string }; }

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

const levelLabels: Record<string, { en: string; so: string; ar: string }> = {
  beginner: { en: 'Beginner', so: 'Bilowga', ar: 'مبتدئ' },
  intermediate: { en: 'Intermediate', so: 'Dhexdhexaad', ar: 'متوسط' },
  advanced: { en: 'Advanced', so: 'Heer Sare', ar: 'متقدم' },
};

export function StudentAvailable() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en'|'so'|'ar';
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const limit = 12;

  const fetchCourses = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: String(limit) };
      if (search) params.search = search; if (category) params.category = category; if (level) params.level = level;
      const { data } = await api.get('/courses/available', { params });
      setCourses(data.data || []); setTotal(data.meta?.total || 0);
    } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setLoading(false); }
  }, [page, search, category, level, t]);

  useEffect(() => { fetchCourses(); api.get('/courses/categories').then(r => setCategories(r.data.data || [])).catch(() => {}); }, [fetchCourses]);

  const handleEnroll = async (courseId: string) => {
    setEnrollingId(courseId); setMessage(''); setError('');
    try { await api.post(`/courses/${courseId}/self-enroll`); setMessage(t('successfully_enrolled')); setCourses(prev => prev.map(c => c._id===courseId?{...c,isEnrolled:true,enrolledStudents:c.enrolledStudents+1}:c)); }
    catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setEnrollingId(null); }
  };
  const handleUnenroll = async (courseId: string) => {
    if (!window.confirm('Are you sure?')) return; setEnrollingId(courseId); setMessage(''); setError('');
    try { await api.post(`/courses/${courseId}/self-unenroll`); setMessage(t('successfully_unenrolled')); setCourses(prev => prev.map(c => c._id===courseId?{...c,isEnrolled:false,enrolledStudents:c.enrolledStudents-1}:c)); }
    catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setEnrollingId(null); }
  };

  const getTitle = (c: Course) => { if(lang==='so'&&c.title.so)return c.title.so; if(lang==='ar'&&c.title.ar)return c.title.ar; return c.title.en; };
  const getCat = (c: string) => catLabels[c]?.[lang] || c;
  const getLevel = (l: string) => levelLabels[l]?.[lang] || l;
  const isFull = (c: Course) => c.enrolledStudents >= c.maxStudents;
  const totalPages = Math.ceil(total / limit);

  if (loading && courses.length === 0) return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🆕 {t('browse_courses')}</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} {t('published_courses')}</p></div>
        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700 flex items-center justify-between"><span>{message}</span><button onClick={()=>setMessage('')} className="text-xs underline">Dismiss</button></div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600 flex items-center justify-between"><span>{error}</span><button onClick={()=>setError('')} className="text-xs underline">Dismiss</button></div>}
        <div className="flex flex-col gap-4">
          <input type="text" placeholder={t('search_courses')} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
          <div className="flex flex-wrap gap-2">
            <button onClick={()=>{setCategory('');setPage(1);}} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${!category?'bg-primary-600 text-white shadow-sm':'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>{t('all_categories')}</button>
            {categories.map(cat => (<button key={cat.value} onClick={()=>{setCategory(cat.value);setPage(1);}} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${category===cat.value?'bg-primary-600 text-white shadow-sm':'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>{catLabels[cat.value]?.[lang] || cat.label?.en || cat.value}</button>))}
          </div>
          <div className="flex gap-2"><select value={level} onChange={e=>{setLevel(e.target.value);setPage(1);}} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2 text-sm"><option value="">{t('all_levels')}</option><option value="beginner">{levelLabels.beginner[lang]}</option><option value="intermediate">{levelLabels.intermediate[lang]}</option><option value="advanced">{levelLabels.advanced[lang]}</option></select><span className="text-xs text-[var(--color-text-tertiary)] self-center ml-2">{total} results</span></div>
        </div>
        {courses.length===0?(
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-5xl mb-4">📚</p><p className="text-lg">{t('no_courses_found')}</p><p className="text-sm">Try adjusting your filters.</p></div>
        ):(
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map(c=>(<div key={c._id} className="group rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-200 flex flex-col cursor-pointer" onClick={()=>setSelectedCourse(c)}>
              <div className="aspect-video bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/40 dark:to-primary-800/30 flex items-center justify-center relative">
                {c.thumbnail?<img src={c.thumbnail} alt={c.title.en} className="w-full h-full object-cover"/>:<span className="text-4xl opacity-40">📚</span>}
                <div className="absolute top-3 left-3 flex gap-1.5"><span className="rounded-full bg-white/90 dark:bg-black/50 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-bold text-primary-700 dark:text-primary-300">{getCat(c.category)}</span><span className="rounded-full bg-white/90 dark:bg-black/50 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-bold text-gray-600 dark:text-gray-300">{getLevel(c.level)}</span></div>
                {c.isEnrolled&&<div className="absolute top-3 right-3 rounded-full bg-green-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">✅ Enrolled</div>}
                {isFull(c)&&!c.isEnrolled&&<div className="absolute top-3 right-3 rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">{t('class_full')}</div>}
                <div className="absolute bottom-3 right-3 rounded-full bg-white/90 dark:bg-black/50 backdrop-blur-sm px-3 py-0.5 text-xs font-bold text-primary-700 dark:text-primary-300">{c.fee>0?`$${c.fee}`:(lang==='so'?'Bilaash':lang==='ar'?'مجاني':'Free')}</div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-sm leading-snug line-clamp-2 mb-1 group-hover:text-primary-600 transition-colors">{getTitle(c)}</h3>
                {c.description?.en&&<p className="text-xs text-[var(--color-text-tertiary)] line-clamp-2 mb-3">{c.description.en}</p>}
                <div className="mt-auto space-y-2">
                  {c.teacher?.profile&&<div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"><span>👨‍🏫</span><span>{c.teacher.profile.firstName} {c.teacher.profile.lastName}</span></div>}
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]"><span>⏱️ {c.duration} {lang==='so'?'usbuuc':lang==='ar'?'أسبوع':'weeks'}</span><span>👥 {c.enrolledStudents}/{c.maxStudents}</span></div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={`h-full rounded-full transition-all duration-500 ${c.enrolledStudents>=c.maxStudents?'bg-red-500':'bg-primary-500'}`} style={{width:`${Math.min((c.enrolledStudents/c.maxStudents)*100,100)}%`}}/></div>
                  <div className="pt-1" onClick={e=>e.stopPropagation()}>
                    {c.isEnrolled?<button onClick={()=>handleUnenroll(c._id)} disabled={enrollingId===c._id} className="w-full rounded-xl border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors">{enrollingId===c._id?'...':t('unenroll')}</button>
                    :isFull(c)?<button disabled className="w-full rounded-xl bg-gray-200 dark:bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-500 cursor-not-allowed">{t('class_full')}</button>
                    :<button onClick={()=>handleEnroll(c._id)} disabled={enrollingId===c._id} className="w-full rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">{enrollingId===c._id?t('enrolling'):t('enroll_now')}</button>}
                  </div>
                </div>
              </div>
            </div>))}
          </div>
        )}
        {totalPages>1&&(<div className="flex items-center justify-center gap-3"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Prev</button><span className="text-sm text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button></div>)}
      </div>
      {selectedCourse&&(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={()=>setSelectedCourse(null)}><div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold">{getTitle(selectedCourse)}</h2><button onClick={()=>setSelectedCourse(null)} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button></div><div className="space-y-3"><div className="flex gap-2"><span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-3 py-1 text-xs font-medium text-primary-700">{getCat(selectedCourse.category)}</span><span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium">{getLevel(selectedCourse.level)}</span><span className="rounded-full bg-gold-100 dark:bg-gold-900/30 px-3 py-1 text-xs font-medium text-gold-700">{selectedCourse.fee>0?`$${selectedCourse.fee}`:(lang==='so'?'Bilaash':lang==='ar'?'مجاني':'Free')}</span></div>{selectedCourse.description?.en&&<p className="text-sm text-[var(--color-text-secondary)]">{selectedCourse.description.en}</p>}<div className="flex justify-between py-1.5 border-b"><span className="text-xs text-[var(--color-text-tertiary)]">Duration</span><span className="text-sm font-medium">{selectedCourse.duration} weeks</span></div><div className="flex justify-between py-1.5 border-b"><span className="text-xs text-[var(--color-text-tertiary)]">Teacher</span><span className="text-sm font-medium">{selectedCourse.teacher?.profile?`${selectedCourse.teacher.profile.firstName} ${selectedCourse.teacher.profile.lastName}`:'TBA'}</span></div><div className="flex justify-between py-1.5 border-b"><span className="text-xs text-[var(--color-text-tertiary)]">Capacity</span><span className="text-sm font-medium">{selectedCourse.enrolledStudents}/{selectedCourse.maxStudents}</span></div><div className="flex justify-between py-1.5"><span className="text-xs text-[var(--color-text-tertiary)]">Status</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${selectedCourse.isEnrolled?'bg-green-100 text-green-700':'bg-gray-100 text-gray-600'}`}>{selectedCourse.isEnrolled?'✅ Enrolled':'Not enrolled'}</span></div></div><div className="mt-5 flex gap-2" onClick={e=>e.stopPropagation()}>{selectedCourse.isEnrolled?<button onClick={()=>{handleUnenroll(selectedCourse._id);setSelectedCourse(null);}} className="flex-1 rounded-xl border border-red-300 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">{t('unenroll')}</button>:<button onClick={()=>{handleEnroll(selectedCourse._id);setSelectedCourse(null);}} disabled={isFull(selectedCourse)} className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed">{isFull(selectedCourse)?t('class_full'):t('enroll_now')}</button>}<button onClick={()=>setSelectedCourse(null)} className="flex-1 rounded-xl border border-[var(--color-border-default)] py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)]">Close</button></div></div></div>)}
    </div>
  );
}
export default StudentAvailable;