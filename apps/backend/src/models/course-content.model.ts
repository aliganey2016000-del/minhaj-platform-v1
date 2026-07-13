/**
 * Course Content Model
 *
 * Stores the curriculum for a course: chapters containing lessons, quizzes,
 * and assignments. Supports drag-and-drop ordering.
 */

import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// Sub-document: Lesson
// ---------------------------------------------------------------------------
export interface ILesson {
  _id?: mongoose.Types.ObjectId;
  title: string;
  type: 'lesson';
  content?: string;           // Rich text / HTML content
  videoUrl?: string;
  videoDuration?: number;     // seconds
  featuredImage?: string;
  attachments: {
    name: string;
    url: string;
    type: string;             // pdf, docx, zip, etc.
    size?: number;            // bytes
  }[];
  order: number;
  status: 'draft' | 'published';
  duration: number;           // estimated minutes
  createdAt?: Date;
  updatedAt?: Date;
}

// ---------------------------------------------------------------------------
// Sub-document: Quiz
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

export interface IQuizQuestion {
  type?: QuestionType;        // defaults to 'mcq' for legacy records saved before this field existed
  question: string;
  explanation?: string;
  points?: number;
  // mcq / picture_choice
  options?: string[];
  correctIndex?: number;      // 0-based index of correct answer / correct choice
  // true_false
  correctAnswer?: boolean;
  // matching — drag-to-pair items
  pairs?: { left: string; right: string }[];
  // ordering — stored already in the correct sequence
  items?: string[];
  // picture_choice
  choices?: { image: string; label?: string }[];
  // swipe_sort — swipe each card left/right into one of two buckets
  leftLabel?: string;
  rightLabel?: string;
  cards?: { text: string; correctSide: 'left' | 'right' }[];
  // listen_write — play audio, student types what they heard
  audioUrl?: string;
  correctText?: string;
  hint?: string;
  // fill_blank — sentence with `___` markers, filled from a word bank
  textTemplate?: string;
  blanks?: string[];
  distractors?: string[];      // shared with sentence_build
  // word_scramble — unscramble the letters of `answer`
  answer?: string;
  // sentence_build — drag word chips into this correct order
  words?: string[];
}

