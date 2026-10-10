import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, CalendarClock, ClipboardList, FileJson, GraduationCap, Inbox, Languages, ListFilter, MoreVertical, Settings2, UploadCloud,
} from 'lucide-react';
import api from '../../../lib/axios';
import { GuuldoonUnmatchedAnswers } from '../components/guuldoon-unmatched-answers';
import { accentFor } from '../components/guuldoon-builder/accents';
import { GuuldoonBuilderChapterCard } from '../components/guuldoon-builder/chapter-card';
import { Drawer, ExamsPanel, GlossaryPanel, JsonImportPanel, SettingsPanel } from '../components/guuldoon-builder/drawers';
import { courseTitle, errorMessage, type Overview } from '../components/guuldoon-builder/types';

type Filter = 'order' | 'important' | 'weak';
type DrawerKey = 'settings' | 'exams' | 'json' | 'glossary' | 'answers';
type Toast = { id: number; message: string; tone: 'ok' | 'error' };

const drawerMeta: Record<DrawerKey, { title: string; subtitle: string; icon: JSX.Element }> = {
  settings: { title: 'Course Settings', subtitle: 'Pass target iyo taariikhda imtixaanka', icon: <Settings2 size={20} /> },
  exams: { title: 'Imtixaanada hore', subtitle: 'Sannadaha, Publish iyo answer key', icon: <GraduationCap size={20} /> },
  json: { title: 'Su’aalo JSON', subtitle: 'Ku dar su’aalo gacanta', icon: <FileJson size={20} /> },
  glossary: { title: 'Glossary', subtitle: 'Ereyada saddex luqadood', icon: <Languages size={20} /> },
  answers: { title: 'Jawaabaha la dhex-eego', subtitle: 'Jawaabo qoraal ah oo sugaya go’aan', icon: <Inbox size={20} /> },
};

