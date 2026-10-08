import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  ChevronRight,
  Clock3,
  GraduationCap,
  Search,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '../../../store/auth-context';
import { OnboardingWizard } from '../../../components/shared/onboarding-wizard';
import api from '../../../lib/axios';

interface DashboardData {
  studentId: string;
  status: string;
  coursesCount: number;
  attendancePercentage: number;
  gpa: number;
  totalFeesPaid: number;
  totalFeesDue: number;
  totalFees: number;
  discount: number;
  profile?: { _id: string; firstName: string; lastName: string; avatar?: string; gender: string };
  school?: { _id: string; name: string; logo?: string };
  enrolledCourses: { _id: string; title: { en: string; so: string; ar: string }; slug: string; category: string; level: string; status: string; thumbnail?: string }[];
}

export function StudentDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWizard, setShowWizard] = useState(false);

  const lang = i18n.language as 'en' | 'so' | 'ar';

  useEffect(() => {
    if (user?.role === 'student' && user.onboardingCompleted === false) setShowWizard(true);
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const { data: response } = await api.get('/students/my/dashboard');
        setData(response.data);
      } catch (err: any) {
        setError(err.response?.data?.message || t('common.error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="student-glass-card flex flex-col items-center gap-4 rounded-3xl px-8 py-7">
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-emerald-400/20 border-t-emerald-500" />
          <p className="text-sm font-semibold text-[var(--color-text-tertiary)]">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center px-4">
        <div className="student-glass-card w-full max-w-md rounded-3xl p-7 text-center">
          <p className="text-sm font-semibold text-red-500">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500">
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;
  if (showWizard) return <OnboardingWizard onComplete={() => setShowWizard(false)} />;

  const fullName = data.profile
    ? `${data.profile.firstName} ${data.profile.lastName}`.trim()
    : (user?.firstName || user?.email?.split('@')[0] || 'Student');

  const dateStr = new Date().toLocaleDateString(
    lang === 'ar' ? 'ar-SA' : lang === 'so' ? 'so-SO' : 'en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  );

  const getTitle = (course: DashboardData['enrolledCourses'][number]) => {
    if (lang === 'so' && course.title.so) return course.title.so;
    if (lang === 'ar' && course.title.ar) return course.title.ar;
    return course.title.en;
  };

  const feesPaidPercent = data.totalFees > 0 ? Math.round((data.totalFeesPaid / data.totalFees) * 100) : 0;

  const navItems: { to: string; label: string; icon: LucideIcon; accent: string }[] = [
    { to: '/student/courses', label: lang === 'so' ? 'Koorsooyinkayga' : lang === 'ar' ? 'دوراتي' : 'My Courses', icon: BookOpen, accent: 'text-sky-500 bg-sky-500/10' },
    { to: '/student/attendance', label: lang === 'so' ? 'Xaadiritaan' : lang === 'ar' ? 'الحضور' : 'Attendance', icon: CalendarCheck2, accent: 'text-emerald-500 bg-emerald-500/10' },
    { to: '/student/exams', label: lang === 'so' ? 'Imtixaan' : lang === 'ar' ? 'الاختبارات' : 'Exams', icon: GraduationCap, accent: 'text-violet-500 bg-violet-500/10' },
    { to: '/student/certificates', label: lang === 'so' ? 'Shahaadooyin' : lang === 'ar' ? 'الشهادات' : 'Certificates', icon: Award, accent: 'text-amber-500 bg-amber-500/10' },
    { to: '/student/schedule', label: lang === 'so' ? 'Jadwalka' : lang === 'ar' ? 'الجدول' : 'Schedule', icon: Clock3, accent: 'text-cyan-500 bg-cyan-500/10' },
    { to: '/student/available', label: lang === 'so' ? 'Raadi Koorso' : lang === 'ar' ? 'تصفح الدورات' : 'Browse Courses', icon: Search, accent: 'text-rose-500 bg-rose-500/10' },
  ];

  return (
    <div className="min-h-screen pb-12">
      <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="student-dashboard-hero relative overflow-hidden rounded-[30px] p-5 text-white sm:p-7">
          <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border-[32px] border-white/[.035]" aria-hidden="true" />
          <div className="absolute bottom-[-5rem] right-[22%] h-44 w-44 rounded-full bg-emerald-300/[.05]" aria-hidden="true" />
          <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[.15em] text-emerald-200">
                  <Sparkles className="h-3.5 w-3.5" /> Student Portal
                </span>
                <span className="rounded-full border border-white/10 bg-white/[.06] px-3 py-1 text-[11px] font-semibold text-white/70">
                  {dateStr}
                </span>
              </div>

              <h2 className="mt-5 text-2xl font-black leading-tight sm:text-3xl">
                {lang === 'so' ? 'Ku soo dhowow' : lang === 'ar' ? 'مرحباً بك' : 'Welcome back'}, {fullName}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/70">
                {lang === 'so'
                  ? 'Hal meel kala soco waxbarashadaada, imtixaannada, xaadiritaanka iyo Guuldoon.'
                  : lang === 'ar'
                    ? 'تابع دراستك واختباراتك وحضورك وGuuldoon من مكان واحد.'
                    : 'Keep your courses, exams, attendance and Guuldoon progress together in one place.'}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Link to="/student/courses" className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-black text-emerald-950 shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-200">
                  {lang === 'so' ? 'Sii wad waxbarashada' : lang === 'ar' ? 'مواصلة التعلم' : 'Continue Learning'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/student/global-courses" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.06] px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/[.1]">
                  <Award className="h-4 w-4 text-amber-300" /> Guuldoon
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 p-3.5 backdrop-blur-sm lg:min-w-[220px]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/50">{lang === 'so' ? 'Student ID' : 'Student ID'}</p>
                <p className="mt-1 font-mono text-sm font-black text-white">{data.studentId}</p>
                <p className="mt-0.5 text-[10px] capitalize text-emerald-100/60">{data.status}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={BookOpen}
            label={lang === 'so' ? 'Koorsooyin La Qaatay' : lang === 'ar' ? 'الدورات المسجلة' : 'Enrolled Courses'}
            value={data.coursesCount}
            sub={lang === 'so' ? 'koorso' : lang === 'ar' ? 'دورة' : 'courses'}
            accent="text-sky-500 bg-sky-500/10"
          />
          <MetricCard
            icon={CalendarCheck2}
            label={lang === 'so' ? 'Xaadiritaan' : lang === 'ar' ? 'الحضور' : 'Attendance'}
            value={`${data.attendancePercentage || 0}%`}
            sub={data.attendancePercentage >= 75 ? (lang === 'so' ? 'Wanaagsan' : lang === 'ar' ? 'جيد' : 'Good standing') : (lang === 'so' ? 'Hagaaji' : lang === 'ar' ? 'تحسين' : 'Needs attention')}
            accent="text-emerald-500 bg-emerald-500/10"
          />
          <MetricCard
            icon={BarChart3}
            label={lang === 'so' ? 'GPA' : lang === 'ar' ? 'المعدل' : 'GPA'}
            value={data.gpa > 0 ? data.gpa.toFixed(1) : '—'}
            sub={data.gpa >= 3.5 ? (lang === 'so' ? 'Heer Sare' : lang === 'ar' ? 'ممتاز' : 'Excellent') : data.gpa >= 2.5 ? (lang === 'so' ? 'Wanaagsan' : lang === 'ar' ? 'جيد' : 'Good') : (lang === 'so' ? 'La soco' : 'Track progress')}
            accent="text-violet-500 bg-violet-500/10"
          />
          <MetricCard
            icon={WalletCards}
            label={lang === 'so' ? 'Lacagaha Haray' : lang === 'ar' ? 'الرسوم المستحقة' : 'Fees Due'}
            value={data.totalFeesDue > 0 ? `$${data.totalFeesDue.toLocaleString()}` : (lang === 'so' ? 'Ma jiraan' : lang === 'ar' ? 'لا يوجد' : 'None')}
            sub={data.totalFees > 0 ? `${feesPaidPercent}% paid` : (lang === 'so' ? 'Wali lama dalacin' : lang === 'ar' ? 'لم تحدد بعد' : 'Not set yet')}
            accent={data.totalFeesDue > 0 ? 'text-rose-500 bg-rose-500/10' : 'text-emerald-500 bg-emerald-500/10'}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <div className="student-glass-card rounded-[26px] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">{lang === 'so' ? 'Waxbarashada' : lang === 'ar' ? 'التعلم' : 'Learning'}</p>
                <h3 className="mt-1 text-lg font-black text-[var(--color-text-primary)]">{lang === 'so' ? 'Koorsooyinkayga' : lang === 'ar' ? 'دوراتي' : 'My Courses'}</h3>
              </div>
              <Link to="/student/courses" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 hover:text-emerald-400">
                {lang === 'so' ? 'Dhammaan' : lang === 'ar' ? 'الكل' : 'View all'} <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {data.enrolledCourses.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.enrolledCourses.slice(0, 6).map(course => (
                  <Link key={course._id} to={`/student/courses/${course._id}`} className="group flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/55 p-3.5 transition hover:border-emerald-500/25 hover:bg-emerald-500/[.055]">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-500/10 text-emerald-500">
                      {course.thumbnail ? <img src={course.thumbnail} alt="" className="h-full w-full object-cover" /> : <BookOpen className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-[var(--color-text-primary)] group-hover:text-emerald-500">{getTitle(course)}</p>
                      <p className="mt-1 text-[11px] capitalize text-[var(--color-text-tertiary)]">{course.level || course.category}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)]/40 p-8 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="mt-3 text-sm font-black text-[var(--color-text-primary)]">{lang === 'so' ? 'Weli koorsooyin kama qaadan' : lang === 'ar' ? 'لم تسجل في أي دورة بعد' : 'No courses enrolled yet'}</p>
                <Link to="/student/available" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">
                  <Search className="h-4 w-4" /> {lang === 'so' ? 'Raadi koorsooyin' : lang === 'ar' ? 'تصفح الدورات' : 'Browse courses'}
                </Link>
              </div>
            )}
          </div>

          <div className="student-glass-card rounded-[26px] p-5 sm:p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">{lang === 'so' ? 'Degdeg' : lang === 'ar' ? 'سريع' : 'Quick access'}</p>
              <h3 className="mt-1 text-lg font-black text-[var(--color-text-primary)]">{lang === 'so' ? 'Adeegyada Ardayga' : lang === 'ar' ? 'خدمات الطالب' : 'Student Services'}</h3>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {navItems.map(item => {
                const Icon = item.icon;
                return (
                  <Link key={item.to} to={item.to} className="student-quick-link group rounded-2xl p-3.5">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.accent}`}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <p className="mt-3 text-xs font-bold leading-5 text-[var(--color-text-primary)]">{item.label}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="student-glass-card flex flex-col gap-4 rounded-[26px] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <Award className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black text-[var(--color-text-primary)]">Guuldoon</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                {lang === 'so' ? 'Diyaar-garowga imtixaanka shahaadiga ah, su’aalaha hore iyo horumarkaaga.' : lang === 'ar' ? 'الاستعداد للامتحان والشروحات والتقدم.' : 'Certificate-exam preparation, past-question practice and progress.'}
              </p>
            </div>
          </div>
          <Link to="/student/global-courses" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-500">
            {lang === 'so' ? 'Fur Guuldoon' : lang === 'ar' ? 'افتح Guuldoon' : 'Open Guuldoon'} <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, accent }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="student-stat-card group rounded-[22px] p-4 sm:p-5">
      <div className="relative z-10 flex items-start justify-between gap-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
        <CalendarDays className="h-4 w-4 text-[var(--color-text-tertiary)]/35" />
      </div>
      <div className="relative z-10 mt-5">
        <p className="text-2xl font-black tracking-tight text-[var(--color-text-primary)]">{value}</p>
        <p className="mt-1 text-xs font-bold text-[var(--color-text-secondary)]">{label}</p>
        {sub && <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{sub}</p>}
      </div>
    </div>
  );
}

export default StudentDashboard;
