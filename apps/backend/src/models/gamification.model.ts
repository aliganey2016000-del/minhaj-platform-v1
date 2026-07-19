/**
 * Gamification Model
 *
 * Tracks XP points, streaks, badges, and achievements for students
 * to drive engagement and motivation through game mechanics.
 *
 * XP Rules:
 *   - Complete a lesson: 10 XP
 *   - Score ≥80% on a quiz: 20 XP
 *   - Score 100% on a quiz: 40 XP (perfect bonus)
 *   - Maintain 5-day streak: 15 XP bonus
 *   - Maintain 10-day streak: 30 XP bonus
 *   - Maintain 30-day streak: 100 XP bonus
 *
 * Badges (auto-awarded):
 *   - 🥉 Bronze Scholar — 250 total XP
 *   - 🥈 Silver Scholar — 500 total XP
 *   - 🥇 Gold Scholar   — 1000 total XP
 *   - 🔥 Streak Master  — 7-day streak
 *   - 💯 Perfect Score  — ace any quiz
 *   - 🎯 Sharpshooter   — 5 perfect quiz scores
 *   - 📚 Bookworm       — complete 10 lessons
 *   - ⚡ Speed Demon    — complete a quiz in under 60 seconds
 *   - 🌙 Night Owl      — login after 10 PM
 *   - ☀️ Early Bird     — login before 6 AM
 *   - 🏆 Level 5        — reach level 5
 *   - 🏆 Level 10       — reach level 10
 */

import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type BadgeCategory = 'milestone' | 'streak' | 'performance' | 'special' | 'level';

export interface IBadge {
  key: string;
  name: {
    en: string;
    so: string;
    ar: string;
  };
  description: {
    en: string;
    so: string;
    ar: string;
  };
  icon: string; // emoji
  category: BadgeCategory;
  color: string; // tailwind gradient class or hex
}

export interface IEarnedBadge {
  badgeKey: string;
  earnedAt: Date;
}

export interface IXPLog {
  amount: number;
  source: string; // lesson_complete, quiz_score, quiz_perfect, streak_5, streak_10, streak_30, bonus, etc.
  description: string;
  earnedAt: Date;
}

export interface IStreak {
  current: number;       // consecutive active days
  longest: number;       // all-time best streak
  lastActivityDate: Date | null;
}

