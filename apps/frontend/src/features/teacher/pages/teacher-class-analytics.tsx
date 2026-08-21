/**
 * Teacher Class Analytics — Class Performance Dashboard within assigned courses.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Users, Target, BookOpen, BarChart3, AlertCircle, Zap, Star } from 'lucide-react';
import api from '../../../lib/axios';

export function TeacherClassAnalytics() {
  const { i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'so' | 'ar';
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState(searchParams.get('courseId') || '');
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/courses?limit=100');
        setCourses(data.data?.results || data.data?.data || []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const queryCourseId = searchParams.get('courseId');
    if (queryCourseId) setSelectedCourse(queryCourseId);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedCourse) {
      setAnalytics(null);
      return;
    }
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get(`/teacher-portal/courses/${selectedCourse}/analytics`);
        setAnalytics(data.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load analytics');
      } finally { setLoading(false); }
    })();
  }, [selectedCourse]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-extrabold text-[var(--color-text-primary)] mb-6">
        {lang === 'so' ? 'Falanqaynta Fasalka' : lang === 'ar' ? 'تحليلات الصف' : 'Class Analytics'}
      </h1>

      <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)}
        className="w-full sm:w-80 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-emerald-500 outline-none mb-6">
        <option value="">{lang === 'so' ? '-- Dooro koorso --' : '-- Select a course --'}</option>
        {courses.map((c: any) => <option key={c._id} value={c._id}>{typeof c.title === 'object' ? c.title.en : c.title}</option>)}
      </select>

      {error && <div className="mb-4 rounded-xl bg-red-50 p-4"><AlertCircle className="h-5 w-5 text-red-500 inline mr-2" /><span className="text-sm text-red-600">{error}</span></div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" /></div>
      ) : analytics ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: lang === 'so' ? 'Ardayda' : 'Students', value: analytics.totalStudents, icon: Users, color: 'text-blue-600 bg-blue-50' },
              { label: lang === 'so' ? 'Gudbinta' : 'Submissions', value: analytics.totalSubmissions, icon: BookOpen, color: 'text-purple-600 bg-purple-50' },
              { label: lang === 'so' ? 'Qiimeeyay' : 'Graded', value: analytics.gradedCount, icon: Star, color: 'text-emerald-600 bg-emerald-50' },
              { label: lang === 'so' ? 'Sugaya' : 'Pending', value: analytics.pendingCount, icon: Target, color: 'text-amber-600 bg-amber-50' },
              { label: lang === 'so' ? 'Celceliska' : 'Avg Grade', value: `${analytics.avgClassGrade}%`, icon: TrendingUp, color: 'text-rose-600 bg-rose-50' },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
                <div className={`inline-flex p-2 rounded-lg ${card.color} mb-2`}><card.icon className="h-4 w-4" /></div>
                <p className="text-xl font-extrabold">{card.value}</p>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">
              {lang === 'so' ? 'Waxqabadka Ardayga' : 'Student Performance'}
            </h2>
            <div className="space-y-3">
              {(analytics.studentPerformance || []).map((sp: any) => (
                <div key={sp.studentId} className="flex items-center gap-3 rounded-lg bg-[var(--color-surface-secondary)] px-4 py-3">
                  <span className="text-sm font-semibold flex-1">{sp.name}</span>
                  <span className="text-xs text-amber-600"><Zap className="h-3 w-3 inline" /> {sp.xp} XP</span>
                  <span className="text-xs text-[var(--color-text-tertiary)]">{sp.submissionsCount} subs</span>
                  <span className="text-xs font-bold text-emerald-600">{sp.averageGrade !== null ? `${sp.averageGrade}%` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20"><BarChart3 className="h-16 w-16 text-[var(--color-text-tertiary)] mx-auto mb-4" /><p className="text-sm text-[var(--color-text-tertiary)]">{lang === 'so' ? 'Dooro koorso' : 'Select a course to view analytics'}</p></div>
      )}
    </div>
  );
}

export default TeacherClassAnalytics;
