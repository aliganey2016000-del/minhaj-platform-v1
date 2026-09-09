/**
 * Shared Question Engine — validation, student sanitization and grading for
 * course quizzes and exam papers.
 */
import type { IQuizQuestion, QuestionType } from '../models/shared/question.schema';

const VALID_TYPES: QuestionType[] = [
  'mcq', 'true_false', 'matching', 'ordering', 'picture_choice',
  'swipe_sort', 'listen_write', 'fill_blank', 'word_scramble', 'sentence_build',
  'short_answer',
];

export function validateQuestion(q: any): void {
  if (!q || typeof q !== 'object') throw new Error('Invalid question');
  if (!VALID_TYPES.includes(q.type)) throw new Error(`Invalid question type "${q.type}"`);
  if (!q.question || !String(q.question).trim()) throw new Error('Every question needs question text');

  switch (q.type as QuestionType) {
    case 'mcq':
      if (!Array.isArray(q.options) || q.options.length < 2) throw new Error('Multiple choice questions need at least 2 options');
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length) throw new Error('Multiple choice questions need a valid correct option');
      break;
    case 'true_false':
      if (typeof q.correctAnswer !== 'boolean') throw new Error('True/False questions need a correct answer');
      break;
    case 'matching':
      if (!Array.isArray(q.pairs) || q.pairs.length < 2) throw new Error('Matching questions need at least 2 pairs');
      break;
    case 'ordering':
      if (!Array.isArray(q.items) || q.items.length < 2) throw new Error('Ordering questions need at least 2 items');
      break;
    case 'picture_choice':
      if (!Array.isArray(q.choices) || q.choices.length < 2) throw new Error('Picture choice questions need at least 2 choices');
      if (typeof q.correctIndex !== 'number') throw new Error('Picture choice questions need a correct choice');
      break;
    case 'swipe_sort':
      if (!Array.isArray(q.cards) || q.cards.length < 1) throw new Error('Swipe sort questions need at least 1 card');
      break;
    case 'listen_write':
      if (!q.audioUrl || !q.correctText) throw new Error('Listen & write questions need audio and a reference answer');
      break;
    case 'fill_blank':
      if (!q.textTemplate || !Array.isArray(q.blanks) || q.blanks.length === 0) throw new Error('Fill in the blank questions need a template and blanks');
      break;
    case 'word_scramble':
      if (!q.answer) throw new Error('Word scramble questions need an answer');
      break;
    case 'sentence_build':
      if (!Array.isArray(q.words) || q.words.length < 2) throw new Error('Sentence build questions need at least 2 words');
      break;
    case 'short_answer':
      if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length < 1 || q.correctAnswers.every((value: any) => !String(value || '').trim())) {
        throw new Error('Short answer questions need at least one accepted answer');
      }
      break;
  }
}

export function validateQuestions(questions: any[]): void {
  if (!Array.isArray(questions) || questions.length === 0) throw new Error('At least one question is required');
  questions.forEach(validateQuestion);
}

const ANSWER_REVEALING_FIELDS = [
  'explanation', 'correctAnswers', 'correctIndex', 'correctAnswer', 'pairs',
  'correctText', 'answer', 'blanks', 'distractors',
] as const;

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sanitizeQuestionForStudent(question: any): any {
  const safeQuestion = { ...question };
  for (const field of ANSWER_REVEALING_FIELDS) delete safeQuestion[field];
  if (Array.isArray(question.cards)) safeQuestion.cards = question.cards.map((card: any) => ({ text: card.text }));

  if (question.type === 'mcq' && Array.isArray(question.options)) safeQuestion.options = shuffleArray(question.options);
  if (question.type === 'picture_choice' && Array.isArray(question.choices)) safeQuestion.choices = shuffleArray(question.choices);
  if (question.type === 'matching' && Array.isArray(question.pairs)) {
    safeQuestion.leftItems = question.pairs.map((pair: any) => pair.left);
    safeQuestion.rightItems = shuffleArray(question.pairs.map((pair: any) => pair.right));
  }
  if (question.type === 'ordering' && Array.isArray(question.items)) safeQuestion.items = shuffleArray(question.items);
  if (question.type === 'swipe_sort' && Array.isArray(question.cards)) safeQuestion.cards = shuffleArray(safeQuestion.cards);
  if (question.type === 'word_scramble' && typeof question.answer === 'string') safeQuestion.scrambledLetters = shuffleArray(question.answer.split(''));
  if (question.type === 'sentence_build' && Array.isArray(question.words)) safeQuestion.wordBank = shuffleArray([...question.words, ...(question.distractors || [])]);
  if (question.type === 'fill_blank' && Array.isArray(question.blanks)) safeQuestion.wordBank = shuffleArray([...question.blanks, ...(question.distractors || [])]);

  return safeQuestion;
}

