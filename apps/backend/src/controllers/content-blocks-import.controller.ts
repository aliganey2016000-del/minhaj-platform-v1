/**
 * Content Blocks Import Controller — bulk-creates Interactive Gate Content
 * Blocks (each with its own Stop & Check question(s)) from an uploaded
 * Excel file or pasted spreadsheet rows, for the Lesson Editor's "Import"
 * option (alongside "AI Generate").
 *
 * Stateless — this only PARSES the file and hands the block/question data
 * back to the frontend. Unlike course-content.controller's importContent
 * (which writes chapters/lessons straight to the database), Content Blocks
 * live inside one Lesson document's `contentBlocks` array and only ever
 * get saved through the normal Lesson Editor "Save Lesson" → Course
 * Builder "Save All Changes" flow, so there's no courseId/lessonId to
 * write against here — the caller just appends the parsed blocks to its
 * local state exactly like the "+ Add Content Block" and "AI Generate"
 * buttons already do.
 */
import { Request, Response } from 'express';
import * as XLSX from 'xlsx';

let markedModulePromise: Promise<typeof import('marked')> | null = null;
function getMarked(): Promise<typeof import('marked')> {
  if (!markedModulePromise) markedModulePromise = import('marked');
  return markedModulePromise;
}

import { BadRequestError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';

// ---------------------------------------------------------------------------
// Ready-to-copy AI prompts — shipped as extra sheets in the downloadable
// template, so an admin can hand their raw lesson text to any chat AI
// (ChatGPT, DeepSeek, ...) and get back rows in EXACTLY this importer's
// column format, instead of writing the spreadsheet by hand. Two variants
// because "paraphrase this" and "don't touch my wording" need opposite
// instructions — same table contract either way.
// ---------------------------------------------------------------------------

const PROMPT_TABLE_CONTRACT = `Output ONLY a table with these exact columns, in this exact order, as TAB-SEPARATED values (so I can paste it straight into Excel) — one row per question, repeating the same Block Title on every question row that belongs to the same block:

Block Title	Block Content (plain text or Markdown)	Min Read Seconds	Question Type (mcq or true_false)	Question Text	Option 1	Option 2	Option 3	Correct Answer (mcq: 1/2/3, true_false: TRUE/FALSE)	Explanation

Rules:
- Put the Block Content only on the FIRST row of each block — leave it blank on that block's other question rows.
- For mcq questions: fill Option 1, Option 2, and Option 3, and set Correct Answer to the option NUMBER (1, 2, or 3).
- For true_false questions: leave Option 1, Option 2, and Option 3 blank, and set Correct Answer to TRUE or FALSE.
- Min Read Seconds can just be 30 for every block unless I say otherwise.
- Do not add any commentary, headers, or explanation before or after the table — output the table rows only.`;

function buildPromptSheetLines(title: string, bodyInstruction: string): string[] {
  return [
    title,
    '='.repeat(title.length),
    '',
    'HOW TO USE: edit the <<...>> placeholders below, paste your lesson text where shown, then send the WHOLE prompt to your AI (ChatGPT, DeepSeek, etc). Copy its reply and paste it into this importer\'s "Manual Copy & Paste" option.',
    '',
    'EDIT THESE PLACEHOLDERS BEFORE SENDING:',
    '- <<NUMBER_OF_BLOCKS>> — how many content blocks to split the lesson into (e.g. 4)',
    '- <<QUESTIONS_PER_BLOCK>> — how many questions per block (e.g. 1 to 3)',
    '- <<QUESTION_TYPES>> — mcq, true_false, or "a mix of mcq and true_false"',
    '',
    '-----------------------------------------------------------------',
    'PROMPT — copy everything from here down:',
    '',
    'You are helping me prepare an interactive lesson for a Learning Management System. I will give you my lesson source text at the end of this message.',
    '',
    bodyInstruction,
    '',
    PROMPT_TABLE_CONTRACT,
    '',
    'Here is my lesson source text:',
    '',
    '<<PASTE YOUR LESSON TEXT HERE>>',
  ];
}

const PARAPHRASE_PROMPT_LINES = buildPromptSheetLines(
  'AI LESSON IMPORT PROMPT — Paraphrase Mode',
  'Rewrite the text in clearer, more polished language while preserving every fact and idea (a paraphrase/polish pass, not new invented content), then split the result into exactly <<NUMBER_OF_BLOCKS>> content blocks. For each block, write <<QUESTIONS_PER_BLOCK>> comprehension question(s) of type <<QUESTION_TYPES>>, answerable purely from that block\'s own content.'
);

const PRESERVE_PROMPT_LINES = buildPromptSheetLines(
  'AI LESSON IMPORT PROMPT — Exact Wording Mode (no paraphrasing)',
  'Do NOT rewrite, paraphrase, or summarize any of the wording — use my exact original text, character for character. Only split it into exactly <<NUMBER_OF_BLOCKS>> content blocks at natural section breaks. For each block, write <<QUESTIONS_PER_BLOCK>> comprehension question(s) of type <<QUESTION_TYPES>>, answerable purely from that block\'s own (unedited) content.'
);

// Third variant — for the importer's "Plain Text (--- dividers)" paste
// mode. Here the ADMIN decides exactly where each block breaks (either by
// typing the dividers themselves, or asking an AI to place them for
// them) — no table, no questions, just the original text with "---" cut
// points. Deliberately has no <<...>> placeholders: this mode is either
// fully manual, or a much simpler one-line instruction to the AI.
const DIVIDER_PROMPT_LINES = [
  'AI LESSON IMPORT PROMPT — Divider Split Mode (you choose the block breaks)',
  '='.repeat('AI LESSON IMPORT PROMPT — Divider Split Mode (you choose the block breaks)'.length),
  '',
  'HOW TO USE: this mode is for when YOU decide exactly where each block starts and ends — either by typing "---" yourself directly in your own notes (skip this prompt entirely and just paste your text with --- already in it), or by asking an AI to place the --- markers for you using the prompt below. Either way, paste the result into this importer\'s "Manual Copy & Paste" → "Plain Text (--- dividers)" option.',
  '',
  'No questions are added automatically in this mode — after import, use each block\'s own "Generate Question" button in the Lesson Editor (AI-assisted), or write one by hand.',
  '',
  '-----------------------------------------------------------------',
  'PROMPT — copy everything from here down (only needed if you want an AI to place the dividers for you):',
  '',
  'You are helping me prepare an interactive lesson for a Learning Management System, split into short sections a student reads one at a time.',
  '',
  'Split my lesson text below into logical sections at natural topic boundaries. Between each section, insert a line containing only three dashes: ---',
  'Do NOT rewrite, paraphrase, or summarize any of the wording — use my exact original text, only inserting the --- dividers between sections. Do not add any commentary, titles, or numbering — output only my original text with --- inserted between sections.',
  '',
  'Here is my lesson source text:',
  '',
  '<<PASTE YOUR LESSON TEXT HERE>>',
];

const HEADER_TITLES = new Set([
  'block title', 'block content', 'min read seconds', 'question type',
  'question text', 'option 1', 'option 2', 'option 3', 'correct answer', 'explanation',
]);

function looksLikeHeaderRow(cellValues: string[]): boolean {
  const matches = cellValues.filter((v) => HEADER_TITLES.has(v.toLowerCase())).length;
  return matches >= 2;
}

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const target = name.toLowerCase();
    const key = keys.find((k) => k.trim().toLowerCase() === target) ?? keys.find((k) => k.trim().toLowerCase().startsWith(target));
    if (key !== undefined) return row[key];
  }
  return undefined;
}

