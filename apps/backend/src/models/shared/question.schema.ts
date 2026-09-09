/**
 * Shared Question Schema — the one question engine used everywhere a
 * student answers something graded: course quizzes AND exam papers.
 *
 * This is the single source of truth for question shape and type names.
 */
import { Schema } from 'mongoose';

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
  | 'sentence_build'
  | 'short_answer';

export interface IQuizQuestion {
  type?: QuestionType;
  question: string;
  explanation?: string;
  points?: number;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: boolean;
  pairs?: { left: string; right: string }[];
  items?: string[];
  choices?: { image: string; label?: string }[];
  leftLabel?: string;
  rightLabel?: string;
  cards?: { text: string; correctSide: 'left' | 'right' }[];
  audioUrl?: string;
  correctText?: string;
  hint?: string;
  textTemplate?: string;
  blanks?: string[];
  distractors?: string[];
  answer?: string;
  words?: string[];
  // short_answer — one or more accepted normalized answers
  correctAnswers?: string[];
}

export const questionSchema = new Schema<IQuizQuestion>(
  {
    type: {
      type: String,
      enum: [
        'mcq', 'true_false', 'matching', 'ordering', 'picture_choice',
        'swipe_sort', 'listen_write', 'fill_blank', 'word_scramble', 'sentence_build',
        'short_answer',
      ],
      default: 'mcq',
    },
    question: { type: String, required: true, trim: true },
    explanation: { type: String, default: '' },
    points: { type: Number, default: 1, min: 0 },
    options: { type: [String], default: undefined },
    correctIndex: { type: Number, min: 0 },
    correctAnswer: { type: Boolean },
    pairs: {
      type: [{ left: { type: String, trim: true }, right: { type: String, trim: true } }],
      default: undefined,
    },
    items: { type: [String], default: undefined },
    choices: {
      type: [{ image: { type: String, trim: true }, label: { type: String, trim: true } }],
      default: undefined,
    },
    leftLabel: { type: String, trim: true },
    rightLabel: { type: String, trim: true },
    cards: {
      type: [{ text: { type: String, trim: true }, correctSide: { type: String, enum: ['left', 'right'] } }],
      default: undefined,
    },
    audioUrl: { type: String, trim: true },
    correctText: { type: String, trim: true },
    hint: { type: String, trim: true },
    textTemplate: { type: String, trim: true },
    blanks: { type: [String], default: undefined },
    distractors: { type: [String], default: undefined },
    answer: { type: String, trim: true },
    words: { type: [String], default: undefined },
    correctAnswers: { type: [String], default: undefined },
  },
  { _id: true }
);
