/**
 * Course Model
 * Islamic educational courses/programs with full multilingual support.
 * Supports syllabus/modules, teacher assignment, enrollment tracking, and fees.
 */

import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

/** Represents a single module/lesson within a course syllabus. */
export interface IModule {
  week: number;
  title: {
    en: string;
    so: string;
    ar: string;
  };
  description: {
    en: string;
    so: string;
    ar: string;
  };
  resources?: string[]; // URLs to downloadable resources
}

export interface ICourse extends Document {
  _id: mongoose.Types.ObjectId;
  title: {
    en: string;
    so: string;
    ar: string;
  };
  slug: string;
  description: {
    en: string;
    so: string;
    ar: string;
  };
  category: 'quran' | 'fiqh' | 'aqeedah' | 'seerah' | 'arabic' | 'tajweed' | 'hadith' | 'akhlaq';
  level: 'beginner' | 'intermediate' | 'advanced';
  duration: number;             // Duration in weeks
  fee: number;                  // 0 = free course
  teacher: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  class?: mongoose.Types.ObjectId;
  maxStudents: number;
  enrolledStudents: number;
  thumbnail?: string;
  syllabus: IModule[];
  prerequisites: string[];      // Array of prerequisite course slugs
  status: 'draft' | 'published' | 'archived';
  startDate?: Date;
  endDate?: Date;
  meetingLink?: string;          // Google Meet URL for this course's live sessions
  isLive: boolean;               // Toggled by the teacher — shows "Join Live" to students when true
  accessMode: 'open' | 'restricted'; // Lesson access restriction: open = all unlocked, restricted = sequential
  videoGating?: IVideoGating;
  createdAt: Date;
  updatedAt: Date;
}

/** A question asked when a student reaches a given video-watch checkpoint. */
export interface ICheckpointQuestion {
  _id?: mongoose.Types.ObjectId;
  text: string;
  type: 'multiple_choice' | 'short_answer';
  options?: string[];           // multiple_choice only
  correctOptionIndex?: number;  // multiple_choice only
}

export interface IVideoGating {
  enabled: boolean;
  blockForwardSeeking: boolean;
  checkpoints: number[];                       // e.g. [33, 66, 95]
  minWatchPercentToUnlock: number;             // e.g. 95
  showCheckpointAlerts: boolean;
  description?: string;
  // Keyed by checkpoint percentage (as a string key, since object keys are
  // always strings) — checkpointQuestions['66'] = [...]
  checkpointQuestions?: Record<string, ICheckpointQuestion[]>;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const moduleSchema = new Schema<IModule>(
  {
    week: {
      type: Number,
      required: [true, 'Module week number is required'],
      min: [1, 'Week must be at least 1'],
    },
    title: {
      en: { type: String, required: [true, 'English title is required'], trim: true },
      so: { type: String, default: '', trim: true },
      ar: { type: String, default: '', trim: true },
    },
    description: {
      en: { type: String, default: '', trim: true },
      so: { type: String, default: '', trim: true },
      ar: { type: String, default: '', trim: true },
    },
    resources: [{ type: String }],
  },
  { _id: true }
);

const courseSchema = new Schema<ICourse>(
  {
    title: {
      en: {
        type: String,
        required: [true, 'English title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters'],
      },
      so: { type: String, default: '', trim: true, maxlength: 200 },
      ar: { type: String, default: '', trim: true, maxlength: 200 },
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      en: { type: String, default: '', trim: true, maxlength: 5000 },
      so: { type: String, default: '', trim: true, maxlength: 5000 },
      ar: { type: String, default: '', trim: true, maxlength: 5000 },
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: ['quran', 'fiqh', 'aqeedah', 'seerah', 'arabic', 'tajweed', 'hadith', 'akhlaq'],
        message: '{VALUE} is not a valid course category',
      },
      index: true,
    },
    level: {
      type: String,
      required: [true, 'Level is required'],
      enum: {
        values: ['beginner', 'intermediate', 'advanced'],
        message: '{VALUE} is not a valid level',
      },
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be at least 1 week'],
    },
    fee: {
      type: Number,
      default: 0,
      min: [0, 'Fee cannot be negative'],
    },
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null,
      index: true,
    },
    school: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      default: null,
      index: true,
    },
    class: {
      type: Schema.Types.ObjectId,
      ref: 'Class',
      default: null,
      index: true,
    },
    maxStudents: {
      type: Number,
      required: [true, 'Maximum students is required'],
      min: [1, 'Must allow at least 1 student'],
    },
    enrolledStudents: {
      type: Number,
      default: 0,
      min: 0,
    },
    thumbnail: {
      type: String,
      default: null,
    },
    syllabus: {
      type: [moduleSchema],
      default: [],
      validate: {
        validator: function (modules: IModule[]) {
          // Validate unique week numbers
          const weeks = modules.map((m) => m.week);
          return new Set(weeks).size === weeks.length;
        },
        message: 'Syllabus contains duplicate week numbers',
      },
    },
    prerequisites: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ['draft', 'published', 'archived'],
        message: '{VALUE} is not a valid status',
      },
      default: 'draft',
      index: true,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    meetingLink: {
      type: String,
      default: '',
      trim: true,
    },
    isLive: {
      type: Boolean,
      default: false,
    },
    accessMode: {
      type: String,
      enum: {
        values: ['open', 'restricted'],
        message: '{VALUE} is not a valid access mode',
      },
      default: 'open',
    },
    videoGating: {
      type: {
        enabled: { type: Boolean, default: false },
        blockForwardSeeking: { type: Boolean, default: true },
        checkpoints: { type: [Number], default: [33, 66, 95] },
        minWatchPercentToUnlock: { type: Number, default: 95 },
        showCheckpointAlerts: { type: Boolean, default: true },
        description: { type: String, default: '' },
        // Dynamic checkpoint -> questions[] map; shape is validated in the
        // controller rather than via a rigid Mongoose subdocument schema.
        checkpointQuestions: { type: Schema.Types.Mixed, default: {} },
      },
      default: undefined,
    },
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
// Indexes
// ---------------------------------------------------------------------------

courseSchema.index({ level: 1 });
courseSchema.index({ fee: 1 }); // For filtering free vs paid courses
courseSchema.index({ startDate: 1 }); // For upcoming courses

// Compound indexes for common queries
courseSchema.index({ status: 1, category: 1 });
courseSchema.index({ status: 1, level: 1 });

// ---------------------------------------------------------------------------
// Virtual — Available Seats
// ---------------------------------------------------------------------------

courseSchema.virtual('availableSeats').get(function (this: ICourse) {
  return Math.max(0, this.maxStudents - this.enrolledStudents);
});

courseSchema.virtual('isFull').get(function (this: ICourse) {
  return this.enrolledStudents >= this.maxStudents;
});

courseSchema.set('toJSON', { virtuals: true });
courseSchema.set('toObject', { virtuals: true });

// ---------------------------------------------------------------------------
// Pre-save Hook — Auto-generate slug if not provided
// ---------------------------------------------------------------------------

courseSchema.pre<ICourse>('save', function (next) {
  if (!this.slug && this.title?.en) {
    this.slug = this.title.en
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100);
  }
  next();
});

// ---------------------------------------------------------------------------
// Model Export
// ---------------------------------------------------------------------------

const Course = mongoose.model<ICourse>('Course', courseSchema);
export default Course;