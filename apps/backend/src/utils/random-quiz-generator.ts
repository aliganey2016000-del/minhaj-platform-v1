import crypto from 'crypto';
import type { IChapter, IQuiz } from '../models/course-content.model';
import type { QuestionType } from '../models/shared/question.schema';

export type RandomQuizSourceType = 'lesson' | 'quiz';

export interface IRandomQuizSourceConfig {
  itemId: string;
  type: RandomQuizSourceType;
  weight: number;
}

export interface IRandomQuizTypeConfig {
  type: QuestionType;
  quantity: number;
}

export interface IRandomQuizConfig {
  enabled: boolean;
  sources: IRandomQuizSourceConfig[];
  questionTypes: IRandomQuizTypeConfig[];
  totalQuestions: number;
  version: number;
}

export interface RandomQuizSourceInfo extends IRandomQuizSourceConfig {
  title: string;
  chapterTitle: string;
  questionCounts: Partial<Record<QuestionType, number>>;
}

export interface RandomQuizPoolQuestion {
  _id: string;
  type: QuestionType;
  question: string;
  sourceId: string;
  sourceType: RandomQuizSourceType;
  sourceTitle: string;
  raw: any;
}

const QUESTION_TYPES: QuestionType[] = [
  'mcq', 'true_false', 'matching', 'ordering', 'picture_choice',
  'swipe_sort', 'listen_write', 'fill_blank', 'word_scramble', 'sentence_build',
];

function asQuestionType(value: unknown): QuestionType | null {
  return QUESTION_TYPES.includes(value as QuestionType) ? value as QuestionType : null;
}

function normalizeId(value: unknown): string {
  return value?.toString?.() || String(value || '');
}

function lessonQuestions(lesson: any): any[] {
  const result: any[] = [];
  for (let blockIndex = 0; blockIndex < (lesson.contentBlocks || []).length; blockIndex++) {
    const block = lesson.contentBlocks[blockIndex];
    const questions = block.questions ?? (block.question ? [block.question] : []);
    questions.forEach((question: any, questionIndex: number) => {
      result.push({
        ...question,
        _id: `${normalizeId(lesson._id)}:block:${blockIndex}:question:${questionIndex}`,
      });
    });
  }
  for (let checkpointIndex = 0; checkpointIndex < (lesson.videoCheckpoints || []).length; checkpointIndex++) {
    const question = lesson.videoCheckpoints[checkpointIndex]?.question;
    if (question) {
      result.push({
        ...question,
        _id: `${normalizeId(lesson._id)}:checkpoint:${checkpointIndex}`,
      });
    }
  }
  return result;
}

export function buildRandomQuizSourceInfos(chapters: IChapter[] | any[], config: IRandomQuizConfig): RandomQuizSourceInfo[] {
  const byId = new Map<string, { item: any; chapterTitle: string }>();
  for (const chapter of chapters || []) {
    for (const item of chapter.items || []) {
      if (item.type === 'lesson' || item.type === 'quiz') {
        byId.set(normalizeId(item._id), { item, chapterTitle: chapter.title || 'Untitled chapter' });
      }
    }
  }

  return (config.sources || []).map((source) => {
    const found = byId.get(normalizeId(source.itemId));
    const questions = found?.item?.type === 'lesson' ? lessonQuestions(found.item) : (found?.item?.questions || []);
    const questionCounts: Partial<Record<QuestionType, number>> = {};
    for (const question of questions) {
      const type = asQuestionType(question.type || 'mcq');
      if (type) questionCounts[type] = (questionCounts[type] || 0) + 1;
    }
    return {
      ...source,
      title: found?.item?.title || 'Unavailable source',
      chapterTitle: found?.chapterTitle || '',
      questionCounts,
    };
  });
}

export function collectRandomQuizPools(chapters: IChapter[] | any[], config: IRandomQuizConfig): Map<string, RandomQuizPoolQuestion[]> {
  const sources = new Map<string, { item: any; chapterTitle: string }>();
  for (const chapter of chapters || []) {
    for (const item of chapter.items || []) {
      sources.set(normalizeId(item._id), { item, chapterTitle: chapter.title || '' });
    }
  }

  const pools = new Map<string, RandomQuizPoolQuestion[]>();
  for (const source of config.sources || []) {
    const found = sources.get(normalizeId(source.itemId));
    if (!found || (found.item.type !== source.type)) {
      pools.set(normalizeId(source.itemId), []);
      continue;
    }
    const rawQuestions = found.item.type === 'lesson' ? lessonQuestions(found.item) : (found.item.questions || []);
    const pool = rawQuestions
      .map((raw: any) => {
        const type = asQuestionType(raw.type || 'mcq');
        if (!type) return null;
        return {
          _id: normalizeId(raw._id),
          type,
          question: String(raw.question || ''),
          sourceId: normalizeId(source.itemId),
          sourceType: source.type,
          sourceTitle: found.item.title || 'Untitled source',
          raw,
        } as RandomQuizPoolQuestion;
      })
      .filter(Boolean) as RandomQuizPoolQuestion[];
    pools.set(normalizeId(source.itemId), pool);
  }
  return pools;
}

