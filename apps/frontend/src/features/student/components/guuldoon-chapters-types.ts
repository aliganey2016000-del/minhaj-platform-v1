
export type GuuldoonRelation = 'direct' | 'indirect' | 'similar' | 'derived';

export interface GuuldoonChapterItem {
  id: string;
  title: string;
  type: string;
  contentText?: string;
  pageFrom?: number | null;
  pageTo?: number | null;
}

export interface GuuldoonChapterSummary {
  id: string;
  title: string;
  order: number;
  examWeight: number;
  mastery: number;
  attempts: number;
  questionCount: number;
  yearsCount: number;
  yearCounts: { year: number; count: number; examId: string }[];
  outsideBook?: boolean;
  items: GuuldoonChapterItem[];
}

export interface GuuldoonHighlightQuestion {
  questionId: string;
  externalId?: string;
  anchorText: string;
  relation: GuuldoonRelation;
  examYear: number | null;
  number: number;
  type: string;
  marks: number;
  text: string;
  language?: 'so' | 'en' | 'ar';
  direction?: 'ltr' | 'rtl' | 'auto';
}

export interface GuuldoonLessonSection {
  id: string;
  externalId: string;
  sectionNumber: string;
  title: string;
  type: string;
  url?: string;
  pageFrom?: number | null;
  pageTo?: number | null;
  language?: 'so' | 'en' | 'ar';
  direction?: 'ltr' | 'rtl' | 'auto';
  offlineAvailable?: boolean;
  contentText: string;
  highlights: GuuldoonHighlightQuestion[];
}

export interface GuuldoonLessonPayload {
  chapter: { id: string; order: number; title: string; outsideBook?: boolean };
  sections: GuuldoonLessonSection[];
}

export interface GuuldoonPracticeQuestion {
  _id: string;
  externalId?: string;
  number: number;
  type: 'mcq' | 'structured' | 'fill' | 'match';
  language?: 'so' | 'en' | 'ar';
  direction?: 'ltr' | 'rtl' | 'auto';
  textSo: string;
  textEn?: string;
  options?: string[];
  marks: number;
  figureUrl?: string;
  figureFiles?: string[];
  chapterId: string;
  topicTags: string[];
  answerStatus: 'verified' | 'pending';
  examYear?: number | null;
  bookRef?: { bookId?: string; pageFrom?: number; pageTo?: number };
}

export const relationMeta: Record<GuuldoonRelation, { label: string; reason: string; className: string; dot: string }> = {
  direct: {
    label: 'Toos',
    reason: 'Jawaabta su’aashan si cad ayay ugu jirtaa qoraalkan.',
    className: 'bg-emerald-400/20 text-emerald-900 dark:text-emerald-100 decoration-emerald-400/70',
    dot: 'bg-emerald-400',
  },
  indirect: {
    label: 'Dadban',
    reason: 'Jawaabtu waxay u baahan tahay in qoraalkan lala xiriiriyo fikrad kale.',
    className: 'bg-sky-400/20 text-sky-900 dark:text-sky-100 decoration-sky-400/70',
    dot: 'bg-sky-400',
  },
  similar: {
    label: 'U eg',
    reason: 'Imtixaanka wuxuu isticmaalay fikrad isku mid ah, laakiin tiro ama eray kale.',
    className: 'bg-amber-300/25 text-amber-950 dark:text-amber-100 decoration-amber-400/70',
    dot: 'bg-amber-400',
  },
  derived: {
    label: 'Laga dhaliyay',
    reason: 'Su’aashu waxay ka dhalatay formula, qaanuun ama natiijo ku jirta qoraalkan.',
    className: 'bg-rose-400/20 text-rose-950 dark:text-rose-100 decoration-rose-400/70',
    dot: 'bg-rose-400',
  },
};

export function masteryText(value: number) {
  if (value < 50) return 'text-rose-500';
  if (value < 75) return 'text-amber-500';
  return 'text-emerald-500';
}

export function masteryBar(value: number) {
  if (value < 50) return 'bg-rose-500';
  if (value < 75) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function yearChip(count: number) {
  if (count >= 10) return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-500';
  if (count >= 5) return 'border-sky-400/25 bg-sky-400/10 text-sky-500';
  return 'border-amber-400/25 bg-amber-400/10 text-amber-500';
}
