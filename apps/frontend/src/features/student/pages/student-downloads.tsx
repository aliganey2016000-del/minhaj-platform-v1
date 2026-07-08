/**
 * Student Downloads — Modern LMS Resources with i18n
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface Resource {
  _id: string; title: string; description: string;
  course?: { _id: string; title: { en: string }; slug: string };
  fileUrl: string; fileType: string; fileSize: number;
  category: string; downloads: number; createdAt: string;
}

const typeIcons: Record<string, string> = { pdf: '📄', doc: '📝', docx: '📝', ppt: '📊', mp4: '🎬', mp3: '🎵', zip: '📦', default: '📎' };
const catLabels: any = { material: { so: '📖 Agab', ar: '📖 مادة' }, lecture: { so: '🎙️ Duruus', ar: '🎙️ محاضرة' }, slides: { so: '📊 Slides', ar: '📊 شرائح' }, worksheet: { so: '📝 Shaqo', ar: '📝 ورقة عمل' }, other: { so: '📌 Kale', ar: '📌 آخر' } };

function formatSize(bytes: number): string {
  if (!bytes) return ''; if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`;
}
function getIcon(ft: string): string { for (const [k, v] of Object.entries(typeIcons)) { if (ft.includes(k)) return v; } return typeIcons.default; }

export function StudentDownloads() {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language as 'en'|'so'|'ar';
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');

  useEffect(() => { (async () => { try { const { data } = await api.get('/resources/my'); setResources(data.data || []); } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setLoading(false); } })(); }, [t]);

  const filtered = resources.filter(r => (!search || r.title.toLowerCase().includes(search.toLowerCase()) || (r.course?.title.en || '').toLowerCase().includes(search.toLowerCase())) && (!catFilter || r.category === catFilter));
  const categories = [...new Set(resources.map(r => r.category))];
  const totalSize = resources.reduce((s, r) => s + (r.fileSize || 0), 0);
  const courseCount = new Set(resources.map(r => r.course?._id).filter(Boolean)).size;

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">{t('retry')}</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10"><div className="mx-auto max-w-6xl space-y-6">
      <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📥 {t('downloads')}</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{resources.length} {t('files')} ({courseCount} courses · {formatSize(totalSize)})</p></div>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-4 text-center"><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{resources.length}</p><p className="text-xs">{t('files')}</p></div>
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-center"><p className="text-2xl font-bold text-green-700 dark:text-green-300">{courseCount}</p><p className="text-xs">{t('courses')}</p></div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/30 p-4 text-center"><p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatSize(totalSize)}</p><p className="text-xs">Size</p></div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input type="text" placeholder={t('search')} value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">{t('all_categories')}</option>{categories.map(c=><option key={c} value={c}>{catLabels[c]?.[lang]||c}</option>)}</select>
      </div>
      {filtered.length===0?<div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-5xl mb-4">📥</p><p className="text-lg">{t('no_data')}</p></div>:<div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]"><tr><th className="text-left px-5 py-3 font-semibold">{lang==='so'?'Feeylasha':lang==='ar'?'الملف':'File'}</th><th className="text-left px-5 py-3 font-semibold hidden md:table-cell">{t('courses')}</th><th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Type</th><th className="text-center px-5 py-3 font-semibold hidden lg:table-cell">Size</th><th className="text-center px-5 py-3 font-semibold">{t('download')}</th></tr></thead><tbody>{filtered.map(r=>(<tr key={r._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="text-2xl flex-shrink-0">{getIcon(r.fileType)}</span><div className="min-w-0"><p className="font-semibold truncate">{r.title}</p>{r.description&&<p className="text-xs text-[var(--color-text-tertiary)] truncate">{r.description}</p>}</div></div></td><td className="px-5 py-4 hidden md:table-cell"><span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{r.course?.title.en||'—'}</span></td><td className="px-5 py-4 text-center hidden sm:table-cell"><span className="text-xs uppercase font-mono text-[var(--color-text-tertiary)]">{r.fileType}</span></td><td className="px-5 py-4 text-center hidden lg:table-cell text-xs text-[var(--color-text-tertiary)]">{formatSize(r.fileSize)}</td><td className="px-5 py-4 text-center"><a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">📥 {t('download')}</a></td></tr>))}</tbody></table></div></div>}
    </div></div>
  );
}
export default StudentDownloads;