interface ParsedQuestion {
  type: 'mcq' | 'true_false';
  question: string;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: boolean;
  explanation?: string;
  aiGenerated: false;
}

interface ParsedBlock {
  title: string;
  content: string;
  minReadSeconds?: number;
  questions: ParsedQuestion[];
}

// ---------------------------------------------------------------------------
// GET /api/v1/content-blocks-import/template — download the import template
// ---------------------------------------------------------------------------
export const downloadContentBlocksTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = [
    'Block Title', 'Block Content (plain text or Markdown)', 'Min Read Seconds (optional)',
    'Question Type (mcq or true_false)', 'Question Text', 'Option 1', 'Option 2', 'Option 3',
    'Correct Answer (mcq: 1/2/3, true_false: TRUE/FALSE)', 'Explanation (optional)',
  ];
  // Every sample block repeats its title across 3 rows — one row per
  // checkpoint question — so the "same Block Title = same block" grouping
  // rule is obvious at a glance. This is just the default: add more rows
  // (with the same Block Title) for more questions on a block, or delete
  // rows down to just 1 for a single-question block.
  const rows = [
    ['Introduction to Salaah', 'Salaah is the second pillar of Islam, performed five times a day.', '30', 'mcq', 'What is Salaah?', 'The second pillar of Islam', 'A type of charity', 'A pilgrimage', '1', 'Salaah refers to the ritual prayer performed five times daily.'],
    ['Introduction to Salaah', '', '', 'true_false', 'Salaah is performed only once a day.', '', '', '', 'FALSE', 'Salaah is performed five times a day, not once.'],
    ['Introduction to Salaah', '', '', 'mcq', 'Which pillar of Islam is Salaah?', 'The first', 'The second', 'The third', '2', ''],
    ['Times of Prayer', 'There are five daily prayers: Fajr, Dhuhr, Asr, Maghrib, and Isha.', '30', 'mcq', 'How many daily prayers are there?', '3', '5', '7', '2', ''],
    ['Times of Prayer', '', '', 'mcq', 'Which prayer is performed at dawn?', 'Fajr', 'Dhuhr', 'Isha', '1', ''],
    ['Times of Prayer', '', '', 'true_false', 'Maghrib is prayed after sunset.', '', '', '', 'TRUE', 'Maghrib is performed just after the sun sets.'],
  ];
  // buildXlsxBuffer only builds a single-sheet workbook — build this one
  // directly with 4 sheets: the data template, plus the three AI prompt
  // sheets (each a single wide column of text, one line per row so it
  // reads naturally in Excel and is easy to select-all and copy).
  const templateSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  templateSheet['!cols'] = headers.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 20), 50) }));

  const paraphraseSheet = XLSX.utils.aoa_to_sheet(PARAPHRASE_PROMPT_LINES.map((line) => [line]));
  paraphraseSheet['!cols'] = [{ wch: 120 }];

  const preserveSheet = XLSX.utils.aoa_to_sheet(PRESERVE_PROMPT_LINES.map((line) => [line]));
  preserveSheet['!cols'] = [{ wch: 120 }];

  const dividerSheet = XLSX.utils.aoa_to_sheet(DIVIDER_PROMPT_LINES.map((line) => [line]));
  dividerSheet['!cols'] = [{ wch: 120 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, templateSheet, 'Content Blocks Template');
  XLSX.utils.book_append_sheet(workbook, paraphraseSheet, 'AI Prompt - Paraphrase');
  XLSX.utils.book_append_sheet(workbook, dividerSheet, 'AI Prompt - Divider Split');
  XLSX.utils.book_append_sheet(workbook, preserveSheet, 'AI Prompt - Exact Wording');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=content-blocks-template.xlsx');
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// POST /api/v1/content-blocks-import/parse — parse an uploaded file into
// Content Blocks + questions. Rows sharing a Block Title group into one
// block; each row with a Question Text becomes one question on that block.
// ---------------------------------------------------------------------------
export const parseContentBlocksImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const { marked } = await getMarked();
  const errors: { row: number; message: string }[] = [];
  const order: string[] = [];
  const groups = new Map<string, ParsedBlock>();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row already stripped by sheet_to_json
    const row = rows[i];
    const cellValues = Object.values(row).map((v) => String(v ?? '').trim());
    if (cellValues.every((v) => v === '')) continue; // blank row
    if (looksLikeHeaderRow(cellValues)) continue; // a re-pasted header row further down the batch

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

  if (groups.size === 0) {
    throw new BadRequestError('No valid rows found to import — every row was missing a Block Title.');
  }

  const blocks: ParsedBlock[] = [];
  for (const key of order) {
    const block = groups.get(key)!;
    if (!block.content) {
      errors.push({ row: 0, message: `Block "${block.title}" was skipped — it has no Block Content in any of its rows` });
      continue;
    }
    blocks.push(block);
  }

  if (blocks.length === 0) {
    throw new BadRequestError('No blocks had any Block Content — nothing to import.');
  }

  return ApiResponse.success(res, { blocks, errors }, 'Content blocks parsed successfully');
};
