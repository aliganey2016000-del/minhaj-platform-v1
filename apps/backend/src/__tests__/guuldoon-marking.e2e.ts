import assert from 'node:assert/strict';
import {
  buildAnswerSpec,
  gradeAnswer,
  gradeNumeric,
  gradeText,
  isAutoMarkable,
  normalizeUnit,
  parseNumber,
} from '../services/guuldoon-marking.service';

const num = (value: number, extra: Record<string, unknown> = {}) => ({ kind: 'numeric' as const, value, ...extra });

// Number parsing: decimals, decimal comma, thousands, fractions, scientific notation, units.
assert.deepEqual(parseNumber('3.5'), { value: 3.5, rest: '' });
assert.deepEqual(parseNumber('3,5'), { value: 3.5, rest: '' });
assert.deepEqual(parseNumber('1,000'), { value: 1000, rest: '' });
assert.deepEqual(parseNumber('1,234.5'), { value: 1234.5, rest: '' });
assert.deepEqual(parseNumber('−2'), { value: -2, rest: '' });
assert.deepEqual(parseNumber('1/2'), { value: 0.5, rest: '' });
assert.deepEqual(parseNumber('5e-3'), { value: 0.005, rest: '' });
assert.equal(parseNumber('5 x 10^-3')?.value, 0.005);
assert.equal(parseNumber('5×10⁻³')?.value, 0.005);
assert.equal(parseNumber('2.5 x 10^3 m')?.rest, 'm');
assert.deepEqual(parseNumber('12 m/s'), { value: 12, rest: 'm/s' });
assert.deepEqual(parseNumber('٣٫٥'.replace('٫', '.')), { value: 3.5, rest: '' });
assert.equal(parseNumber('abc'), null);
assert.equal(parseNumber(''), null);

// Units compare by meaning, not by spelling.
assert.equal(normalizeUnit('m/s'), normalizeUnit('m s^-1'));
assert.equal(normalizeUnit('m/s'), normalizeUnit('m·s⁻¹'));
assert.equal(normalizeUnit('m/s2'), normalizeUnit('m s-2'));
assert.notEqual(normalizeUnit('m/s'), normalizeUnit('m/s2'));
assert.equal(normalizeUnit('kg m/s2'), normalizeUnit('kg·m·s⁻²'));

// Numeric marking: tolerance, unit and equivalent forms.
assert.equal(gradeNumeric('0.5', num(0.5)).correct, true);
assert.equal(gradeNumeric('1/2', num(0.5)).correct, true);
assert.equal(gradeNumeric('0,5', num(0.5)).correct, true);
assert.equal(gradeNumeric('5 x 10^-1', num(0.5)).correct, true);
assert.equal(gradeNumeric('0.504', num(0.5)).correct, true, 'within the default 1% tolerance');
assert.equal(gradeNumeric('0.52', num(0.5)).correct, false);
assert.equal(gradeNumeric('0.52', num(0.5, { tolerancePct: 5 })).correct, true);
assert.equal(gradeNumeric('9.8', num(9.81, { tolerancePct: 1 })).correct, true);
assert.equal(gradeNumeric('0', num(0)).correct, true);
assert.equal(gradeNumeric('10 m/s', num(10, { unit: 'm/s' })).correct, true);
assert.equal(gradeNumeric('10 m s^-1', num(10, { unit: 'm/s' })).correct, true);
assert.equal(gradeNumeric('10', num(10, { unit: 'm/s' })).correct, true, 'a missing unit is not penalised');
assert.deepEqual(gradeNumeric('10 m', num(10, { unit: 'm/s' })), { correct: false, reason: 'unit' });
assert.deepEqual(gradeNumeric('twelve', num(12)), { correct: false, reason: 'unparsable' });
assert.deepEqual(gradeNumeric('  ', num(12)), { correct: false, reason: 'empty' });

// Text marking: normalisation, accepted list, careful spelling allowance.
assert.equal(gradeText('Period', ['period']).correct, true);
assert.equal(gradeText('  the   PERIOD. ', ['the period']).correct, true);
assert.equal(gradeText('periode', ['period']).correct, true, 'one typo in a 6 letter word');
assert.equal(gradeText('frequency', ['period']).correct, false);
assert.equal(gradeText('amplitude', ['amplitude', 'amplitud']).correct, true);
assert.equal(gradeText('cat', ['cut']).correct, false, 'short words get no spelling allowance');
assert.equal(gradeText('12', ['13']).correct, false, 'numbers never get a spelling allowance');
assert.equal(gradeText('', ['period']).correct, false);
assert.equal(gradeText('الإزاحة', ['الازاحة']).correct, true, 'Arabic alef variants and diacritics');
assert.equal(gradeText('Qaybta', ['qaybta']).correct, true);

// Dispatch + legacy keys keep working.
assert.equal(gradeAnswer('mcq', 1, 1).correct, true);
assert.equal(gradeAnswer('mcq', 1, 2).correct, false);
assert.equal(gradeAnswer('fill', 'Period', 'period').correct, true);
assert.equal(gradeAnswer('fill', 'Period', 'frequency').correct, false);
assert.equal(gradeAnswer('match', { a: '1', b: '2' }, { b: '2', a: '1' }).correct, true);
assert.equal(gradeAnswer('structured', num(4, { unit: 'N' }), '4 N').correct, true);
assert.equal(gradeAnswer('structured', { kind: 'text', accepted: ['velocity'] }, 'velocity').correct, true);

// Which verified keys can be marked automatically.
assert.equal(isAutoMarkable('mcq', 0), true);
assert.equal(isAutoMarkable('fill', 'x'), true);
assert.equal(isAutoMarkable('structured', 'long answer'), false);
assert.equal(isAutoMarkable('structured', num(4)), true);
assert.equal(isAutoMarkable('structured', undefined), false);

// Importer helper builds the stored key.
assert.deepEqual(buildAnswerSpec({ answerType: 'numeric', correctAnswer: '9.81 m/s2', tolerancePct: 2 }), { kind: 'numeric', value: 9.81, tolerancePct: 2, unit: 'm/s2' });
assert.deepEqual(buildAnswerSpec({ answerType: 'numeric', correctAnswer: '4', unit: 'N' }), { kind: 'numeric', value: 4, unit: 'N' });
assert.equal(buildAnswerSpec({ answerType: 'numeric', correctAnswer: 'four' }), undefined);
assert.deepEqual(buildAnswerSpec({ answerType: 'text', correctAnswer: 'Period', acceptedAnswers: ['T', 'period'] }), { kind: 'text', accepted: ['Period', 'T', 'period'] });
assert.deepEqual(buildAnswerSpec({ acceptedAnswers: ['a', 'b'] }), { kind: 'text', accepted: ['a', 'b'] });
assert.equal(buildAnswerSpec({ correctAnswer: 'B' }), undefined);

console.log('Guuldoon deterministic marking engine: numeric, units, text, Arabic, legacy keys and importer keys passed.');
