import type { QuestionType } from './course-builder.types';

export interface RandomQuizSourceConfig {
  itemId: string;
  type: 'lesson' | 'quiz';
  weight: number;
}

export interface RandomQuizTypeConfig {
  type: QuestionType;
  quantity: number;
}

export interface RandomQuizConfig {
  enabled: boolean;
  sources: RandomQuizSourceConfig[];
  questionTypes: RandomQuizTypeConfig[];
  totalQuestions: number;
  version: number;
}

declare module './course-builder.types' {
  interface QuizItem {
    randomConfig?: RandomQuizConfig;
  }
}
