/**
 * Guuldoon deterministic marking engine.
 *
 * Marks short answers and simple calculations without AI and without a
 * teacher: numeric answers are compared with a tolerance and a unit check,
 * text answers against a list of accepted answers after normalisation and a
 * conservative spelling allowance. Everything here is pure and synchronous so
 * it is cheap at 70k+ students and easy to test.
 */

export type NumericAnswerSpec = {
  kind: 'numeric';
  value: number;
  /** Relative tolerance in percent. Defaults to 1. */
  tolerancePct?: number;
  /** Absolute tolerance, used when it is larger than the relative one. */
  toleranceAbs?: number;
  /** Expected unit, e.g. "m/s". If the student writes a unit it must match. */
  unit?: string;
};

export type TextAnswerSpec = {
  kind: 'text';
  accepted: string[];
};

export type AnswerSpec = NumericAnswerSpec | TextAnswerSpec;

export type GradeResult = { correct: boolean; reason?: 'value' | 'unit' | 'unparsable' | 'empty' };

export const DEFAULT_TOLERANCE_PCT = 1;

export function isAnswerSpec(value: unknown): value is AnswerSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'numeric') return Number.isFinite((value as NumericAnswerSpec).value);
  if (kind === 'text') {
    const accepted = (value as TextAnswerSpec).accepted;
    return Array.isArray(accepted) && accepted.length > 0 && accepted.every(item => typeof item === 'string');
  }
  return false;
}

/* ───────────────────────────── text ───────────────────────────── */

export function normalizeText(input: unknown): string {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '') // Latin accents, Arabic tashkeel and tatweel
    .replace(/[أإآ]/g, 'ا') // alef variants
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    let rowMin = previous[0];
    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = temp;
      rowMin = Math.min(rowMin, previous[j]);
    }
    if (rowMin > limit) return limit + 1;
  }
  return previous[b.length];
}

/** Spelling allowance: none for short answers, 1 edit from 5 letters, 2 from 10. */
function spellingLimit(length: number): number {
  if (length >= 10) return 2;
  if (length >= 5) return 1;
  return 0;
}

function stripArticle(value: string): string {
  return value.replace(/^(?:the|a|an)\s+(?=\S)/, '');
}

export function gradeText(submitted: unknown, accepted: string[]): GradeResult {
  const answer = stripArticle(normalizeText(submitted));
  if (!answer) return { correct: false, reason: 'empty' };
  for (const candidate of accepted) {
    const expected = stripArticle(normalizeText(candidate));
    if (!expected) continue;
    if (answer === expected) return { correct: true };
    // Numbers must match exactly; spelling tolerance is for words only.
    if (/\d/.test(expected)) continue;
    if (editDistance(answer, expected, spellingLimit(expected.length)) <= spellingLimit(expected.length)) return { correct: true };
  }
  return { correct: false, reason: 'value' };
}

/* ──────────────────────────── numeric ─────────────────────────── */

const SUPERSCRIPTS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };

function plainDigits(value: string): string {
  return value
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, char => SUPERSCRIPTS[char] || char)
    .replace(/[−–—]/g, '-')
    .replace(/[٠-٩]/g, char => String(char.charCodeAt(0) - 0x0660)); // Arabic-Indic digits
}

function toDecimal(raw: string): number {
  let text = raw.replace(/\s+/g, '');
  if (text.includes('.') && text.includes(',')) text = text.replace(/,/g, '');
  else if (text.includes(',')) text = /^[1-9]\d{0,2}(,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  return Number(text);
}

/**
 * Reads a leading number (integer, decimal with . or ,, a/b fraction,
 * 5e-3, or 5 x 10^-3) and returns the remaining text as the unit part.
 */
export function parseNumber(input: unknown): { value: number; rest: string } | null {
  const text = plainDigits(String(input ?? '')).trim();
  if (!text) return null;

  const scientific = text.match(/^([+-]?\d[\d.,]*)\s*(?:[x×*·]|\*)\s*10\s*\^?\s*\(?\s*([+-]?\d+)\s*\)?\s*(.*)$/i);
  if (scientific) {
    const mantissa = toDecimal(scientific[1]);
    const exponent = Number(scientific[2]);
    if (Number.isFinite(mantissa) && Number.isFinite(exponent)) return { value: mantissa * 10 ** exponent, rest: scientific[3].trim() };
  }

  const fraction = text.match(/^([+-]?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)(?![\p{L}\d])\s*(.*)$/u);
  if (fraction) {
    const top = toDecimal(fraction[1]);
    const bottom = toDecimal(fraction[2]);
    if (Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0) return { value: top / bottom, rest: fraction[3].trim() };
  }

  const plain = text.match(/^([+-]?(?:\d[\d.,]*|\.\d+)(?:e[+-]?\d+)?)\s*(.*)$/i);
  if (plain) {
    const value = toDecimal(plain[1]);
    if (Number.isFinite(value)) return { value, rest: plain[2].trim() };
  }
  return null;
}

/** Canonical form of a simple unit so that m/s, m s^-1, m·s⁻¹ and m*s-1 compare equal. */
export function normalizeUnit(input: unknown): string {
  const text = plainDigits(String(input ?? ''))
    .toLowerCase()
    .replace(/[·⋅*]/g, ' ')
    .replace(/\^/g, '')
    .replace(/\s+/g, ' ')
    .replace(/°\s*/g, '°')
    .trim();
  if (!text) return '';
  const [numerator, ...denominators] = text.split('/');
  const exponents = new Map<string, number>();
  const add = (chunk: string, sign: 1 | -1) => {
    chunk.split(/\s+/).filter(Boolean).forEach(factor => {
      const match = factor.match(/^([^\d+-]+?)([+-]?\d+)?$/u);
      const symbol = match ? match[1] : factor;
      const power = match && match[2] ? Number(match[2]) : 1;
      exponents.set(symbol, (exponents.get(symbol) || 0) + sign * power);
    });
  };
  add(numerator, 1);
  denominators.forEach(part => add(part, -1));
  return [...exponents.entries()]
    .filter(([, power]) => power !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, power]) => (power === 1 ? symbol : `${symbol}${power}`))
    .join(' ');
}

