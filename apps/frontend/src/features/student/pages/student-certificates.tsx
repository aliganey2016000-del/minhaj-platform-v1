import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface Certificate { _id: string; title: string; certificateNumber: string; course?: { _id: string; title: { en: string; so: string; ar: string } }; issueDate: string; expiryDate?: string; grade?: string; status: string; }

export function StudentCertificates() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en'|'so'|'ar';
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { (async () => { try { const { data: certsData } = await api.get('/certificates/my'); setCerts(certsData.data || []); } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setLoading(false); } })(); }, [t]);

  const getTitle = (c: any) => { if(lang==='so'&&c?.title?.so)return c.title.so; if(lang==='ar'&&c?.title?.ar)return c.title.ar; return c?.title?.en||''; };
  const getStatusLabel = (s: string) => {
    if (lang==='so') return s==='issued'?t('issued'):t('revoked');
    if (lang==='ar') return s==='issued'?t('issued'):t('revoked');
    return s;
  };
  const issued = certs.filter(c => c.status === 'issued');
  const revoked = certs.filter(c => c.status === 'revoked');

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10"><div className="mx-auto max-w-6xl space-y-6">
      <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🏆 {t('certificates')}</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{certs.length} {t('total')} — {issued.length} {t('issued')}, {revoked.length} {t('revoked')}</p></div>
      <div className="grid grid-cols-2 gap-4"><div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-center"><p className="text-2xl font-bold text-green-700 dark:text-green-300">{issued.length}</p><p className="text-xs">{t('issued')}</p></div><div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-2xl font-bold text-red-700 dark:text-red-300">{revoked.length}</p><p className="text-xs">{t('revoked')}</p></div></div>
      {certs.length===0?<div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-5xl mb-4">🏆</p><p className="text-lg">{t('no_data')}</p></div>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{certs.map(c=>(<div key={c._id} className={`rounded-2xl border bg-[var(--color-surface-primary)] p-5 shadow-card ${c.status==='revoked'?'border-red-300 opacity-60':'border-[var(--color-border-default)]'}`}>{c.course&&<span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300">{getTitle(c.course)}</span>}<h3 className="font-bold mt-2 mb-1">{c.title}</h3><code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{c.certificateNumber}</code><div className="mt-3 space-y-1 text-xs"><div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Lagu bixiyey':lang==='ar'?'صدر':'Issued'}</span><span className="font-semibold">{new Date(c.issueDate).toLocaleDateString()}</span></div>{c.grade&&<div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Darajada':lang==='ar'?'الدرجة':'Grade'}</span><span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-bold text-emerald-700">{c.grade}</span></div>}{c.expiryDate&&<div className="flex justify-between"><span className="text-[var(--color-text-tertiary)]">{lang==='so'?'Wuu dhacayaa':lang==='ar'?'تنتهي':'Expires'}</span><span className="font-semibold">{new Date(c.expiryDate).toLocaleDateString()}</span></div>}</div><div className="mt-3 pt-3 border-t"><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${c.status==='issued'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{getStatusLabel(c.status)}</span></div></div>))}</div>}
    </div></div>
  );
}
export default StudentCertificates;