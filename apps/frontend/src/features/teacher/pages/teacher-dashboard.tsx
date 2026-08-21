import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BookOpen, Users, ClipboardList, TrendingUp, Clock, Zap, Trophy, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import api from '../../../lib/axios';

interface CourseCard { _id: string; title: { en: string; so?: string; ar?: string }; slug: string; description?: { en: string }; category: string; enrolledStudents: number; maxStudents: number; status: string; thumbnail?: string; }
interface PendingSubmission { _id: string; studentName: string; assignmentTitle: string; courseTitle: string; submittedAt: string; status: string; }
interface DashboardStats { totalCourses: number; totalStudents: number; pendingSubmissions: number; avgPerformance: number; }
interface GamificationStudent { studentId: string; name: string; avatar?: string; xp: number; level: number; badges: string[]; streak: number; }
interface DashboardData { activeCourses: CourseCard[]; draftCourses: CourseCard[]; pendingSubmissions: PendingSubmission[]; stats: DashboardStats; teacher: { teacherId: string; qualification?: string; specialization?: string[]; }; }
interface GamificationData { topStudents: GamificationStudent[]; totalClassXP: number; participantCount: number; }

export function TeacherDashboard() {
  const { i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [gamification, setGamification] = useState<GamificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [gamificationError, setGamificationError] = useState('');

  const load = async () => {
    setLoading(true);
    setDashboardError('');
    setGamificationError('');
    const [dashResult, gamResult] = await Promise.allSettled([
      api.get('/teacher-portal/dashboard'),
      api.get('/teacher-portal/dashboard/gamification'),
    ]);
    if (dashResult.status === 'fulfilled') setDashboard(dashResult.value.data.data);
    else setDashboardError(dashResult.reason?.response?.data?.message || 'Failed to load dashboard');
    if (gamResult.status === 'fulfilled') setGamification(gamResult.value.data.data);
    else setGamificationError(gamResult.reason?.response?.data?.message || 'Failed to load gamification');
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="flex flex-col items-center gap-4"><div className="h-10 w-10 animate-spin rounded-full border-3 border-emerald-200 border-t-emerald-600" /><p className="text-sm text-[var(--color-text-tertiary)]">Loading dashboard...</p></div></div>;

  if (!dashboard && dashboardError) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-center"><AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" /><p className="text-red-500">{dashboardError}</p><button onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-600 hover:underline"><RefreshCw className="h-4 w-4" />Retry</button></div></div>;

  const s = dashboard?.stats ?? { totalCourses: 0, totalStudents: 0, pendingSubmissions: 0, avgPerformance: 0 };
  const courses = dashboard?.activeCourses ?? [];
  const submissions = dashboard?.pendingSubmissions ?? [];
  const g = gamification;
  const statCards = [
    { label: lang === 'so' ? 'Koorsooyin' : 'Active Courses', value: s.totalCourses, icon: BookOpen, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
    { label: lang === 'so' ? 'Arday' : 'Students', value: s.totalStudents, icon: Users, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
    { label: lang === 'so' ? 'Gudbin Sugaya' : 'Pending Submissions', value: s.pendingSubmissions, icon: ClipboardList, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
    { label: lang === 'so' ? 'Celcelis Waxqabad' : 'Avg Performance', value: `${s.avgPerformance}%`, icon: TrendingUp, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30' },
  ];

  return <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
    <div className="flex items-start justify-between gap-4 mb-8"><div><h1 className="text-2xl font-extrabold text-[var(--color-text-primary)]">{lang === 'so' ? 'Dashboard-ka Macallinka' : lang === 'ar' ? 'لوحة المعلم' : 'Teacher Dashboard'}</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{lang === 'so' ? 'Ku soo dhawoow bartaada macallinimo' : lang === 'ar' ? 'مرحباً بك في بوابة المعلم' : 'Welcome to your teaching portal'}{dashboard?.teacher.teacherId ? ` • ID: ${dashboard.teacher.teacherId}` : ''}</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" />{lang === 'so' ? 'Cusbooneysii' : 'Refresh'}</button></div>

    {dashboardError && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4 flex items-center gap-3"><AlertCircle className="h-5 w-5 text-red-500" /><p className="text-sm text-red-600 dark:text-red-400">{dashboardError}</p><button onClick={() => void load()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">Retry</button></div>}
    {gamificationError && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 flex items-center gap-3"><AlertCircle className="h-5 w-5 text-amber-500" /><p className="text-sm text-amber-700 dark:text-amber-300">{gamificationError}</p><button onClick={() => void load()} className="ml-auto text-xs font-semibold text-amber-700 hover:underline">Retry</button></div>}

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">{statCards.map((card, idx) => <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 shadow-sm"><div className={`inline-flex p-2.5 rounded-xl ${card.color} mb-3`}><card.icon className="h-5 w-5" /></div><p className="text-2xl font-extrabold text-[var(--color-text-primary)]">{card.value}</p><p className="text-xs font-medium text-[var(--color-text-tertiary)] mt-1">{card.label}</p></motion.div>)}</div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 space-y-6">
      <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm overflow-hidden"><div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]"><h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><BookOpen className="h-4 w-4 text-emerald-500" />{lang === 'so' ? 'Koorsooyinkayga Firfircoon' : 'My Active Courses'}</h2><Link to="/teacher/courses" className="text-xs font-medium text-emerald-600 flex items-center gap-1">{lang === 'so' ? 'Dhamaan' : 'View All'} <ChevronRight className="h-3.5 w-3.5" /></Link></div><div className="divide-y divide-[var(--color-border-subtle)]">{courses.slice(0, 5).map(course => <Link key={course._id} to={`/teacher/courses/${course._id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-[var(--color-surface-tertiary)]"><div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">{course.category?.charAt(0).toUpperCase() || 'C'}</div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{typeof course.title === 'object' ? course.title[lang] || course.title.en : course.title}</p><p className="text-xs text-[var(--color-text-tertiary)]">{course.enrolledStudents}/{course.maxStudents} {lang === 'so' ? 'arday' : 'students'}</p></div><span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium">{course.status}</span></Link>)}{courses.length === 0 && <p className="px-6 py-8 text-center text-sm text-[var(--color-text-tertiary)]">{lang === 'so' ? 'Ma jiraan koorsooyin firfircoon' : 'No active courses assigned'}</p>}</div></section>
      <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm overflow-hidden"><div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]"><h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" />{lang === 'so' ? 'Gudbin Sugaya' : 'Pending Submissions'}</h2><Link to="/teacher/gradebook" className="text-xs font-medium text-emerald-600 flex items-center gap-1">{lang === 'so' ? 'Dhamaan' : 'View All'} <ChevronRight className="h-3.5 w-3.5" /></Link></div><div className="divide-y divide-[var(--color-border-subtle)]">{submissions.map(sub => <div key={sub._id} className="flex items-center gap-3 px-6 py-3"><div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold">{sub.studentName?.charAt(0) || '?'}</div><div className="flex-1 min-w-0"><p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{sub.studentName} — {sub.assignmentTitle}</p><p className="text-[10px] text-[var(--color-text-tertiary)]">{sub.courseTitle} • {new Date(sub.submittedAt).toLocaleDateString()}</p></div><span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{sub.status}</span></div>)}{submissions.length === 0 && <p className="px-6 py-8 text-center text-sm text-[var(--color-text-tertiary)]">{lang === 'so' ? 'Ma jiraan gudbin sugaya' : 'No pending submissions'}</p>}</div></section>
    </div>
    <div className="space-y-6"><section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm overflow-hidden"><div className="px-6 py-4 border-b border-[var(--color-border-subtle)]"><h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" />{lang === 'so' ? 'Hogaamiyayaasha XP' : 'XP Leaderboard'}</h2><div className="flex items-center gap-2 mt-2"><Zap className="h-3.5 w-3.5 text-amber-500" /><span className="text-xs font-semibold text-amber-700">{g?.totalClassXP?.toLocaleString() || 0} {lang === 'so' ? 'XP Class' : 'Class XP'}</span></div></div><div className="divide-y divide-[var(--color-border-subtle)]">{g?.topStudents?.slice(0, 8).map((student, idx) => <div key={student.studentId} className="flex items-center gap-3 px-6 py-3"><span className="text-xs font-bold w-5">{idx + 1}</span><div className="flex-1 min-w-0"><p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{student.name}{student.streak > 0 && <span className="text-[10px] text-orange-500"> 🔥{student.streak}</span>}</p><div className="flex items-center gap-2 mt-0.5"><div className="w-20 h-1.5 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500" style={{ width: `${Math.min(100, (student.xp / 1000) * 100)}%` }} /></div><span className="text-[10px] text-[var(--color-text-tertiary)]">{student.xp} XP</span></div></div><span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Lv.{student.level}</span></div>)}{!g && !gamificationError && <p className="px-6 py-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading gamification…</p>}{g && g.topStudents.length === 0 && <p className="px-6 py-8 text-center text-sm text-[var(--color-text-tertiary)]">{lang === 'so' ? 'Wali ma jiraan arday' : 'No student participation yet'}</p>}</div></section>
      <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] shadow-sm p-6"><h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">{lang === 'so' ? 'Tallaabooyin Degdeg ah' : 'Quick Actions'}</h2><div className="grid grid-cols-2 gap-3"><Link to="/teacher/quizzes/create" className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-4"><span className="text-2xl">❓</span><span className="text-[10px] font-semibold text-emerald-700">{lang === 'so' ? 'Abuur Quiz' : 'Create Quiz'}</span></Link><Link to="/teacher/gradebook" className="flex flex-col items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 p-4"><span className="text-2xl">📊</span><span className="text-[10px] font-semibold text-blue-700">{lang === 'so' ? 'Qiimee' : 'Grade'}</span></Link><Link to="/teacher/lessons" className="flex flex-col items-center gap-2 rounded-xl bg-purple-50 border border-purple-200 p-4"><span className="text-2xl">📖</span><span className="text-[10px] font-semibold text-purple-700">{lang === 'so' ? 'Casharrada' : 'Lessons'}</span></Link><Link to="/teacher/analytics" className="flex flex-col items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 p-4"><span className="text-2xl">📈</span><span className="text-[10px] font-semibold text-amber-700">{lang === 'so' ? 'Falanqayn' : 'Analytics'}</span></Link></div></section>
    </div></div>
  </div>;
}
export default TeacherDashboard;
