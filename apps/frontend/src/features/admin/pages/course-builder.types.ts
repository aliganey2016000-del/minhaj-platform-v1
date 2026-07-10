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

export interface QuizQuestion {
  _id?: string;
  question: string;
  options: string[];
  correctIndex: number; // 0-based
  explanation?: string;
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