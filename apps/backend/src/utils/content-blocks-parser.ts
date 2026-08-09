/**
 * Shared row → Interactive Gate Content Block parser.
 *
 * Groups spreadsheet rows into blocks (rows sharing a Block Title belong to
 * the same block; each row with a Question Text becomes one Stop & Check
 * question on that block). Used by both the single-lesson importer
 * (content-blocks-import.controller.ts, one sheet → one lesson's blocks,
 * stateless) and the course-wide bulk importer (course-content.controller.ts,
 * many sheets → many lessons' blocks, writes straight to the DB) so the
 * grouping/validation rules never drift between the two entry points.
 */

// `marked` ships ESM-only (`"type": "module"`, no CJS build). TypeScript
// compiles this file to CommonJS, and under that target it silently rewrites
// a plain `import('marked')` into `Promise.resolve().then(() => require('marked'))`
// — `require()` can't load a pure-ESM package, so that throws ERR_REQUIRE_ESM
// at runtime every time this import is hit. Wrapping the call in `new Function`
// hides it from TS's static downleveling, so it stays a genuine dynamic
// `import()` at runtime, which Node resolves correctly even from CJS.
let markedModulePromise: Promise<typeof import('marked')> | null = null;
function getMarked(): Promise<typeof import('marked')> {
  if (!markedModulePromise) markedModulePromise = new Function('return import("marked")')() as Promise<typeof import('marked')>;
  return markedModulePromise;
}

export const CONTENT_BLOCK_HEADER_TITLES = new Set([
  'block title', 'block content', 'min read seconds', 'question type',
  'question text', 'option 1', 'option 2', 'option 3', 'correct answer', 'explanation',
]);

export function looksLikeContentBlockHeaderRow(cellValues: string[]): boolean {
  const matches = cellValues.filter((v) => CONTENT_BLOCK_HEADER_TITLES.has(v.toLowerCase())).length;
  return matches >= 2;
}

export function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const target = name.toLowerCase();
    const key = keys.find((k) => k.trim().toLowerCase() === target) ?? keys.find((k) => k.trim().toLowerCase().startsWith(target));
    if (key !== undefined) return row[key];
  }
  return undefined;
}

export interface ParsedGateQuestion {
  type: 'mcq' | 'true_false';
  question: string;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: boolean;
  explanation?: string;
  aiGenerated: false;
}

export interface ParsedGateBlock {
  title: string;
  content: string;
  minReadSeconds?: number;
  questions: ParsedGateQuestion[];
}

export interface ParsedRow {
  rowNum: number;
  data: Record<string, any>;
}

/**
 * Parses a set of already-extracted spreadsheet rows into grouped blocks.
 * `rowNum` is caller-supplied per row purely for error messages, so callers
 * that split one sheet's rows across several lessons (the bulk course-wide
 * importer) can still report the original sheet row number in errors.
 */
export async function parseBlockRows(rows: ParsedRow[]): Promise<{ blocks: ParsedGateBlock[]; errors: { row: number; message: string }[]; hadAnyBlock: boolean }> {
  const { marked } = await getMarked();
  const errors: { row: number; message: string }[] = [];
  const order: string[] = [];
  const groups = new Map<string, ParsedGateBlock>();

  for (const { rowNum, data: row } of rows) {
    const cellValues = Object.values(row).map((v) => String(v ?? '').trim());
    if (cellValues.every((v) => v === '')) continue; // blank row
    if (looksLikeContentBlockHeaderRow(cellValues)) continue; // a re-pasted header row further down the batch

    const blockTitle = String(getField(row, 'Block Title') ?? '').trim();
    if (!blockTitle) {
      errors.push({ row: rowNum, message: 'Block Title is required' });
      continue;
    }

    const key = blockTitle.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { title: blockTitle, content: '', questions: [] });
      order.push(key);
    }
    const block = groups.get(key)!;

    const contentRaw = String(getField(row, 'Block Content') ?? '').trim();
    if (contentRaw && !block.content) {
      block.content = marked.parse(contentRaw, { async: false }) as string;
    }

    if (block.minReadSeconds === undefined) {
      const minReadRaw = getField(row, 'Min Read Seconds');
      const n = Number(minReadRaw);
      if (minReadRaw !== undefined && String(minReadRaw).trim() !== '' && !Number.isNaN(n) && n > 0) {
        block.minReadSeconds = n;
      }
    }

    const questionText = String(getField(row, 'Question Text') ?? '').trim();
    if (!questionText) continue; // a row can just carry block content with no question of its own

    const typeRaw = String(getField(row, 'Question Type') ?? '').trim().toLowerCase();
    const type: 'mcq' | 'true_false' = ['true_false', 'true/false', 'truefalse'].includes(typeRaw) ? 'true_false' : 'mcq';
    const explanation = String(getField(row, 'Explanation') ?? '').trim();

    if (type === 'true_false') {
      const correctRaw = String(getField(row, 'Correct Answer') ?? '').trim().toLowerCase();
      block.questions.push({
        type: 'true_false',
        question: questionText,
        correctAnswer: correctRaw === 'true' || correctRaw === 'yes' || correctRaw === '1',
        explanation,
        aiGenerated: false,
      });
    } else {
      const options = [
        String(getField(row, 'Option 1') ?? '').trim(),
        String(getField(row, 'Option 2') ?? '').trim(),
        String(getField(row, 'Option 3') ?? '').trim(),
      ].filter(Boolean);
      if (options.length < 2) {
        errors.push({ row: rowNum, message: 'MCQ questions need at least 2 options' });
        continue;
      }
      const correctRaw = String(getField(row, 'Correct Answer') ?? '').trim();
      const correctNum = Number(correctRaw);
      const correctIndex = Number.isInteger(correctNum) && correctNum >= 1 && correctNum <= options.length ? correctNum - 1 : 0;
      block.questions.push({
        type: 'mcq',
        question: questionText,
        options,
        correctIndex,
        explanation,
        aiGenerated: false,
      });
    }
  }

  const blocks: ParsedGateBlock[] = [];
  for (const key of order) {
    const block = groups.get(key)!;
    if (!block.content) {
      errors.push({ row: 0, message: `Block "${block.title}" was skipped — it has no Block Content in any of its rows` });
      continue;
    }
    blocks.push(block);
  }

  return { blocks, errors, hadAnyBlock: order.length > 0 };
}
