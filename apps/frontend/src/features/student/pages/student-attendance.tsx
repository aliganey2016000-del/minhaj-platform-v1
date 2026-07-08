import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface AttendanceData { studentId: string; total: number; present: number; late: number; absent: number; excused: number; percentage: number; }

export function StudentAttendance() {
  const { t } = useTranslation('common');
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { (async () => { try { const { data: res } = await api.get('/attendance/my'); setData(res.data); } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setLoading(false); } })(); }, [t]);

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;
  if (!data) return null;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10"><div className="mx-auto max-w-6xl space-y-6">
      <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📅 {t('attendance')}</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{data.studentId} · {data.total} {t('total')} records</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card text-center"><p className="text-5xl font-bold mb-2" style={{color:data.percentage>=75?'#059669':'#dc2626'}}>{data.percentage}%</p><p className="text-sm text-[var(--color-text-tertiary)]">{t('attendance')}</p><div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)] mt-4"><div className={`h-full rounded-full ${data.percentage>=75?'bg-green-500':'bg-red-500'} transition-all duration-700`} style={{width:`${data.percentage}%`}}/></div></div>
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card text-center"><p className="text-5xl font-bold text-blue-600 mb-2">{data.total}</p><p className="text-sm text-[var(--color-text-tertiary)]">{t('total')} Records</p></div>
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <StatusCard label={t('present')} value={data.present} color="bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900/50" textColor="text-green-700 dark:text-green-300" icon="✅"/>
        <StatusCard label={t('late')} value={data.late} color="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50" textColor="text-amber-700 dark:text-amber-300" icon="⏰"/>
        <StatusCard label={t('absent')} value={data.absent} color="bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50" textColor="text-red-700 dark:text-red-300" icon="❌"/>
        <StatusCard label={t('excused')} value={data.excused} color="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50" textColor="text-blue-700 dark:text-blue-300" icon="📝"/>
      </div>
    </div></div>
  );
}

function StatusCard({ label, value, color, textColor, icon }: { label: string; value: number; color: string; textColor: string; icon: string }) {
  return <div className={`rounded-xl border ${color} p-4 text-center`}><p className="text-lg mb-1">{icon}</p><p className={`text-2xl font-bold ${textColor}`}>{value}</p><p className="text-xs text-[var(--color-text-tertiary)]">{label}</p></div>;
}

export default StudentAttendance;