export function GuuldoonBuilder() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('order');
  const [openChapter, setOpenChapter] = useState<string | null>(searchParams.get('chapter'));
  const returnSection = searchParams.get('section') === 'lessons' ? 'lessons' : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKey | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number>();

  // The first load shows a spinner; later refreshes (after an edit) update in place so the page never flashes.
  const load = useCallback(async () => {
    if (!courseId) return;
    try {
      const { data } = await api.get(`/guuldoon/admin/builder/courses/${courseId}`);
      setOverview(data.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Guuldoon Builder lama soo rari karin.'));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const notify = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const chapters = useMemo(() => {
    const rows = [...(overview?.chapters || [])];
    if (filter === 'important') rows.sort((a, b) => b.examWeight - a.examWeight || a.order - b.order);
    if (filter === 'weak') rows.sort((a, b) => (a.avgMastery ?? 101) - (b.avgMastery ?? 101) || a.order - b.order);
    return rows;
  }, [overview, filter]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500/20 border-t-primary-500" /></div>;
  if (!overview || !courseId) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <button onClick={() => navigate('/admin/global-courses')} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Guuldoon Courses</button>
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error || 'Course lama helin.'} <button className="underline" onClick={() => { setLoading(true); void load(); }}>Mar kale isku day</button></div>
      </div>
    );
  }

  const imported = overview.mode === 'imported';
  const { stats, course } = overview;
  const weightOk = Math.abs(stats.totalWeight - 100) <= 0.5;
  const targetDate = overview.config.targetExamDate ? new Date(overview.config.targetExamDate) : null;
  const daysLeft = targetDate ? Math.ceil((targetDate.getTime() - Date.now()) / 86400000) : null;

  const openDrawer = (key: DrawerKey) => { setMenuOpen(false); setDrawer(key); };
  const closeDrawer = () => { setDrawer(null); void load(); };

  const menuItem = (icon: JSX.Element, tone: string, title: string, description: string, onClick: () => void, badge?: number) => (
    <button key={title} type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--color-surface-tertiary)]">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-black">{title}</span><span className="block truncate text-xs text-[var(--color-text-tertiary)]">{description}</span></span>
      {badge ? <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-black text-white">{badge}</span> : null}
    </button>
  );
  const groupLabel = (label: string) => <p className="px-3 pb-1 pt-3 text-[10px] font-black uppercase tracking-[.14em] text-[var(--color-text-tertiary)]">{label}</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={() => navigate('/admin/global-courses')} className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Guuldoon Courses</button>
          <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Guuldoon · Grade {course.grade}</p>
          <h1 className="mt-1 break-words text-2xl font-black sm:text-3xl">{courseTitle(course.title)}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
            <span className={'rounded-full px-3 py-1 ' + (course.status === 'published' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/15')}>{course.status === 'published' ? '● Published' : 'Draft'}</span>
            <span className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-500">{course.students} arday</span>
            {targetDate && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-amber-500"><CalendarClock size={13} /> Imtixaanka: {targetDate.toLocaleDateString()}{daysLeft !== null && daysLeft >= 0 ? ` · ${daysLeft} maalmood` : ''}</span>}
          </div>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button type="button" onClick={() => setMenuOpen(open => !open)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Menu-ga dejinta" className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm">
            <MoreVertical size={20} />
            {stats.unmatchedPending > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{stats.unmatchedPending}</span>}
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-[52px] z-30 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-2xl">
              {groupLabel('Xogta course-ka')}
              {menuItem(<UploadCloud size={17} />, 'bg-emerald-500/10 text-emerald-500', 'Import Full Course', 'Excel-ka cutubyada, su’aalaha, glossary', () => navigate(`/admin/global-courses/${courseId}/import`))}
              {!imported && menuItem(<BookOpen size={17} />, 'bg-sky-500/10 text-sky-500', 'Chapters & Lessons', 'Casharrada Course Builder-ka', () => navigate(`/admin/courses/${courseId}/builder`))}
              {groupLabel('Dejinta')}
              {menuItem(<Settings2 size={17} />, 'bg-violet-500/10 text-violet-500', 'Course Settings', 'Pass target iyo taariikhda imtixaanka', () => openDrawer('settings'))}
              {menuItem(<GraduationCap size={17} />, 'bg-sky-500/10 text-sky-500', 'Imtixaanada hore', 'Sannadaha, Publish, answer key', () => openDrawer('exams'))}
              {!imported && menuItem(<FileJson size={17} />, 'bg-emerald-500/10 text-emerald-500', 'Su’aalo JSON', 'Ku dar su’aalo gacanta', () => openDrawer('json'))}
              {menuItem(<Languages size={17} />, 'bg-amber-500/10 text-amber-500', 'Glossary', `${overview.glossary.terms.length} eray`, () => openDrawer('glossary'))}
              {groupLabel('Ardayda')}
              {menuItem(<Inbox size={17} />, 'bg-rose-500/10 text-rose-500', 'Jawaabaha la dhex-eego', 'Jawaabo qoraal ah oo sugaya go’aan', () => openDrawer('answers'), stats.unmatchedPending)}
            </div>
          )}
        </div>
      </header>

      <section aria-label="Kooban" className="grid items-center gap-5 overflow-hidden rounded-[26px] bg-gradient-to-br from-emerald-800 via-teal-800 to-sky-900 p-5 text-white sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#6ee7b7 ${Math.min(100, stats.passMeter)}%, rgba(255,255,255,.18) 0)` }}>
            <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full bg-emerald-950 text-center">
              <strong className="text-2xl leading-none">{stats.passMeter}%</strong>
              <span className="mt-1 text-[10px] text-white/60">Celcelis</span>
            </div>
          </div>
          <div className="sm:hidden"><p className="text-sm font-black">Pass Meter ardayda</p><p className="text-xs text-white/70">Target: {overview.config.passTarget}%</p></div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            [stats.chapters, 'Cutub'],
            [stats.questions, 'Su’aalo'],
            [stats.pastExams, 'Sanad imtixaan'],
            [`${overview.config.passTarget}%`, 'Target'],
          ].map(([value, label]) => (
            <div key={String(label)} className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5">
              <strong className="block text-xl tabular-nums">{value}</strong>
              <span className="text-[11px] text-white/70">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Miisaanka cutubyada" className="student-glass-card rounded-[22px] p-4">
        <div className="mb-2 flex items-center justify-between text-xs font-black">
          <span>Miisaanka imtixaanka (cutub kasta)</span>
          <span className={weightOk ? 'text-emerald-500' : 'text-amber-500'}>{stats.totalWeight}%{!weightOk && ' · waa inuu noqdaa 100%'}</span>
        </div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
          {overview.chapters.filter(chapter => chapter.examWeight > 0).map(chapter => (
            <div key={chapter.id} title={`${chapter.title}: ${chapter.examWeight}%`} className={accentFor(overview.chapters.indexOf(chapter)).solid} style={{ flex: chapter.examWeight }} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
          {overview.chapters.map((chapter, index) => <span key={chapter.id}><i className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px] ${accentFor(index).solid}`} />{chapter.order}. {chapter.examWeight}%</span>)}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Cutubyada</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">Sidan ayuu ardaygu u arkaa. Cutub fur si aad u aragto casharrada iyo su’aalaha; ✏️ riix si aad meesha uga saxdo.</p>
          </div>
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1" role="group" aria-label="Kala soocid">
            <ListFilter size={15} className="ml-2 shrink-0 text-[var(--color-text-tertiary)]" />
            {([['order', 'Isku xigga'], ['important', 'Ugu muhiimsan'], ['weak', 'Ardaydu ku liitaan']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ' + (filter === value ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)]')}>{label}</button>
            ))}
          </div>
        </div>

        {imported && (
          <p className="flex items-start gap-2 rounded-2xl border border-violet-500/25 bg-violet-500/10 px-3 py-2.5 text-xs font-semibold text-[var(--color-text-secondary)]">
            <ClipboardList size={15} className="mt-0.5 shrink-0 text-violet-500" />
            <span>Wixii gacanta lagu saxo waxaa lagu calaamadeeyaa <strong className="text-violet-500">La beddelay</strong>. Marka Excel-ka dib loo import-gareeyo, saxitaankaaga lama beddelayo.</span>
          </p>
        )}

        {!chapters.length && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-8 text-center text-sm text-[var(--color-text-tertiary)]">Cutubyo wali ma jiraan. Isticmaal <strong>Import Full Course</strong> (menu-ga ⋮) si aad u soo geliso.</div>}

        <div className="space-y-3">
          {chapters.map(chapter => (
            <GuuldoonBuilderChapterCard
              key={chapter.id}
              courseId={courseId}
              chapter={chapter}
              index={overview.chapters.indexOf(chapter)}
              chapters={overview.chapters}
              open={openChapter === chapter.id}
              imported={imported}
              onToggle={() => setOpenChapter(current => current === chapter.id ? null : chapter.id)}
              onChanged={() => void load()}
              notify={notify}
              onOpenLegacyBuilder={() => navigate(`/admin/courses/${courseId}/builder`)}
              onOpenLesson={lessonId => navigate(`/admin/global-courses/${courseId}/guuldoon-builder/chapters/${encodeURIComponent(chapter.id)}/lessons/${lessonId}`)}
              initialSection={chapter.id === searchParams.get('chapter') ? returnSection : null}
            />
          ))}
        </div>
      </section>

      {drawer && (
        <Drawer title={drawerMeta[drawer].title} subtitle={drawerMeta[drawer].subtitle} icon={drawerMeta[drawer].icon} onClose={closeDrawer}>
          {drawer === 'settings' && <SettingsPanel courseId={courseId} overview={overview} onSaved={() => void load()} notify={notify} />}
          {drawer === 'exams' && <ExamsPanel courseId={courseId} exams={overview.exams} onChanged={() => void load()} notify={notify} />}
          {drawer === 'json' && <JsonImportPanel exams={overview.exams} chapters={overview.chapters} notify={notify} onImported={() => void load()} />}
          {drawer === 'glossary' && <GlossaryPanel courseId={courseId} overview={overview} onSaved={() => void load()} notify={notify} />}
          {drawer === 'answers' && <GuuldoonUnmatchedAnswers courseId={courseId} />}
        </Drawer>
      )}

      {toast && (
        <div role="status" aria-live="polite" className={'fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-xl ' + (toast.tone === 'error' ? 'bg-red-600' : 'bg-slate-900')}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