export function gradeNumeric(submitted: unknown, spec: NumericAnswerSpec): GradeResult {
  const parsed = parseNumber(submitted);
  if (!String(submitted ?? '').trim()) return { correct: false, reason: 'empty' };
  if (!parsed) return { correct: false, reason: 'unparsable' };
  const pct = spec.tolerancePct ?? DEFAULT_TOLERANCE_PCT;
  const allowed = Math.max(Math.abs(spec.value) * pct / 100, spec.toleranceAbs ?? 0, Math.abs(spec.value) * 1e-9, Number.MIN_VALUE);
  if (Math.abs(parsed.value - spec.value) > allowed) return { correct: false, reason: 'value' };
  // A unit is checked only when the key defines one and the student wrote one.
  if (spec.unit && parsed.rest && normalizeUnit(parsed.rest) !== normalizeUnit(spec.unit)) return { correct: false, reason: 'unit' };
  return { correct: true };
}

/* ───────────────────────────── generic ────────────────────────── */

function legacyKey(value: unknown): string {
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ').toLowerCase();
  if (Array.isArray(value)) return JSON.stringify(value.map(item => (typeof item === 'string' ? item.trim().toLowerCase() : item)));
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return JSON.stringify(Object.keys(source).sort().reduce<Record<string, unknown>>((acc, key) => { acc[key] = source[key]; return acc; }, {}));
  }
  return JSON.stringify(value);
}

/** True when this answer key can be marked automatically once it is verified. */
export function isAutoMarkable(type: string, answer: unknown): boolean {
  if (answer === undefined || answer === null || answer === '') return false;
  if (isAnswerSpec(answer)) return true;
  if (type === 'match') return Array.isArray(answer) && answer.length >= 2 && answer.every(item => Number.isInteger(item));
  return type === 'mcq' || type === 'fill';
}

export function gradeAnswer(type: string, key: unknown, submitted: unknown): GradeResult {
  if (isAnswerSpec(key)) return key.kind === 'numeric' ? gradeNumeric(submitted, key) : gradeText(submitted, key.accepted);
  // Legacy keys: MCQ index / letter, match objects and plain fill strings.
  if (type === 'fill' && typeof key === 'string') return gradeText(submitted, [key]);
  return { correct: legacyKey(submitted) === legacyKey(key) };
}

/** Builds the stored answer key from the importer columns. */
export function buildAnswerSpec(input: {
  answerType?: string;
  correctAnswer?: string;
  acceptedAnswers?: string[];
  tolerancePct?: number | null;
  unit?: string;
}): AnswerSpec | undefined {
  const type = (input.answerType || '').trim().toLowerCase();
  const accepted = [input.correctAnswer || '', ...(input.acceptedAnswers || [])].map(item => item.trim()).filter(Boolean);
  if (type === 'numeric') {
    const parsed = parseNumber(input.correctAnswer || '');
    if (!parsed) return undefined;
    const unit = (input.unit || parsed.rest || '').trim();
    return {
      kind: 'numeric',
      value: parsed.value,
      ...(input.tolerancePct != null && Number.isFinite(input.tolerancePct) ? { tolerancePct: input.tolerancePct } : {}),
      ...(unit ? { unit } : {}),
    };
  }
  if (type === 'text' || (!type && (input.acceptedAnswers || []).length)) {
    return accepted.length ? { kind: 'text', accepted: [...new Set(accepted)] } : undefined;
  }
  return undefined;
}

/** Human-readable correct answer for display after the student answers or asks to see it. */
export function describeAnswer(type: string, key: unknown, options?: string[]): string {
  if (key === undefined || key === null || key === '') return '';
  if (isAnswerSpec(key)) {
    if (key.kind === 'numeric') return `${key.value}${key.unit ? ' ' + key.unit : ''}`;
    return key.accepted[0] || '';
  }
  if (type === 'mcq') {
    const index = typeof key === 'number' ? key : ['A', 'B', 'C', 'D'].indexOf(String(key).trim().toUpperCase());
    const text = index >= 0 && options?.[index] ? options[index] : '';
    return index >= 0 && text ? `${String.fromCharCode(65 + index)}. ${text}` : String(key);
  }
  if (type === 'match' && Array.isArray(key) && options) {
    const lefts = options.filter(item => item.startsWith('L|')).map(item => item.slice(2));
    const rights = options.filter(item => item.startsWith('R|')).map(item => item.slice(2));
    return key.map((rightIndex, index) => `${index + 1}. ${lefts[index] ?? ''} → ${rights[Number(rightIndex)] ?? ''}`).join('\n');
  }
  return typeof key === 'string' ? key : JSON.stringify(key);
}
