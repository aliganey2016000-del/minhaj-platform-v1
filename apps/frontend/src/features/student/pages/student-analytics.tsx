/**
 * Student Progress Analytics Dashboard
 *
 * Route: /student/analytics
 *
 * Visualizes learning progress with:
 *   - XP & Level progress bar
 *   - Streak calendar (GitHub-style contribution heatmap)
 *   - Weekly learning time chart (bar chart)
 *   - Course completion donut chart
 *   - Quiz performance over time
 *   - Badge showcase
 *   - Leaderboard snippet
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  TrendingUp, Clock, BookOpen, Target, Zap, Award, Flame, Calendar,
  ChevronRight, Trophy, Star, BarChart3, PieChart, Activity,
} from 'lucide-react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GamificationData {
  _id: string;
  xp: number;
  level: number;
  xpToNextLevel: number;
  streak: { current: number; longest: number; lastActivityDate: string | null };
  totalBadges: number;
  earnedBadges: { badgeKey: string; earnedAt: string; badge: { key: string; name: { en: string; so: string; ar: string }; icon: string; color: string; category: string } | null }[];
  totalLessonsCompleted: number;
  totalQuizzesCompleted: number;
  totalPerfectScores: number;
  totalTimeSpentSeconds: number;
  recentXPLog: { amount: number; source: string; description: string; earnedAt: string }[];
  weeklyActivity: { date: string; xpEarned: number; lessonsCompleted: number; quizzesCompleted: number }[];
  allBadges: { key: string; name: { en: string; so: string; ar: string }; icon: string; color: string; category: string }[];
}

interface LeaderboardEntry {
  rank: number;
  studentId: string;
  name: string;
  avatar?: string;
  xp: number;
  level: number;
  badges: number;
  streak: number;
}

interface CourseProgressSummary {
  total: number;
  completed: number;
  inProgress: number;
  courses: { _id: string; title: { en: string; so: string; ar: string }; progressPercent: number; status: string }[];
}

interface WeeklyActivity {
  day: string;
  date: string;
  xpEarned: number;
  lessonsCompleted: number;
  quizzesCompleted: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StudentAnalytics() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'so' | 'ar';

  const [gam, setGam] = useState<GamificationData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [courseProgress, setCourseProgress] = useState<CourseProgressSummary | null>(null);
  const [weeklyActivity, setWeeklyActivity] = useState<WeeklyActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Fire all requests independently — one failing won't crash the whole page
      const results = await Promise.allSettled([
        api.get('/gamification/my').then(r => r.data).catch(() => null),
        api.get('/gamification/leaderboard?limit=10').then(r => r.data).catch(() => null),
        api.get('/students/my/dashboard').then(r => r.data).catch(() => null),
      ]);

      if (cancelled) return;

      // Gamification data
      const gamResult = results[0];
      if (gamResult.status === 'fulfilled' && gamResult.value?.data) {
        const gamData: GamificationData = gamResult.value.data;
        setGam(gamData);
        setWeeklyActivity(mapWeeklyActivity(gamData.weeklyActivity || [], lang));
      } else {
        console.warn('Gamification API unavailable — showing empty analytics');
        setWeeklyActivity(mapWeeklyActivity([], lang));
      }

      // Leaderboard
      const lbResult = results[1];
      if (lbResult.status === 'fulfilled' && lbResult.value?.data) {
        setLeaderboard(lbResult.value.data);
      }

      // Dashboard → course progress
      const dashResult = results[2];
      if (dashResult.status === 'fulfilled' && dashResult.value?.data) {
        const dashData = dashResult.value.data;
        const enrolledCourses = dashData.enrolledCourses || [];
        const coursesWithProgress = enrolledCourses.map((c: any) => ({
          _id: c._id,
          title: c.title,
          progressPercent: c.progressPercent || 0,
          status: c.status || 'in_progress',
        }));

        setCourseProgress({
          total: coursesWithProgress.length,
          completed: coursesWithProgress.filter((c: any) => c.status === 'completed').length,
          inProgress: coursesWithProgress.filter((c: any) => c.status === 'in_progress').length,
          courses: coursesWithProgress,
        });
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600" />
        <p className="text-sm text-[var(--color-text-tertiary)]">
          {lang === 'so' ? 'Diyaarinta xogtaada...' : lang === 'ar' ? 'تحضير بياناتك...' : 'Loading your data...'}
        </p>
      </div>
    </div>
  );

  const xpPercent = gam ? Math.round((gam.xp / (gam.xp + gam.xpToNextLevel)) * 100) : 0;
  const totalHours = gam ? Math.floor(gam.totalTimeSpentSeconds / 3600) : 0;
  const totalMinutes = gam ? Math.floor((gam.totalTimeSpentSeconds % 3600) / 60) : 0;

  const earnedBadgeKeys = new Set(gam?.earnedBadges.map(b => b.badgeKey) || []);
  const badgesByCategory = groupBadgesByCategory(gam?.allBadges || [], gam?.earnedBadges || []);

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)]">
      <div className="mx-auto max-w-6xl px-6 space-y-8 pb-16 pt-4">
        {/* ── Header ── */}
        <div>
          <h1 className="text-3xl font-extrabold text-[var(--color-text-primary)]">
            {lang === 'so' ? 'Falanqaynta Horumarka' : lang === 'ar' ? 'تحليلات التقدم' : 'Progress Analytics'}
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {lang === 'so' ? 'La soco horumarkaaga waxbarasho ee guud' : lang === 'ar' ? 'تتبع تقدمك التعليمي العام' : 'Track your overall learning progress'}
          </p>
        </div>

        {/* ── Level & XP Bar ── */}
        {gam && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white text-xl font-bold shadow-lg shadow-amber-500/20">
                  {gam.level}
                </div>
                <div>
                  <p className="font-bold text-[var(--color-text-primary)]">
                    {lang === 'so' ? `Heerka ${gam.level}` : lang === 'ar' ? `المستوى ${gam.level}` : `Level ${gam.level}`}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {gam.xp.toLocaleString()} XP • {gam.xpToNextLevel.toLocaleString()} XP {lang === 'so' ? 'loo baahan' : lang === 'ar' ? 'مطلوب' : 'to next level'}
                  </p>
                </div>
              </div>
              <Link
                to="/student/achievements"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                {lang === 'so' ? 'Dhamaan' : lang === 'ar' ? 'الكل' : 'All'}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {/* XP Progress Bar */}
            <div className="w-full h-3 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500"
                initial={{ width: 0 }}
                animate={{ width: `${xpPercent}%` }}
                transition={{ duration: 1.2, type: 'spring' }}
              />
            </div>
          </motion.div>
        )}

        {/* ── Quick Stats Grid ── */}
        {gam && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Flame className="h-5 w-5" />}
              iconBg="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
              value={gam.streak?.current || 0}
              unit={lang === 'so' ? 'maalmood' : lang === 'ar' ? 'أيام' : 'days'}
              label={lang === 'so' ? 'Streak-ga Hadda' : lang === 'ar' ? 'التتابع الحالي' : 'Current Streak'}
              sub={gam.streak?.longest ? `${lang === 'so' ? 'Ugu badnaa' : lang === 'ar' ? 'الأطول' : 'Longest'}: ${gam.streak.longest}` : ''}
            />
            <StatCard
              icon={<Trophy className="h-5 w-5" />}
              iconBg="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
              value={gam.totalBadges}
              unit={lang === 'so' ? 'calaamadood' : lang === 'ar' ? 'شارة' : 'badges'}
              label={lang === 'so' ? 'Calaamadaha La Helay' : lang === 'ar' ? 'الشارات المكتسبة' : 'Badges Earned'}
              sub={`${gam.totalBadges}/${gam.allBadges?.length || 12}`}
            />
            <StatCard
              icon={<BookOpen className="h-5 w-5" />}
              iconBg="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
              value={gam.totalLessonsCompleted}
              unit={lang === 'so' ? 'cashar' : lang === 'ar' ? 'درس' : 'lessons'}
              label={lang === 'so' ? 'Casharada La Dhameeyay' : lang === 'ar' ? 'الدروس المكتملة' : 'Lessons Completed'}
            />
            <StatCard
              icon={<Clock className="h-5 w-5" />}
              iconBg="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
              value={totalHours > 0 ? `${totalHours}h ${totalMinutes}m` : `${totalMinutes}m`}
              unit=""
              label={lang === 'so' ? 'Waqtiga Waxbarashada' : lang === 'ar' ? 'وقت التعلم' : 'Total Study Time'}
            />
          </div>
        )}

        {/* ── Weekly Activity Bar Chart ── */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              {lang === 'so' ? 'Hawlaha Toddobaadkan' : lang === 'ar' ? 'نشاط هذا الأسبوع' : 'This Week\'s Activity'}
            </h2>
          </div>
          <div className="flex items-end justify-between gap-2 h-40">
            {weeklyActivity.map((day, idx) => {
              const maxXp = Math.max(...weeklyActivity.map(d => d.xpEarned), 1);
              const height = day.xpEarned > 0 ? Math.max(6, (day.xpEarned / maxXp) * 140) : 2;
              const activityCount = day.lessonsCompleted + day.quizzesCompleted;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1" title={activityCount > 0 ? `${activityCount} ${lang === 'so' ? 'hawlood' : lang === 'ar' ? 'نشاط' : 'activities'}` : ''}>
                  <span className="text-[10px] font-semibold text-[var(--color-text-secondary)]">
                    {day.xpEarned > 0 ? `+${day.xpEarned}` : ''}
                  </span>
                  <motion.div
                    className={`w-full max-w-[40px] rounded-t-lg ${day.xpEarned > 0 ? 'bg-gradient-to-t from-emerald-400 to-emerald-300 dark:from-emerald-600 dark:to-emerald-400' : 'bg-[var(--color-surface-tertiary)]'}`}
                    initial={{ height: 0 }}
                    animate={{ height }}
                    transition={{ duration: 0.6, delay: idx * 0.05 }}
                  />
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    {day.day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Course Completion Donut ── */}
        {courseProgress && courseProgress.total > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6">
              <div className="flex items-center gap-2 mb-4">
                <PieChart className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                  {lang === 'so' ? 'Koorsooyinka' : lang === 'ar' ? 'الدورات' : 'Courses'}
                </h2>
              </div>
              <div className="flex items-center gap-6">
                {/* Donut */}
                <div className="relative w-28 h-28 flex-shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-surface-tertiary)" strokeWidth="12" />
                    {courseProgress.completed > 0 && (
                      <motion.circle
                        cx="50" cy="50" r="40" fill="none" stroke="#10b981"
                        strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={`${(courseProgress.completed / courseProgress.total) * 251} 251`}
                        initial={{ strokeDasharray: '0 251' }}
                        animate={{ strokeDasharray: `${(courseProgress.completed / courseProgress.total) * 251} 251` }}
                        transition={{ duration: 1 }}
                      />
                    )}
                    {courseProgress.inProgress > 0 && (
                      <motion.circle
                        cx="50" cy="50" r="40" fill="none" stroke="#f59e0b"
                        strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={`${(courseProgress.inProgress / courseProgress.total) * 251} 251`}
                        strokeDashoffset={`${-(courseProgress.completed / courseProgress.total) * 251}`}
                        initial={{ strokeDasharray: '0 251', strokeDashoffset: '0' }}
                        animate={{ strokeDasharray: `${(courseProgress.inProgress / courseProgress.total) * 251} 251`, strokeDashoffset: `${-(courseProgress.completed / courseProgress.total) * 251}` }}
                        transition={{ duration: 1 }}
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-[var(--color-text-primary)]">{courseProgress.total}</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {courseProgress.completed} {lang === 'so' ? 'La dhameeyay' : lang === 'ar' ? 'مكتمل' : 'Completed'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {courseProgress.inProgress} {lang === 'so' ? 'Socda' : lang === 'ar' ? 'قيد التقدم' : 'In Progress'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Course list */}
              <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                {courseProgress.courses.slice(0, 5).map(c => (
                  <Link key={c._id} to={`/student/courses/${c._id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--color-surface-tertiary)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                        {lang === 'so' ? c.title.so || c.title.en : lang === 'ar' ? c.title.ar || c.title.en : c.title.en}
                      </p>
                      <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-tertiary)] mt-1 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-emerald-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${c.progressPercent}%` }}
                          transition={{ duration: 0.8 }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--color-text-tertiary)]">{c.progressPercent}%</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Leaderboard Snippet */}
            <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                    {lang === 'so' ? 'Hogaanka' : lang === 'ar' ? 'لوحة المتصدرين' : 'Leaderboard'}
                  </h2>
                </div>
                <Link
                  to="/student/leaderboard"
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  {lang === 'so' ? 'Eeg dhamaan' : lang === 'ar' ? 'عرض الكل' : 'View All'}
                </Link>
              </div>
              <div className="space-y-2">
                {leaderboard.slice(0, 5).map((entry, idx) => (
                  <div key={idx} className={`flex items-center gap-3 rounded-xl p-3 ${idx === 0 ? 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border border-amber-200 dark:border-amber-800' : 'hover:bg-[var(--color-surface-tertiary)] transition-colors'}`}>
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0 ? 'bg-amber-400 text-white' :
                      idx === 1 ? 'bg-gray-300 text-gray-700' :
                      idx === 2 ? 'bg-amber-600 text-white' :
                      'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]'
                    }`}>
                      {entry.rank}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {entry.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{entry.name}</p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)]">Lv.{entry.level} • {entry.xp.toLocaleString()} XP</p>
                    </div>
                    {entry.badges > 0 && (
                      <div className="flex items-center gap-1">
                        <Award className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{entry.badges}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Badge Showcase ── */}
        {gam && gam.earnedBadges.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                  {lang === 'so' ? 'Calaamadahaagii La Helay' : lang === 'ar' ? 'شاراتك المكتسبة' : 'Your Earned Badges'}
                </h2>
              </div>
              <Link to="/student/achievements" className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                {lang === 'so' ? 'Dhamaan' : lang === 'ar' ? 'الكل' : 'All'}
              </Link>
            </div>
            <div className="flex flex-wrap gap-3">
              {gam.earnedBadges.slice(0, 8).map((eb, idx) => (
                <motion.div
                  key={idx}
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: idx * 0.05, type: 'spring' }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${eb.badge?.color || 'from-gray-400 to-gray-500'} flex items-center justify-center text-2xl shadow-lg`}>
                    {eb.badge?.icon || '🏅'}
                  </div>
                  <span className="text-[9px] font-medium text-[var(--color-text-tertiary)] text-center leading-tight max-w-[56px] truncate">
                    {lang === 'so' ? eb.badge?.name.so : lang === 'ar' ? eb.badge?.name.ar : eb.badge?.name.en}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Recent Activity Feed ── */}
        {gam && gam.recentXPLog && gam.recentXPLog.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                {lang === 'so' ? 'Dhaqdhaqaaqyadii Ugu Dambeeyay' : lang === 'ar' ? 'آخر النشاطات' : 'Recent Activity'}
              </h2>
            </div>
            <div className="space-y-2">
              {gam.recentXPLog.map((log, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{log.description}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {new Date(log.earnedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">+{log.amount} XP</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty State ── */}
        {(!gam || gam.xp === 0) && !loading && (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-12 text-center">
            <p className="text-5xl mb-4">📊</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              {lang === 'so' ? 'Weli wax horumar ah lama samayn' : lang === 'ar' ? 'لا يوجد تقدم حتى الآن' : 'No progress yet'}
            </p>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
              {lang === 'so' ? 'Bilow koorsooyin oo dhammee casharada si aad u heshid XP iyo calaamado!' : lang === 'ar' ? 'ابدأ الدورات وأكمل الدروس لكسب النقاط والشارات!' : 'Start courses and complete lessons to earn XP and badges!'}
            </p>
            <Link
              to="/student/courses"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
            >
              📚 {lang === 'so' ? 'Koorsooyinkayga' : lang === 'ar' ? 'دوراتي' : 'My Courses'}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function StatCard({ icon, iconBg, value, unit, label, sub }: {
  icon: React.ReactNode; iconBg: string; value: string | number; unit: string;
  label: string; sub?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-extrabold text-[var(--color-text-primary)]">{value}</p>
          {unit && <p className="text-[10px] text-[var(--color-text-tertiary)]">{unit}</p>}
        </div>
      </div>
      <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">{sub}</p>}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps the server's real per-day activity (from gamification.weeklyActivity) onto
 *  localized day-of-week labels — indexed by each date's actual weekday, not by
 *  loop position, so labels never drift if the page is opened on a day other than Sunday. */
function mapWeeklyActivity(
  serverDays: { date: string; xpEarned: number; lessonsCompleted: number; quizzesCompleted: number }[],
  lang: 'en' | 'so' | 'ar'
): WeeklyActivity[] {
  const dayNames: Record<'en' | 'so' | 'ar', string[]> = {
    // Sunday-first, matching Date#getDay()
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    so: ['Axd', 'Isn', 'Tal', 'Arb', 'Kha', 'Jim', 'Sab'],
    ar: ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'],
  };

  if (serverDays.length > 0) {
    return serverDays.map((d) => ({
      day: dayNames[lang][new Date(`${d.date}T00:00:00`).getDay()],
      date: d.date,
      xpEarned: d.xpEarned,
      lessonsCompleted: d.lessonsCompleted,
      quizzesCompleted: d.quizzesCompleted,
    }));
  }

  // Gamification data unavailable — show the last 7 real calendar days at zero,
  // never fabricated numbers.
  const now = new Date();
  const days: WeeklyActivity[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({
      day: dayNames[lang][d.getDay()],
      date: d.toISOString().slice(0, 10),
      xpEarned: 0,
      lessonsCompleted: 0,
      quizzesCompleted: 0,
    });
  }
  return days;
}

function groupBadgesByCategory(allBadges: GamificationData['allBadges'], earnedBadges: GamificationData['earnedBadges']) {
  const earnedKeys = new Set(earnedBadges.map(b => b.badgeKey));
  const categories: Record<string, { key: string; name: { en: string; so: string; ar: string }; icon: string; color: string; earned: boolean }[]> = {};

  for (const badge of allBadges) {
    const cat = (badge as any).category || 'milestone';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({
      ...badge,
      earned: earnedKeys.has(badge.key),
    });
  }
  return categories;
}

export default StudentAnalytics;