function normalizeText(s: unknown): string {
  return typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

function arraysMatch<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function textArraysMatch(a: unknown[], b: string[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((value, index) => normalizeText(value) === normalizeText(b[index]));
}

function compareMatching(correctPairs: any[], submittedPairs: any[]): boolean {
  if (!Array.isArray(submittedPairs) || submittedPairs.length !== correctPairs.length) return false;
  return correctPairs.every((correct) => submittedPairs.some((submitted) => submitted?.left === correct.left && submitted?.right === correct.right));
}

export function evaluateQuestion(question: any, answer: any): boolean {
  if (!question || typeof question !== 'object') return false;
  switch (question.type) {
    case 'mcq':
      return typeof answer === 'string' && Array.isArray(question.options) && typeof question.correctIndex === 'number' && normalizeText(answer) === normalizeText(question.options[question.correctIndex]);
    case 'picture_choice':
      return typeof answer === 'string' && Array.isArray(question.choices) && typeof question.correctIndex === 'number' && answer === question.choices[question.correctIndex]?.image;
    case 'true_false':
      return answer === question.correctAnswer;
    case 'matching':
      return compareMatching(question.pairs || [], Array.isArray(answer) ? answer : []);
    case 'ordering':
      return Array.isArray(answer) && Array.isArray(question.items) ? arraysMatch(answer, question.items) : false;
    case 'fill_blank':
      return Array.isArray(question.blanks) ? textArraysMatch(answer, question.blanks) : false;
    case 'word_scramble':
      return typeof answer === 'string' && typeof question.answer === 'string' && normalizeText(answer) === normalizeText(question.answer);
    case 'sentence_build':
      return Array.isArray(answer) && Array.isArray(question.words) ? arraysMatch(answer, question.words) : false;
    case 'listen_write':
      return typeof answer === 'string' && typeof question.correctText === 'string' && normalizeText(answer) === normalizeText(question.correctText);
    case 'short_answer': {
      if (typeof answer !== 'string' || !Array.isArray(question.correctAnswers)) return false;
      const submitted = normalizeText(answer);
      return submitted.length > 0 && question.correctAnswers.some((accepted: unknown) => normalizeText(accepted) === submitted);
    }
    case 'swipe_sort':
      if (!Array.isArray(answer) || !Array.isArray(question.cards)) return false;
      return question.cards.every((card: any) => {
        const submitted = answer.find((item: any) => item?.text === card.text);
        return submitted?.side === card.correctSide;
      });
    default:
      return false;
  }
}

function matchingFraction(correctPairs: any[], submittedPairs: any[]): number {
  if (!Array.isArray(correctPairs) || correctPairs.length === 0 || !Array.isArray(submittedPairs)) return 0;
  const correctCount = correctPairs.filter((correct) => submittedPairs.some((s) => s?.left === correct.left && s?.right === correct.right)).length;
  return correctCount / correctPairs.length;
}

export function questionFraction(question: any, answer: any): number {
  if (question?.type === 'matching') return matchingFraction(question.pairs || [], answer);
  return evaluateQuestion(question, answer) ? 1 : 0;
}

export interface GradedAnswer {
  questionId: string | undefined;
  selectedAnswer: unknown;
  correct: boolean;
  points: number;
  explanation?: string;
}

export function gradeQuestionSet(questions: IQuizQuestion[] & { _id?: any }[], answerMap: Record<string, unknown>) {
  const gradedAnswers: GradedAnswer[] = [];
  let earnedPoints = 0;
  let totalPoints = 0;

  for (const question of questions as any[]) {
    const questionId = question._id?.toString();
    const selectedAnswer = questionId ? answerMap[questionId] : undefined;
    const points = typeof question.points === 'number' ? question.points : 1;
    const fraction = questionFraction(question, selectedAnswer);
    const earned = Math.round(points * fraction * 100) / 100;
    earnedPoints += earned;
    gradedAnswers.push({
      questionId,
      selectedAnswer,
      correct: fraction === 1,
      points: earned,
      explanation: fraction !== 1 && question.explanation ? question.explanation : undefined,
    });
    totalPoints += points;
  }

  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  return { gradedAnswers, earnedPoints, totalPoints, percentage };
}
