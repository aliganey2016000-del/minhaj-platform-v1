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
export interface IQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;       // 0-based index of correct answer
  explanation?: string;
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
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctIndex: { type: Number, required: true, min: 0 },
    explanation: { type: String, default: '' },
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