import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface Exam { _id: string; title: string; examDate: string; startTime: string; endTime: string; duration: number; totalMarks: number; passingMarks: number; room: string; instructions: string; status: string; course?: { _id: string; title: { en: string; so: string; ar: string }; category: string }; }
const catLabels: Record<string,{so:string;ar:string}> = { quran:{so:"Qur'aanka",ar:'القرآن'}, fiqh:{so:'Fiqhiga',ar:'الفقه'}, aqeedah:{so:'Cajiidada',ar:'العقيدة'}, seerah:{so:'Siirada',ar:'السيرة'}, arabic:{so:'Carabiga',ar:'العربية'}, tajweed:{so:'Tajwiidka',ar:'التجويد'}, hadith:{so:'Xadiithka',ar:'الحديث'}, akhlaq:{so:'Akhlaaqda',ar:'الأخلاق'} };
const statusLabels: Record<string,{so:string;ar:string}> = { scheduled:{so:'La Qorsheeyey',ar:'مجدول'}, ongoing:{so:'Socda',ar:'جاري'}, completed:{so:'Dhameystiran',ar:'مكتمل'}, cancelled:{so:'La Joojiyey',ar:'ملغي'} };

export function StudentExams() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en'|'so'|'ar';
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all'|'upcoming'|'completed'>('all');

  useEffect(() => { (async () => { try { const { data: examsData } = await api.get('/exams/my'); setExams(examsData.data || []); } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setLoading(false); } })(); }, [t]);

  const upcoming = exams.filter(e => e.status === 'scheduled' || e.status === 'ongoing');
  const completed = exams.filter(e => e.status === 'completed');
  const cancelled = exams.filter(e => e.status === 'cancelled');
  const filtered = filter === 'upcoming' ? upcoming : filter === 'completed' ? completed : exams;

  const getTitle = (course: any) => { if(lang==='so'&&course?.title?.so)return course.title.so; if(lang==='ar'&&course?.title?.ar)return course.title.ar; return course?.title?.en||''; };
const getStatus = (s: string) => (statusLabels as any)[s]?.[lang] || s;
const getCat = (c: string) => (catLabels as any)[c]?.[lang] || c;

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10"><div className="mx-auto max-w-6xl space-y-6">
      <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📖 {t('exams')}</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{exams.length} {t('total')} — {upcoming.length} {t('upcoming')}, {completed.length} {t('completed')}, {cancelled.length} {t('cancelled')}</p></div>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-4 text-center"><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{upcoming.length}</p><p className="text-xs">{t('upcoming')}</p></div>
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-center"><p className="text-2xl font-bold text-green-700 dark:text-green-300">{completed.length}</p><p className="text-xs">{t('completed')}</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-2xl font-bold text-red-700 dark:text-red-300">{cancelled.length}</p><p className="text-xs">{t('cancelled')}</p></div>
      </div>
      <div className="flex gap-2">{(['all','upcoming','completed'] as const).map(f=>(<button key={f} onClick={()=>setFilter(f)} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${filter===f?'bg-primary-600 text-white shadow-sm':'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>{f==='all'?'All':f==='upcoming'?t('upcoming'):t('completed')}</button>))}</div>
      {filtered.length===0?<div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-5xl mb-4">📖</p><p className="text-lg">{t('no_data')}</p></div>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(e=>(<div key={e._id} className={`rounded-2xl border bg-[var(--color-surface-primary)] p-5 shadow-card ${e.status==='cancelled'?'border-red-300 opacity-60':e.status==='scheduled'?'border-blue-300':'border-[var(--color-border-default)]'}`}>{e.course&&<span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300">{getTitle(e.course)}</span>}<h3 className="font-bold mt-2 mb-1">{e.title}</h3><div className="space-y-1 text-xs"><div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Taariikh':lang==='ar'?'التاريخ':'Date'}</span><span className="font-semibold">{new Date(e.examDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</span></div><div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Waqti':lang==='ar'?'الوقت':'Time'}</span><span className="font-semibold">{e.startTime} - {e.endTime}</span></div><div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Muddada':lang==='ar'?'المدة':'Duration'}</span><span className="font-semibold">{e.duration} min</span></div><div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Dhibcaha':lang==='ar'?'الدرجة':'Marks'}</span><span className="font-semibold">{e.totalMarks}</span></div><div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Gudubka':lang==='ar'?'النجاح':'Passing'}</span><span className="font-semibold">{e.passingMarks} ({Math.round(e.passingMarks/e.totalMarks*100)}%)</span></div>{e.room&&<div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Qolka':lang==='ar'?'القاعة':'Room'}</span><span className="font-semibold">{e.room}</span></div>}</div><div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)]"><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${e.status==='scheduled'?'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300':e.status==='ongoing'?'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300':e.status==='completed'?'bg-purple-100 text-purple-700':'bg-red-100 text-red-700'}`}>{getStatus(e.status)}</span></div></div>))}</div>}
    </div></div>
  );
}
export default StudentExams;