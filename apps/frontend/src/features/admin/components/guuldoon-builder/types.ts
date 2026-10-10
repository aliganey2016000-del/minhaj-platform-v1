export type ChapterRow = {
  id: string;
  order: number;
  title: string;
  titleSo: string;
  titleEn: string;
  titleAr: string;
  status: 'draft' | 'published';
  examWeight: number;
  weightSource: 'chapter' | 'manual' | 'auto';
  manuallyEdited: boolean;
  lessonCount: number;
  questionCount: number;
  practiceCount: number;
  years: { year: number; count: number }[];
  avgMastery: number | null;
  masteryStudents: number;
  outsideBook: boolean;
  editableLessons: boolean;
};

export type ExamRow = {
  id: string;
  year: number;
  kind: 'past' | 'practice';
  published: boolean;
  answerKeyStatus: 'verified' | 'pending';
  durationMin: number;
  totalMarks: number;
  source: string;
  questionCount: number;
};

export type GlossaryTerm = { termSo: string; termEn: string; termAr: string };

export type Overview = {
  course: { id: string; title: unknown; grade: number; status: string; language: 'so' | 'en' | 'ar'; students: number };
  mode: 'imported' | 'legacy';
  config: { passTarget: number; targetExamDate: string | null };
  glossary: { source: 'import' | 'config'; terms: GlossaryTerm[] };
  chapters: ChapterRow[];
  exams: ExamRow[];
  stats: { chapters: number; questions: number; pastExams: number; totalWeight: number; passMeter: number; unmatchedPending: number };
};

export type LessonRow = {
  id: string;
  title: string;
  type: string;
  contentText: string;
  url: string;
  pageFrom: number | null;
  pageTo: number | null;
  language: 'so' | 'en' | 'ar';
  direction: 'ltr' | 'rtl' | 'auto';
  manuallyEdited: boolean;
  readOnly: boolean;
};

export type AnswerKey =
  | number
  | string
  | number[]
  | { kind: 'text'; accepted: string[] }
  | { kind: 'numeric'; value: number; tolerancePct?: number; unit?: string }
  | null;

export type QuestionRow = {
  id: string;
  examId: string;
  number: number;
  type: 'mcq' | 'structured' | 'fill' | 'match';
  language: 'so' | 'en' | 'ar';
  direction: 'ltr' | 'rtl' | 'auto';
  textSo: string;
  textEn: string;
  options: string[];
  marks: number;
  figureUrl: string;
  chapterId: string;
  topicTags: string[];
  answerStatus: 'verified' | 'pending';
  explainerText: string;
  manuallyEdited: boolean;
  answer: AnswerKey;
  answerDisplay: string;
};

export type ChapterContent = {
  chapterId: string;
  lessons: LessonRow[];
  questions: QuestionRow[];
  exams: { id: string; year: number; kind: 'past' | 'practice'; published: boolean; answerKeyStatus: 'verified' | 'pending' }[];
};

export function courseTitle(title: unknown): string {
  if (!title) return 'Course';
  if (typeof title === 'string') return title;
  const record = title as Record<string, string>;
  return record.en || record.so || record.ar || Object.values(record).find(Boolean) || 'Course';
}

export function errorMessage(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || fallback;
}
