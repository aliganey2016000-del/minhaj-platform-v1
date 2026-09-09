import { useMemo, useState } from 'react';
import type { Chapter, QuestionType, QuizItem } from '../course-builder.types';
import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER } from '../quiz-question-meta';

export interface RandomQuizSourceConfig { itemId: string; type: 'lesson' | 'quiz'; weight: number; }
export interface RandomQuizTypeConfig { type: QuestionType; quantity: number; }
export interface RandomQuizConfig { enabled: boolean; sources: RandomQuizSourceConfig[]; questionTypes: RandomQuizTypeConfig[]; totalQuestions: number; version: number; }
interface RandomQuizGeneratorProps { chapters: Chapter[]; quiz: QuizItem; value?: RandomQuizConfig; onChange: (config: RandomQuizConfig) => void; }

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple Choice', true_false: 'True / False', matching: 'Matching', ordering: 'Ordering',
  picture_choice: 'Picture Choice', swipe_sort: 'Swipe Sort', listen_write: 'Listen & Write',
  fill_blank: 'Fill in the Blank', word_scramble: 'Word Scramble', sentence_build: 'Sentence Builder',
  short_answer: 'Short Answer',
};

function questionCount(item: any, type: QuestionType): number {
  if (!item) return 0;
  if (item.type === 'quiz') return (item.questions || []).filter((q: any) => (q.type || 'mcq') === type).length;
  let count = 0;
  for (const block of item.contentBlocks || []) {
    const questions = block.questions ?? (block.question ? [block.question] : []);
    count += questions.filter((q: any) => (q.type || 'mcq') === type).length;
  }
  for (const checkpoint of item.videoCheckpoints || []) if (checkpoint.question && (checkpoint.question.type || 'mcq') === type) count++;
  return count;
}

function initialConfig(chapters: Chapter[], existing?: RandomQuizConfig): RandomQuizConfig {
  if (existing?.enabled) return existing;
  const sources = chapters.flatMap((chapter) => chapter.items.filter((item: any) => item.type === 'lesson' || item.type === 'quiz'));
  const weight = sources.length ? Number((100 / sources.length).toFixed(2)) : 100;
  return {
    enabled: true,
    sources: sources.map((item: any, index) => ({ itemId: item._id, type: item.type, weight: index === sources.length - 1 ? Number((100 - weight * (sources.length - 1)).toFixed(2)) : weight })),
    questionTypes: [], totalQuestions: 0, version: 1,
  };
}

function allocate(total: number, sources: { key: string; weight: number; capacity: number }[]) {
  const result = new Map<string, number>();
  const desired = sources.map((source) => ({ ...source, target: total * source.weight / 100 }));
  let assigned = 0;
  for (const source of desired) { const value = Math.min(Math.floor(source.target), source.capacity); result.set(source.key, value); assigned += value; }
  while (assigned < total) {
    const candidates = desired.filter((source) => (result.get(source.key) || 0) < source.capacity).sort((a, b) => (b.target - (result.get(b.key) || 0)) - (a.target - (result.get(a.key) || 0)));
    if (!candidates.length) break;
    const next = candidates[0]; result.set(next.key, (result.get(next.key) || 0) + 1); assigned++;
  }
  return result;
}