function sumQuantities(config: IRandomQuizConfig): number {
  return (config.questionTypes || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
}

export function validateRandomQuizConfig(chapters: IChapter[] | any[], config: IRandomQuizConfig): void {
  if (!config || config.enabled !== true) return;
  if (!Array.isArray(config.sources) || config.sources.length < 1) throw new Error('Random Quiz Generator requires at least one source');
  if (!Array.isArray(config.questionTypes) || config.questionTypes.length < 1) throw new Error('Random Quiz Generator requires at least one question type');

  const total = sumQuantities(config);
  if (!Number.isInteger(total) || total < 1 || total !== Number(config.totalQuestions)) {
    throw new Error('Random quiz question quantities must add up to the total question count');
  }

  const uniqueTypes = new Set<string>();
  for (const entry of config.questionTypes) {
    if (!asQuestionType(entry.type)) throw new Error(`Unsupported random quiz question type: ${entry.type}`);
    if (uniqueTypes.has(entry.type)) throw new Error('Each random quiz question type may appear only once');
    uniqueTypes.add(entry.type);
    if (!Number.isInteger(Number(entry.quantity)) || Number(entry.quantity) < 1) {
      throw new Error('Each random quiz question quantity must be at least 1');
    }
  }

  const uniqueSources = new Set<string>();
  let weightTotal = 0;
  for (const source of config.sources) {
    const id = normalizeId(source.itemId);
    if (!id || uniqueSources.has(`${source.type}:${id}`)) throw new Error('Random quiz sources must be unique');
    uniqueSources.add(`${source.type}:${id}`);
    const weight = Number(source.weight);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error('Each random quiz source weight must be greater than 0 and at most 100');
    weightTotal += weight;
  }
  if (Math.abs(weightTotal - 100) > 0.01) throw new Error('Random quiz source weights must total 100%');

  const pools = collectRandomQuizPools(chapters, config);
  for (const typeEntry of config.questionTypes) {
    const available = config.sources.reduce((sum, source) => {
      return sum + (pools.get(normalizeId(source.itemId)) || []).filter((q) => q.type === typeEntry.type).length;
    }, 0);
    if (available < typeEntry.quantity) {
      throw new Error(`Not enough ${typeEntry.type} questions in the selected sources: need ${typeEntry.quantity}, found ${available}`);
    }
  }
}

function seededRandom(seed: string): () => number {
  const digest = crypto.createHash('sha256').update(seed).digest();
  let state = digest.readUInt32BE(0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1000000) / 1000000;
  };
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const result = [...items];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function allocateWeighted(total: number, sources: IRandomQuizSourceConfig[], capacities: Map<string, number>): Map<string, number> {
  const allocations = new Map<string, number>();
  const targets = sources.map((source) => ({ key: `${source.type}:${source.itemId}`, desired: total * (source.weight / 100) }));
  let assigned = 0;

  for (const target of targets) {
    const capacity = capacities.get(target.key) || 0;
    const initial = Math.min(Math.floor(target.desired), capacity);
    allocations.set(target.key, initial);
    assigned += initial;
  }

  while (assigned < total) {
    const candidates = targets
      .filter((target) => (capacities.get(target.key) || 0) > (allocations.get(target.key) || 0))
      .sort((a, b) => {
        const aGap = a.desired - (allocations.get(a.key) || 0);
        const bGap = b.desired - (allocations.get(b.key) || 0);
        return bGap - aGap;
      });
    if (!candidates.length) break;
    const next = candidates[0];
    allocations.set(next.key, (allocations.get(next.key) || 0) + 1);
    assigned++;
  }
  return allocations;
}

export function generateRandomQuizQuestions(
  chapters: IChapter[] | any[],
  config: IRandomQuizConfig,
  seed: string,
): any[] {
  validateRandomQuizConfig(chapters, config);
  const pools = collectRandomQuizPools(chapters, config);
  const selected: RandomQuizPoolQuestion[] = [];

  for (const typeEntry of config.questionTypes) {
    const capacities = new Map<string, number>();
    for (const source of config.sources) {
      const key = `${source.type}:${source.itemId}`;
      capacities.set(key, (pools.get(normalizeId(source.itemId)) || []).filter((q) => q.type === typeEntry.type).length);
    }
    const allocations = allocateWeighted(typeEntry.quantity, config.sources, capacities);

    for (const source of config.sources) {
      const key = `${source.type}:${source.itemId}`;
      const count = allocations.get(key) || 0;
      if (count < 1) continue;
      const pool = (pools.get(normalizeId(source.itemId)) || []).filter((q) => q.type === typeEntry.type);
      const shuffled = seededShuffle(pool, `${seed}:${key}:${typeEntry.type}`);
      selected.push(...shuffled.slice(0, count));
    }
  }

  return seededShuffle(selected, `${seed}:final-order`).map((entry) => ({ ...entry.raw, _id: entry._id }));
}

export function getRandomQuizSourceSummary(chapters: IChapter[] | any[], config: IRandomQuizConfig) {
  return buildRandomQuizSourceInfos(chapters, config).map((source) => ({
    itemId: source.itemId,
    type: source.type,
    title: source.title,
    chapterTitle: source.chapterTitle,
    weight: source.weight,
    questionCounts: source.questionCounts,
  }));
}
