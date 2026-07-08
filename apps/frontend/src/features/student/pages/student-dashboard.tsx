import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

interface DashboardData {
  studentId: string;
  status: string;
  coursesCount: number;
  attendancePercentage: number;
  gpa: number;
  totalFeesPaid: number;
  totalFeesDue: number;
  enrolledCourses: { _id: string; title: { en: string; so: string; ar: string }; slug: string; category: string; level: string; status: string; thumbnail?: string }[];
}

export function StudentDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const lang = i18n.language as 'en' | 'so' | 'ar';

  useEffect(() => {
    (async () => {
      try {
        const { data: res } = await api.get('/students/my/dashboard');
        setData(res.data);
      } catch (err: any) {
        setError(err.response?.data?.message || t('common.error_occurred'));
      } finally { setLoading(false); }
    })();
  }, [t]);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="flex min-h-[400px] items-center justify-center"><div className="text-center"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div></div>;
  if (!data) return null;

  const getTitle = (course: any) => {
    if (lang === 'so' && course.title.so) return course.title.so;
    if (lang === 'ar' && course.title.ar) return course.title.ar;
    return course.title.en;
  };

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

  const getCatLabel = (cat: string) => {
    if (lang === 'so') return catLabels[cat]?.so || cat;
    if (lang === 'ar') return catLabels[cat]?.ar || cat;
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  const levelLabels: Record<string, Record<string,string>> = {
    beginner: { so:'Bilowga', ar:'مبتدئ' },
    intermediate: { so:'Dhexdhexaad', ar:'متوسط' },
    advanced: { so:'Heer Sare', ar:'متقدم' },
  };

  const navItems = [
    { to: '/student/courses', label: t('my_courses'), icon: '📚' },
    { to: '/student/attendance', label: t('attendance'), icon: '📅' },
    { to: '/student/exams', label: t('exams'), icon: '📖' },
    { to: '/student/certificates', label: t('certificates'), icon: '🏆' },
  ];

  const studLabels: Record<string, Record<string,string>> = {
    enrolledCourses: { so:'Koorsooyin La Qaatay', ar:'الدورات المسجلة' },
    attendance: { so:'Xaadiritaan', ar:'الحضور' },
    gpa: { so:'GPA', ar:'المعدل' },
    feesDue: { so:'Lacagaha Bixinta', ar:'الرسوم المستحقة' },
    none: { so:'Ma jiraan', ar:'لا يوجد' },
  };

  const statusLabels: Record<string, Record<string,string>> = {
    active: { so:'Firfircoon', ar:'نشط' },
    inactive: { so:'Aan Firfircooneyn', ar:'غير نشط' },
    graduated: { so:'Shahaadisay', ar:'متخرج' },
    suspended: { so:'La joojiyey', ar:'موقوف' },
  };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🏠 {t('student_dashboard')}</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{t('welcome')}, {user?.email} · {data.studentId}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon="📚" label={lang==='so'?'Koorsooyin La Qaatay':lang==='ar'?'الدورات المسجلة':'Enrolled Courses'} value={data.coursesCount} color="bg-blue-500" />
          <StatCard icon="📅" label={lang==='so'?'Xaadiritaan':lang==='ar'?'الحضور':'Attendance'} value={`${data.attendancePercentage}%`} color={data.attendancePercentage >= 75 ? 'bg-green-500' : 'bg-amber-500'} />
          <StatCard icon="📊" label={lang==='so'?'GPA':lang==='ar'?'المعدل':'GPA'} value={data.gpa > 0 ? data.gpa.toFixed(1) : '—'} color="bg-purple-500" />
          <StatCard icon="💰" label={lang==='so'?'Lacagaha Bixinta':lang==='ar'?'الرسوم المستحقة':'Fees Due'} value={data.totalFeesDue > 0 ? `$${data.totalFeesDue}` : (lang==='so'?'Ma jiraan':lang==='ar'?'لا يوجد':'None')} color={data.totalFeesDue > 0 ? 'bg-red-500' : 'bg-green-500'} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {navItems.map(item => (
            <Link key={item.to} to={item.to} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 text-center hover:bg-[var(--color-surface-tertiary)] transition-colors">
              <span className="text-2xl block mb-1">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          ))}
        </div>

        {data.enrolledCourses.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
            <h2 className="text-lg font-bold mb-4">{lang==='so'?'Koorsooyinkayga':lang==='ar'?'دوراتي':'My Courses'}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.enrolledCourses.slice(0, 6).map(c => (
                <Link key={c._id} to="/student/courses" className="rounded-xl border border-[var(--color-border-default)] p-4 hover:bg-[var(--color-surface-tertiary)] transition-colors">
                  <p className="font-semibold text-sm">{getTitle(c)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300">{getCatLabel(c.category)}</span>
                    <span className="text-[10px] text-[var(--color-text-tertiary)] capitalize">
                      {lang==='so'?levelLabels[c.level]?.so||c.level:lang==='ar'?levelLabels[c.level]?.ar||c.level:c.level}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card hover:shadow-card-hover transition-shadow">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color} text-white text-xl shadow-sm`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
          <p className="text-sm text-[var(--color-text-tertiary)]">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default StudentDashboard;