export function RandomQuizGenerator({ chapters, quiz, value, onChange }: RandomQuizGeneratorProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [config, setConfig] = useState<RandomQuizConfig>(() => initialConfig(chapters, value || quiz.randomConfig));
  const [error, setError] = useState('');
  const sourceItems = useMemo(() => chapters.flatMap((chapter) => chapter.items.filter((item: any) => item.type === 'lesson' || item.type === 'quiz').map((item: any) => ({ item, chapterTitle: chapter.title }))), [chapters]);
  const sourceMap = useMemo(() => new Map(sourceItems.map(({ item, chapterTitle }) => [item._id, { item, chapterTitle }])), [sourceItems]);
  const selectedSources = config.sources.filter((source) => sourceMap.has(source.itemId));
  const totalQuestions = config.questionTypes.reduce((sum, entry) => sum + entry.quantity, 0);
  const weightsTotal = config.sources.reduce((sum, source) => sum + Number(source.weight || 0), 0);
  const updateConfig = (next: RandomQuizConfig) => { setConfig(next); setError(''); onChange(next); };
  const toggleSource = (item: any) => {
    const exists = config.sources.some((source) => source.itemId === item._id && source.type === item.type);
    updateConfig(exists ? { ...config, sources: config.sources.filter((source) => !(source.itemId === item._id && source.type === item.type)) } : { ...config, sources: [...config.sources, { itemId: item._id, type: item.type, weight: 0 }] });
  };
  const rebalanceWeights = () => {
    if (!config.sources.length) return;
    const equal = Number((100 / config.sources.length).toFixed(2));
    updateConfig({ ...config, sources: config.sources.map((source, index) => ({ ...source, weight: index === config.sources.length - 1 ? Number((100 - equal * (config.sources.length - 1)).toFixed(2)) : equal })) });
  };
  const setWeight = (itemId: string, weight: number) => updateConfig({ ...config, sources: config.sources.map((source) => source.itemId === itemId ? { ...source, weight } : source) });
  const toggleType = (type: QuestionType) => {
    const exists = config.questionTypes.some((entry) => entry.type === type);
    const questionTypes = exists ? config.questionTypes.filter((entry) => entry.type !== type) : [...config.questionTypes, { type, quantity: 1 }];
    updateConfig({ ...config, questionTypes, totalQuestions: questionTypes.reduce((sum, entry) => sum + entry.quantity, 0) });
  };
  const setQuantity = (type: QuestionType, quantity: number) => {
    const questionTypes = config.questionTypes.map((entry) => entry.type === type ? { ...entry, quantity: Math.max(1, quantity || 1) } : entry);
    updateConfig({ ...config, questionTypes, totalQuestions: questionTypes.reduce((sum, entry) => sum + entry.quantity, 0) });
  };
  const availability = (type: QuestionType) => selectedSources.reduce((sum, source) => sum + questionCount(sourceMap.get(source.itemId)?.item, type), 0);
  const allocations = useMemo(() => config.questionTypes.map((entry) => {
    const sourceRows = selectedSources.map((source) => { const item = sourceMap.get(source.itemId)?.item; return { key: `${source.type}:${source.itemId}`, title: item?.title || 'Source', weight: source.weight, capacity: questionCount(item, entry.type) }; });
    const allocated = allocate(entry.quantity, sourceRows);
    return { type: entry.type, quantity: entry.quantity, perSource: selectedSources.map((source) => ({ title: sourceMap.get(source.itemId)?.item?.title || 'Source', count: allocated.get(`${source.type}:${source.itemId}`) || 0 })) };
  }), [config.questionTypes, selectedSources, sourceMap]);
  const validateStep1 = () => !config.sources.length ? 'Select at least one lesson or quiz source.' : Math.abs(weightsTotal - 100) > 0.01 ? `Source weights must total 100%. Current total: ${weightsTotal.toFixed(2)}%.` : '';
  const validateStep2 = () => {
    if (!config.questionTypes.length) return 'Select at least one question type.';
    if (!totalQuestions) return 'Question quantities must add up to at least 1.';
    for (const entry of config.questionTypes) {
      if (!Number.isInteger(entry.quantity) || entry.quantity < 1) return `${TYPE_LABELS[entry.type]} must have a valid quantity.`;
      if (availability(entry.type) < entry.quantity) return `Not enough ${TYPE_LABELS[entry.type]} questions in the selected sources. Need ${entry.quantity}, found ${availability(entry.type)}.`;
    }
    return '';
  };
  const next = () => { const validation = step === 1 ? validateStep1() : validateStep2(); if (validation) { setError(validation); return; } setError(''); setStep((step + 1) as 2 | 3); };
  const generate = () => { const validation = validateStep1() || validateStep2(); if (validation) { setError(validation); return; } updateConfig({ ...config, enabled: true, totalQuestions, version: (config.version || 0) + 1 }); setStep(3); };

  return <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5 space-y-5">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-bold">🎲 Random Quiz Generator</h3><p className="mt-1 text-xs text-[var(--color-text-secondary)]">Same structure for everyone; deterministic student-specific questions.</p></div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">3 Steps</span></div>
    <div className="grid grid-cols-3 gap-2">{(['Select Sources & Weights', 'Question Types & Quantities', 'Review & Generate'] as const).map((label, index) => <button key={label} type="button" onClick={() => setStep((index + 1) as 1 | 2 | 3)} className={`rounded-xl px-2 py-2 text-[10px] font-bold ${step === index + 1 ? 'bg-indigo-600 text-white' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]'}`}>{index + 1}. {label}</button>)}</div>
    {step === 1 && <section className="space-y-3"><div className="flex items-center justify-between"><h4 className="text-sm font-bold">1. Select Sources & Weights</h4><button type="button" onClick={rebalanceWeights} className="text-xs font-semibold text-primary-600">Equalize</button></div>{sourceItems.map(({ item, chapterTitle }) => { const selected = config.sources.find((source) => source.itemId === item._id && source.type === item.type); return <div key={`${item.type}-${item._id}`} className="rounded-xl border p-3"><div className="flex items-center gap-3"><input type="checkbox" checked={!!selected} onChange={() => toggleSource(item)} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="text-[10px] text-[var(--color-text-tertiary)]">{chapterTitle} · {item.type === 'lesson' ? 'Lesson' : 'Quiz'}</p></div>{selected && <div className="flex items-center gap-1"><input type="number" min={0.01} max={100} step={0.01} value={selected.weight} onChange={(e) => setWeight(item._id, Number(e.target.value))} className="w-20 rounded-lg border px-2 py-1.5 text-right text-xs" /><span className="text-xs">%</span></div>}</div>{selected && <p className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">Available: {QUESTION_TYPE_ORDER.map((type) => `${TYPE_LABELS[type]} ${questionCount(item, type)}`).filter((text) => !text.endsWith(' 0')).join(' · ') || 'No questions yet'}</p>}</div>; })}<div className={`rounded-lg px-3 py-2 text-xs font-semibold ${Math.abs(weightsTotal - 100) <= 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>Weight total: {weightsTotal.toFixed(2)}%</div></section>}
    {step === 2 && <section className="space-y-3"><h4 className="text-sm font-bold">2. Question Types & Quantities</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{QUESTION_TYPE_ORDER.map((type) => { const selected = config.questionTypes.find((entry) => entry.type === type); const available = availability(type); return <div key={type} className="rounded-xl border p-3"><div className="flex items-center gap-2"><input type="checkbox" checked={!!selected} onChange={() => toggleType(type)} /><span>{QUESTION_TYPE_META[type].icon}</span><span className="flex-1 text-xs font-semibold">{TYPE_LABELS[type]}</span>{selected && <input type="number" min={1} value={selected.quantity} onChange={(e) => setQuantity(type, Number(e.target.value))} className="w-16 rounded-lg border px-2 py-1 text-center text-xs" />}</div><p className="mt-1 pl-6 text-[10px] text-[var(--color-text-tertiary)]">{available} available</p></div>; })}</div><div className="rounded-xl bg-[var(--color-surface-tertiary)] px-3 py-2 text-xs font-bold">Total questions: {totalQuestions}</div></section>}
    {step === 3 && <section className="space-y-4"><div><h4 className="text-sm font-bold">3. Review & Generate</h4><p className="mt-1 text-xs text-[var(--color-text-secondary)]">Review the exact structure before enabling randomized sets.</p></div><div className="rounded-xl border p-3"><p className="text-xs font-bold">{quiz.title || 'Untitled Quiz'} · {totalQuestions} questions</p><div className="mt-2 space-y-1">{config.questionTypes.map((entry) => <div key={entry.type} className="flex items-center justify-between text-xs"><span>{QUESTION_TYPE_META[entry.type].icon} {TYPE_LABELS[entry.type]}</span><strong>{entry.quantity}</strong></div>)}</div></div><div className="rounded-xl border p-3"><p className="text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">Source distribution</p>{allocations.map((row) => <div key={row.type} className="mt-2"><p className="text-xs font-semibold">{TYPE_LABELS[row.type]} · {row.quantity}</p>{row.perSource.filter((source) => source.count > 0).map((source) => <div key={source.title} className="flex justify-between text-[10px] text-[var(--color-text-secondary)]"><span>{source.title}</span><span>{source.count}</span></div>)}</div>)}</div></section>}
    {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
    <div className="flex justify-between gap-2"><button type="button" onClick={() => setStep((Math.max(1, step - 1)) as 1 | 2 | 3)} disabled={step === 1} className="rounded-xl border px-4 py-2 text-xs font-semibold disabled:opacity-40">Back</button>{step < 3 ? <button type="button" onClick={next} className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white">Next</button> : <button type="button" onClick={generate} className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white">🎲 Generate Random Quiz</button>}</div>
  </div>;
}
