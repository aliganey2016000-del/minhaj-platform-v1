/**
 * Shared Question Schema — the one question engine used everywhere a
 * student answers something graded: course quizzes AND exam papers.
 *
 * Previously exam papers had their own, much smaller 3-type schema
 * (mcq/true_false/short_answer) defined separately in exam-paper.model.ts,
 * with its own admin editor and its own inline grading logic in
 * exam-attempt.controller.ts. That meant two codebases to keep in sync for
 * "what a question looks like" and "how it's graded" — this file (plus
 * ../../utils/question-grading.ts on the grading side) is the single source
 * of truth both quiz and exam questions now share.
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

export const questionSchema = new Schema<IQuizQuestion>(
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