export interface IGamification extends Document {
  _id: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;   // ref -> Student
  xp: number;
  level: number;
  xpToNextLevel: number;
  streak: IStreak;
  earnedBadges: IEarnedBadge[];
  xpLog: IXPLog[];
  totalLessonsCompleted: number;
  totalQuizzesCompleted: number;
  totalPerfectScores: number;
  totalTimeSpentSeconds: number;       // cumulative learning time
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// XP per level formula: level * 125 (Level 1→125, 2→250, 3→375, ...)
// ---------------------------------------------------------------------------

export function xpForLevel(level: number): number {
  return level * 125;
}

export function totalXpForLevel(targetLevel: number): number {
  let total = 0;
  for (let l = 1; l < targetLevel; l++) {
    total += xpForLevel(l);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Badge Definitions
// ---------------------------------------------------------------------------

export const ALL_BADGES: IBadge[] = [
  {
    key: 'bronze_scholar',
    name: { en: 'Bronze Scholar', so: 'Aqoonyahan Bronze', ar: 'باحث برونزي' },
    description: { en: 'Earned 250 XP', so: 'Helay 250 XP', ar: 'حصل على 250 نقطة' },
    icon: '🥉',
    category: 'milestone',
    color: 'from-amber-600 to-amber-700',
  },
  {
    key: 'silver_scholar',
    name: { en: 'Silver Scholar', so: 'Aqoonyahan Silver', ar: 'باحث فضي' },
    description: { en: 'Earned 500 XP', so: 'Helay 500 XP', ar: 'حصل على 500 نقطة' },
    icon: '🥈',
    category: 'milestone',
    color: 'from-gray-300 to-gray-400',
  },
  {
    key: 'gold_scholar',
    name: { en: 'Gold Scholar', so: 'Aqoonyahan Gold', ar: 'باحث ذهبي' },
    description: { en: 'Earned 1000 XP', so: 'Helay 1000 XP', ar: 'حصل على 1000 نقطة' },
    icon: '🥇',
    category: 'milestone',
    color: 'from-yellow-400 to-yellow-500',
  },
  {
    key: 'streak_master',
    name: { en: 'Streak Master', so: 'Halyeyga Streak', ar: 'سيد التتابع' },
    description: { en: '7-day streak', so: '7 maalmood oo xiriir ah', ar: '٧ أيام متتالية' },
    icon: '🔥',
    category: 'streak',
    color: 'from-orange-500 to-red-500',
  },
  {
    key: 'perfect_score',
    name: { en: 'Perfect Score', so: 'Dhibco Dhameystiran', ar: 'الدرجة الكاملة' },
    description: { en: 'Aced a quiz with 100%', so: '100% ku dhameeyay quiz', ar: 'حصل على ١٠٠٪ في اختبار' },
    icon: '💯',
    category: 'performance',
    color: 'from-green-400 to-emerald-500',
  },
  {
    key: 'sharpshooter',
    name: { en: 'Sharpshooter', so: 'Toogte Khabiir ah', ar: 'القناص' },
    description: { en: '5 perfect quiz scores', so: '5 quiz oo 100% ah', ar: '٥ درجات كاملة' },
    icon: '🎯',
    category: 'performance',
    color: 'from-red-400 to-rose-500',
  },
  {
    key: 'bookworm',
    name: { en: 'Bookworm', so: 'Jecel Akhriska', ar: 'دودة الكتب' },
    description: { en: 'Completed 10 lessons', so: '10 cashar dhameeyay', ar: 'أكمل ١٠ دروس' },
    icon: '📚',
    category: 'milestone',
    color: 'from-blue-400 to-indigo-500',
  },
  {
    key: 'speed_demon',
    name: { en: 'Speed Demon', so: 'Ku Cuno Degdegga', ar: 'شيطان السرعة' },
    description: { en: 'Completed a quiz in under 60s', so: 'Quiz ku dhameeyay 60s gudahood', ar: 'أكمل اختبارًا في أقل من ٦٠ ثانية' },
    icon: '⚡',
    category: 'special',
    color: 'from-yellow-300 to-amber-400',
  },
  {
    key: 'night_owl',
    name: { en: 'Night Owl', so: 'Guumaystaha Habeenkii', ar: 'بومة الليل' },
    description: { en: 'Studied after 10 PM', so: 'Wax bartay 10 PM kadib', ar: 'درس بعد الساعة ١٠ مساءً' },
    icon: '🌙',
    category: 'special',
    color: 'from-indigo-500 to-purple-600',
  },
  {
    key: 'early_bird',
    name: { en: 'Early Bird', so: 'Kalsooni Subax', ar: 'الطائر المبكر' },
    description: { en: 'Studied before 6 AM', so: 'Wax bartay 6 AM ka hor', ar: 'درس قبل الساعة ٦ صباحًا' },
    icon: '☀️',
    category: 'special',
    color: 'from-orange-300 to-yellow-400',
  },
  {
    key: 'level_5',
    name: { en: 'Level 5', so: 'Heerka 5aad', ar: 'المستوى ٥' },
    description: { en: 'Reached Level 5', so: 'Gaaray Heerka 5aad', ar: 'وصل إلى المستوى ٥' },
    icon: '🏆',
    category: 'level',
    color: 'from-purple-500 to-violet-600',
  },
  {
    key: 'level_10',
    name: { en: 'Level 10', so: 'Heerka 10aad', ar: 'المستوى ١٠' },
    description: { en: 'Reached Level 10', so: 'Gaaray Heerka 10aad', ar: 'وصل إلى المستوى ١٠' },
    icon: '👑',
    category: 'level',
    color: 'from-yellow-400 to-amber-500',
  },
];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const earnedBadgeSchema = new Schema<IEarnedBadge>(
  {
    badgeKey: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const xpLogSchema = new Schema<IXPLog>(
  {
    amount: { type: Number, required: true },
    source: { type: String, required: true },
    description: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const streakSchema = new Schema<IStreak>(
  {
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    lastActivityDate: { type: Date, default: null },
  },
  { _id: false }
);

const gamificationSchema = new Schema<IGamification>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true,
      index: true,
    },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    xpToNextLevel: { type: Number, default: 125 },
    streak: { type: streakSchema, default: () => ({ current: 0, longest: 0, lastActivityDate: null }) },
    earnedBadges: { type: [earnedBadgeSchema], default: [] },
    xpLog: { type: [xpLogSchema], default: [] },
    totalLessonsCompleted: { type: Number, default: 0 },
    totalQuizzesCompleted: { type: Number, default: 0 },
    totalPerfectScores: { type: Number, default: 0 },
    totalTimeSpentSeconds: { type: Number, default: 0 },
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

// Index for leaderboard queries
gamificationSchema.index({ xp: -1 });
gamificationSchema.index({ level: -1 });

// ---------------------------------------------------------------------------
// Virtual — total number of badges
// ---------------------------------------------------------------------------

gamificationSchema.virtual('totalBadges').get(function (this: IGamification) {
  return this.earnedBadges.length;
});

gamificationSchema.set('toJSON', { virtuals: true });
gamificationSchema.set('toObject', { virtuals: true });

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const Gamification = mongoose.model<IGamification>('Gamification', gamificationSchema);
export default Gamification;