export interface IQuiz {
  _id?: mongoose.Types.ObjectId;
  title: string;
  type: 'quiz';
  description?: string;
  questions: IQuizQuestion[];
  passingScore: number;       // percentage required to pass
  timeLimit?: number;         // minutes, 0 = no limit
  order: number;
  status: 'draft' | 'published';
  duration: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ---------------------------------------------------------------------------
// Sub-document: Assignment
// ---------------------------------------------------------------------------
export interface IAssignmentItem {
  _id?: mongoose.Types.ObjectId;
  title: string;
  type: 'assignment';
  description?: string;
  instructions?: string;
  dueDate?: Date;
  maxScore: number;
  allowedFileTypes?: string[];
  attachments: {
    name: string;
    url: string;
    type: string;
    size?: number;
  }[];
  order: number;
  status: 'draft' | 'published';
  duration: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ---------------------------------------------------------------------------
// Sub-document: Chapter (Topic)
// ---------------------------------------------------------------------------
export type ChapterItem = ILesson | IQuiz | IAssignmentItem;

export interface IChapter {
  _id?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  order: number;
  status: 'draft' | 'published';
  collapsed?: boolean;
  items: ChapterItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

// ---------------------------------------------------------------------------
// Main Document: CourseContent
// ---------------------------------------------------------------------------
export interface ICourseContent extends Document {
  course: mongoose.Types.ObjectId;
  chapters: IChapter[];
  totalDuration: number;       // computed sum in minutes
  totalLessons: number;        // computed count
  totalQuizzes: number;
  totalAssignments: number;
  lastSaved: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const attachmentSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
  },
  { _id: false }
);

const lessonSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, default: 'lesson', enum: ['lesson'] },
    content: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    videoDuration: { type: Number, default: 0 },
    featuredImage: { type: String, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    order: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    duration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const questionSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'mcq', 'true_false', 'matching', 'ordering', 'picture_choice',
        'swipe_sort', 'listen_write', 'fill_blank', 'word_scramble', 'sentence_build',
      ],
      default: 'mcq',
    },
    question: { type: String, required: true, trim: true },
    explanation: { type: String, default: '' },
    points: { type: Number, default: 1, min: 0 },
    // mcq / picture_choice
    options: { type: [String], default: undefined },
    correctIndex: { type: Number, min: 0 },
    // true_false
    correctAnswer: { type: Boolean },
    // matching
    pairs: {
      type: [
        {
          left: { type: String, trim: true },
          right: { type: String, trim: true },
        },
      ],
      default: undefined,
    },
    // ordering — stored already in the correct sequence
    items: { type: [String], default: undefined },
    // picture_choice
    choices: {
      type: [
        {
          image: { type: String, trim: true },
          label: { type: String, trim: true },
        },
      ],
      default: undefined,
    },
    // swipe_sort — swipe each card left/right into one of two buckets
    leftLabel: { type: String, trim: true },
    rightLabel: { type: String, trim: true },
    cards: {
      type: [
        {
          text: { type: String, trim: true },
          correctSide: { type: String, enum: ['left', 'right'] },
        },
      ],
      default: undefined,
    },
    // listen_write — play audio, student types what they heard
    audioUrl: { type: String, trim: true },
    correctText: { type: String, trim: true },
    hint: { type: String, trim: true },
    // fill_blank — sentence with `___` markers, filled from a word bank
    textTemplate: { type: String, trim: true },
    blanks: { type: [String], default: undefined },
    distractors: { type: [String], default: undefined }, // shared with sentence_build
    // word_scramble — unscramble the letters of `answer`
    answer: { type: String, trim: true },
    // sentence_build — drag word chips into this correct order
    words: { type: [String], default: undefined },
  },
  { _id: true }
);

const quizSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, default: 'quiz', enum: ['quiz'] },
    description: { type: String, default: '' },
    questions: { type: [questionSchema], default: [] },
    passingScore: { type: Number, default: 60, min: 0, max: 100 },
    timeLimit: { type: Number, default: 0 },
    order: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    duration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const assignmentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, default: 'assignment', enum: ['assignment'] },
    description: { type: String, default: '' },
    instructions: { type: String, default: '' },
    dueDate: { type: Date, default: null },
    maxScore: { type: Number, default: 100 },
    allowedFileTypes: { type: [String], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    order: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    duration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const chapterSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    order: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    collapsed: { type: Boolean, default: false },
    items: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

const courseContentSchema = new Schema<ICourseContent>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      unique: true,
      index: true,
    },
    chapters: { type: [chapterSchema], default: [] },
    totalDuration: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    totalQuizzes: { type: Number, default: 0 },
    totalAssignments: { type: Number, default: 0 },
    lastSaved: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ---------------------------------------------------------------------------
// Pre-save hook — compute totals
// ---------------------------------------------------------------------------
courseContentSchema.pre('save', function (next) {
  let totalDuration = 0;
  let totalLessons = 0;
  let totalQuizzes = 0;
  let totalAssignments = 0;

  for (const chapter of this.chapters) {
    for (const item of chapter.items) {
      totalDuration += item.duration || 0;
      if (item.type === 'lesson') totalLessons++;
      else if (item.type === 'quiz') totalQuizzes++;
      else if (item.type === 'assignment') totalAssignments++;
    }
  }

  this.totalDuration = totalDuration;
  this.totalLessons = totalLessons;
  this.totalQuizzes = totalQuizzes;
  this.totalAssignments = totalAssignments;
  this.lastSaved = new Date();

  next();
});

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
const CourseContent = mongoose.model<ICourseContent>('CourseContent', courseContentSchema);
export default CourseContent;