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
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

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
  const rows = [
    ['Introduction to Salaah', 'Salaah is the second pillar of Islam, performed five times a day.', '30', 'mcq', 'What is Salaah?', 'The second pillar of Islam', 'A type of charity', 'A pilgrimage', '1', 'Salaah refers to the ritual prayer performed five times daily.'],
    ['Introduction to Salaah', '', '', 'true_false', 'Salaah is performed only once a day.', '', '', '', 'FALSE', 'Salaah is performed five times a day, not once.'],
    ['Times of Prayer', 'There are five daily prayers: Fajr, Dhuhr, Asr, Maghrib, and Isha.', '30', 'mcq', 'How many daily prayers are there?', '3', '5', '7', '2', ''],
  ];
  const buffer = buildXlsxBuffer(headers, rows, 'Content Blocks Template');

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
