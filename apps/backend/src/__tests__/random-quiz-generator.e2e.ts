import assert from 'node:assert/strict';
import { generateRandomQuizQuestions, validateRandomQuizConfig } from '../utils/random-quiz-generator';
import { evaluateQuestion, sanitizeQuestionForStudent } from '../utils/question-engine';

const chapters: any[] = [{
  _id: 'chapter-1', title: 'Unit 1', items: [
    { _id: 'lesson-1', type: 'lesson', title: 'Lesson 1', contentBlocks: [{ questions: [
      { type: 'mcq', question: 'L1-Q1', options: ['A', 'B'], correctIndex: 0 },
      { type: 'mcq', question: 'L1-Q2', options: ['A', 'B'], correctIndex: 1 },
      { type: 'true_false', question: 'L1-Q3', correctAnswer: true },
      { type: 'short_answer', question: 'L1-Q4', correctAnswers: ['Prophet Muhammad', 'Muhammad'] },
    ] }] },
    { _id: 'lesson-2', type: 'lesson', title: 'Lesson 2', contentBlocks: [{ questions: [
      { type: 'mcq', question: 'L2-Q1', options: ['A', 'B'], correctIndex: 0 },
      { type: 'mcq', question: 'L2-Q2', options: ['A', 'B'], correctIndex: 1 },
      { type: 'true_false', question: 'L2-Q3', correctAnswer: false },
      { type: 'short_answer', question: 'L2-Q4', correctAnswers: ['Madinah'] },
    ] }] },
    { _id: 'quiz-1', type: 'quiz', title: 'Source Quiz', questions: [
      { _id: 'q1', type: 'mcq', question: 'Q1', options: ['A', 'B'], correctIndex: 0 },
      { _id: 'q2', type: 'mcq', question: 'Q2', options: ['A', 'B'], correctIndex: 1 },
    ] },
  ],
}];

const config = {
  enabled: true,
  sources: [
    { itemId: 'lesson-1', type: 'lesson' as const, weight: 50 },
    { itemId: 'lesson-2', type: 'lesson' as const, weight: 30 },
    { itemId: 'quiz-1', type: 'quiz' as const, weight: 20 },
  ],
  questionTypes: [
    { type: 'mcq' as const, quantity: 4 },
    { type: 'true_false' as const, quantity: 2 },
  ],
  totalQuestions: 6,
  version: 1,
};

validateRandomQuizConfig(chapters, config);
const first = generateRandomQuizQuestions(chapters, config, 'student-A:course-1:quiz-1:1');
const second = generateRandomQuizQuestions(chapters, config, 'student-A:course-1:quiz-1:1');
const otherStudent = generateRandomQuizQuestions(chapters, config, 'student-B:course-1:quiz-1:1');
assert.equal(first.length, 6);
assert.deepEqual(first.map((q) => q._id), second.map((q) => q._id), 'same student seed must be stable across reloads');
assert.equal(first.filter((q) => q.type === 'mcq').length, 4);
assert.equal(first.filter((q) => q.type === 'true_false').length, 2);
assert.ok(new Set(first.map((q) => q._id)).size === first.length, 'questions must not repeat');
assert.notDeepEqual(first.map((q) => q._id), otherStudent.map((q) => q._id), 'different students should normally receive different sets');

const fallbackConfig = { ...config, sources: [{ itemId: 'lesson-1', type: 'lesson' as const, weight: 80 }, { itemId: 'lesson-2', type: 'lesson' as const, weight: 20 }], questionTypes: [{ type: 'mcq' as const, quantity: 3 }], totalQuestions: 3 };
const fallbackSet = generateRandomQuizQuestions(chapters, fallbackConfig, 'student-A:course-1:quiz-2:1');
assert.equal(fallbackSet.length, 3, 'capacity deficits must be filled from other selected sources');

const shortAnswerConfig = { ...config, sources: [{ itemId: 'lesson-1', type: 'lesson' as const, weight: 50 }, { itemId: 'lesson-2', type: 'lesson' as const, weight: 50 }], questionTypes: [{ type: 'short_answer' as const, quantity: 2 }], totalQuestions: 2 };
const shortAnswerSet = generateRandomQuizQuestions(chapters, shortAnswerConfig, 'student-A:course-1:quiz-3:1');
assert.equal(shortAnswerSet.length, 2);
assert.ok(shortAnswerSet.every((q) => q.type === 'short_answer'));

assert.equal(evaluateQuestion({ type: 'short_answer', correctAnswers: ['Prophet Muhammad', 'Muhammad'] }, 'prophet   muhammad'), true);
assert.equal(evaluateQuestion({ type: 'short_answer', correctAnswers: ['Prophet Muhammad', 'Muhammad'] }, 'MUSA'), false);
const safeShort = sanitizeQuestionForStudent({ type: 'short_answer', question: 'Who?', correctAnswers: ['Prophet Muhammad'] });
assert.equal('correctAnswers' in safeShort, false, 'student payload must not expose accepted answers');

assert.throws(() => validateRandomQuizConfig(chapters, { ...config, sources: [{ itemId: 'lesson-1', type: 'lesson', weight: 60 }, { itemId: 'lesson-2', type: 'lesson', weight: 30 }] } as any), /100%/);
assert.throws(() => validateRandomQuizConfig(chapters, { ...config, questionTypes: [{ type: 'mcq', quantity: 99 }], totalQuestions: 99 } as any), /Not enough/);

console.log('random-quiz-generator: PASS');
