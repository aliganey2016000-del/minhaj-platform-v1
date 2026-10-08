
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Layers3, Target } from 'lucide-react';
import api from '../../../lib/axios';
import type {
  GuuldoonChapterSummary,
  GuuldoonHighlightQuestion,
  GuuldoonLessonPayload,
  GuuldoonPracticeQuestion,
} from './guuldoon-chapters-types';
import { masteryBar, masteryText, yearChip } from './guuldoon-chapters-types';
import { GuuldoonLessonReader } from './guuldoon-lesson-reader';
import { GuuldoonPracticeView, GuuldoonYearQuestions } from './guuldoon-practice-view';

type Filter = 'sequence' | 'important' | 'unstarted';
type View = 'list' | 'lesson-list' | 'lesson-section' | 'practice' | 'years';

export function GuuldoonChaptersExperience({
  courseId,
  passMeter,
  passTarget,
  chapters,
  onRefresh,
}: {
  courseId: string;
  passMeter: number;
  passTarget: number;
  chapters: GuuldoonChapterSummary[];
  onRefresh: () => Promise<void> | void;
}) {
  const [filter, setFilter] = useState<Filter>('sequence');
  const [openChapterId, setOpenChapterId] = useState<string | null>(chapters[0]?.id || null);
  const [view, setView] = useState<View>('list');
  const [selectedChapter, setSelectedChapter] = useState<GuuldoonChapterSummary | null>(null);
  const [lesson, setLesson] = useState<GuuldoonLessonPayload | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [questions, setQuestions] = useState<GuuldoonPracticeQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswersState] = useState<Record<string, unknown>>({});
  const [feedback, setFeedback] = useState<Record<string, any>>({});
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!openChapterId && chapters.length) setOpenChapterId(chapters[0].id);
  }, [chapters, openChapterId]);

  const filteredChapters = useMemo(() => {
    const copy = [...chapters];
    if (filter === 'important') return copy.sort((a, b) => b.examWeight - a.examWeight || a.order - b.order);
    if (filter === 'unstarted') return copy.filter(chapter => chapter.attempts === 0).sort((a, b) => a.order - b.order);
    return copy.sort((a, b) => a.order - b.order);
  }, [chapters, filter]);

  const nextChapter = useMemo(
    () => chapters.find(chapter => !chapter.outsideBook && (chapter.attempts === 0 || chapter.mastery < 75))
      || chapters.find(chapter => !chapter.outsideBook)
      || chapters[0],
    [chapters],
  );

  const loadLesson = async (chapter: GuuldoonChapterSummary, page?: number) => {
    setSelectedChapter(chapter);
    setLessonLoading(true);
    setError('');
    try {
      const { data } = await api.get('/guuldoon/courses/' + courseId + '/chapters/' + chapter.id + '/lesson');
      const payload = data.data as GuuldoonLessonPayload;
      setLesson(payload);
      const foundIndex = page
        ? payload.sections.findIndex(section => {
            const from = section.pageFrom || 0;
            const to = section.pageTo || from;
            return from <= page && page <= to;
          })
        : 0;
      setSectionIndex(foundIndex >= 0 ? foundIndex : 0);
      setView(page ? 'lesson-section' : 'lesson-list');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Casharka cutubka lama furi karin.');
    } finally {
      setLessonLoading(false);
    }
  };

  const loadQuestions = async (chapter: GuuldoonChapterSummary, year?: number, focusQuestionId?: string) => {
    setSelectedChapter(chapter);
    setQuestionsLoading(true);
    setError('');
    try {
      const { data } = await api.get('/guuldoon/courses/' + courseId + '/chapters/' + chapter.id + '/questions', {
        params: { limit: 250, ...(year ? { year } : {}) },
      });
      const rows = (data.data?.questions || []) as GuuldoonPracticeQuestion[];
      setQuestions(rows);
      setSelectedYear(year || null);
      const foundIndex = focusQuestionId ? rows.findIndex(question => question._id === focusQuestionId) : 0;
      setQuestionIndex(foundIndex >= 0 ? foundIndex : 0);
      setAnswersState({});
      setFeedback({});
      return rows;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Su’aalaha cutubka lama furi karin.');
      return [];
    } finally {
      setQuestionsLoading(false);
    }
  };

  const openPractice = async (chapter: GuuldoonChapterSummary, year?: number, focusQuestionId?: string) => {
    await loadQuestions(chapter, year, focusQuestionId);
    setView('practice');
  };

  const openYears = async (chapter: GuuldoonChapterSummary, year?: number) => {
    const initialYear = year || chapter.yearCounts[0]?.year || undefined;
    await loadQuestions(chapter, initialYear);
    setView('years');
  };

  const submitAnswer = async (question: GuuldoonPracticeQuestion) => {
    if (answers[question._id] === undefined || answering) return;
    setAnswering(true);
    setError('');
    try {
      const { data } = await api.post('/guuldoon/questions/' + question._id + '/answer', { answer: answers[question._id] });
      setFeedback(current => ({ ...current, [question._id]: data.data }));
      await onRefresh();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Jawaabta lama gudbin karin.');
    } finally {
      setAnswering(false);
    }
  };

  const backToList = () => {
    setView('list');
    setLesson(null);
    setQuestions([]);
    setSelectedChapter(null);
    setError('');
  };

  const openHighlightQuestion = (question: GuuldoonHighlightQuestion) => {
    if (!selectedChapter) return;
    void openPractice(selectedChapter, question.examYear || undefined, question.questionId);
  };

  if ((view === 'lesson-list' || view === 'lesson-section') && selectedChapter) {
    if (lessonLoading) {
      return <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">Casharka waa la soo rarayaa...</div>;
    }
    return (
      <>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</div>}
        <GuuldoonLessonReader
          chapter={selectedChapter}
          lesson={lesson}
          sectionIndex={sectionIndex}
          setSectionIndex={setSectionIndex}
          mode={view}
          setMode={setView}
          onBack={backToList}
          onPractice={() => void openPractice(selectedChapter)}
          onQuestion={openHighlightQuestion}
        />
      </>
    );
  }

  if (view === 'years' && selectedChapter) {
    return (
      <>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</div>}
        <GuuldoonYearQuestions
          chapter={selectedChapter}
          questions={questions}
          loading={questionsLoading}
          selectedYear={selectedYear}
          onBack={backToList}
          onYear={year => { void loadQuestions(selectedChapter, year); }}
          onAnswer={index => { setQuestionIndex(index); setView('practice'); }}
        />
      </>
    );
  }

  if (view === 'practice' && selectedChapter) {
    return (
      <>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</div>}
        <GuuldoonPracticeView
          chapter={selectedChapter}
          questions={questions}
          loading={questionsLoading}
          questionIndex={questionIndex}
          setQuestionIndex={setQuestionIndex}
          answers={answers}
          setAnswers={updater => setAnswersState(updater)}
          feedback={feedback}
          answering={answering}
          onSubmit={question => void submitAnswer(question)}
          onBack={backToList}
          onBookPage={question => { if (question.bookRef?.pageFrom) void loadLesson(selectedChapter, question.bookRef.pageFrom); }}
        />
      </>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
        <div className="student-glass-card flex items-center gap-4 rounded-[24px] p-4 lg:block lg:text-center">
          <div
            className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full lg:mx-auto"
            style={{ background: 'conic-gradient(rgb(52 211 153) ' + Math.max(0, Math.min(100, passMeter)) * 3.6 + 'deg, rgba(100,116,139,.16) 0deg)' }}
          >
            <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-[var(--color-surface-primary)]">
              <span className="text-2xl font-black">{passMeter}%</span>
              <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-tertiary)]">Pass Meter</span>
            </div>
          </div>
          <div className="lg:mt-3">
            <p className="text-xs font-black">Diyaar-garowga</p>
            <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">Target {passTarget}/100</p>
          </div>
        </div>

        <div className="student-glass-card rounded-[24px] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-500">Cutubka xiga</p>
              <h2 className="mt-1 text-lg font-black">{nextChapter?.title || 'Cutub ma jiro'}</h2>
              {nextChapter && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{nextChapter.examWeight}% imtixaanka · {nextChapter.questionCount} su’aalood</p>}
            </div>
            <Target className="h-5 w-5 text-emerald-500" />
          </div>
          {nextChapter && (
            <button onClick={() => setOpenChapterId(nextChapter.id)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white">
              Fur cutubka <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="student-glass-card rounded-[24px] p-4">
          <p className="text-xs font-black">Miisaanka imtixaanka</p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
            {chapters.filter(chapter => !chapter.outsideBook && chapter.examWeight > 0).map((chapter, index) => (
              <span key={chapter.id} title={chapter.title + ': ' + chapter.examWeight + '%'} className={index % 2 === 0 ? 'bg-emerald-500' : 'bg-teal-400'} style={{ width: chapter.examWeight + '%' }} />
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[var(--color-text-tertiary)]">Cutubyada miisaanka badan leh waxay mudnaan ku leeyihiin tababarka.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">Cutubyada</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Akhri casharka, tababar, kadib eeg su’aalaha sanad kasta.</p>
        </div>
        <div className="flex rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1">
          {([
            ['sequence', 'Isku xigga'],
            ['important', 'Ugu muhiimsan'],
            ['unstarted', 'Aan bilaabin'],
          ] as const).map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)} className={'rounded-lg px-3 py-2 text-[11px] font-black transition ' + (filter === value ? 'bg-emerald-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]')}>{label}</button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</div>}

      <div className="space-y-3">
        {filteredChapters.map(chapter => {
          const open = openChapterId === chapter.id;
          return (
            <article key={chapter.id} className="student-glass-card overflow-hidden rounded-[24px]">
              <button onClick={() => setOpenChapterId(open ? null : chapter.id)} className="w-full p-4 text-left sm:p-5" aria-expanded={open}>
                <div className="flex items-start gap-3">
                  <span className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-black ' + (chapter.outsideBook ? 'bg-violet-500/10 text-violet-500' : 'bg-emerald-500/10 text-emerald-500')}>
                    {chapter.outsideBook ? <Layers3 className="h-5 w-5" /> : chapter.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    {chapter.outsideBook && <p className="mb-1 text-[10px] font-black uppercase tracking-[.12em] text-violet-500">Outside the book</p>}
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 flex-1 text-sm font-black leading-5 sm:text-base">{chapter.outsideBook ? 'Other topics (outside the book)' : chapter.title}</h3>
                      <div className="shrink-0 text-right">
                        <p className={'text-base font-black ' + masteryText(chapter.mastery)}>{chapter.mastery}%</p>
                        <p className="text-[9px] text-[var(--color-text-tertiary)]">mastery</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-emerald-500/[.07] px-2 py-2 text-center"><strong className="block text-sm">{chapter.examWeight}%</strong><span className="text-[9px] text-[var(--color-text-tertiary)]">imtixaanka</span></div>
                      <div className="rounded-xl bg-sky-500/[.07] px-2 py-2 text-center"><strong className="block text-sm">{chapter.questionCount}</strong><span className="text-[9px] text-[var(--color-text-tertiary)]">su’aalood</span></div>
                      <div className="rounded-xl bg-amber-500/[.07] px-2 py-2 text-center"><strong className="block text-sm">{chapter.yearsCount}</strong><span className="text-[9px] text-[var(--color-text-tertiary)]">sannadood</span></div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"><div className={'h-full rounded-full ' + masteryBar(chapter.mastery)} style={{ width: chapter.mastery + '%' }} /></div>
                      <ChevronDown className={'h-4 w-4 text-[var(--color-text-tertiary)] transition-transform ' + (open ? 'rotate-180' : '')} />
                    </div>
                  </div>
                </div>
              </button>

              {open && (
                <div className="border-t border-[var(--color-border-subtle)] p-4 sm:p-5">
                  <div className="grid gap-3">
                    <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-sm font-black text-emerald-500">1</span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-black">Cashar: akhri cutubka</p><p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{chapter.items.length ? chapter.items.length + ' qaybood / resources' : 'Qoraal buug lama gelin'}</p></div>
                      {!chapter.outsideBook && <button onClick={() => void loadLesson(chapter)} className={'rounded-xl px-3.5 py-2 text-xs font-black ' + (chapter.attempts === 0 ? 'bg-emerald-600 text-white' : 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-500')}>{chapter.attempts === 0 ? 'Bilow casharka' : 'Akhri casharka'}</button>}
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sm font-black text-sky-500">2</span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-black">Tababar</p><p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">Su’aalaha published ee cutubkan</p></div>
                      <button onClick={() => void openPractice(chapter)} className="rounded-xl border border-sky-400/25 bg-sky-400/10 px-3.5 py-2 text-xs font-black text-sky-500">{chapter.attempts > 0 ? 'Sii wad tababarka' : 'Bilow tababarka'}</button>
                    </div>

                    <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]/35 p-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-sm font-black text-amber-500">3</span>
                        <div><p className="text-sm font-black">Su’aalaha sanad kasta</p><p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">Dooro sanad si aad u aragto su’aalihiisa.</p></div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {chapter.yearCounts.length ? chapter.yearCounts.map(item => (
                          <button key={item.year} onClick={() => void openYears(chapter, item.year)} className={'rounded-full border px-3 py-1.5 text-xs font-black ' + yearChip(item.count)}>{item.year} · {item.count}</button>
                        )) : <span className="text-xs text-[var(--color-text-tertiary)]">Sannado published ah ma jiraan.</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default GuuldoonChaptersExperience;
