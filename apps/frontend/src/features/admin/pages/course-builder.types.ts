/**
 * Course Content Builder — TypeScript Types
 *
 * Mirrors the backend course-content.model.ts schema with additional
 * UI-state fields for the drag-and-drop curriculum builder.
 */

// ---------------------------------------------------------------------------
// Attachment
// ---------------------------------------------------------------------------
export interface Attachment {
  name: string;
  url: string;
  type: string; // pdf, docx, zip, image, etc.
  size?: number; // bytes
}

// ---------------------------------------------------------------------------
// Content Item Types
// ---------------------------------------------------------------------------
export type ChapterItemType = 'lesson' | 'quiz' | 'assignment';

export interface LessonItem {
  _id: string;
  title: string;
  type: 'lesson';
  content?: string; // Rich text / HTML content
  videoUrl?: string;
  videoDuration?: number; // seconds
  featuredImage?: string;
  attachments: Attachment[];
  order: number;
  status: 'draft' | 'published';
  duration: number; // estimated minutes
  createdAt?: string;
  updatedAt?: string;
  // UI state
  _isNew?: boolean;
  _isEditing?: boolean;
}

// ---------------------------------------------------------------------------
// Quiz Questions — discriminated union of interactive question types
// ---------------------------------------------------------------------------
export type QuestionType =
  | 'mcq'
  | 'true_false'
  | 'matching'
  | 'ordering'
  | 'picture_choice'
  | 'swipe_sort'
  | 'listen_write'
  | 'fill_blank'
  | 'word_scramble'
  | 'sentence_build';

interface BaseQuizQuestion {
  _id?: string;
  question: string; // the prompt, shared across all types
  explanation?: string;
  points?: number;
}

/** Classic multiple choice — pick the one correct option. */
export interface McqQuestion extends BaseQuizQuestion {
  type: 'mcq';
  options: string[];
  correctIndex: number; // 0-based
}

/** Quick yes/no challenge. */
export interface TrueFalseQuestion extends BaseQuizQuestion {
  type: 'true_false';
  correctAnswer: boolean;
}

/** Drag-to-match pairs — e.g. term ↔ definition, Arabic word ↔ meaning. */
export interface MatchingQuestion extends BaseQuizQuestion {
  type: 'matching';
  pairs: { left: string; right: string }[];
}

/** Drag items into the correct sequence. Stored already in correct order — shuffle for display. */
export interface OrderingQuestion extends BaseQuizQuestion {
  type: 'ordering';
  items: string[];
}

/** Tap the picture that answers the question — visual, low-reading-load. */
export interface PictureChoiceQuestion extends BaseQuizQuestion {
  type: 'picture_choice';
  choices: { image: string; label?: string }[];
  correctIndex: number;
}

/** Tinder-style swipe — sort each card into one of two buckets. */
export interface SwipeSortQuestion extends BaseQuizQuestion {
  type: 'swipe_sort';
  leftLabel: string; // e.g. "Halal"
  rightLabel: string; // e.g. "Haram"
  cards: { text: string; correctSide: 'left' | 'right' }[];
}

/** Play an audio clip and type what was heard (dictation / listening comprehension). */
export interface ListenWriteQuestion extends BaseQuizQuestion {
  type: 'listen_write';
  audioUrl: string;
  correctText: string;
  hint?: string;
}

/** A sentence with blanks — drag the right word from a bank into each gap. */
export interface FillBlankQuestion extends BaseQuizQuestion {
  type: 'fill_blank';
  /** The sentence with each blank marked as `___`. */
  textTemplate: string;
  /** Correct word for each `___`, in left-to-right order. */
  blanks: string[];
  /** Extra decoy words shown in the word bank alongside the correct ones. */
  distractors: string[];
}

/** Unscramble the shuffled letters to spell the correct word. */
export interface WordScrambleQuestion extends BaseQuizQuestion {
  type: 'word_scramble';
  answer: string;
  hint?: string;
}

/** Drag word chips into the correct order to build the sentence. */
export interface SentenceBuildQuestion extends BaseQuizQuestion {
  type: 'sentence_build';
  /** Words in the correct order — this order is the answer key. */
  words: string[];
  /** Extra decoy words mixed into the word bank. */
  distractors: string[];
}

export type QuizQuestion =
  | McqQuestion
  | TrueFalseQuestion
  | MatchingQuestion
  | OrderingQuestion
  | PictureChoiceQuestion
  | SwipeSortQuestion
  | ListenWriteQuestion
  | FillBlankQuestion
  | WordScrambleQuestion
  | SentenceBuildQuestion;

/** Old records saved before `type` existed are always plain MCQ. */
export function normalizeQuestion(q: any): QuizQuestion {
  if (q && q.type) return q as QuizQuestion;
  return { ...q, type: 'mcq', options: q?.options?.length >= 2 ? q.options : ['', ''], correctIndex: q?.correctIndex ?? 0 };
}

export interface QuizItem {
  _id: string;
  title: string;
  type: 'quiz';
  description?: string;
  questions: QuizQuestion[];
  passingScore: number; // percentage
  timeLimit?: number; // minutes, 0 = no limit
  order: number;
  status: 'draft' | 'published';
  duration: number;
  createdAt?: string;
  updatedAt?: string;
  // UI state
  _isNew?: boolean;
  _isEditing?: boolean;
}

export interface AssignmentItem {
  _id: string;
  title: string;
  type: 'assignment';
  description?: string;
  instructions?: string;
  dueDate?: string;
  maxScore: number;
  allowedFileTypes?: string[];
  attachments: Attachment[];
  order: number;
  status: 'draft' | 'published';
  duration: number;
  createdAt?: string;
  updatedAt?: string;
  // UI state
  _isNew?: boolean;
  _isEditing?: boolean;
}

// Union type for any item in a chapter
export type ChapterItem = LessonItem | QuizItem | AssignmentItem;

// ---------------------------------------------------------------------------
// Chapter (Module)
// ---------------------------------------------------------------------------
export interface Chapter {
  _id: string;
  title: string;
  description?: string;
  order: number;
  status: 'draft' | 'published';
  collapsed?: boolean;
  items: ChapterItem[];
  createdAt?: string;
  updatedAt?: string;
  // UI state
  _isNew?: boolean;
  _isEditing?: boolean;
}

// ---------------------------------------------------------------------------
// Full Course Content Document
// ---------------------------------------------------------------------------
export interface CourseContent {
  _id?: string;
  course: string; // ObjectId as string
  chapters: Chapter[];
  totalDuration: number;
  totalLessons: number;
  totalQuizzes: number;
  totalAssignments: number;
  lastSaved: string;
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Drag-and-Drop Types
// ---------------------------------------------------------------------------
export type DragItemType = 'chapter' | 'chapter-item';

export interface DragPayload {
  type: DragItemType;
  chapterIndex: number;
  itemIndex?: number; // only for chapter-item
  id: string;
}

// ---------------------------------------------------------------------------
// Form Types
// ---------------------------------------------------------------------------
export type ItemFormMode = 'lesson' | 'quiz' | 'assignment';

export interface ItemFormData {
  mode: ItemFormMode;
  chapterIndex: number;
  itemIndex?: number; // undefined = new item
}