/** Course Content Builder — TypeScript Types */

export interface Attachment { name: string; url: string; type: string; size?: number; }
export type ChapterItemType = 'lesson' | 'quiz' | 'assignment' | 'exam';
export type LessonDeliveryMode = 'traditional' | 'interactive_gate';

export type ContentBlockQuestion = QuizQuestion & { aiGenerated: boolean; answerHash?: string };
export function isContentBlockQuestion(q: any): q is ContentBlockQuestion { return q && typeof q.aiGenerated === 'boolean'; }
export interface ContentBlock { _id?: string; title?: string; order: number; content: string; minReadSeconds: number; question?: ContentBlockQuestion; questions?: ContentBlockQuestion[]; }
export function getBlockQuestions(block: ContentBlock): ContentBlockQuestion[] { return block.questions ?? (block.question ? [block.question] : []); }
export interface VideoCheckpoint { _id?: string; percentage: number; question: ContentBlockQuestion; }

export interface LessonItem {
  _id: string; title: string; type: 'lesson'; content?: string; videoUrl?: string; videoDuration?: number;
  featuredImage?: string; attachments: Attachment[]; order: number; status: 'draft' | 'published'; duration: number;
  deliveryMode: LessonDeliveryMode; contentBlocks?: ContentBlock[]; defaultMinReadSeconds?: number;
  blockForwardSeeking?: boolean; videoCheckpoints?: VideoCheckpoint[]; createdAt?: string; updatedAt?: string;
  _isNew?: boolean; _isEditing?: boolean;
}

export type QuestionType =
  | 'mcq' | 'true_false' | 'matching' | 'ordering' | 'picture_choice'
  | 'swipe_sort' | 'listen_write' | 'fill_blank' | 'word_scramble' | 'sentence_build' | 'short_answer';

interface BaseQuizQuestion { _id?: string; question: string; explanation?: string; points?: number; }
export interface McqQuestion extends BaseQuizQuestion { type: 'mcq'; options: string[]; correctIndex: number; }
export interface TrueFalseQuestion extends BaseQuizQuestion { type: 'true_false'; correctAnswer: boolean; }
export interface MatchingQuestion extends BaseQuizQuestion { type: 'matching'; pairs: { left: string; right: string }[]; }
export interface OrderingQuestion extends BaseQuizQuestion { type: 'ordering'; items: string[]; }
export interface PictureChoiceQuestion extends BaseQuizQuestion { type: 'picture_choice'; choices: { image: string; label?: string }[]; correctIndex: number; }
export interface SwipeSortQuestion extends BaseQuizQuestion { type: 'swipe_sort'; leftLabel: string; rightLabel: string; cards: { text: string; correctSide: 'left' | 'right' }[]; }
export interface ListenWriteQuestion extends BaseQuizQuestion { type: 'listen_write'; audioUrl: string; correctText: string; hint?: string; }
export interface FillBlankQuestion extends BaseQuizQuestion { type: 'fill_blank'; textTemplate: string; blanks: string[]; distractors: string[]; }
export interface WordScrambleQuestion extends BaseQuizQuestion { type: 'word_scramble'; answer: string; hint?: string; }
export interface SentenceBuildQuestion extends BaseQuizQuestion { type: 'sentence_build'; words: string[]; distractors: string[]; }
export interface ShortAnswerQuestion extends BaseQuizQuestion { type: 'short_answer'; correctAnswers: string[]; }

export type QuizQuestion =
  | McqQuestion | TrueFalseQuestion | MatchingQuestion | OrderingQuestion | PictureChoiceQuestion
  | SwipeSortQuestion | ListenWriteQuestion | FillBlankQuestion | WordScrambleQuestion | SentenceBuildQuestion
  | ShortAnswerQuestion;

export function normalizeQuestion(q: any): QuizQuestion {
  if (!q || !q.type) return { ...q, type: 'mcq', options: q?.options?.length >= 2 ? q.options : ['', ''], correctIndex: q?.correctIndex ?? 0 };
  const base = { ...q };
  switch (q.type) {
    case 'mcq': return { ...base, options: q.options ?? ['', ''], correctIndex: q.correctIndex ?? 0 } as QuizQuestion;
    case 'true_false': return { ...base, correctAnswer: q.correctAnswer ?? true } as QuizQuestion;
    case 'matching': return { ...base, pairs: q.pairs ?? [] } as QuizQuestion;
    case 'ordering': return { ...base, items: q.items ?? [] } as QuizQuestion;
    case 'picture_choice': return { ...base, choices: q.choices ?? [], correctIndex: q.correctIndex ?? 0 } as QuizQuestion;
    case 'swipe_sort': return { ...base, cards: q.cards ?? [], leftLabel: q.leftLabel ?? 'Left', rightLabel: q.rightLabel ?? 'Right' } as QuizQuestion;
    case 'listen_write': return { ...base, audioUrl: q.audioUrl ?? '', hint: q.hint ?? '' } as QuizQuestion;
    case 'fill_blank': return { ...base, textTemplate: q.textTemplate ?? '', blanks: q.blanks ?? [], distractors: q.distractors ?? [] } as QuizQuestion;
    case 'word_scramble': return { ...base, answer: q.answer ?? '', hint: q.hint ?? '' } as QuizQuestion;
    case 'sentence_build': return { ...base, words: q.words ?? [], distractors: q.distractors ?? [] } as QuizQuestion;
    case 'short_answer': return { ...base, correctAnswers: Array.isArray(q.correctAnswers) ? q.correctAnswers : [] } as QuizQuestion;
    default: return base as QuizQuestion;
  }
}

export interface QuizItem {
  _id: string; title: string; type: 'quiz'; description?: string; questions: QuizQuestion[]; passingScore: number;
  timeLimit?: number; order: number; status: 'draft' | 'published'; duration: number; createdAt?: string; updatedAt?: string;
  _isNew?: boolean; _isEditing?: boolean;
}
export interface AssignmentItem {
  _id: string; title: string; type: 'assignment'; description?: string; instructions?: string; dueDate?: string;
  maxScore: number; allowedFileTypes?: string[]; attachments: Attachment[]; order: number; status: 'draft' | 'published'; duration: number; createdAt?: string; updatedAt?: string; _isNew?: boolean; _isEditing?: boolean;
}
export interface ExamItem {
  _id: string; title: string; type: 'exam'; examId: string; examDate?: string; totalMarks?: number; order: number; status: 'draft' | 'published'; duration: number; createdAt?: string; updatedAt?: string; _isNew?: boolean;
}
export type ChapterItem = LessonItem | QuizItem | AssignmentItem | ExamItem;
export interface Chapter { _id: string; title: string; description?: string; order: number; status: 'draft' | 'published'; collapsed?: boolean; items: ChapterItem[]; examMilestone?: 'mid' | null; createdAt?: string; updatedAt?: string; _isNew?: boolean; _isEditing?: boolean; }
export interface CourseContent { _id?: string; course: string; chapters: Chapter[]; totalDuration: number; totalLessons: number; totalQuizzes: number; totalAssignments: number; lastSaved: string; createdAt?: string; updatedAt?: string; }
export type DragItemType = 'chapter' | 'chapter-item';
export interface DragPayload { type: DragItemType; chapterIndex: number; itemIndex?: number; id: string; }
export type ItemFormMode = 'lesson' | 'quiz' | 'assignment';
export interface ItemFormData { mode: ItemFormMode; chapterIndex: number; itemIndex?: number; }
